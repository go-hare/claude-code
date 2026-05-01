import { randomUUID } from 'crypto'
import { EMPTY_USAGE } from '@ant/model-provider'
import type { AppState } from 'src/state/AppStateStore.js'
import type { RewindFilesResult } from 'src/entrypoints/agentSdkTypes.js'
import type { SessionExternalMetadata } from 'src/utils/sessionState.js'
import type { Message, NormalizedUserMessage } from 'src/types/message.js'
import { logEvent } from 'src/services/analytics/index.js'
import { isPolicyAllowed } from 'src/services/policyLimits/index.js'
import {
  loadConversationForResume,
  type TurnInterruptionState,
} from 'src/utils/conversationRecovery.js'
import { logError } from 'src/utils/log.js'
import {
  hydrateRemoteSession,
  hydrateFromCCRv2InternalEvents,
} from 'src/utils/sessionStorage.js'
import { parseSessionIdentifier } from 'src/utils/sessionUrl.js'
import {
  processSessionStartHooks,
  takeInitialUserMessage,
} from 'src/utils/sessionStart.js'
import { gracefulShutdownSync } from 'src/utils/gracefulShutdown.js'
import {
  fileHistoryRewind,
  fileHistoryCanRestore,
  fileHistoryEnabled,
  fileHistoryGetDiffStats,
} from 'src/utils/fileHistory.js'
import { errorMessage } from '../../../../utils/errors.js'
import { isEnvTruthy } from '../../../../utils/envUtils.js'
import { jsonStringify } from '../../../../utils/slowOperations.js'
import type { UUID } from 'crypto'
import type { RuntimeSessionIdentityStateProvider } from '../../../core/state/providers.js'
import { applyResumeSessionAtToTranscript } from '../../../core/session/sessionContinuation.js'
import type { HeadlessSessionContext } from './headlessSessionControl.js'
import type { HeadlessLoadedConversationResult } from './headlessSessionBootstrap.js'

export function removeInterruptedMessage(
  messages: Message[],
  interruptedUserMessage: NormalizedUserMessage,
): void {
  const idx = messages.findIndex(m => m.uuid === interruptedUserMessage.uuid)
  if (idx !== -1) {
    messages.splice(idx, 2)
  }
}

export type LoadInitialMessagesResult = {
  messages: Message[]
  turnInterruptionState?: TurnInterruptionState
  agentSetting?: string
  externalMetadata?: SessionExternalMetadata | null
  loadedConversation?: HeadlessLoadedConversationResult
  initialUserMessage?: string
}

export function emitLoadError(
  bootstrapStateProvider: RuntimeSessionIdentityStateProvider,
  message: string,
  outputFormat: string | undefined,
): void {
  if (outputFormat === 'stream-json') {
    const errorResult = {
      type: 'result',
      subtype: 'error_during_execution',
      duration_ms: 0,
      duration_api_ms: 0,
      is_error: true,
      num_turns: 0,
      stop_reason: null,
      session_id: bootstrapStateProvider.getSessionIdentity().sessionId,
      total_cost_usd: 0,
      usage: EMPTY_USAGE,
      modelUsage: {},
      permission_denials: [],
      uuid: randomUUID(),
      errors: [message],
    }
    process.stdout.write(jsonStringify(errorResult) + '\n')
  } else {
    process.stderr.write(message + '\n')
  }
}

export async function handleRewindFiles(
  userMessageId: UUID,
  appState: AppState,
  setAppState: (updater: (prev: AppState) => AppState) => void,
  dryRun: boolean,
): Promise<RewindFilesResult> {
  if (!fileHistoryEnabled()) {
    return {
      canRewind: false,
      error: 'File rewinding is not enabled.',
      filesChanged: [],
    }
  }
  if (!fileHistoryCanRestore(appState.fileHistory, userMessageId)) {
    return {
      canRewind: false,
      error: 'No file checkpoint found for this message.',
      filesChanged: [],
    }
  }

  if (dryRun) {
    const diffStats = await fileHistoryGetDiffStats(
      appState.fileHistory,
      userMessageId,
    )
    return {
      canRewind: true,
      filesChanged: diffStats?.filesChanged ?? [],
      insertions: diffStats?.insertions,
      deletions: diffStats?.deletions,
    }
  }

  try {
    await fileHistoryRewind(
      updater =>
        setAppState(prev => ({
          ...prev,
          fileHistory: updater(prev.fileHistory),
        })),
      userMessageId,
    )
  } catch (error) {
    return {
      canRewind: false,
      error: `Failed to rewind: ${errorMessage(error)}`,
      filesChanged: [],
    }
  }

  return { canRewind: true, filesChanged: [] }
}

