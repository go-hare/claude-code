import { exitWithError } from '../../../interactiveHelpers.js'
import { logEvent } from '../../../services/analytics/index.js'
import { launchRepl } from '../../../replLauncher.js'
import { loadConversationForResume } from '../../../utils/conversationRecovery.js'
import { logError } from '../../../utils/log.js'
import { processResumedConversation } from '../../../utils/sessionRestore.js'
import type {
  CliLaunchAppProps,
  CliLaunchRenderAndRun,
  CliLaunchRoot,
  CliLaunchSessionConfig,
} from './sharedLaunchContext.js'

export type ContinueLaunchOptions = {
  root: CliLaunchRoot
  appProps: CliLaunchAppProps
  sessionConfig: CliLaunchSessionConfig
  renderAndRun: CliLaunchRenderAndRun
  forkSession?: boolean
  resumeContext: Parameters<typeof processResumedConversation>[2]
  startupModes: {
    activateProactive(): void
    activateBrief(): void
  }
  runtime: {
    exit(code: number): void
  }
}

export async function runContinueLaunch(
  options: ContinueLaunchOptions,
): Promise<void> {
  let resumeSucceeded = false
  try {
    const resumeStart = performance.now()
    const { clearSessionCaches } = await import('../../../commands/clear/caches.js')
    clearSessionCaches()

    const result = await loadConversationForResume(undefined, undefined)
    if (!result) {
      logEvent('tengu_continue', {
        success: false,
      })
      await exitWithError(options.root, 'No conversation found to continue')
      return
    }

    const loaded = await processResumedConversation(
      result,
      {
        forkSession: !!options.forkSession,
        includeAttribution: true,
        transcriptPath: result.fullPath,
      },
      options.resumeContext,
    )

    options.startupModes.activateProactive()
    options.startupModes.activateBrief()

    logEvent('tengu_continue', {
      success: true,
      resume_duration_ms: Math.round(performance.now() - resumeStart),
    })
    resumeSucceeded = true

    await launchRepl(
      options.root,
      {
        ...options.appProps,
        initialState: loaded.initialState,
      },
      {
        ...options.sessionConfig,
        mainThreadAgentDefinition:
          loaded.restoredAgentDef ?? options.sessionConfig.mainThreadAgentDefinition,
        initialMessages: loaded.messages,
        initialFileHistorySnapshots: loaded.fileHistorySnapshots,
        initialContentReplacements: loaded.contentReplacements,
        initialAgentName: loaded.agentName,
        initialAgentColor: loaded.agentColor,
      },
      options.renderAndRun,
    )
  } catch (error) {
    if (!resumeSucceeded) {
      logEvent('tengu_continue', {
        success: false,
      })
    }
    logError(error)
    options.runtime.exit(1)
  }
}
