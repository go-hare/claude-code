import type { Root } from '@anthropic/ink'
import chalk from 'chalk'
import { getRemoteSessionUrl } from '../../../constants/product.js'
import {
  launchTeleportRepoMismatchDialog,
  launchTeleportResumeWrapper,
} from '../../../dialogLaunchers.js'
import { exitWithError } from '../../../interactiveHelpers.js'
import { logEvent } from '../../../services/analytics/index.js'
import { waitForPolicyLimitsToLoad, isPolicyAllowed } from '../../../services/policyLimits/index.js'
import type { Message as MessageType } from '../../../types/message.js'
import { errorMessage, TeleportOperationError } from '../../../utils/errors.js'
import {
  filterExistingPaths,
  getKnownPathsForRepo,
} from '../../../utils/githubRepoPathMapping.js'
import { logError } from '../../../utils/log.js'
import {
  checkOutTeleportedSessionBranch,
  processMessagesForTeleportResume,
  validateGitState,
  validateSessionRepository,
} from '../../../utils/teleport.js'
import { fetchSession } from '../../../utils/teleport/api.js'
import { runRemoteLaunch } from './remoteLauncher.js'
import type { ResumeLikeLaunchOptions } from './resumeLauncherShared.js'

export async function handleRemoteOrTeleport(
  options: ResumeLikeLaunchOptions,
): Promise<{ exitEarly: boolean; messages: MessageType[] | null }> {
  if (options.remote !== null || options.teleport) {
    await waitForPolicyLimitsToLoad()
    if (!isPolicyAllowed('allow_remote_sessions')) {
      await exitWithError(
        options.root,
        "Error: Remote sessions are disabled by your organization's policy.",
        () => options.runtime.shutdown(1),
      )
      return { exitEarly: true, messages: null }
    }
  }

  if (options.remote !== null) {
    await runNestedRemoteLaunch(options)
    return { exitEarly: true, messages: null }
  }

  if (!options.teleport) {
    return { exitEarly: false, messages: null }
  }

  const messages = await handleTeleportResume(options)
  return { exitEarly: messages === null, messages }
}

async function runNestedRemoteLaunch(
  options: ResumeLikeLaunchOptions,
): Promise<void> {
  const { getFeatureValue_CACHED_MAY_BE_STALE } = await import(
    '../../../services/analytics/growthbook.js'
  )
  const remotePrompt =
    typeof options.remote === 'string' ? options.remote : ''
  const isRemoteTuiEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_remote_backend',
    false,
  )
  logEvent('tengu_remote_create_session', {
    has_initial_prompt: String(remotePrompt.length > 0) as never,
  })
  await runRemoteLaunch({
    root: options.root,
    appProps: options.appProps,
    replProps: options.replProps,
    renderAndRun: options.renderAndRun,
    remotePrompt,
    isRemoteTuiEnabled,
    onSessionCreated(createdSession) {
      logEvent('tengu_remote_create_session_success', {
        session_id: createdSession.id as never,
      })
    },
    stateWriter: {
      enableRemoteMode: options.stateWriter.enableRemoteMode,
    },
    onConnectionError: async message => {
      logEvent('tengu_remote_create_session_error', {
        error: 'unable_to_create_session' as never,
      })
      return exitWithError(options.root, message, () => options.runtime.shutdown(1))
    },
    onCreatedWithoutTui: async createdSession => {
      options.runtime.writeStdout(
        `Created remote session: ${createdSession.title}\n`,
      )
      options.runtime.writeStdout(
        `View: ${getRemoteSessionUrl(createdSession.id)}?m=0\n`,
      )
      options.runtime.writeStdout(
        `Resume with: claude --teleport ${createdSession.id}\n`,
      )
      await options.runtime.shutdown(0)
      options.runtime.exit(0)
    },
  })
}

async function handleTeleportResume(
  options: ResumeLikeLaunchOptions,
): Promise<MessageType[] | null> {
  if (options.teleport === true || options.teleport === '') {
    logEvent('tengu_teleport_interactive_mode', {})
    const teleportResult = await launchTeleportResumeWrapper(options.root)
    if (!teleportResult) {
      await options.runtime.shutdown(0)
      options.runtime.exit(0)
      return null
    }
    const { branchError } = await checkOutTeleportedSessionBranch(
      teleportResult.branch,
    )
    return processMessagesForTeleportResume(teleportResult.log, branchError)
  }

  if (typeof options.teleport !== 'string') {
    return null
  }

  logEvent('tengu_teleport_resume_session', {
    mode: 'direct' as never,
  })
  try {
    const shouldContinue = await ensureTeleportRepositoryMatches(
      options.root,
      options.teleport,
      options.stateWriter,
      options.runtime,
    )
    if (!shouldContinue) {
      return null
    }
    await validateGitState()
    const { teleportWithProgress } = await import(
      '../../../components/TeleportProgress.js'
    )
    const result = await teleportWithProgress(options.root, options.teleport)
    options.stateWriter.markTeleportedSession(options.teleport)
    return result.messages
  } catch (error) {
    if (error instanceof TeleportOperationError) {
      options.runtime.writeStderr(`${error.formattedMessage}\n`)
    } else {
      logError(error)
      options.runtime.writeStderr(chalk.red(`Error: ${errorMessage(error)}\n`))
    }
    await options.runtime.shutdown(1)
    return null
  }
}

async function ensureTeleportRepositoryMatches(
  root: Root,
  sessionId: string,
  stateWriter: ResumeLikeLaunchOptions['stateWriter'],
  runtime: ResumeLikeLaunchOptions['runtime'],
): Promise<boolean> {
  const sessionData = await fetchSession(sessionId)
  const repoValidation = await validateSessionRepository(sessionData)
  if (repoValidation.status === 'error') {
    throw new TeleportOperationError(
      repoValidation.errorMessage || 'Failed to validate session',
      chalk.red(
        `Error: ${repoValidation.errorMessage || 'Failed to validate session'}\n`,
      ),
    )
  }
  if (
    repoValidation.status !== 'mismatch' &&
    repoValidation.status !== 'not_in_repo'
  ) {
    return true
  }

  const sessionRepo = repoValidation.sessionRepo
  if (!sessionRepo) {
    return true
  }

  const existingPaths = await filterExistingPaths(getKnownPathsForRepo(sessionRepo))
  if (existingPaths.length === 0) {
    throw new TeleportOperationError(
      `You must run claude --teleport ${sessionId} from a checkout of ${sessionRepo}.`,
      chalk.red(
        `You must run claude --teleport ${sessionId} from a checkout of ${chalk.bold(sessionRepo)}.\n`,
      ),
    )
  }

  const selectedPath = await launchTeleportRepoMismatchDialog(root, {
    targetRepo: sessionRepo,
    initialPaths: existingPaths,
  })
  if (!selectedPath) {
    await runtime.shutdown(0)
    runtime.exit(0)
    return false
  }

  process.chdir(selectedPath)
  stateWriter.setCwd(selectedPath)
  stateWriter.setOriginalCwd(selectedPath)
  return true
}