export async function loadInitialMessages(
  session: HeadlessSessionContext,
  setAppState: (f: (prev: AppState) => AppState) => void,
  options: {
    continue: boolean | undefined
    teleport: string | true | null | undefined
    resume: string | boolean | undefined
    resumeSessionAt: string | undefined
    forkSession: boolean | undefined
    outputFormat: string | undefined
    sessionStartHooksPromise?: ReturnType<typeof processSessionStartHooks>
    restoredWorkerState: Promise<SessionExternalMetadata | null>
  },
  emitLoadError: (message: string, outputFormat: string | undefined) => void,
): Promise<LoadInitialMessagesResult> {
  const bootstrapStateProvider = session.bootstrapStateProvider
  const persistSession = !bootstrapStateProvider.isSessionPersistenceDisabled()
  if (options.continue) {
    try {
      logEvent('tengu_continue_print', {})

      const result = await loadConversationForResume(undefined, undefined)
      if (result) {
        return {
          messages: result.messages,
          turnInterruptionState: result.turnInterruptionState,
          agentSetting: result.agentSetting,
          loadedConversation: result,
        }
      }
    } catch (error) {
      logError(error)
      gracefulShutdownSync(1)
      return { messages: [] }
    }
  }

  if (options.teleport) {
    try {
      if (!isPolicyAllowed('allow_remote_sessions')) {
        throw new Error(
          "Remote sessions are disabled by your organization's policy.",
        )
      }

      logEvent('tengu_teleport_print', {})

      if (typeof options.teleport !== 'string') {
        throw new Error('No session ID provided for teleport')
      }

      const {
        checkOutTeleportedSessionBranch,
        processMessagesForTeleportResume,
        teleportResumeCodeSession,
        validateGitState,
      } = await import('src/utils/teleport.js')
      await validateGitState()
      const teleportResult = await teleportResumeCodeSession(options.teleport)
      const { branchError } = await checkOutTeleportedSessionBranch(
        teleportResult.branch,
      )
      return {
        messages: processMessagesForTeleportResume(
          teleportResult.log,
          branchError,
        ),
      }
    } catch (error) {
      logError(error)
      gracefulShutdownSync(1)
      return { messages: [] }
    }
  }

  if (options.resume) {
    try {
      logEvent('tengu_resume_print', {})
      let externalMetadata: SessionExternalMetadata | null = null

      const parsedSessionId = parseSessionIdentifier(
        typeof options.resume === 'string' ? options.resume : '',
      )
      if (!parsedSessionId) {
        let errorMessage =
          'Error: --resume requires a valid session ID when used with --print. Usage: hare -p --resume <session-id>'
        if (typeof options.resume === 'string') {
          errorMessage += `. Session IDs must be in UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000). Provided value "${options.resume}" is not a valid UUID`
        }
        emitLoadError(errorMessage, options.outputFormat)
        gracefulShutdownSync(1)
        return { messages: [] }
      }

      if (isEnvTruthy(process.env.CLAUDE_CODE_USE_CCR_V2)) {
        const sessionId = parsedSessionId.sessionId as UUID
        const [, metadata] = await Promise.all([
          hydrateFromCCRv2InternalEvents(sessionId),
          options.restoredWorkerState,
        ])
        externalMetadata = metadata
      } else if (
        parsedSessionId.isUrl &&
        parsedSessionId.ingressUrl &&
        isEnvTruthy(process.env.ENABLE_SESSION_PERSISTENCE)
      ) {
        const sessionId = parsedSessionId.sessionId as UUID
        await hydrateRemoteSession(
          sessionId,
          parsedSessionId.ingressUrl,
        )
      }

      let result = await loadConversationForResume(
        parsedSessionId.sessionId,
        parsedSessionId.jsonlFile || undefined,
      )

      if (!result || result.messages.length === 0) {
        if (
          parsedSessionId.isUrl ||
          isEnvTruthy(process.env.CLAUDE_CODE_USE_CCR_V2)
        ) {
          const messages =
            await (options.sessionStartHooksPromise ??
              processSessionStartHooks('startup'))
          return {
            messages,
            initialUserMessage: takeInitialUserMessage(),
          }
        } else {
          emitLoadError(
            `No conversation found with session ID: ${parsedSessionId.sessionId}`,
            options.outputFormat,
          )
          gracefulShutdownSync(1)
          return { messages: [] }
        }
      }

      if (options.resumeSessionAt) {
        const sliced = applyResumeSessionAtToTranscript(
          result,
          options.resumeSessionAt,
        )
        if (sliced.error) {
          emitLoadError(
            sliced.error,
            options.outputFormat,
          )
          gracefulShutdownSync(1)
          return { messages: [] }
        }
        result = sliced.transcript
      }

      return {
        messages: result.messages,
        turnInterruptionState: result.turnInterruptionState,
        agentSetting: result.agentSetting,
        externalMetadata,
        loadedConversation: result,
      }
    } catch (error) {
      logError(error)
      const errorText =
        error instanceof Error
          ? `Failed to resume session: ${error.message}`
          : 'Failed to resume session with --print mode'
      emitLoadError(errorText, options.outputFormat)
      gracefulShutdownSync(1)
      return { messages: [] }
    }
  }

  const messages =
    await (options.sessionStartHooksPromise ??
      processSessionStartHooks('startup'))
  return {
    messages,
    initialUserMessage: takeInitialUserMessage(),
  }
}
