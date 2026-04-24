import type { AgentColorName } from '@go-hare/builtin-tools/tools/AgentTool/agentColorManager.js'
import chalk from 'chalk'
import { resolve } from 'path'
import { exitWithError } from '../../../interactiveHelpers.js'
import { count } from '../../../utils/array.js'
import { loadConversationForResume } from '../../../utils/conversationRecovery.js'
import { errorMessage, isENOENT } from '../../../utils/errors.js'
import { logError } from '../../../utils/log.js'
import type { LogOption } from '../../../types/logs.js'
import type { Message as MessageType } from '../../../types/message.js'
import {
  getSessionIdFromLog,
  loadTranscriptFromFile,
  searchSessionsByCustomTitle,
} from '../../../utils/sessionStorage.js'
import {
  processResumedConversation,
  type ProcessedResume,
} from '../../../utils/sessionRestore.js'
import { validateUuid } from '../../../utils/uuid.js'
import { logEvent } from '../../../services/analytics/index.js'
import type {
  ResumeLikeLaunchOptions,
  ResumeProcessingResult,
  ResumeSelection,
} from './resumeLauncherShared.js'
import { EXIT_EARLY } from './resumeLauncherShared.js'

export async function resolveResumeSelection(
  options: Pick<ResumeLikeLaunchOptions, 'resume' | 'fromPr'>,
): Promise<ResumeSelection> {
  let maybeSessionId = validateUuid(options.resume)
  let searchTerm: string | undefined
  let matchedLog: LogOption | null = null
  let filterByPr: boolean | number | string | undefined

  if (options.fromPr) {
    filterByPr = options.fromPr === true ? true : options.fromPr
  }

  if (typeof options.resume === 'string' && !maybeSessionId) {
    const trimmedValue = options.resume.trim()
    if (trimmedValue) {
      const matches = await searchSessionsByCustomTitle(trimmedValue, {
        exact: true,
      })
      if (matches.length === 1) {
        matchedLog = matches[0]!
        maybeSessionId = getSessionIdFromLog(matchedLog) ?? null
      } else {
        searchTerm = trimmedValue
      }
    }
  }

  return { maybeSessionId, searchTerm, matchedLog, filterByPr }
}

export async function maybeLoadResumeFromFile(
  options: ResumeLikeLaunchOptions,
  selection: ResumeSelection,
): Promise<ResumeProcessingResult> {
  if (
    process.env.USER_TYPE !== 'ant' ||
    typeof options.resume !== 'string' ||
    selection.maybeSessionId
  ) {
    return undefined
  }

  const ccshareResult = await tryLoadCcshareResume(options, options.resume)
  if (ccshareResult !== undefined) {
    return ccshareResult
  }
  return tryLoadTranscriptResume(options, options.resume)
}

export async function resumeBySessionId(
  options: ResumeLikeLaunchOptions,
  sessionId: string,
  matchedLog: LogOption | null,
): Promise<ResumeProcessingResult> {
  return withResumeLogging('cli_flag', async () => {
    const result = await loadConversationForResume(matchedLog ?? sessionId, undefined)
    if (!result) {
      await exitWithError(options.root, `No conversation found with session ID: ${sessionId}`)
      return EXIT_EARLY
    }
    return processResumedConversation(
      result,
      {
        forkSession: !!options.forkSession,
        sessionIdOverride: sessionId,
        transcriptPath: matchedLog?.fullPath ?? result.fullPath,
      },
      options.resumeContext,
    )
  }, options.root, `Failed to resume session ${sessionId}`)
}

export async function waitForDownloadedFiles(
  options: Pick<ResumeLikeLaunchOptions, 'fileDownloadPromise' | 'root' | 'runtime'>,
): Promise<boolean> {
  if (!options.fileDownloadPromise) {
    return true
  }

  try {
    const results = await options.fileDownloadPromise
    const failedCount = count(results, result => !result.success)
    if (failedCount > 0) {
      options.runtime.writeStderr(
        chalk.yellow(
          `Warning: ${failedCount}/${results.length} file(s) failed to download.\n`,
        ),
      )
    }
    return true
  } catch (error) {
    await exitWithError(
      options.root,
      `Error downloading files: ${errorMessage(error)}`,
    )
    return false
  }
}

export function buildResumeData(
  messages: MessageType[] | null,
  restoredAgentDef: ResumeLikeLaunchOptions['replProps']['mainThreadAgentDefinition'],
  initialState: ResumeLikeLaunchOptions['appProps']['initialState'],
): ProcessedResume | undefined {
  if (!Array.isArray(messages)) {
    return undefined
  }

  return {
    messages,
    fileHistorySnapshots: undefined,
    agentName: undefined,
    agentColor: undefined as AgentColorName | undefined,
    restoredAgentDef,
    initialState,
    contentReplacements: undefined,
  }
}

async function tryLoadCcshareResume(
  options: ResumeLikeLaunchOptions,
  resumeValue: string,
): Promise<ResumeProcessingResult> {
  const { parseCcshareId, loadCcshare } = await import('../../../utils/ccshareResume.js')
  const ccshareId = parseCcshareId(resumeValue)
  if (!ccshareId) {
    return undefined
  }

  return withResumeLogging('ccshare', async () => {
    const logOption = await loadCcshare(ccshareId)
    return loadProcessedResume(options, logOption, {
      forkSession: true,
      transcriptPathFromResult: true,
    })
  }, options.root)
}

async function tryLoadTranscriptResume(
  options: ResumeLikeLaunchOptions,
  resumeValue: string,
): Promise<ResumeProcessingResult> {
  const resolvedPath = resolve(resumeValue)
  return withResumeLogging('file', async () => {
    let logOption
    try {
      logOption = await loadTranscriptFromFile(resolvedPath)
    } catch (error) {
      if (!isENOENT(error)) {
        throw error
      }
    }
    if (!logOption) {
      return undefined
    }
    return loadProcessedResume(options, logOption, {
      forkSession: !!options.forkSession,
      transcriptPathFromResult: true,
    })
  }, options.root, `Unable to load transcript from file: ${resumeValue}`)
}

async function loadProcessedResume(
  options: ResumeLikeLaunchOptions,
  source: string | LogOption,
  config: { forkSession: boolean; transcriptPathFromResult: boolean },
): Promise<ProcessedResume | undefined> {
  const result = await loadConversationForResume(source, undefined)
  if (!result) {
    return undefined
  }
  return processResumedConversation(
    result,
    {
      forkSession: config.forkSession,
      transcriptPath: config.transcriptPathFromResult ? result.fullPath : undefined,
    },
    options.resumeContext,
  )
}

async function withResumeLogging(
  entrypoint: 'ccshare' | 'file' | 'cli_flag',
  run: () => Promise<ResumeProcessingResult>,
  root: ResumeLikeLaunchOptions['root'],
  fallbackError?: string,
): Promise<ResumeProcessingResult> {
  try {
    const resumeStart = performance.now()
    const result = await run()
    logEvent('tengu_session_resumed', {
      entrypoint: entrypoint as never,
      success: Boolean(result && result !== EXIT_EARLY),
      ...(result && result !== EXIT_EARLY && {
        resume_duration_ms: Math.round(performance.now() - resumeStart),
      }),
    })
    return result
  } catch (error) {
    logEvent('tengu_session_resumed', {
      entrypoint: entrypoint as never,
      success: false,
    })
    logError(error)
    await exitWithError(
      root,
      fallbackError ?? `Unable to resume from ${entrypoint}: ${errorMessage(error)}`,
    )
    return EXIT_EARLY
  }
}
