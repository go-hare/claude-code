// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { feature } from 'bun:bundle'
import { readFile, stat } from 'fs/promises'
import { dirname } from 'path'
import {
  downloadUserSettings,
  redownloadUserSettings,
} from 'src/services/settingsSync/index.js'
import { StructuredIO } from './io/structuredIO.js'
import { RemoteIO } from './io/remoteIO.js'
import type { Command } from 'src/commands.js'
import { installStreamJsonStdoutGuard } from 'src/utils/streamJsonStdoutGuard.js'
import type { ToolPermissionContext } from 'src/Tool.js'
import type { ThinkingConfig } from 'src/utils/thinking.js'
import { assembleToolPool, filterToolsByDenyRules } from 'src/tools.js'
import uniqBy from 'lodash-es/uniqBy.js'
import { resolveMergedToolState } from 'src/utils/toolPool.js'
import {
  createRuntimeCoordinatorToolCapabilityPlane,
  stripRuntimeCoordinatorToolCapabilityPlane,
} from 'src/runtime/capabilities/coordinator/CoordinatorCapabilityPlane.js'
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { logForDebugging } from 'src/utils/debug.js'
import { logForDiagnosticsNoPII } from 'src/utils/diagLogs.js'
import {
  dedupeToolsByName,
  toolMatchesName,
  type Tool,
  type Tools,
} from 'src/Tool.js'
import {
  type AgentDefinition,
  isBuiltInAgent,
  parseAgentsFromJson,
} from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { Message, NormalizedUserMessage } from 'src/types/message.js'
import type { QueuedCommand } from 'src/types/textInputTypes.js'
import {
  dequeue,
  dequeueAllMatching,
  enqueue,
  hasCommandsInQueue,
  peek,
  subscribeToCommandQueue,
  getCommandsByMaxPriority,
} from 'src/utils/messageQueueManager.js'
import { notifyCommandLifecycle } from 'src/utils/commandLifecycle.js'
import {
  getSessionState,
  notifySessionStateChanged,
  setPermissionModeChangedListener,
  type RequiresActionDetails,
  type SessionExternalMetadata,
} from 'src/utils/sessionState.js'
import { externalMetadataToAppState } from 'src/state/onChangeAppState.js'
import { getInMemoryErrors, logError, logMCPDebug } from 'src/utils/log.js'
import {
  writeToStdout,
  registerProcessOutputErrorHandlers,
} from 'src/utils/process.js'
import type { Stream } from 'src/utils/stream.js'
import { EMPTY_USAGE } from '@ant/model-provider'
import {
  loadConversationForResume,
  type TurnInterruptionState,
} from 'src/utils/conversationRecovery.js'
import type {
  MCPServerConnection,
  McpSdkServerConfig,
  ScopedMcpServerConfig,
} from 'src/services/mcp/types.js'
import {
  ChannelMessageNotificationSchema,
  gateChannelServer,
  wrapChannelMessage,
  findChannelEntry,
} from 'src/services/mcp/channelNotification.js'
import { parsePluginIdentifier } from 'src/utils/plugins/pluginIdentifier.js'
import { validateUuid } from 'src/utils/uuid.js'
import { fromArray } from 'src/utils/generators.js'
import { askRuntime } from 'src/QueryEngine.js'
import type { PermissionPromptTool } from 'src/utils/queryHelpers.js'
import { type FileState } from 'src/utils/fileStateCache.js'
import { expandPath } from 'src/utils/path.js'
import { registerHookEventHandler } from 'src/utils/hooks/hookEvents.js'
import { executeFilePersistence } from 'src/utils/filePersistence/filePersistence.js'
import { finalizePendingAsyncHooks } from 'src/utils/hooks/AsyncHookRegistry.js'
import {
  gracefulShutdown,
  gracefulShutdownSync,
  isShuttingDown,
} from 'src/utils/gracefulShutdown.js'
import { registerCleanup } from 'src/utils/cleanupRegistry.js'
import { createIdleTimeoutManager } from 'src/utils/idleTimeout.js'
import type {
  SDKStatus,
  ModelInfo,
  SDKMessage,
  SDKUserMessage,
  SDKUserMessageReplay,
  PermissionResult,
  McpServerConfigForProcessTransport,
  RewindFilesResult,
} from 'src/entrypoints/agentSdkTypes.js'
import type {
  StdoutMessage,
  SDKControlInitializeRequest,
  SDKControlInitializeResponse,
  SDKControlRequest,
  SDKControlResponse,
} from 'src/entrypoints/sdk/controlTypes.js'
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { PermissionMode as InternalPermissionMode } from 'src/types/permissions.js'
import { cwd } from 'process'
import { getCwd } from 'src/utils/cwd.js'
import omit from 'lodash-es/omit.js'
import reject from 'lodash-es/reject.js'
import { isPolicyAllowed } from 'src/services/policyLimits/index.js'
import type { ReplBridgeHandle } from 'src/bridge/replBridge.js'
import { getRemoteSessionUrl } from 'src/constants/product.js'
import { buildBridgeConnectUrl } from 'src/bridge/bridgeStatusUtil.js'
import { extractInboundMessageFields } from 'src/bridge/inboundMessages.js'
import { resolveAndPrepend } from 'src/bridge/inboundAttachments.js'
import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import { hasPermissionsToUseTool } from 'src/utils/permissions/permissions.js'
import { safeParseJSON } from 'src/utils/json.js'
import {
  outputSchema as permissionToolOutputSchema,
  permissionPromptToolResultToPermissionDecision,
} from 'src/utils/permissions/PermissionPromptToolResultSchema.js'
import { createAbortController } from 'src/utils/abortController.js'
import { createCombinedAbortSignal } from 'src/utils/combinedAbortSignal.js'
import { generateSessionTitle } from 'src/utils/sessionTitle.js'
import { buildSideQuestionFallbackParams } from 'src/utils/queryContext.js'
import { runSideQuestion } from 'src/utils/sideQuestion.js'
import {
  processSessionStartHooks,
  processSetupHooks,
} from 'src/utils/sessionStart.js'
import {
  DEFAULT_OUTPUT_STYLE_NAME,
  getAllOutputStyles,
} from 'src/constants/outputStyles.js'
import { TEAMMATE_MESSAGE_TAG, TICK_TAG } from 'src/constants/xml.js'
import {
  getSettings_DEPRECATED,
  getSettingsWithSources,
} from 'src/utils/settings/settings.js'
import { settingsChangeDetector } from 'src/utils/settings/changeDetector.js'
import { applySettingsChange } from 'src/utils/settings/applySettingsChange.js'
import {
  isFastModeAvailable,
  isFastModeEnabled,
  isFastModeSupportedByModel,
  getFastModeState,
} from 'src/utils/fastMode.js'
import {
  isAutoModeGateEnabled,
  getAutoModeUnavailableNotification,
  getAutoModeUnavailableReason,
  isBypassPermissionsModeDisabled,
  transitionPermissionMode,
} from 'src/utils/permissions/permissionSetup.js'
import {
  tryGenerateSuggestion,
  logSuggestionOutcome,
  logSuggestionSuppressed,
  type PromptVariant,
} from 'src/services/PromptSuggestion/promptSuggestion.js'
import { getLastCacheSafeParams } from 'src/utils/forkedAgent.js'
import { getAccountInformation } from 'src/utils/auth.js'
import { OAuthService } from 'src/services/oauth/index.js'
import { installOAuthTokens } from 'src/services/oauth/installOAuthTokens.js'
import { getAPIProvider } from 'src/utils/model/providers.js'
import type { HookCallbackMatcher } from 'src/types/hooks.js'
import { AwsAuthStatusManager } from 'src/utils/awsAuthStatusManager.js'
import type { HookEvent } from 'src/entrypoints/agentSdkTypes.js'
import { createSyntheticOutputTool } from '@go-hare/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js'
import { parseSessionIdentifier } from 'src/utils/sessionUrl.js'
import {
  hydrateRemoteSession,
  hydrateFromCCRv2InternalEvents,
  resetSessionFilePointer,
  doesMessageExistInSession,
  findUnresolvedToolUse,
  recordAttributionSnapshot,
  resetSessionMetadataForResume,
  saveMode,
  restoreSessionMetadata,
} from 'src/utils/sessionStorage.js'
import { incrementPromptCount } from 'src/utils/commitAttribution.js'
import {
  clearServerCache,
  reconnectMcpServerImpl,
} from 'src/services/mcp/client.js'
import {
  getMcpConfigByName,
  isMcpServerDisabled,
  setMcpServerEnabled,
} from 'src/services/mcp/config.js'
import {
  performMCPOAuthFlow,
  revokeServerTokens,
} from 'src/services/mcp/auth.js'
import {
  runElicitationHooks,
  runElicitationResultHooks,
} from 'src/services/mcp/elicitationHandler.js'
import { executeNotificationHooks } from 'src/utils/hooks.js'
import {
  ElicitRequestSchema,
  ElicitationCompleteNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { getMcpPrefix } from 'src/services/mcp/mcpStringUtils.js'
import { commandBelongsToServer } from 'src/services/mcp/utils.js'
import { setupVscodeSdkMcp } from 'src/services/mcp/vscodeSdkMcp.js'
import {
  isQualifiedForGrove,
  checkGroveForNonInteractive,
} from 'src/services/api/grove.js'
import {
  provisionContentReplacementState,
  type ContentReplacementRecord,
} from 'src/utils/toolResultStorage.js'
import { extractLoadedNestedMemoryPathsFromMessages } from 'src/utils/queryHelpers.js'
import {
  toInternalMessages,
  toSDKRateLimitInfo,
} from 'src/utils/messages/mappers.js'
import { createModelSwitchBreadcrumbs } from 'src/utils/messages.js'
import { collectContextData } from 'src/commands/context/context-noninteractive.js'
import { LOCAL_COMMAND_STDOUT_TAG } from 'src/constants/xml.js'
import {
  statusListeners,
  type ClaudeAILimits,
} from 'src/services/claudeAiLimits.js'
import {
  getDefaultMainLoopModel,
  getMainLoopModel,
  modelDisplayString,
  parseUserSpecifiedModel,
} from 'src/utils/model/model.js'
import { getModelOptions } from 'src/utils/model/modelOptions.js'
import {
  modelSupportsEffort,
  modelSupportsMaxEffort,
  EFFORT_LEVELS,
  resolveAppliedEffort,
  shouldShowEffortUI,
} from 'src/utils/effort.js'
import { modelSupportsAdaptiveThinking } from 'src/utils/thinking.js'
import { modelSupportsAutoMode } from 'src/utils/betas.js'
import { ensureModelStringsInitialized } from 'src/utils/model/modelStrings.js'
import { runWithWorkload, WORKLOAD_CRON } from 'src/utils/workloadContext.js'
import type { UUID } from 'crypto'
import { randomUUID } from 'crypto'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { AppState } from 'src/state/AppStateStore.js'
import {
  fileHistoryRewind,
  fileHistoryCanRestore,
  fileHistoryEnabled,
  fileHistoryGetDiffStats,
} from 'src/utils/fileHistory.js'
import {
  restoreAgentFromSession,
  restoreSessionStateFromLog,
} from 'src/utils/sessionRestore.js'
import { SandboxManager } from 'src/utils/sandbox/sandbox-adapter.js'
import {
  headlessProfilerStartTurn,
  headlessProfilerCheckpoint,
  logHeadlessProfilerTurn,
} from 'src/utils/headlessProfiler.js'
import {
  startQueryProfile,
  logQueryProfileReport,
} from 'src/utils/queryProfiler.js'
import { asSessionId } from 'src/types/ids.js'
import {
  commitAutonomyQueuedPrompt,
  createAutonomyQueuedPrompt,
  createProactiveAutonomyCommands,
  finalizeAutonomyRunCompleted,
  finalizeAutonomyRunFailed,
  markAutonomyRunCompleted,
  markAutonomyRunFailed,
  markAutonomyRunRunning,
} from 'src/utils/autonomyRuns.js'
import { prepareAutonomyTurnPrompt } from 'src/utils/autonomyAuthority.js'
import {
  type HeadlessSessionContext,
  type HeadlessSessionStateProvider,
  handleChannelEnable,
  handleSetPermissionMode,
  reregisterChannelHandlerAfterReconnect,
} from './headlessSessionControl.js'
import {
  type DynamicMcpState,
  type McpSetServersResult,
  type SdkMcpState,
  reconcileMcpServers,
  handleMcpSetServers,
} from './headlessMcp.js'
import {
  installPluginsAndApplyMcpInBackgroundRuntime,
} from './headlessPlugins.js'
import { createRuntimeHeadlessMcpService } from '../../mcp/RuntimeHeadlessMcpService.js'
import { createHeadlessRuntimeCapabilityBundle } from './headlessRuntimeCapabilityBundle.js'
import {
  createFilesPersistedMessage,
  flushHeldBackResultAndSuggestion,
} from './headlessPostTurn.js'
import { emitHeadlessRuntimeMessage } from './headlessStreamEmission.js'
import { projectRuntimeEnvelopeToLegacySDKMessage } from '../../../core/events/compatProjection.js'
import {
  hasHeadlessBackgroundWorkPending,
  observeHeadlessBackgroundSdkMessage,
} from './headlessBackgroundWork.js'
import {
  projectHeadlessTaskNotification,
  type RuntimeTurnPreludeEvent,
} from './headlessTaskNotificationProjection.js'
import {
  createCoordinatorLifecycleEvent,
  projectCoordinatorLifecycleFromSdkMessage,
  type CoordinatorLifecycleRuntimeEvent,
} from './headlessCoordinatorLifecycleEvents.js'
import {
  createHeadlessRuntimeStreamPublisher,
  createHeadlessStreamCollector,
} from './headlessStreaming.js'
import {
  type HeadlessRuntimeEventSink,
  createHeadlessPermissionRuntime,
} from './headlessPermissionRuntime.js'
import { RuntimePermissionBroker } from '../../permissions/RuntimePermissionBroker.js'
import { createHeadlessRuntimeEventSink } from './headlessRuntimeEventOutput.js'
import {
  createHeadlessConversation,
  type HeadlessConversation,
} from './headlessConversationAdapter.js'
import {
  canBatchWith,
  createCanUseToolWithPermissionPrompt,
  getCanUseToolFn,
  handleInitializeRequest,
  getStructuredIO,
  joinPromptValues,
} from './headlessControl.js'
import {
  emitLoadError,
  handleRewindFiles,
  loadInitialMessages,
} from './headlessBootstrap.js'
import { resolveHeadlessResumeInterruptedTurn } from './headlessResumePolicy.js'
import {
  completeHeadlessRewind,
  failHeadless,
  finalizeHeadlessResult,
  installHeadlessStreamJsonGuard,
  registerHeadlessOutputHandlers,
  shutdownHeadless,
  writeHeadlessResult,
  writeHeadlessStderr,
} from './headlessHostIO.js'
import { createHeadlessManagedSession } from './headlessManagedSession.js'
import { forwardMessagesToBridge as forwardBridgeMessages } from './headlessBridgeForwarding.js'
import { jsonStringify } from '../../../../utils/slowOperations.js'
import { skillChangeDetector } from '../../../../utils/skills/skillChangeDetector.js'
import { clearCommandsCache } from '../../../../commands.js'
import {
  isBareMode,
  isEnvTruthy,
  isEnvDefinedFalsy,
} from '../../../../utils/envUtils.js'
import {
  isTeamLead,
  hasActiveInProcessTeammates,
  hasWorkingInProcessTeammates,
  waitForTeammatesToBecomeIdle,
} from '../../../../utils/teammate.js'
import {
  readUnreadMessages,
  markMessagesAsRead,
  isShutdownApproved,
} from '../../../../utils/teammateMailbox.js'
import { removeTeammateFromTeamFile } from '../../../../utils/swarm/teamHelpers.js'
import {
  unassignTeammateTasks,
} from '../../../../utils/tasks.js'
import { getRunningTasks } from '../../../../utils/task/framework.js'
import { isBackgroundTask } from '../../../../tasks/types.js'
import { stopTask } from '../../../../tasks/stopTask.js'
import { drainSdkEvents } from '../../../../utils/sdkEventQueue.js'
import { initializeGrowthBook } from '../../../../services/analytics/growthbook.js'
import { errorMessage, toError } from '../../../../utils/errors.js'
import { sleep } from '../../../../utils/sleep.js'
import { isExtractModeActive } from '../../../../memdir/paths.js'
import { resolveHeadlessRuntimeTurnId } from './headlessRuntimeTurnId.js'

// Dead code elimination: conditional imports
/* eslint-disable @typescript-eslint/no-require-imports */
const coordinatorModeModule = feature('COORDINATOR_MODE')
  ? (require('../../../../coordinator/coordinatorMode.js') as typeof import('../../../../coordinator/coordinatorMode.js'))
  : null
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS')
    ? (require('../../../../proactive/index.js') as typeof import('../../../../proactive/index.js'))
    : null
const cronSchedulerModule =
  require('../../../../utils/cronScheduler.js') as typeof import('../../../../utils/cronScheduler.js')
const cronJitterConfigModule =
  require('../../../../utils/cronJitterConfig.js') as typeof import('../../../../utils/cronJitterConfig.js')
const cronGate =
  require('@go-hare/builtin-tools/tools/ScheduleCronTool/prompt.js') as typeof import('@go-hare/builtin-tools/tools/ScheduleCronTool/prompt.js')
const extractMemoriesModule = feature('EXTRACT_MEMORIES')
  ? (require('../../../../services/extractMemories/extractMemories.js') as typeof import('../../../../services/extractMemories/extractMemories.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

const SHUTDOWN_TEAM_PROMPT = `<system-reminder>
You are running in non-interactive mode and cannot return a response to the user until your team is shut down.

You MUST shut down your team before preparing your final response:
1. Use requestShutdown to ask each team member to shut down gracefully
2. Wait for shutdown approvals
3. Use the cleanup operation to clean up the team
4. Only then provide your final response to the user

The user cannot receive your response until the team is completely shut down.
</system-reminder>

Shut down your team and prepare your final response for the user.`

export async function runHeadlessRuntimeLoop(
  inputPrompt: string | AsyncIterable<string>,
  getAppState: () => AppState,
  setAppState: (f: (prev: AppState) => AppState) => void,
  commands: Command[],
  tools: Tools,
  sdkMcpConfigs: Record<string, McpSdkServerConfig>,
  agents: AgentDefinition[],
  options: {
    continue: boolean | undefined
    resume: string | boolean | undefined
    resumeSessionAt: string | undefined
    verbose: boolean | undefined
    outputFormat: string | undefined
    jsonSchema: Record<string, unknown> | undefined
    permissionPromptToolName: string | undefined
    allowedTools: string[] | undefined
    thinkingConfig: ThinkingConfig | undefined
    maxTurns: number | undefined
    maxBudgetUsd: number | undefined
    taskBudget: { total: number } | undefined
    systemPrompt: string | undefined
    appendSystemPrompt: string | undefined
    userSpecifiedModel: string | undefined
    fallbackModel: string | undefined
    teleport: string | true | null | undefined
    sdkUrl: string | undefined
    replayUserMessages: boolean | undefined
    includePartialMessages: boolean | undefined
    resumeInterruptedTurn?: boolean | undefined
    forkSession: boolean | undefined
    rewindFiles: string | undefined
    enableAuthStatus: boolean | undefined
    agent: string | undefined
    workload: string | undefined
    setupTrigger?: 'init' | 'maintenance' | undefined
    sessionStartHooksPromise?: ReturnType<typeof processSessionStartHooks>
    setSDKStatus?: (status: SDKStatus) => void
    runtimeEventSink?: HeadlessRuntimeEventSink
  },
  bootstrapStateProvider: HeadlessSessionStateProvider,
  session: HeadlessSessionContext,
): Promise<void> {
  if (
    process.env.USER_TYPE === 'ant' &&
    isEnvTruthy(process.env.CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER)
  ) {
    writeHeadlessStderr(
      `\nStartup time: ${Math.round(process.uptime() * 1000)}ms\n`,
    )
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(0)
  }

  try {
    // Fire user settings download now so it overlaps with the MCP/tool setup
    // below. Managed settings already started in main.tsx preAction; this gives
    // user settings a similar head start. The cached promise is joined in
    // installPluginsAndApplyMcpInBackground before plugin install reads
    // enabledPlugins.
    if (
      feature('DOWNLOAD_USER_SETTINGS') &&
      (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ||
        session.bootstrapStateProvider.getHeadlessControlState().isRemoteMode)
    ) {
      void downloadUserSettings()
    }

    // In headless mode there is no React tree, so the useSettingsChange hook
    // never runs. Subscribe directly so that settings changes (including
    // managed-settings / policy updates) are fully applied.
    const unsubscribeSettingsChanges = settingsChangeDetector.subscribe(
      source => {
        applySettingsChange(source, setAppState)

        // In headless mode, also sync the denormalized fastMode field from
        // settings. The TUI manages fastMode via the UI so it skips this.
        if (isFastModeEnabled()) {
          setAppState(prev => {
            const s = prev.settings as Record<string, unknown>
            const fastMode = s.fastMode === true && !s.fastModePerSessionOptIn
            return { ...prev, fastMode }
          })
        }
      },
    )
    session.registerCleanup(unsubscribeSettingsChanges)

    // Proactive activation is now handled in main.tsx before getTools() so
    // SleepTool passes isEnabled() filtering. This fallback covers the case
    // where CLAUDE_CODE_PROACTIVE is set but main.tsx's check didn't fire
    // (e.g. env was injected by the SDK transport after argv parsing).
    if (
      (feature('PROACTIVE') || feature('KAIROS')) &&
      proactiveModule &&
      !proactiveModule.isProactiveActive() &&
      isEnvTruthy(process.env.CLAUDE_CODE_PROACTIVE)
    ) {
      proactiveModule.activateProactive('command')
    }

    // Periodically force a full GC to keep memory usage in check
    if (typeof Bun !== 'undefined') {
      const gcTimer = setInterval(Bun.gc, 1000)
      gcTimer.unref()
    }

    // Start headless profiler for first turn
    headlessProfilerStartTurn()
    headlessProfilerCheckpoint('runHeadless_entry')

    // Check Grove requirements for non-interactive consumer subscribers
    if (await isQualifiedForGrove()) {
      await checkGroveForNonInteractive()
    }
    headlessProfilerCheckpoint('after_grove_check')

    // Initialize GrowthBook so feature flags take effect in headless mode.
    // Without this, the disk cache is empty and all flags fall back to defaults.
    void initializeGrowthBook()

    if (options.resumeSessionAt && !options.resume) {
      failHeadless(`Error: --resume-session-at requires --resume\n`)
      return
    }

    if (options.rewindFiles && !options.resume) {
      failHeadless(`Error: --rewind-files requires --resume\n`)
      return
    }

    if (options.rewindFiles && inputPrompt) {
      failHeadless(
        `Error: --rewind-files is a standalone operation and cannot be used with a prompt\n`,
      )
      return
    }

    const structuredIO = getStructuredIO(
      inputPrompt,
      session.bootstrapStateProvider.getSessionIdentity().sessionId,
      options,
    )

    // When emitting NDJSON for SDK clients, any stray write to stdout (debug
    // prints, dependency console.log, library banners) breaks the client's
    // line-by-line JSON parser. Install a guard that diverts non-JSON lines to
    // stderr so the stream stays clean. Must run before the first
    // structuredIO.write below.
    installHeadlessStreamJsonGuard(options.outputFormat)

    // #34044: if user explicitly set sandbox.enabled=true but deps are missing,
    // isSandboxingEnabled() returns false silently. Surface the reason so users
    // know their security config isn't being enforced.
    const sandboxUnavailableReason =
      SandboxManager.getSandboxUnavailableReason()
    if (sandboxUnavailableReason) {
      if (SandboxManager.isSandboxRequired()) {
        failHeadless(
          `\nError: sandbox required but unavailable: ${sandboxUnavailableReason}\n` +
            `  sandbox.failIfUnavailable is set — refusing to start without a working sandbox.\n\n`,
        )
        return
      }
      writeHeadlessStderr(
        `\n⚠ Sandbox disabled: ${sandboxUnavailableReason}\n` +
          `  Commands will run WITHOUT sandboxing. Network and filesystem restrictions will NOT be enforced.\n\n`,
      )
    } else if (SandboxManager.isSandboxingEnabled()) {
      // Initialize sandbox with a callback that forwards network permission
      // requests to the SDK host via the can_use_tool control_request protocol.
      // This must happen after structuredIO is created so we can send requests.
      try {
        await SandboxManager.initialize(structuredIO.createSandboxAskCallback())
      } catch (err) {
        failHeadless(`\n❌ Sandbox Error: ${errorMessage(err)}\n`, 1, 'other')
        return
      }
    }

    if (options.outputFormat === 'stream-json' && options.verbose) {
      registerHookEventHandler(event => {
        const message: StdoutMessage = (() => {
          switch (event.type) {
            case 'started':
              return {
                type: 'system' as const,
                subtype: 'hook_started' as const,
                hook_id: event.hookId,
                hook_name: event.hookName,
                hook_event: event.hookEvent,
                uuid: randomUUID(),
                session_id:
                  session.bootstrapStateProvider.getSessionIdentity().sessionId,
              }
            case 'progress':
              return {
                type: 'system' as const,
                subtype: 'hook_progress' as const,
                hook_id: event.hookId,
                hook_name: event.hookName,
                hook_event: event.hookEvent,
                stdout: event.stdout,
                stderr: event.stderr,
                output: event.output,
                uuid: randomUUID(),
                session_id:
                  session.bootstrapStateProvider.getSessionIdentity().sessionId,
              }
            case 'response':
              return {
                type: 'system' as const,
                subtype: 'hook_response' as const,
                hook_id: event.hookId,
                hook_name: event.hookName,
                hook_event: event.hookEvent,
                output: event.output,
                stdout: event.stdout,
                stderr: event.stderr,
                exit_code: event.exitCode,
                outcome: event.outcome,
                uuid: randomUUID(),
                session_id:
                  session.bootstrapStateProvider.getSessionIdentity().sessionId,
              }
          }
        })()
        void structuredIO.write(message)
      })
      session.registerCleanup(() => {
        registerHookEventHandler(null)
      })
    }

    if (options.setupTrigger) {
      await processSetupHooks(options.setupTrigger)
    }

    headlessProfilerCheckpoint('before_loadInitialMessages')
    const appState = getAppState()
    const {
      messages: initialMessages,
      turnInterruptionState,
      agentSetting: resumedAgentSetting,
      externalMetadata,
      loadedConversation,
      initialUserMessage,
    } = await loadInitialMessages(
      session,
      setAppState,
      {
        continue: options.continue,
        teleport: options.teleport,
        resume: options.resume,
        resumeSessionAt: options.resumeSessionAt,
        forkSession: options.forkSession,
        outputFormat: options.outputFormat,
        sessionStartHooksPromise: options.sessionStartHooksPromise,
        restoredWorkerState: structuredIO.restoredWorkerState,
      },
      (message, outputFormat) =>
        emitLoadError(session.bootstrapStateProvider, message, outputFormat),
    )
    const persistSession =
      !session.bootstrapStateProvider.isSessionPersistenceDisabled()

    session.bootstrap.applyExternalMetadata(
      externalMetadata ?? null,
      setAppState,
    )
    if (loadedConversation) {
      await session.bootstrap.applyLoadedConversation(
        loadedConversation,
        setAppState,
        {
          forkSession: options.forkSession,
          persistSession,
        },
      )
      await session.bootstrap.applyLoadedConversationMode(
        loadedConversation.mode,
        setAppState,
      )
    }

    // SessionStart hooks can emit initialUserMessage — the first user turn for
    // headless orchestrator sessions where stdin is empty and additionalContext
    // alone (an attachment, not a turn) would leave the REPL with nothing to
    // respond to.
    if (initialUserMessage) {
      structuredIO.prependUserMessage(initialUserMessage)
    }

    // Restore agent setting from the resumed session (if not overridden by current --agent flag
    // or settings-based agent, which would already have set mainThreadAgentType in main.tsx)
    if (
      !options.agent &&
      !session.bootstrapStateProvider.getHeadlessControlState()
        .mainThreadAgentType &&
      resumedAgentSetting
    ) {
      const { agentDefinition: restoredAgent } = restoreAgentFromSession(
        resumedAgentSetting,
        undefined,
        { activeAgents: agents, allAgents: agents },
      )
      if (restoredAgent) {
        setAppState(prev => ({ ...prev, agent: restoredAgent.agentType }))
        // Apply the agent's system prompt for non-built-in agents (mirrors main.tsx initial --agent path)
        if (!options.systemPrompt && !isBuiltInAgent(restoredAgent)) {
          const agentSystemPrompt = restoredAgent.getSystemPrompt()
          if (agentSystemPrompt) {
            options.systemPrompt = agentSystemPrompt
          }
        }
        // Re-persist agent setting so future resumes maintain the agent
        session.bootstrap.persistAgentSetting(restoredAgent.agentType)
      }
    }

    // gracefulShutdownSync schedules an async shutdown and sets process.exitCode.
    // If a loadInitialMessages error path triggered it, bail early to avoid
    // unnecessary work while the process winds down.
    if (initialMessages.length === 0 && process.exitCode !== undefined) {
      return
    }

    // Handle --rewind-files: restore filesystem and exit immediately
    if (options.rewindFiles) {
      // File history snapshots are only created for user messages,
      // so we require the target to be a user message
      const targetMessage = initialMessages.find(
        m => m.uuid === options.rewindFiles,
      )

      if (!targetMessage || targetMessage.type !== 'user') {
        failHeadless(
          `Error: --rewind-files requires a user message UUID, but ${options.rewindFiles} is not a user message in this session\n`,
        )
        return
      }

      const currentAppState = getAppState()
      const result = await handleRewindFiles(
        options.rewindFiles as UUID,
        currentAppState,
        setAppState,
        false,
      )
      if (!result.canRewind) {
        failHeadless(`Error: ${result.error || 'Unexpected error'}\n`)
        return
      }

      // Rewind complete - exit successfully
      completeHeadlessRewind(options.rewindFiles)
      return
    }

    // Check if we need input prompt - skip if we're resuming with a valid session ID/JSONL file or using SDK URL
    const hasValidResumeSessionId =
      typeof options.resume === 'string' &&
      (Boolean(validateUuid(options.resume)) ||
        options.resume.endsWith('.jsonl'))
    const isUsingSdkUrl = Boolean(options.sdkUrl)

    if (!inputPrompt && !hasValidResumeSessionId && !isUsingSdkUrl) {
      failHeadless(
        `Error: Input must be provided either through stdin or as a prompt argument when using --print\n`,
      )
      return
    }

    if (options.outputFormat === 'stream-json' && !options.verbose) {
      failHeadless(
        'Error: When using --print, --output-format=stream-json requires --verbose\n',
      )
      return
    }

    // Filter out MCP tools that are in the deny list
    const allowedMcpTools = filterToolsByDenyRules(
      appState.mcp.tools,
      appState.toolPermissionContext,
    )
    let filteredTools = [...tools, ...allowedMcpTools]

    // When using SDK URL, always use stdio permission prompting to delegate to the SDK
    const effectivePermissionPromptToolName = options.sdkUrl
      ? 'stdio'
      : options.permissionPromptToolName

    // Callback for when a permission prompt is shown
    const onPermissionPrompt = (details: RequiresActionDetails) => {
      if (feature('COMMIT_ATTRIBUTION')) {
        setAppState(prev => ({
          ...prev,
          attribution: {
            ...prev.attribution,
            permissionPromptCount: prev.attribution.permissionPromptCount + 1,
          },
        }))
      }
      notifySessionStateChanged('requires_action', details)
    }

    const headlessRuntimeId =
      bootstrapStateProvider.getSessionIdentity().sessionId
    const runtimeEventSink = createHeadlessRuntimeEventSink(structuredIO, {
      outputFormat: options.outputFormat,
      verbose: options.verbose,
      sessionId: headlessRuntimeId,
      runtimeEventSink: options.runtimeEventSink,
    })
    const headlessConversation = createHeadlessConversation({
      runtimeId: headlessRuntimeId,
      conversationId: headlessRuntimeId,
      workspacePath: bootstrapStateProvider.getSessionIdentity().cwd,
      sessionId: headlessRuntimeId,
      runtimeEventSink,
    })
    session.registerCleanup(() =>
      headlessConversation.dispose('Headless runtime disposed'),
    )
    const permissionBroker = new RuntimePermissionBroker({
      eventBus: headlessConversation.eventBus,
    })
    const canUseToolUsesBroker = effectivePermissionPromptToolName === 'stdio'
    const structuredPermissionOptions = effectivePermissionPromptToolName
      ? {
          permissionBroker,
          getConversationId: () =>
            bootstrapStateProvider.getSessionIdentity().sessionId,
          getTurnId: () => headlessConversation.activeTurnId,
        }
      : undefined
    const permissionRuntime = createHeadlessPermissionRuntime({
      runtimeId: headlessRuntimeId,
      eventBus: headlessConversation.eventBus,
      canUseTool: getCanUseToolFn(
        effectivePermissionPromptToolName,
        structuredIO,
        () => getAppState().mcp.tools,
        onPermissionPrompt,
        structuredPermissionOptions,
      ),
      getConversationId: () =>
        bootstrapStateProvider.getSessionIdentity().sessionId,
      permissionBroker,
      canUseToolUsesBroker,
    })
    session.registerCleanup(() =>
      permissionRuntime.dispose('Headless runtime disposed'),
    )

    const canUseTool = permissionRuntime.canUseTool
    if (options.permissionPromptToolName) {
      // Remove the permission prompt tool from the list of available tools.
      filteredTools = filteredTools.filter(
        tool => !toolMatchesName(tool, options.permissionPromptToolName!),
      )
    }

    // Install errors handlers to gracefully handle broken pipes (e.g., when parent process dies)
    registerHeadlessOutputHandlers()

    headlessProfilerCheckpoint('after_loadInitialMessages')

    // Ensure model strings are initialized before generating model options.
    // For Bedrock users, this waits for the profile fetch to get correct region strings.
    await ensureModelStringsInitialized()
    headlessProfilerCheckpoint('after_modelStrings')

    // UDS inbox store registration is deferred until after `run` is defined
    // so we can pass `run` as the onEnqueue callback (see below).

    const streamCollector = createHeadlessStreamCollector(
      options,
      createHeadlessRuntimeStreamPublisher({
        eventBus: headlessConversation.eventBus,
        conversationId: headlessConversation.id,
        getTurnId: () => headlessConversation.activeTurnId,
        onPublishError(error) {
          logForDebugging(
            `[headless] Failed to publish runtime SDK message event: ${error instanceof Error ? error.message : String(error)}`,
          )
        },
      }),
    )

    headlessProfilerCheckpoint('before_runHeadlessStreaming')
    for await (const message of runHeadlessStreaming(
      structuredIO,
      appState.mcp.clients,
      [...commands, ...appState.mcp.commands],
      filteredTools,
      initialMessages,
      canUseTool,
      sdkMcpConfigs,
      getAppState,
      setAppState,
      agents,
      options,
      session,
      headlessConversation,
      loadedConversation?.contentReplacements,
      turnInterruptionState,
    )) {
      await streamCollector.handleMessage(structuredIO, message)
    }

    const lastMessage = streamCollector.getLastMessage()
    writeHeadlessResult(lastMessage, streamCollector.getMessages(), options)

    // Log headless latency metrics for the final turn
    logHeadlessProfilerTurn()

    // Drain any in-flight memory extraction before shutdown. The response is
    // already flushed above, so this adds no user-visible latency — it just
    // delays process exit so gracefulShutdownSync's 5s failsafe doesn't kill
    // the forked agent mid-flight. Gated by isExtractModeActive so the
    // tengu_slate_thimble flag controls non-interactive extraction end-to-end.
    if (feature('EXTRACT_MEMORIES') && isExtractModeActive()) {
      await extractMemoriesModule!.drainPendingExtraction()
    }

    finalizeHeadlessResult(lastMessage)
  } finally {
    await session.cleanup()
  }
}

function runHeadlessStreaming(
  structuredIO: StructuredIO,
  mcpClients: MCPServerConnection[],
  commands: Command[],
  tools: Tools,
  initialMessages: Message[],
  canUseTool: CanUseToolFn,
  sdkMcpConfigs: Record<string, McpSdkServerConfig>,
  getAppState: () => AppState,
  setAppState: (f: (prev: AppState) => AppState) => void,
  agents: AgentDefinition[],
  options: {
    verbose: boolean | undefined
    jsonSchema: Record<string, unknown> | undefined
    permissionPromptToolName: string | undefined
    allowedTools: string[] | undefined
    thinkingConfig: ThinkingConfig | undefined
    maxTurns: number | undefined
    maxBudgetUsd: number | undefined
    taskBudget: { total: number } | undefined
    systemPrompt: string | undefined
    appendSystemPrompt: string | undefined
    userSpecifiedModel: string | undefined
    fallbackModel: string | undefined
    replayUserMessages?: boolean | undefined
    includePartialMessages?: boolean | undefined
    resumeInterruptedTurn?: boolean | undefined
    enableAuthStatus?: boolean | undefined
    agent?: string | undefined
    setSDKStatus?: (status: SDKStatus) => void
    promptSuggestions?: boolean | undefined
    workload?: string | undefined
    forkSession?: boolean | undefined
  },
  session: HeadlessSessionContext,
  headlessConversation: HeadlessConversation,
  initialContentReplacements?: ContentReplacementRecord[],
  turnInterruptionState?: TurnInterruptionState,
): AsyncIterable<StdoutMessage> {
  let running = false
  let runPhase:
    | 'draining_commands'
    | 'waiting_for_agents'
    | 'finally_flush'
    | 'finally_post_flush'
    | undefined
  let inputClosed = false
  let shutdownPromptInjected = false
  let shutdownRequestEventEmitted = false
  let shutdownCompletedEventEmitted = false
  let heldBackResult: StdoutMessage | null = null
  let heldBackAssistantMessages: StdoutMessage[] = []
  let terminalResultEmitted = false
  const backgroundEventTracking = {
    pendingTaskIds: new Set<string>(),
    handoffTurnIds: new Set<string>(),
  }
  // Same queue sendRequest() enqueues to — one FIFO for everything.
  const output = structuredIO.outbound
  const managedSession = createHeadlessManagedSession(initialMessages, {
    sessionId: session.bootstrapStateProvider.getSessionIdentity().sessionId,
    cwd: session.bootstrapStateProvider.getSessionIdentity().cwd,
    getWorkDir: () => session.bootstrapStateProvider.getSessionIdentity().cwd,
    onUpdated: updatedSession => {
      session.syncIndexedSession(updatedSession)
    },
    onStopped: stoppedSession => {
      void session.removeIndexedSession(stoppedSession.id)
    },
  })
  void session.registerIndexedSession(managedSession)
  const mutableMessages = managedSession.messages
  const contentReplacementState = provisionContentReplacementState(
    initialMessages,
    initialContentReplacements,
  )
  let loadedNestedMemoryPaths = extractLoadedNestedMemoryPathsFromMessages(
    initialMessages,
  )
  const emitOutput = (message: StdoutMessage) => {
    if (
      terminalResultEmitted &&
      (message.type === 'assistant' ||
        message.type === 'user' ||
        message.type === 'stream_event' ||
        message.type === 'streamlined_text' ||
        message.type === 'result')
    ) {
      return
    }
    managedSession.emitOutput(message)
  }
  const sessionOutput = {
    enqueue(message: StdoutMessage) {
      emitOutput(message)
    },
  }
  const outputSink = {
    send(message: StdoutMessage) {
      output.enqueue(message)
    },
  }
  managedSession.attachSink(outputSink)
  session.registerCleanup(() => {
    managedSession.detachSink(outputSink)
  })
  session.registerCleanup(async () => {
    const activeTurnId = headlessConversation.activeTurnId
    if (
      activeTurnId &&
      backgroundEventTracking.handoffTurnIds.has(activeTurnId)
    ) {
      headlessConversation.completeTurn(activeTurnId, 'end_turn')
      await managedSession.stopAndWait(false)
      return
    }

    await managedSession.stopAndWait(true)
  })

  const abortCurrentHeadlessTurn = (reason = 'interrupt') => {
    headlessConversation.abortActiveTurn(reason)
    managedSession.abortActiveTurn(reason)
  }

  // Ctrl+C in -p mode: abort the in-flight query, then shut down gracefully.
  // gracefulShutdown persists session state and flushes analytics, with a
  // failsafe timer that force-exits if cleanup hangs.
  const sigintHandler = () => {
    logForDiagnosticsNoPII('info', 'shutdown_signal', { signal: 'SIGINT' })
    abortCurrentHeadlessTurn('SIGINT')
    void gracefulShutdown(0)
  }
  process.on('SIGINT', sigintHandler)
  session.registerCleanup(() => {
    process.off('SIGINT', sigintHandler)
  })

  // Dump run()'s state at SIGTERM so a stuck session's healthsweep can name
  // the do/while(waitingForAgents) poll without reading the transcript.
  registerCleanup(async () => {
    const bg: Record<string, number> = {}
    for (const t of getRunningTasks(getAppState())) {
      if (isBackgroundTask(t)) bg[t.type] = (bg[t.type] ?? 0) + 1
    }
    logForDiagnosticsNoPII('info', 'run_state_at_shutdown', {
      run_active: running,
      run_phase: runPhase,
      worker_status: getSessionState(),
      internal_events_pending: structuredIO.internalEventsPending,
      bg_tasks: bg,
    })
  })

  // Wire the central onChangeAppState mode-diff hook to the SDK output stream.
  // This fires whenever ANY code path mutates toolPermissionContext.mode —
  // Shift+Tab, ExitPlanMode dialog, /plan slash command, rewind, bridge
  // set_permission_mode, the query loop, stop_task — rather than the two
  // paths that previously went through a bespoke wrapper.
  // The wrapper's body was fully redundant (it enqueued here AND called
  // notifySessionMetadataChanged, both of which onChangeAppState now covers);
  // keeping it would double-emit status messages.
  setPermissionModeChangedListener(newMode => {
    // Only emit for SDK-exposed modes.
    if (
      newMode === 'default' ||
      newMode === 'acceptEdits' ||
      newMode === 'bypassPermissions' ||
      newMode === 'plan' ||
      newMode === (feature('TRANSCRIPT_CLASSIFIER') && 'auto') ||
      newMode === 'dontAsk'
    ) {
      emitOutput({
        type: 'system',
        subtype: 'status',
        status: null,
        permissionMode: newMode as PermissionMode,
        uuid: randomUUID(),
        session_id:
          session.bootstrapStateProvider.getSessionIdentity().sessionId,
      })
    }
  })
  session.registerCleanup(() => {
    setPermissionModeChangedListener(null)
  })

  // Prompt suggestion tracking (push model)
  const suggestionState: {
    abortController: AbortController | null
    inflightPromise: Promise<void> | null
    lastEmitted: {
      text: string
      emittedAt: number
      promptId: PromptVariant
      generationRequestId: string | null
    } | null
    pendingSuggestion: {
      type: 'prompt_suggestion'
      suggestion: string
      uuid: UUID
      session_id: string
    } | null
    pendingLastEmittedEntry: {
      text: string
      promptId: PromptVariant
      generationRequestId: string | null
    } | null
  } = {
    abortController: null,
    inflightPromise: null,
    lastEmitted: null,
    pendingSuggestion: null,
    pendingLastEmittedEntry: null,
  }

  const emitCoordinatorLifecycleEvent = (
    event: CoordinatorLifecycleRuntimeEvent,
  ): void => {
    headlessConversation.eventBus.emit({
      conversationId: headlessConversation.id,
      ...event,
    })
  }

  const emitTeamLifecycleEvent = (
    args: Omit<
      Parameters<typeof createCoordinatorLifecycleEvent>[0],
      'teamName' | 'activeTeammateCount'
    > & {
      teamName?: string
      activeTeammateCount?: number
    },
  ): void => {
    const teamContext = getAppState().teamContext
    emitCoordinatorLifecycleEvent(
      createCoordinatorLifecycleEvent({
        ...args,
        teamName: args.teamName ?? teamContext?.teamName,
        activeTeammateCount:
          args.activeTeammateCount ??
          (teamContext?.teammates
            ? Object.keys(teamContext.teammates).length
            : undefined),
      }),
    )
  }

  const emitTeamShutdownRequested = (reason: string): void => {
    if (shutdownRequestEventEmitted) {
      return
    }
    shutdownRequestEventEmitted = true
    emitTeamLifecycleEvent({
      type: 'team.shutdown_requested',
      phase: 'team_shutdown',
      state: 'requested',
      source: 'headless_team_shutdown',
      reason,
    })
  }

  const emitTeamShutdownCompleted = (teamName?: string): void => {
    if (shutdownCompletedEventEmitted) {
      return
    }
    shutdownCompletedEventEmitted = true
    emitTeamLifecycleEvent({
      type: 'team.shutdown_completed',
      phase: 'team_shutdown',
      state: 'completed',
      source: 'headless_team_shutdown',
      teamName,
      activeTeammateCount: 0,
    })
  }

  const observeHeadlessBackgroundSdkEvent = (
    message: StdoutMessage,
    options: { emitLifecycle?: boolean } = {},
  ) => {
    observeHeadlessBackgroundSdkMessage(
      message,
      backgroundEventTracking,
      headlessConversation.activeTurnId,
    )
    if (options.emitLifecycle === false) {
      return
    }
    const lifecycleEvent = projectCoordinatorLifecycleFromSdkMessage(
      message,
      headlessConversation.activeTurnId,
    )
    if (lifecycleEvent) {
      emitCoordinatorLifecycleEvent(lifecycleEvent)
    }
  }

  const drainTrackedSdkEvents = (): StdoutMessage[] => {
    const events = drainSdkEvents()
    for (const event of events) {
      observeHeadlessBackgroundSdkEvent(event)
    }
    return events
  }

  const hasPendingHeadlessBackgroundWork = (): boolean =>
    backgroundEventTracking.pendingTaskIds.size > 0 ||
    hasHeadlessBackgroundWorkPending(getAppState())

  const flushHeldBackIfNoBackgroundWork = () => {
    if (hasPendingHeadlessBackgroundWork()) {
      return
    }
    if (terminalResultEmitted) {
      heldBackResult = null
      heldBackAssistantMessages = []
    }
    const hadHeldBackResult = heldBackResult !== null
    const flushed = flushHeldBackResultAndSuggestion({
      output: sessionOutput,
      heldBackResult,
      heldBackAssistantMessages,
      suggestionState,
    })
    heldBackResult = flushed.heldBackResult
    heldBackAssistantMessages = flushed.heldBackAssistantMessages
    if (hadHeldBackResult) {
      terminalResultEmitted = true
    }
  }

  // Set up AWS auth status listener if enabled
  let unsubscribeAuthStatus: (() => void) | undefined
  if (options.enableAuthStatus) {
    const authStatusManager = AwsAuthStatusManager.getInstance()
    unsubscribeAuthStatus = authStatusManager.subscribe(status => {
      emitOutput({
        type: 'auth_status',
        isAuthenticating: status.isAuthenticating,
        output: status.output,
        error: status.error,
        uuid: randomUUID(),
        session_id:
          session.bootstrapStateProvider.getSessionIdentity().sessionId,
      })
    })
  }

  // Set up rate limit status listener to emit SDKRateLimitEvent for all status changes.
  // Emitting for all statuses (including 'allowed') ensures consumers can clear warnings
  // when rate limits reset. The upstream emitStatusChange already deduplicates via isEqual.
  const rateLimitListener = (limits: ClaudeAILimits) => {
    const rateLimitInfo = toSDKRateLimitInfo(limits)
    if (rateLimitInfo) {
      emitOutput({
        type: 'rate_limit_event',
        rate_limit_info: rateLimitInfo,
        uuid: randomUUID(),
        session_id:
          session.bootstrapStateProvider.getSessionIdentity().sessionId,
      } as unknown as Parameters<typeof output.enqueue>[0])
    }
  }
  statusListeners.add(rateLimitListener)
  session.registerCleanup(() => {
    statusListeners.delete(rateLimitListener)
  })

  // Auto-resume interrupted turns on restart so CC continues from where it
  // left off without requiring the SDK to re-send the prompt.
  if (
    turnInterruptionState &&
    turnInterruptionState.kind !== 'none' &&
    resolveHeadlessResumeInterruptedTurn(options.resumeInterruptedTurn)
  ) {
    logForDebugging(
      `[print.ts] Auto-resuming interrupted turn (kind: ${turnInterruptionState.kind})`,
    )

    // Remove the interrupted message and its sentinel, then re-enqueue so
    // the model sees it exactly once. For mid-turn interruptions, the
    // deserialization layer transforms them into interrupted_prompt by
    // appending a synthetic "Continue from where you left off." message.
    enqueue({
      mode: 'prompt',
      value: managedSession.resumeInterruptedTurn(
        turnInterruptionState.message,
      ),
      uuid: randomUUID(),
    })
  }

  const modelOptions = getModelOptions()
  const modelInfos = modelOptions.map(option => {
    const modelId = option.value === null ? 'default' : option.value
    const resolvedModel =
      modelId === 'default'
        ? getDefaultMainLoopModel()
        : parseUserSpecifiedModel(modelId)
    const hasEffort = modelSupportsEffort(resolvedModel)
    const hasAdaptiveThinking = modelSupportsAdaptiveThinking(resolvedModel)
    const hasFastMode = isFastModeSupportedByModel(option.value)
    const hasAutoMode = modelSupportsAutoMode(resolvedModel)
    return {
      name: modelId,
      value: modelId,
      displayName: option.label,
      description: option.description,
      ...(hasEffort && {
        supportsEffort: true,
        supportedEffortLevels:
          getAPIProvider() === 'openai'
            ? EFFORT_LEVELS.filter(l => l !== 'max')
            : modelSupportsMaxEffort(resolvedModel)
              ? EFFORT_LEVELS.filter(l => l !== 'xhigh')
              : EFFORT_LEVELS.filter(l => l !== 'max' && l !== 'xhigh'),
      }),
      ...(hasAdaptiveThinking && { supportsAdaptiveThinking: true }),
      ...(hasFastMode && { supportsFastMode: true }),
      ...(hasAutoMode && { supportsAutoMode: true }),
    }
  })
  let activeUserSpecifiedModel = options.userSpecifiedModel

  function injectModelSwitchBreadcrumbs(
    modelArg: string,
    resolvedModel: string,
  ): void {
    const breadcrumbs = createModelSwitchBreadcrumbs(
      modelArg,
      modelDisplayString(resolvedModel),
    )
    managedSession.appendMessages(breadcrumbs)
    for (const crumb of breadcrumbs) {
      if (
        typeof crumb.message.content === 'string' &&
        crumb.message.content.includes(`<${LOCAL_COMMAND_STDOUT_TAG}>`)
      ) {
        emitOutput({
          type: 'user',
          content: crumb.message.content,
          message: crumb.message as unknown,
          session_id:
            session.bootstrapStateProvider.getSessionIdentity().sessionId,
          parent_tool_use_id: null,
          uuid: crumb.uuid,
          timestamp: crumb.timestamp,
          isReplay: true,
        } as unknown as StdoutMessage)
      }
    }
  }

  // Track which MCP clients have had elicitation handlers registered
  const elicitationRegistered = new Set<string>()

  /**
   * Register elicitation request/completion handlers on connected MCP clients
   * that haven't been registered yet. SDK MCP servers are excluded because they
   * route through SdkControlClientTransport. Hooks run first (matching REPL
   * behavior); if no hook responds, the request is forwarded to the SDK
   * consumer via the control protocol.
   */
  function registerElicitationHandlers(clients: MCPServerConnection[]): void {
    for (const connection of clients) {
      if (
        connection.type !== 'connected' ||
        elicitationRegistered.has(connection.name)
      ) {
        continue
      }
      // Skip SDK MCP servers — elicitation flows through SdkControlClientTransport
      if (connection.config.type === 'sdk') {
        continue
      }
      const serverName = connection.name

      // Wrapped in try/catch because setRequestHandler throws if the client wasn't
      // created with elicitation capability declared (e.g., SDK-created clients).
      try {
        connection.client.setRequestHandler(
          ElicitRequestSchema,
          async (request, extra) => {
            logMCPDebug(
              serverName,
              `Elicitation request received in print mode: ${jsonStringify(request)}`,
            )

            const mode = request.params.mode === 'url' ? 'url' : 'form'

            logEvent('tengu_mcp_elicitation_shown', {
              mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            })

            // Run elicitation hooks first — they can provide a response programmatically
            const hookResponse = await runElicitationHooks(
              serverName,
              request.params,
              extra.signal,
            )
            if (hookResponse) {
              logMCPDebug(
                serverName,
                `Elicitation resolved by hook: ${jsonStringify(hookResponse)}`,
              )
              logEvent('tengu_mcp_elicitation_response', {
                mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                action:
                  hookResponse.action as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              })
              return hookResponse
            }

            // Delegate to SDK consumer via control protocol
            const url =
              'url' in request.params
                ? (request.params.url as string)
                : undefined
            const requestedSchema =
              'requestedSchema' in request.params
                ? (request.params.requestedSchema as
                    | Record<string, unknown>
                    | undefined)
                : undefined

            const elicitationId =
              'elicitationId' in request.params
                ? (request.params.elicitationId as string | undefined)
                : undefined

            const rawResult = await structuredIO.handleElicitation(
              serverName,
              request.params.message,
              requestedSchema,
              extra.signal,
              mode,
              url,
              elicitationId,
            )

            const result = await runElicitationResultHooks(
              serverName,
              rawResult,
              extra.signal,
              mode,
              elicitationId,
            )

            logEvent('tengu_mcp_elicitation_response', {
              mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              action:
                result.action as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            })
            return result
          },
        )

        // Surface completion notifications to SDK consumers (URL mode)
        connection.client.setNotificationHandler(
          ElicitationCompleteNotificationSchema,
          notification => {
            const { elicitationId } = notification.params
            logMCPDebug(
              serverName,
              `Elicitation completion notification: ${elicitationId}`,
            )
            void executeNotificationHooks({
              message: `MCP server "${serverName}" confirmed elicitation ${elicitationId} complete`,
              notificationType: 'elicitation_complete',
            })
            emitOutput({
              type: 'system',
              subtype: 'elicitation_complete',
              mcp_server_name: serverName,
              elicitation_id: elicitationId,
              uuid: randomUUID(),
              session_id:
                session.bootstrapStateProvider.getSessionIdentity().sessionId,
            })
          },
        )

        elicitationRegistered.add(serverName)
      } catch {
        // setRequestHandler throws if the client wasn't created with
        // elicitation capability — skip silently
      }
    }
  }

  const mcpService = createRuntimeHeadlessMcpService({
    sdkMcpConfigs,
    getAppState,
    setAppState,
    sendMcpMessage: (serverName, message) =>
      structuredIO.sendMcpMessage(serverName, message),
  })

  void mcpService.updateSdk()

  // Shared tool assembly for runtime turns and the get_context_usage control request.
  // Closes over the runtime MCP service so both call
  // sites see late-connecting servers.
  const buildAllToolState = (appState: AppState) => {
    const assembledTools = assembleToolPool(
      appState.toolPermissionContext,
      appState.mcp.tools,
    )
    const mergedState = resolveMergedToolState({
      initialTools: [
        ...tools,
        ...mcpService.getSdkTools(),
        ...mcpService.getDynamicState().tools,
      ],
      assembled: assembledTools,
      mode: appState.toolPermissionContext.mode,
    })
    let allTools = dedupeToolsByName(mergedState.tools)
    if (options.permissionPromptToolName) {
      allTools = allTools.filter(
        tool => !toolMatchesName(tool, options.permissionPromptToolName!),
      )
    }
    const initJsonSchema =
      session.bootstrapStateProvider.getHeadlessControlState().initJsonSchema
    if (initJsonSchema && !options.jsonSchema) {
      const syntheticOutputResult = createSyntheticOutputTool(initJsonSchema)
      if ('tool' in syntheticOutputResult) {
        allTools = [...allTools, syntheticOutputResult.tool]
      }
    }
    return {
      tools: allTools,
      capabilityPlane:
        mergedState.executionMode === 'coordinator'
          ? stripRuntimeCoordinatorToolCapabilityPlane(
              createRuntimeCoordinatorToolCapabilityPlane(allTools),
            )
          : mergedState.capabilityPlane,
      executionMode: mergedState.executionMode,
    }
  }
  const buildAllTools = (appState: AppState): Tools =>
    buildAllToolState(appState).tools

  // Bridge handle for remote-control (SDK control message).
  // Mirrors the REPL's useReplBridge hook: the handle is created when
  // `remote_control` is enabled and torn down when disabled.
  let bridgeHandle: ReplBridgeHandle | null = null
  // Cursor into mutableMessages — tracks how far we've forwarded.
  // Same index-based diff as useReplBridge's lastWrittenIndexRef.
  let bridgeLastForwardedIndex = 0

  // Forward new messages from mutableMessages to the bridge.
  // Called incrementally during each turn (so claude.ai sees progress
  // and stays alive during permission waits) and again after the turn.
  //
  // writeMessages has its own UUID-based dedup (initialMessageUUIDs,
  // recentPostedUUIDs) — the index cursor here is a pre-filter to avoid
  // O(n) re-scanning of already-sent messages on every call.
  function forwardMessagesToBridge(): void {
    bridgeLastForwardedIndex = forwardBridgeMessages({
      bridgeHandle,
      bridgeLastForwardedIndex,
      mutableMessages,
    })
  }
  session.registerCleanup(() => {
    unsubscribeAuthStatus?.()
  })

  const runtimeCapabilities = createHeadlessRuntimeCapabilityBundle({
    initialCommands: commands,
    initialAgents: agents,
    getCwd: cwd,
    setAppState,
    mcpService,
  })

  async function installPluginsAndApplyMcpInBackground(): Promise<void> {
    return installPluginsAndApplyMcpInBackgroundRuntime({
      isRemoteMode:
        isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ||
        session.bootstrapStateProvider.getHeadlessControlState().isRemoteMode,
      applyPluginMcpDiff: runtimeCapabilities.applyPluginMcpDiff,
    })
  }

  // Background plugin installation for all headless users
  // Installs marketplaces from extraKnownMarketplaces and missing enabled plugins
  // CLAUDE_CODE_SYNC_PLUGIN_INSTALL=true: resolved in run() before the first
  // query so plugins are guaranteed available on the first runtime turn.
  let pluginInstallPromise: Promise<void> | null = null
  // --bare / SIMPLE: skip plugin install. Scripted calls don't add plugins
  // mid-session; the next interactive run reconciles.
  if (!isBareMode()) {
    if (isEnvTruthy(process.env.CLAUDE_CODE_SYNC_PLUGIN_INSTALL)) {
      pluginInstallPromise = installPluginsAndApplyMcpInBackground()
    } else {
      void installPluginsAndApplyMcpInBackground()
    }
  }

  // Idle timeout management
  const idleTimeout = createIdleTimeoutManager(() => !running)

  // Subscribe to skill changes for hot reloading
  const unsubscribeSkillChanges = skillChangeDetector.subscribe(() => {
    clearCommandsCache()
    void runtimeCapabilities.refreshCommands()
  })
  session.registerCleanup(unsubscribeSkillChanges)

  // Proactive mode: schedule a tick to keep the model looping autonomously.
  // setTimeout(0) yields to the event loop so pending stdin messages
  // (interrupts, user messages) are processed before the tick fires.
  const scheduleProactiveTick =
    feature('PROACTIVE') || feature('KAIROS')
      ? () => {
          setTimeout(() => {
            if (
              !proactiveModule?.isProactiveActive() ||
              proactiveModule.isProactivePaused() ||
              inputClosed
            ) {
              return
            }
            void (async () => {
              const commands = await createProactiveAutonomyCommands({
                basePrompt: `<${TICK_TAG}>${new Date().toLocaleTimeString()}</${TICK_TAG}>`,
                currentDir: cwd(),
                shouldCreate: () => !inputClosed,
              })
              for (const command of commands) {
                if (inputClosed) {
                  return
                }
                enqueue({
                  ...command,
                  uuid: randomUUID(),
                })
              }
              void run()
            })()
          }, 0)
        }
      : undefined

  let didCleanupSession = false
  const cleanupHeadlessSession = async () => {
    if (didCleanupSession) {
      return
    }
    didCleanupSession = true
    emitTeamLifecycleEvent({
      type: 'team.cleanup_started',
      phase: 'team_cleanup',
      state: 'started',
      source: 'headless_team_cleanup',
    })
    try {
      if (suggestionState.inflightPromise) {
        await Promise.race([suggestionState.inflightPromise, sleep(5000)])
      }
      suggestionState.abortController?.abort()
      suggestionState.abortController = null
      await finalizePendingAsyncHooks()
      emitTeamLifecycleEvent({
        type: 'team.cleanup_completed',
        phase: 'team_cleanup',
        state: 'completed',
        source: 'headless_team_cleanup',
      })
    } catch (error) {
      emitTeamLifecycleEvent({
        type: 'team.cleanup_failed',
        phase: 'team_cleanup',
        state: 'failed',
        source: 'headless_team_cleanup',
        error: errorMessage(error),
      })
      throw error
    } finally {
      await session.cleanup()
      output.done()
    }
  }

  // Abort the current operation when a 'now' priority message arrives.
  const unsubscribeQueueAbort = subscribeToCommandQueue(() => {
    const activeAbortController = managedSession.getAbortController()
    if (activeAbortController && getCommandsByMaxPriority('now').length > 0) {
      activeAbortController.abort('interrupt')
    }
  })
  session.registerCleanup(unsubscribeQueueAbort)

  const run = async () => {
    if (running) {
      return
    }

    running = true
    runPhase = undefined
    notifySessionStateChanged('running')
    idleTimeout.stop()

    headlessProfilerCheckpoint('run_entry')
    // TODO(custom-tool-refactor): Should move to the init message, like browser

    await mcpService.updateSdk()
    headlessProfilerCheckpoint('after_updateSdkMcp')

    // Resolve deferred plugin installation (CLAUDE_CODE_SYNC_PLUGIN_INSTALL).
    // The promise was started eagerly so installation overlaps with other init.
    // Awaiting here guarantees plugins are available before the first runtime turn.
    // If CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS is set, races against that
    // deadline and proceeds without plugins on timeout (logging an error).
    if (pluginInstallPromise) {
      const timeoutMs = parseInt(
        process.env.CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS || '',
        10,
      )
      if (timeoutMs > 0) {
        const timeout = sleep(timeoutMs).then(() => 'timeout' as const)
        const result = await Promise.race([pluginInstallPromise, timeout])
        if (result === 'timeout') {
          logError(
            new Error(
              `CLAUDE_CODE_SYNC_PLUGIN_INSTALL: plugin installation timed out after ${timeoutMs}ms`,
            ),
          )
          logEvent('tengu_sync_plugin_install_timeout', {
            timeout_ms: timeoutMs,
          })
        }
      } else {
        await pluginInstallPromise
      }
      pluginInstallPromise = null

      // Refresh commands, agents, and hooks now that plugins are installed
      await runtimeCapabilities.refresh()
    }

    // Only main-thread commands (agentId===undefined) — subagent
    // notifications are drained by the subagent's mid-turn gate in query.ts.
    // Defined outside the try block so it's accessible in the post-finally
    // queue re-checks at the bottom of run().
    const isMainThread = (cmd: QueuedCommand) => cmd.agentId === undefined

    try {
      let command: QueuedCommand | undefined
      let waitingForAgents = false

      // Extract command processing into a named function for the do-while pattern.
      // Drains the queue, batching consecutive prompt-mode commands into one
      // runtime turn so messages that queued up during a long turn coalesce
      // into a single follow-up turn instead of N separate turns.
      const drainCommandQueue = async () => {
        while ((command = dequeue(isMainThread))) {
          if (
            command.mode !== 'prompt' &&
            command.mode !== 'orphaned-permission' &&
            command.mode !== 'task-notification'
          ) {
            throw new Error(
              'only prompt commands are supported in streaming mode',
            )
          }

          // Non-prompt commands (task-notification, orphaned-permission) carry
          // side effects or orphanedPermission state, so they process singly.
          // Prompt commands greedily collect followers with matching workload.
          const batch: QueuedCommand[] = [command]
          if (command.mode === 'prompt') {
            while (canBatchWith(command, peek(isMainThread))) {
              batch.push(dequeue(isMainThread)!)
            }
            if (batch.length > 1) {
              command = {
                ...command,
                value: joinPromptValues(batch.map(c => c.value)),
                uuid: batch.findLast(c => c.uuid)?.uuid ?? command.uuid,
              }
            }
          }
          const batchUuids = batch.map(c => c.uuid).filter(u => u !== undefined)

          // QueryEngine will emit a replay for command.uuid (the last uuid in
          // the batch) via its messagesToAck path. Emit replays here for the
          // rest so consumers that track per-uuid delivery (clank's
          // asyncMessages footer, CCR) see an ack for every message they sent,
          // not just the one that survived the merge.
          if (options.replayUserMessages && batch.length > 1) {
            for (const c of batch) {
              if (c.uuid && c.uuid !== command.uuid) {
                emitOutput({
                  type: 'user',
                  content: c.value,
                  message: { role: 'user', content: c.value } as unknown,
                  session_id:
                    session.bootstrapStateProvider.getSessionIdentity()
                      .sessionId,
                  parent_tool_use_id: null,
                  uuid: c.uuid as string,
                  isReplay: true,
                } as unknown as StdoutMessage)
              }
            }
          }

          // Combine all MCP clients. appState.mcp is populated incrementally
          // per-server by main.tsx (mirrors useManageMCPConnections). Reading
          // fresh per-command means late-connecting servers are visible on the
          // next turn. registerElicitationHandlers is idempotent (tracking set).
          const appState = getAppState()
          const allMcpClients = mcpService.getAllClients(appState.mcp.clients)
          registerElicitationHandlers(allMcpClients)
          // Channel handlers for servers allowlisted via --channels at
          // construction time (or enableChannel() mid-session). Runs every
          // turn like registerElicitationHandlers — idempotent per-client
          // (setNotificationHandler replaces, not stacks) and no-ops for
          // non-allowlisted servers (one feature-flag check).
          for (const client of allMcpClients) {
            reregisterChannelHandlerAfterReconnect(
              client,
              session.bootstrapStateProvider,
            )
          }

          const toolState = buildAllToolState(appState)
          const allTools = toolState.tools

          for (const uuid of batchUuids) {
            notifyCommandLifecycle(uuid, 'started')
          }

          // Task notifications arrive when background agents complete.
          // Emit an SDK system event for SDK consumers, then fall through
          // to the runtime turn so the model sees the agent result and can act on it.
          // This matches TUI behavior where useQueueProcessor always feeds
          // notifications to the model regardless of coordinator mode.
          const preludeEvents: RuntimeTurnPreludeEvent[] = []
          if (command.mode === 'task-notification') {
            const taskNotificationProjection =
              projectHeadlessTaskNotification({
                value: command.value,
                sessionId:
                  session.bootstrapStateProvider.getSessionIdentity().sessionId,
                uuid: randomUUID(),
              })

            // Only emit terminal task notifications. Stream events from
            // enqueueStreamEvent carry no <status> and must not close SDK tasks.
            if (taskNotificationProjection) {
              preludeEvents.push(taskNotificationProjection.runtimeEvent)
              preludeEvents.push(taskNotificationProjection.handoffEvent)
              observeHeadlessBackgroundSdkEvent(
                taskNotificationProjection.sdkMessage,
                { emitLifecycle: false },
              )
              emitOutput(taskNotificationProjection.sdkMessage)
            }
            // No continue -- fall through so the runtime turn processes the result.
          }

          const input = command.value
          const autonomyRunIds = batch
            .map(item => item.autonomy?.runId)
            .filter((runId): runId is string => Boolean(runId))

          if (structuredIO instanceof RemoteIO && command.mode === 'prompt') {
            logEvent('tengu_bridge_message_received', {
              is_repl: false,
            })
          }

          // Abort any in-flight suggestion generation and track acceptance
          suggestionState.abortController?.abort()
          suggestionState.abortController = null
          suggestionState.pendingSuggestion = null
          suggestionState.pendingLastEmittedEntry = null
          if (suggestionState.lastEmitted) {
            if (command.mode === 'prompt') {
              // SDK user messages enqueue ContentBlockParam[], not a plain string
              const inputText =
                typeof input === 'string'
                  ? input
                  : (
                      input.find(b => b.type === 'text') as
                        | { type: 'text'; text: string }
                        | undefined
                    )?.text
              if (typeof inputText === 'string') {
                logSuggestionOutcome(
                  suggestionState.lastEmitted.text,
                  inputText,
                  suggestionState.lastEmitted.emittedAt,
                  suggestionState.lastEmitted.promptId,
                  suggestionState.lastEmitted.generationRequestId,
                )
              }
              suggestionState.lastEmitted = null
            }
          }

          // Per-iteration ALS context so bg agents spawned inside runtime turns
          // inherit workload across their detached awaits. In-process cron
          // stamps cmd.workload; the SDK --workload flag is options.workload.
          // const-capture: TS loses `while ((command = dequeue()))` narrowing
          // inside the closure.
          const cmd = command
          const runtimeTurnId = resolveHeadlessRuntimeTurnId(cmd.uuid)
          headlessConversation.runTurn({
            turnId: runtimeTurnId,
            prompt: input,
            metadata: {
              commandMode: cmd.mode,
              batchUuids,
              isMeta: cmd.isMeta,
            },
          })
          const turnAbortController = managedSession.startTurn()
          let runtimeTurnFinalized = false
          const abortRuntimeTurn = () => {
            if (terminalResultEmitted) {
              return
            }
            if (runtimeTurnFinalized) {
              return
            }
            const reason = turnAbortController.signal.reason ?? 'interrupt'
            const activeTurnId = headlessConversation.activeTurnId
            if (
              reason === 'shutdown' &&
              activeTurnId &&
              (backgroundEventTracking.handoffTurnIds.has(activeTurnId) ||
                backgroundEventTracking.pendingTaskIds.size > 0)
            ) {
              runtimeTurnFinalized = true
              headlessConversation.completeTurn(activeTurnId, 'end_turn')
              return
            }
            headlessConversation.abortActiveTurn(
              reason,
            )
          }
          turnAbortController.signal.addEventListener(
            'abort',
            abortRuntimeTurn,
            { once: true },
          )
          const turnStartTime = feature('FILE_PERSISTENCE')
            ? Date.now()
            : undefined

          headlessProfilerCheckpoint('before_ask')
          startQueryProfile()
          for (const runId of autonomyRunIds) {
            await markAutonomyRunRunning(runId)
          }
          let lastResultIsError = false
          const finalizeRuntimeTurn = (
            outcome: 'completed' | 'failed',
            value: unknown,
          ) => {
            if (runtimeTurnFinalized) {
              return
            }
            runtimeTurnFinalized = true
            if (outcome === 'completed') {
              headlessConversation.completeTurn(
                runtimeTurnId,
                typeof value === 'string' ? value : null,
              )
              return
            }
            headlessConversation.failTurn(runtimeTurnId, value)
          }

          try {
            await runWithWorkload(
              cmd.workload ?? options.workload,
              async () => {
                for await (const envelope of askRuntime({
                  commands: uniqBy(
                    [
                      ...runtimeCapabilities.getCommands(),
                      ...appState.mcp.commands,
                    ],
                    'name',
                  ),
                  prompt: input,
                  promptUuid: cmd.uuid,
                  isMeta: cmd.isMeta,
                  cwd: cwd(),
                  tools: allTools,
                  verbose: options.verbose,
                  mcpClients: allMcpClients,
                  thinkingConfig: options.thinkingConfig,
                  maxTurns: options.maxTurns,
                  maxBudgetUsd: options.maxBudgetUsd,
                  taskBudget: options.taskBudget,
                  canUseTool,
                  userSpecifiedModel: activeUserSpecifiedModel,
                  fallbackModel: options.fallbackModel,
                  jsonSchema:
                    session.bootstrapStateProvider.getHeadlessControlState()
                      .initJsonSchema ?? options.jsonSchema,
                  mutableMessages,
                  contentReplacementState,
                  initialLoadedNestedMemoryPaths: Array.from(
                    loadedNestedMemoryPaths,
                  ),
                  getReadFileCache: () => managedSession.getReadFileCache(),
                  setReadFileCache: cache =>
                    managedSession.commitReadFileCache(cache),
                  customSystemPrompt: options.systemPrompt,
                  appendSystemPrompt: options.appendSystemPrompt,
                  getAppState,
                  setAppState,
                  bootstrapStateProvider: session.bootstrapStateProvider,
                  abortController: turnAbortController,
                  replayUserMessages: options.replayUserMessages,
                  includePartialMessages: options.includePartialMessages,
                  handleElicitation: (serverName, params, elicitSignal) =>
                    structuredIO.handleElicitation(
                      serverName,
                      params.message,
                      'requestedSchema' in params
                        ? params.requestedSchema
                        : undefined,
                      elicitSignal,
                      params.mode,
                      'url' in params ? params.url : undefined,
                      'elicitationId' in params
                        ? params.elicitationId
                        : undefined,
                    ),
                  agents: runtimeCapabilities.getAgents(),
                  orphanedPermission: cmd.orphanedPermission,
                  executionMode: toolState.executionMode ?? 'headless',
                  capabilityPlane: toolState.capabilityPlane,
                  preludeEvents,
                  setSDKStatus: status => {
                    emitOutput({
                      type: 'system',
                      subtype: 'status',
                      status: status as 'compacting' | null,
                      session_id:
                        session.bootstrapStateProvider.getSessionIdentity()
                          .sessionId,
                        uuid: randomUUID(),
                    })
                  },
                })) {
                  const sdkMessage =
                    projectRuntimeEnvelopeToLegacySDKMessage(envelope)
                  if (!sdkMessage) {
                    continue
                  }
                  const message = sdkMessage as unknown as StdoutMessage
                  // Runtime-first execution can surface task bookends as the
                  // current SDK message, not only through the side SDK queue.
                  // Track both sources before deciding whether headless can
                  // drain/cleanup or must wait for background completion.
                  observeHeadlessBackgroundSdkEvent(message)
                  // Forward messages to bridge incrementally (mid-turn) so
                  // claude.ai sees progress and the connection stays alive
                  // while blocked on permission requests.
                  forwardMessagesToBridge()

                  const emission = emitHeadlessRuntimeMessage({
                    message,
                    output: sessionOutput,
                    drainSdkEvents: drainTrackedSdkEvents,
                    hasBackgroundTasks: hasPendingHeadlessBackgroundWork,
                    heldBackResult,
                    heldBackAssistantMessages,
                    terminalResultEmitted,
                  })
                  heldBackResult = emission.heldBackResult
                  heldBackAssistantMessages = emission.heldBackAssistantMessages
                  if (emission.terminalResultEmitted) {
                    terminalResultEmitted = true
                  }
                  if (emission.lastResultIsError !== undefined) {
                    lastResultIsError = emission.lastResultIsError
                  }
                }
              },
            ) // end runWithWorkload
            if (lastResultIsError) {
              finalizeRuntimeTurn('failed', 'ask_result_error')
              for (const runId of autonomyRunIds) {
                await finalizeAutonomyRunFailed({
                  runId,
                  error: 'runtime turn returned an error result',
                })
              }
            } else {
              finalizeRuntimeTurn('completed', 'end_turn')
              for (const runId of autonomyRunIds) {
                const nextCommands = await finalizeAutonomyRunCompleted({
                  runId,
                  currentDir: cwd(),
                  priority: 'later',
                  workload: cmd.workload ?? options.workload,
                })
                for (const nextCommand of nextCommands) {
                  enqueue({
                    ...nextCommand,
                    uuid: randomUUID(),
                  })
                }
              }
            }
          } catch (error) {
            if (turnAbortController.signal.aborted && terminalResultEmitted) {
              finalizeRuntimeTurn(
                lastResultIsError ? 'failed' : 'completed',
                lastResultIsError ? 'ask_result_error' : 'end_turn',
              )
            } else {
              finalizeRuntimeTurn(
                turnAbortController.signal.aborted ? 'completed' : 'failed',
                turnAbortController.signal.aborted ? 'aborted' : error,
              )
            }
            for (const runId of autonomyRunIds) {
              await finalizeAutonomyRunFailed({
                runId,
                error: String(error),
              })
            }
            throw error
          } finally {
            loadedNestedMemoryPaths =
              extractLoadedNestedMemoryPathsFromMessages(mutableMessages)
            turnAbortController.signal.removeEventListener(
              'abort',
              abortRuntimeTurn,
            )
          }

          for (const uuid of batchUuids) {
            notifyCommandLifecycle(uuid, 'completed')
          }

          // Forward messages to bridge after each turn
          forwardMessagesToBridge()
          bridgeHandle?.sendResult()

          if (feature('FILE_PERSISTENCE') && turnStartTime !== undefined) {
            void executeFilePersistence(
              {
                turnStartTime,
              } as import('src/utils/filePersistence/types.js').TurnStartTime,
              turnAbortController.signal,
              result => {
                const filesResult = result as unknown as {
                  persistedFiles: { filename: string; file_id: string }[]
                  failedFiles: { filename: string; error: string }[]
                }
                emitOutput(
                  createFilesPersistedMessage({
                    result: filesResult,
                    sessionId:
                      session.bootstrapStateProvider.getSessionIdentity()
                        .sessionId,
                  }),
                )
              },
            )
          }

          // Generate and emit prompt suggestion for SDK consumers
          if (
            options.promptSuggestions &&
            !isEnvDefinedFalsy(process.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION)
          ) {
            // TS narrows suggestionState to never in the while loop body;
            // cast via unknown to reset narrowing.
            const state = suggestionState as unknown as typeof suggestionState
            state.abortController?.abort()
            const localAbort = new AbortController()
            suggestionState.abortController = localAbort

            const cacheSafeParams = getLastCacheSafeParams()
            if (!cacheSafeParams) {
              logSuggestionSuppressed(
                'sdk_no_params',
                undefined,
                undefined,
                'sdk',
              )
            } else {
              // Use a ref object so the IIFE's finally can compare against its own
              // promise without a self-reference (which upsets TypeScript's flow analysis).
              const ref: { promise: Promise<void> | null } = { promise: null }
              ref.promise = (async () => {
                try {
                  const result = await tryGenerateSuggestion(
                    localAbort,
                    mutableMessages,
                    getAppState,
                    cacheSafeParams,
                    'sdk',
                  )
                  if (!result || localAbort.signal.aborted) return
                  const suggestionMsg = {
                    type: 'prompt_suggestion' as const,
                    suggestion: result.suggestion,
                    uuid: randomUUID(),
                    session_id:
                      session.bootstrapStateProvider.getSessionIdentity()
                        .sessionId,
                  }
                  const lastEmittedEntry = {
                    text: result.suggestion,
                    emittedAt: Date.now(),
                    promptId: result.promptId,
                    generationRequestId: result.generationRequestId,
                  }
                  // Defer emission if the result is being held for background agents,
                  // so that prompt_suggestion always arrives after result.
                  // Only set lastEmitted when the suggestion is actually delivered
                  // to the consumer; deferred suggestions may be discarded before
                  // delivery if a new command arrives first.
                  if (heldBackResult) {
                    suggestionState.pendingSuggestion = suggestionMsg
                    suggestionState.pendingLastEmittedEntry = {
                      text: lastEmittedEntry.text,
                      promptId: lastEmittedEntry.promptId,
                      generationRequestId: lastEmittedEntry.generationRequestId,
                    }
                  } else {
                    suggestionState.lastEmitted = lastEmittedEntry
                    emitOutput(suggestionMsg)
                  }
                } catch (error) {
                  if (
                    error instanceof Error &&
                    (error.name === 'AbortError' ||
                      error.name === 'APIUserAbortError')
                  ) {
                    logSuggestionSuppressed(
                      'aborted',
                      undefined,
                      undefined,
                      'sdk',
                    )
                    return
                  }
                  logError(toError(error))
                } finally {
                  if (suggestionState.inflightPromise === ref.promise) {
                    suggestionState.inflightPromise = null
                  }
                }
              })()
              suggestionState.inflightPromise = ref.promise
            }
          }

          // Log headless profiler metrics for this turn and start next turn
          logHeadlessProfilerTurn()
          logQueryProfileReport()
          headlessProfilerStartTurn()
        }
      }

      // Use a do-while loop to drain commands and then wait for any
      // background agents that are still running. When agents complete,
      // their notifications are enqueued and the loop re-drains.
      do {
        // Drain SDK events (task_started, task_progress) before command queue
        // so progress events precede task_notification on the stream.
        for (const event of drainTrackedSdkEvents()) {
          emitOutput(event)
        }
        flushHeldBackIfNoBackgroundWork()

        runPhase = 'draining_commands'
        await drainCommandQueue()

        // Check for running background tasks before exiting.
        // Exclude in_process_teammate — teammates are long-lived by design
        // (status: 'running' for their whole lifetime, cleaned up by the
        // shutdown protocol, not by transitioning to 'completed'). Waiting
        // on them here loops forever (gh-30008). Same exclusion already
        // exists at useBackgroundTaskNavigation.ts:55 for the same reason;
        // L1839 above is already narrower (type === 'local_agent') so it
        // doesn't hit this.
        waitingForAgents = false
        {
          const hasRunningBg = hasPendingHeadlessBackgroundWork()
          const hasMainThreadQueued = peek(isMainThread) !== undefined
          if (hasRunningBg || hasMainThreadQueued) {
            waitingForAgents = true
            if (!hasMainThreadQueued) {
              runPhase = 'waiting_for_agents'
              // No commands ready yet, wait for tasks to complete
              await sleep(100)
            }
            // Loop back to drain any newly queued commands
          }
        }
      } while (waitingForAgents)

      flushHeldBackIfNoBackgroundWork()
    } catch (error) {
      // Emit error result message before shutting down
      // Write directly to structuredIO to ensure immediate delivery
      try {
        if (!terminalResultEmitted) {
          await structuredIO.write({
            type: 'result',
            subtype: 'error_during_execution',
            duration_ms: 0,
            duration_api_ms: 0,
            is_error: true,
            num_turns: 0,
            stop_reason: null,
            session_id:
              session.bootstrapStateProvider.getSessionIdentity().sessionId,
            total_cost_usd: 0,
            usage: EMPTY_USAGE,
            modelUsage: {},
            permission_denials: [],
            uuid: randomUUID(),
            errors: [
              errorMessage(error),
              ...getInMemoryErrors().map(_ => _.error),
            ],
          })
          terminalResultEmitted = true
        }
      } catch {
        // If we can't emit the error result, continue with shutdown anyway
      }
      suggestionState.abortController?.abort()
      shutdownHeadless(1)
      return
    } finally {
      runPhase = 'finally_flush'
      // Flush pending internal events before going idle
      await structuredIO.flushInternalEvents()
      runPhase = 'finally_post_flush'
      if (!isShuttingDown()) {
        notifySessionStateChanged('idle')
        // Drain so the idle session_state_changed SDK event (plus any
        // terminal task_notification bookends emitted during bg-agent
        // teardown) reach the output stream before we block on the next
        // command. The do-while drain above only runs while
        // waitingForAgents; once we're here the next drain would be the
        // top of the next run(), which won't come if input is idle.
        for (const event of drainTrackedSdkEvents()) {
          emitOutput(event)
        }
        flushHeldBackIfNoBackgroundWork()
      }
      running = false
      // Start idle timer when we finish processing and are waiting for input
      idleTimeout.start()
    }

    // Proactive tick: if proactive is active and queue is empty, inject a tick
    if (
      (feature('PROACTIVE') || feature('KAIROS')) &&
      proactiveModule?.isProactiveActive() &&
      !proactiveModule.isProactivePaused()
    ) {
      if (peek(isMainThread) === undefined && !inputClosed) {
        scheduleProactiveTick!()
        return
      }
    }

    // Re-check the queue after releasing the mutex. A message may have
    // arrived (and called run()) between the last dequeue() returning
    // undefined and `running = false` above. In that case the caller
    // saw `running === true` and returned immediately, leaving the
    // message stranded in the queue with no one to process it.
    if (peek(isMainThread) !== undefined) {
      void run()
      return
    }

    // Check for unread teammate messages and process them
    // This mirrors what useInboxPoller does in interactive REPL mode
    // Poll until no more messages (teammates may still be working)
    {
      const currentAppState = getAppState()
      const teamContext = currentAppState.teamContext

      if (teamContext && isTeamLead(teamContext)) {
        const agentName = 'team-lead'

        // Poll for messages while teammates are active
        // This is needed because teammates may send messages while we're waiting
        // Keep polling until the team is shut down
        const POLL_INTERVAL_MS = 500

        while (true) {
          // Check if teammates are still active
          const refreshedState = getAppState()
          const hasActiveTeammates =
            hasActiveInProcessTeammates(refreshedState) ||
            (refreshedState.teamContext &&
              Object.keys(refreshedState.teamContext.teammates).length > 0)

          if (!hasActiveTeammates) {
            logForDebugging(
              '[print.ts] No more active teammates, stopping poll',
            )
            if (inputClosed || shutdownPromptInjected) {
              emitTeamShutdownCompleted(refreshedState.teamContext?.teamName)
            }
            break
          }

          const unread = await readUnreadMessages(
            agentName,
            refreshedState.teamContext?.teamName,
          )

          if (unread.length > 0) {
            logForDebugging(
              `[print.ts] Team-lead found ${unread.length} unread messages`,
            )

            // Mark as read immediately to avoid duplicate processing
            await markMessagesAsRead(
              agentName,
              refreshedState.teamContext?.teamName,
            )

            // Process shutdown_approved messages - remove teammates from team file
            // This mirrors what useInboxPoller does in interactive mode (lines 546-606)
            const teamName = refreshedState.teamContext?.teamName
            for (const m of unread) {
              const shutdownApproval = isShutdownApproved(m.text)
              if (shutdownApproval && teamName) {
                const teammateToRemove = shutdownApproval.from
                logForDebugging(
                  `[print.ts] Processing shutdown_approved from ${teammateToRemove}`,
                )
                emitTeamLifecycleEvent({
                  type: 'team.shutdown_approved',
                  phase: 'team_shutdown',
                  state: 'approved',
                  source: 'headless_team_shutdown',
                  teamName,
                  teammateName: teammateToRemove,
                })

                // Find the teammate ID by name
                const teammateId = refreshedState.teamContext?.teammates
                  ? Object.entries(refreshedState.teamContext.teammates).find(
                      ([, t]) => t.name === teammateToRemove,
                    )?.[0]
                  : undefined

                if (teammateId) {
                  emitTeamLifecycleEvent({
                    type: 'team.cleanup_started',
                    phase: 'team_cleanup',
                    state: 'started',
                    source: 'headless_team_cleanup',
                    teamName,
                    teammateId,
                    teammateName: teammateToRemove,
                    reason: 'shutdown_approved',
                  })
                  try {
                    // Remove from team file
                    removeTeammateFromTeamFile(teamName, {
                      agentId: teammateId,
                      name: teammateToRemove,
                    })
                    logForDebugging(
                      `[print.ts] Removed ${teammateToRemove} from team file`,
                    )

                    // Unassign tasks owned by this teammate
                    await unassignTeammateTasks(
                      teamName,
                      teammateId,
                      teammateToRemove,
                      'shutdown',
                    )

                    // Remove from teamContext in AppState
                    setAppState(prev => {
                      if (!prev.teamContext?.teammates) return prev
                      if (!(teammateId in prev.teamContext.teammates))
                        return prev
                      const { [teammateId]: _, ...remainingTeammates } =
                        prev.teamContext.teammates
                      return {
                        ...prev,
                        teamContext: {
                          ...prev.teamContext,
                          teammates: remainingTeammates,
                        },
                      }
                    })
                    emitTeamLifecycleEvent({
                      type: 'team.cleanup_completed',
                      phase: 'team_cleanup',
                      state: 'completed',
                      source: 'headless_team_cleanup',
                      teamName,
                      teammateId,
                      teammateName: teammateToRemove,
                      reason: 'shutdown_approved',
                    })
                  } catch (error) {
                    emitTeamLifecycleEvent({
                      type: 'team.cleanup_failed',
                      phase: 'team_cleanup',
                      state: 'failed',
                      source: 'headless_team_cleanup',
                      teamName,
                      teammateId,
                      teammateName: teammateToRemove,
                      reason: 'shutdown_approved',
                      error: errorMessage(error),
                    })
                    throw error
                  }
                }
              }
            }

            // Format messages same as useInboxPoller
            const formatted = unread
              .map(
                (m: { from: string; text: string; color?: string }) =>
                  `<${TEAMMATE_MESSAGE_TAG} teammate_id="${m.from}"${m.color ? ` color="${m.color}"` : ''}>\n${m.text}\n</${TEAMMATE_MESSAGE_TAG}>`,
              )
              .join('\n\n')

            // Enqueue and process
            enqueue({
              mode: 'prompt',
              value: formatted,
              uuid: randomUUID(),
            })
            void run()
            return // run() will come back here after processing
          }

          // No messages - check if we need to prompt for shutdown
          // If input is closed and teammates are active, inject shutdown prompt once
          if (inputClosed && !shutdownPromptInjected) {
            shutdownPromptInjected = true
            logForDebugging(
              '[print.ts] Input closed with active teammates, injecting shutdown prompt',
            )
            emitTeamShutdownRequested('input_closed')
            enqueue({
              mode: 'prompt',
              value: SHUTDOWN_TEAM_PROMPT,
              uuid: randomUUID(),
            })
            void run()
            return // run() will come back here after processing
          }

          // Wait and check again
          await sleep(POLL_INTERVAL_MS)
        }
      }
    }

    if (inputClosed) {
      // Check for active swarm that needs shutdown
      const hasActiveSwarm = await (async () => {
        // Wait for any working in-process team members to finish
        const currentAppState = getAppState()
        if (hasWorkingInProcessTeammates(currentAppState)) {
          emitTeamLifecycleEvent({
            type: 'team.idle_wait_started',
            phase: 'team_idle',
            state: 'waiting',
            source: 'headless_team_idle',
          })
          await waitForTeammatesToBecomeIdle(setAppState, currentAppState)
          emitTeamLifecycleEvent({
            type: 'team.idle_reached',
            phase: 'team_idle',
            state: 'reached',
            source: 'headless_team_idle',
          })
        }

        // Re-fetch state after potential wait
        const refreshedAppState = getAppState()
        const refreshedTeamContext = refreshedAppState.teamContext
        const hasTeamMembersNotCleanedUp =
          refreshedTeamContext &&
          Object.keys(refreshedTeamContext.teammates).length > 0

        return (
          hasTeamMembersNotCleanedUp ||
          hasActiveInProcessTeammates(refreshedAppState)
        )
      })()

      if (hasActiveSwarm) {
        // Team members are idle or pane-based - inject prompt to shut down team
        emitTeamShutdownRequested('active_swarm_on_input_closed')
        enqueue({
          mode: 'prompt',
          value: SHUTDOWN_TEAM_PROMPT,
          uuid: randomUUID(),
        })
        void run()
      } else {
        emitTeamShutdownCompleted()
        await cleanupHeadlessSession()
      }
    }
  }

  // Set up UDS inbox callback so the query loop is kicked off
  // when a message arrives via the UDS socket in headless mode.
  if (feature('UDS_INBOX')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { setOnEnqueue } = require('../../../../utils/udsMessaging.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    setOnEnqueue(() => {
      if (!inputClosed) {
        void run()
      }
    })
  }

  // Cron scheduler: runs scheduled_tasks.json tasks in SDK/-p mode.
  // Mirrors REPL's useScheduledTasks hook. Fired prompts enqueue + kick
  // off run() directly — unlike REPL, there's no queue subscriber here
  // that drains on enqueue while idle. The run() mutex makes this safe
  // during an active turn: the call no-ops and the post-run recheck at
  // the end of run() picks up the queued command.
  let cronScheduler:
    | import('../../../../utils/cronScheduler.js').CronScheduler
    | null = null
  if (cronGate.isKairosCronEnabled()) {
    cronScheduler = cronSchedulerModule.createCronScheduler({
      onFire: prompt => {
        if (inputClosed) return
        void (async () => {
          const prepared = await prepareAutonomyTurnPrompt({
            basePrompt: prompt,
            trigger: 'scheduled-task',
            currentDir: cwd(),
          })
          if (inputClosed) return
          const command = await commitAutonomyQueuedPrompt({
            prepared,
            currentDir: cwd(),
            workload: WORKLOAD_CRON,
          })
          if (inputClosed) return
          enqueue({
            ...command,
            uuid: randomUUID(),
          })
          void run()
        })()
      },
      onFireTask: task => {
        if (inputClosed) return
        void (async () => {
          if (task.agentId) {
            const prepared = await prepareAutonomyTurnPrompt({
              basePrompt: task.prompt,
              trigger: 'scheduled-task',
              currentDir: cwd(),
            })
            if (inputClosed) return
            const command = await commitAutonomyQueuedPrompt({
              prepared,
              currentDir: cwd(),
              sourceId: task.id,
              sourceLabel: task.prompt,
              workload: WORKLOAD_CRON,
            })
            await markAutonomyRunFailed(
              command.autonomy!.runId,
              `No teammate runtime available for scheduled task owner ${task.agentId} in headless mode.`,
            )
            return
          }
          const prepared = await prepareAutonomyTurnPrompt({
            basePrompt: task.prompt,
            trigger: 'scheduled-task',
            currentDir: cwd(),
          })
          if (inputClosed) return
          const command = await commitAutonomyQueuedPrompt({
            prepared,
            currentDir: cwd(),
            sourceId: task.id,
            sourceLabel: task.prompt,
            workload: WORKLOAD_CRON,
          })
          if (inputClosed) return
          enqueue({
            ...command,
            uuid: randomUUID(),
          })
          void run()
        })()
      },
      isLoading: () => running || inputClosed,
      getJitterConfig: cronJitterConfigModule?.getCronJitterConfig,
      isKilled: () => !cronGate?.isKairosCronEnabled(),
    })
    cronScheduler.start()
  }

  const sendControlResponseSuccess = function (
    message: { request_id: string } | SDKControlRequest,
    response?: Record<string, unknown>,
  ) {
    emitOutput({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: message.request_id,
        response: response,
      },
    })
  }

  const sendControlResponseError = function (
    message: { request_id: string } | SDKControlRequest,
    errorMessage: string,
  ) {
    emitOutput({
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: message.request_id,
        error: errorMessage,
      },
    })
  }

  structuredIO.setUnexpectedResponseCallback(async message => {
    await session.control.handleOrphanedPermissionResponse({
      message,
      setAppState,
      onEnqueued: () => {
        // The first message of a session might be the orphaned permission
        // check rather than a user prompt, so kick off the loop.
        void run()
      },
    })
  })

  // Track active OAuth flows per server so we can abort a previous flow
  // when a new mcp_authenticate request arrives for the same server.
  const activeOAuthFlows = new Map<string, AbortController>()
  // Track manual callback URL submit functions for active OAuth flows.
  // Used when localhost is not reachable (e.g., browser-based IDEs).
  const oauthCallbackSubmitters = new Map<
    string,
    (callbackUrl: string) => void
  >()
  // Track servers where the manual callback was actually invoked (so the
  // automatic reconnect path knows to skip — the extension will reconnect).
  const oauthManualCallbackUsed = new Set<string>()
  // Track OAuth auth-only promises so mcp_oauth_callback_url can await
  // token exchange completion. Reconnect is handled separately by the
  // extension via handleAuthDone → mcp_reconnect.
  const oauthAuthPromises = new Map<string, Promise<void>>()

  // In-flight Anthropic OAuth flow (claude_authenticate). Single-slot: a
  // second authenticate request cleans up the first. The service holds the
  // PKCE verifier + localhost listener; the promise settles after
  // installOAuthTokens — after it resolves, the in-process memoized token
  // cache is already cleared and the next API call picks up the new creds.
  let claudeOAuth: {
    service: OAuthService
    flow: Promise<void>
  } | null = null

  // This is essentially spawning a parallel async task- we have two
  // running in parallel- one reading from stdin and adding to the
  // queue to be processed and another reading from the queue,
  // processing and returning the result of the generation.
  // The process is complete when the input stream completes and
  // the last generation of the queue has complete.
  void (async () => {
    let initialized = false
    logForDiagnosticsNoPII('info', 'cli_message_loop_started')
    for await (const message of structuredIO.structuredInput) {
      // Non-user events are handled inline (no queue). started→completed in
      // the same tick carries no information, so only fire completed.
      // control_response is reported by StructuredIO.processLine (which also
      // sees orphans that never yield here).
      const eventId = 'uuid' in message ? message.uuid : undefined
      if (
        eventId &&
        message.type !== 'user' &&
        message.type !== 'control_response'
      ) {
        notifyCommandLifecycle(eventId as string, 'completed')
      }

      if (message.type === 'control_request') {
        // Type assertion: structuredInput yields StdinMessage | SDKMessage, but
        // when type === 'control_request' the object has request_id and request.
        // The union with SDKMessage (typed as `any`) causes request to be `unknown`.
        // Cast to SDKControlRequest (via unknown) for type safety on known subtypes,
        // and use Record<string, unknown> for subtypes not in the zod schema union.
        const msg = message as unknown as SDKControlRequest
        // Wider-typed alias for request properties on subtypes not in the zod schema.
        // The schema union doesn't include end_session, channel_enable, mcp_authenticate,
        // claude_authenticate, etc. so accessing their properties narrows to `never`.
        const req = msg.request as Record<string, unknown>
        if (msg.request.subtype === 'interrupt') {
          // Track escapes for attribution (ant-only feature)
          if (feature('COMMIT_ATTRIBUTION')) {
            setAppState(prev => ({
              ...prev,
              attribution: {
                ...prev.attribution,
                escapeCount: prev.attribution.escapeCount + 1,
              },
            }))
          }
          abortCurrentHeadlessTurn('interrupt')
          suggestionState.abortController?.abort()
          suggestionState.abortController = null
          suggestionState.lastEmitted = null
          suggestionState.pendingSuggestion = null
          sendControlResponseSuccess(msg)
        } else if (req.subtype === 'end_session') {
          logForDebugging(
            `[print.ts] end_session received, reason=${req.reason ?? 'unspecified'}`,
          )
          if (!terminalResultEmitted) {
            abortCurrentHeadlessTurn('end_session')
          }
          suggestionState.abortController?.abort()
          suggestionState.abortController = null
          suggestionState.lastEmitted = null
          suggestionState.pendingSuggestion = null
          sendControlResponseSuccess(msg)
          break // exits for-await → falls through to inputClosed=true drain below
        } else if (msg.request.subtype === 'initialize') {
          // SDK MCP server names from the initialize message
          // Populated by both browser and ProcessTransport sessions
          if (
            msg.request.sdkMcpServers &&
            msg.request.sdkMcpServers.length > 0
          ) {
            for (const serverName of msg.request.sdkMcpServers) {
              // Create placeholder config for SDK MCP servers
              // The actual server connection is managed by the SDK Query class
              sdkMcpConfigs[serverName] = {
                type: 'sdk',
                name: serverName,
              }
            }
          }

          await handleInitializeRequest(
            msg.request,
            msg.request_id,
            initialized,
            output,
            commands,
            modelInfos,
            structuredIO,
            !!options.enableAuthStatus,
            options,
            agents,
            getAppState,
            session.bootstrapStateProvider,
          )

          // Enable prompt suggestions in AppState when SDK consumer opts in.
          // shouldEnablePromptSuggestion() returns false for non-interactive
          // sessions, but the SDK consumer explicitly requested suggestions.
          if (msg.request.promptSuggestions) {
            setAppState(prev => {
              if (prev.promptSuggestionEnabled) return prev
              return { ...prev, promptSuggestionEnabled: true }
            })
          }

          if (
            msg.request.agentProgressSummaries &&
            getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_prism', true)
          ) {
            session.bootstrapStateProvider.patchHeadlessControlState({
              sdkAgentProgressSummariesEnabled: true,
            })
          }

          initialized = true

          // If the auto-resume logic pre-enqueued a command, drain it now
          // that initialize has set up systemPrompt, agents, hooks, etc.
          if (hasCommandsInQueue()) {
            void run()
          }
        } else if (msg.request.subtype === 'set_permission_mode') {
          const m = msg.request // for typescript (TODO: use readonly types to avoid this)
          setAppState(prev => ({
            ...prev,
            toolPermissionContext: handleSetPermissionMode(
              m,
              msg.request_id,
              prev.toolPermissionContext,
              output,
            ),
            isUltraplanMode: m.ultraplan ?? prev.isUltraplanMode,
          }))
          // handleSetPermissionMode sends the control_response; the
          // notifySessionMetadataChanged that used to follow here is
          // now fired by onChangeAppState (with externalized mode name).
        } else if (msg.request.subtype === 'set_model') {
          const requestedModel = msg.request.model ?? 'default'
          const model =
            requestedModel === 'default'
              ? getDefaultMainLoopModel()
              : requestedModel
          activeUserSpecifiedModel = model
          session.bootstrap.applyModelChange({
            mainLoopModelOverride: model,
            resolvedModel: model,
          })
          injectModelSwitchBreadcrumbs(requestedModel, model)

          sendControlResponseSuccess(msg)
        } else if (msg.request.subtype === 'set_max_thinking_tokens') {
          if (msg.request.max_thinking_tokens === null) {
            options.thinkingConfig = undefined
          } else if (msg.request.max_thinking_tokens === 0) {
            options.thinkingConfig = { type: 'disabled' }
          } else {
            options.thinkingConfig = {
              type: 'enabled',
              budgetTokens: msg.request.max_thinking_tokens,
            }
          }
          sendControlResponseSuccess(msg)
        } else if (msg.request.subtype === 'mcp_status') {
          sendControlResponseSuccess(msg, {
            mcpServers: mcpService.buildStatuses(),
          })
        } else if (msg.request.subtype === 'get_context_usage') {
          try {
            const appState = getAppState()
            const data = await collectContextData({
              messages: mutableMessages,
              getAppState,
              options: {
                mainLoopModel: getMainLoopModel(),
                tools: buildAllTools(appState),
                agentDefinitions: appState.agentDefinitions,
                customSystemPrompt: options.systemPrompt,
                appendSystemPrompt: options.appendSystemPrompt,
              },
            })
            sendControlResponseSuccess(msg, { ...data })
          } catch (error) {
            sendControlResponseError(msg, errorMessage(error))
          }
        } else if (msg.request.subtype === 'mcp_message') {
          // Handle MCP notifications from SDK servers
          const mcpRequest = msg.request as Record<string, unknown>
          const sdkClient = mcpService.getSdkClients().find(
            client => client.name === mcpRequest.server_name,
          )
          // Check client exists - dynamically added SDK servers may have
          // placeholder clients with null client until updateSdkMcp() runs
          if (
            sdkClient &&
            sdkClient.type === 'connected' &&
            sdkClient.client?.transport?.onmessage
          ) {
            sdkClient.client.transport.onmessage(
              mcpRequest.message as import('@modelcontextprotocol/sdk/types.js').JSONRPCMessage,
            )
          }
          sendControlResponseSuccess(msg)
        } else if (msg.request.subtype === 'rewind_files') {
          const appState = getAppState()
          const result = await handleRewindFiles(
            msg.request.user_message_id as UUID,
            appState,
            setAppState,
            msg.request.dry_run ?? false,
          )
          if (result.canRewind || msg.request.dry_run) {
            sendControlResponseSuccess(msg, result)
          } else {
            sendControlResponseError(
              msg,
              (result.error as string) ?? 'Unexpected error',
            )
          }
        } else if (msg.request.subtype === 'cancel_async_message') {
          const targetUuid = msg.request.message_uuid
          const removed = dequeueAllMatching(cmd => cmd.uuid === targetUuid)
          sendControlResponseSuccess(msg, {
            cancelled: removed.length > 0,
          })
        } else if (msg.request.subtype === 'seed_read_state') {
          // Client observed a Read that was later removed from context (e.g.
          // by snip), so transcript-based seeding missed it. Queued into the
          // managed session's pending read-state cache; applied at the next
          // clone-replace boundary.
          try {
            // expandPath: all other readFileState writers normalize (~, relative,
            // session cwd vs process cwd). FileEditTool looks up by expandPath'd
            // key — a verbatim client path would miss.
            const normalizedPath = expandPath(msg.request.path)
            // Check disk mtime before reading content. If the file changed
            // since the client's observation, readFile would return C_current
            // but we'd store it with the client's M_observed — getChangedFiles
            // then sees disk > cache.timestamp, re-reads, diffs C_current vs
            // C_current = empty, emits no attachment, and the model is never
            // told about the C_observed → C_current change. Skipping the seed
            // makes Edit fail "file not read yet" → forces a fresh Read.
            // Math.floor matches FileReadTool and getFileModificationTime.
            const diskMtime = Math.floor((await stat(normalizedPath)).mtimeMs)
            if (diskMtime <= msg.request.mtime) {
              const raw = await readFile(normalizedPath, 'utf-8')
              // Strip BOM + normalize CRLF→LF to match readFileInRange and
              // readFileSyncWithMetadata. FileEditTool's content-compare
              // fallback (for Windows mtime bumps without content change)
              // compares against LF-normalized disk reads.
              const content = (
                raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
              ).replaceAll('\r\n', '\n')
              managedSession.seedReadFileState(normalizedPath, {
                content,
                timestamp: diskMtime,
                offset: undefined,
                limit: undefined,
              } satisfies FileState)
            }
          } catch {
            // ENOENT etc — skip seeding but still succeed
          }
          sendControlResponseSuccess(msg)
        } else if (msg.request.subtype === 'mcp_set_servers') {
          const { response, sdkServersChanged } = await mcpService.applyServerChanges(
            msg.request.servers as Record<
              string,
              McpServerConfigForProcessTransport
            >,
          )
          sendControlResponseSuccess(msg, response)

          // Connect SDK servers AFTER response to avoid deadlock
          if (sdkServersChanged) {
            void mcpService.updateSdk()
          }
        } else if (msg.request.subtype === 'reload_plugins') {
          try {
            if (
              feature('DOWNLOAD_USER_SETTINGS') &&
              (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ||
                session.bootstrapStateProvider.getHeadlessControlState()
                  .isRemoteMode)
            ) {
              // Re-pull user settings so enabledPlugins pushed from the
              // user's local CLI take effect before the cache sweep.
              const applied = await redownloadUserSettings()
              if (applied) {
                settingsChangeDetector.notifyChange('userSettings')
              }
            }

            sendControlResponseSuccess(
              msg,
              await runtimeCapabilities.refresh(),
            )
          } catch (error) {
            sendControlResponseError(msg, errorMessage(error))
          }
        } else if (msg.request.subtype === 'mcp_reconnect') {
          const currentAppState = getAppState()
          const { serverName } = msg.request
          elicitationRegistered.delete(serverName)
          // Config-existence gate must cover the SAME sources as the
          // operations below. SDK-injected servers (query({mcpServers:{...}}))
          // and dynamically-added servers were missing here, so
          // toggleMcpServer/reconnect returned "Server not found" even though
          // the disconnect/reconnect would have worked (gh-31339 / CC-314).
          const config =
            getMcpConfigByName(serverName) ??
            mcpClients.find(c => c.name === serverName)?.config ??
            mcpService.findConfig(serverName, {
              baseClients: mcpClients,
              getConfiguredServer: () => getMcpConfigByName(serverName) ?? null,
            })
          if (!config) {
            sendControlResponseError(msg, `Server not found: ${serverName}`)
          } else {
            const result = await reconnectMcpServerImpl(serverName, config)
            // Update appState.mcp with the new client, tools, commands, and resources
            const prefix = getMcpPrefix(serverName)
            setAppState(prev => ({
              ...prev,
              mcp: {
                ...prev.mcp,
                clients: prev.mcp.clients.map(c =>
                  c.name === serverName ? result.client : c,
                ),
                tools: [
                  ...reject(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                  ...result.tools,
                ],
                commands: [
                  ...reject(prev.mcp.commands, c =>
                    commandBelongsToServer(c, serverName),
                  ),
                  ...result.commands,
                ],
                resources:
                  result.resources && result.resources.length > 0
                    ? { ...prev.mcp.resources, [serverName]: result.resources }
                    : omit(prev.mcp.resources, serverName),
              },
            }))
            // Also update dynamicMcpState so run() picks up the new tools
            // on the next turn (run() reads dynamicMcpState, not appState)
            mcpService.replaceDynamicConnection({
              serverName,
              client: result.client,
              tools: result.tools,
            })
            if (result.client.type === 'connected') {
              registerElicitationHandlers([result.client])
              reregisterChannelHandlerAfterReconnect(
                result.client,
                session.bootstrapStateProvider,
              )
              sendControlResponseSuccess(msg)
            } else {
              const errorMessage =
                result.client.type === 'failed'
                  ? (result.client.error ?? 'Connection failed')
                  : `Server status: ${result.client.type}`
              sendControlResponseError(msg, errorMessage)
            }
          }
        } else if (msg.request.subtype === 'mcp_toggle') {
          const currentAppState = getAppState()
          const { serverName, enabled } = msg.request
          elicitationRegistered.delete(serverName)
          // Gate must match the client-lookup spread below (which
          // includes sdkClients and dynamicMcpState.clients). Same fix as
          // mcp_reconnect above (gh-31339 / CC-314).
          const config =
            getMcpConfigByName(serverName) ??
            mcpClients.find(c => c.name === serverName)?.config ??
            mcpService.findConfig(serverName, {
              baseClients: mcpClients,
              getConfiguredServer: () => getMcpConfigByName(serverName) ?? null,
            })

          if (!config) {
            sendControlResponseError(msg, `Server not found: ${serverName}`)
          } else if (!enabled) {
            // Disabling: persist + disconnect (matches TUI toggleMcpServer behavior)
            setMcpServerEnabled(serverName, false)
            const client = [
              ...mcpClients,
              ...mcpService.getSdkClients(),
              ...mcpService.getDynamicState().clients,
              ...currentAppState.mcp.clients,
            ].find(c => c.name === serverName)
            if (client && client.type === 'connected') {
              await clearServerCache(serverName, config)
            }
            // Update appState.mcp to reflect disabled status and remove tools/commands/resources
            const prefix = getMcpPrefix(serverName)
            setAppState(prev => ({
              ...prev,
              mcp: {
                ...prev.mcp,
                clients: prev.mcp.clients.map(c =>
                  c.name === serverName
                    ? { name: serverName, type: 'disabled' as const, config }
                    : c,
                ),
                tools: reject(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                commands: reject(prev.mcp.commands, c =>
                  commandBelongsToServer(c, serverName),
                ),
                resources: omit(prev.mcp.resources, serverName),
              },
            }))
            mcpService.removeDynamicConnection(serverName)
            sendControlResponseSuccess(msg)
          } else {
            // Enabling: persist + reconnect
            setMcpServerEnabled(serverName, true)
            const result = await reconnectMcpServerImpl(serverName, config)
            // Update appState.mcp with the new client, tools, commands, and resources
            // This ensures the LLM sees updated tools after enabling the server
            const prefix = getMcpPrefix(serverName)
            setAppState(prev => ({
              ...prev,
              mcp: {
                ...prev.mcp,
                clients: prev.mcp.clients.map(c =>
                  c.name === serverName ? result.client : c,
                ),
                tools: [
                  ...reject(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                  ...result.tools,
                ],
                commands: [
                  ...reject(prev.mcp.commands, c =>
                    commandBelongsToServer(c, serverName),
                  ),
                  ...result.commands,
                ],
                resources:
                  result.resources && result.resources.length > 0
                    ? { ...prev.mcp.resources, [serverName]: result.resources }
                  : omit(prev.mcp.resources, serverName),
              },
            }))
            mcpService.replaceDynamicConnection({
              serverName,
              client: result.client,
              tools: result.tools,
            })
            if (result.client.type === 'connected') {
              registerElicitationHandlers([result.client])
              reregisterChannelHandlerAfterReconnect(
                result.client,
                session.bootstrapStateProvider,
              )
              sendControlResponseSuccess(msg)
            } else {
              const errorMessage =
                result.client.type === 'failed'
                  ? (result.client.error ?? 'Connection failed')
                  : `Server status: ${result.client.type}`
              sendControlResponseError(msg, errorMessage)
            }
          }
        } else if (req.subtype === 'channel_enable') {
          const currentAppState = getAppState()
          handleChannelEnable(
            msg.request_id,
            req.serverName as string,
            // Pool spread matches mcp_status — all three client sources.
            [
              ...currentAppState.mcp.clients,
              ...mcpService.getSdkClients(),
              ...mcpService.getDynamicState().clients,
            ],
            output,
            session.bootstrapStateProvider,
          )
        } else if (req.subtype === 'mcp_authenticate') {
          const serverName = req.serverName as string
          const config = mcpService.findConfig(serverName, {
            baseClients: mcpClients,
            getConfiguredServer: () => getMcpConfigByName(serverName) ?? null,
          })
          if (!config) {
            sendControlResponseError(msg, `Server not found: ${serverName}`)
          } else if (config.type !== 'sse' && config.type !== 'http') {
            sendControlResponseError(
              msg,
              `Server type "${config.type}" does not support OAuth authentication`,
            )
          } else {
            try {
              // Abort any previous in-flight OAuth flow for this server
              activeOAuthFlows.get(serverName as string)?.abort()
              const controller = new AbortController()
              activeOAuthFlows.set(serverName as string, controller)

              // Capture the auth URL from the callback
              let resolveAuthUrl: (url: string) => void
              const authUrlPromise = new Promise<string>(resolve => {
                resolveAuthUrl = resolve
              })

              // Start the OAuth flow in the background
              const oauthPromise = performMCPOAuthFlow(
                serverName as string,
                config,
                url => resolveAuthUrl!(url),
                controller.signal,
                {
                  skipBrowserOpen: true,
                  onWaitingForCallback: submit => {
                    oauthCallbackSubmitters.set(serverName as string, submit)
                  },
                },
              )

              // Wait for the auth URL (or the flow to complete without needing redirect)
              const authUrl = await Promise.race([
                authUrlPromise,
                oauthPromise.then(() => null as string | null),
              ])

              if (authUrl) {
                sendControlResponseSuccess(msg, {
                  authUrl,
                  requiresUserAction: true,
                })
              } else {
                sendControlResponseSuccess(msg, {
                  requiresUserAction: false,
                })
              }

              // Store auth-only promise for mcp_oauth_callback_url handler.
              // Don't swallow errors — the callback handler needs to detect
              // auth failures and report them to the caller.
              oauthAuthPromises.set(serverName, oauthPromise)

              // Handle background completion — reconnect after auth.
              // When manual callback is used, skip the reconnect here;
              // the extension's handleAuthDone → mcp_reconnect handles it
              // (which also updates dynamicMcpState for tool registration).
              const fullFlowPromise = oauthPromise
                .then(async () => {
                  // Don't reconnect if the server was disabled during the OAuth flow
                  if (isMcpServerDisabled(serverName as string)) {
                    return
                  }
                  // Skip reconnect if the manual callback path was used —
                  // handleAuthDone will do it via mcp_reconnect (which
                  // updates dynamicMcpState for tool registration).
                  if (oauthManualCallbackUsed.has(serverName as string)) {
                    return
                  }
                  // Reconnect the server after successful auth
                  const result = await reconnectMcpServerImpl(
                    serverName as string,
                    config,
                  )
                  const prefix = getMcpPrefix(serverName as string)
                  setAppState(prev => ({
                    ...prev,
                    mcp: {
                      ...prev.mcp,
                      clients: prev.mcp.clients.map(c =>
                        c.name === (serverName as string) ? result.client : c,
                      ),
                      tools: [
                        ...reject(prev.mcp.tools, t =>
                          t.name?.startsWith(prefix),
                        ),
                        ...result.tools,
                      ],
                      commands: [
                        ...reject(prev.mcp.commands, c =>
                          commandBelongsToServer(c, serverName as string),
                        ),
                        ...result.commands,
                      ],
                      resources:
                        result.resources && result.resources.length > 0
                          ? {
                              ...prev.mcp.resources,
                              [serverName as string]: result.resources,
                            }
                          : omit(prev.mcp.resources, serverName as string),
                    },
                  }))
                  mcpService.replaceDynamicConnection({
                    serverName: serverName as string,
                    client: result.client,
                    tools: result.tools,
                  })
                })
                .catch(error => {
                  logForDebugging(
                    `MCP OAuth failed for ${serverName as string}: ${error}`,
                    { level: 'error' },
                  )
                })
                .finally(() => {
                  // Clean up only if this is still the active flow
                  if (
                    activeOAuthFlows.get(serverName as string) === controller
                  ) {
                    activeOAuthFlows.delete(serverName as string)
                    oauthCallbackSubmitters.delete(serverName as string)
                    oauthManualCallbackUsed.delete(serverName as string)
                    oauthAuthPromises.delete(serverName as string)
                  }
                })
              void fullFlowPromise
            } catch (error) {
              sendControlResponseError(msg, errorMessage(error))
            }
          }
        } else if (req.subtype === 'mcp_oauth_callback_url') {
          const serverName = req.serverName as string
          const callbackUrl = req.callbackUrl as string
          const submit = oauthCallbackSubmitters.get(serverName)
          if (submit) {
            // Validate the callback URL before submitting. The submit
            // callback in auth.ts silently ignores URLs missing a code
            // param, which would leave the auth promise unresolved and
            // block the control message loop until timeout.
            let hasCodeOrError = false
            try {
              const parsed = new URL(callbackUrl as string | URL)
              hasCodeOrError =
                parsed.searchParams.has('code') ||
                parsed.searchParams.has('error')
            } catch {
              // Invalid URL
            }
            if (!hasCodeOrError) {
              sendControlResponseError(
                msg,
                'Invalid callback URL: missing authorization code. Please paste the full redirect URL including the code parameter.',
              )
            } else {
              oauthManualCallbackUsed.add(serverName)
              submit(callbackUrl as string)
              // Wait for auth (token exchange) to complete before responding.
              // Reconnect is handled by the extension via handleAuthDone →
              // mcp_reconnect (which updates dynamicMcpState for tools).
              const authPromise = oauthAuthPromises.get(serverName)
              if (authPromise) {
                try {
                  await authPromise
                  sendControlResponseSuccess(msg)
                } catch (error) {
                  sendControlResponseError(
                    msg,
                    error instanceof Error
                      ? error.message
                      : 'OAuth authentication failed',
                  )
                }
              } else {
                sendControlResponseSuccess(msg)
              }
            }
          } else {
            sendControlResponseError(
              msg,
              `No active OAuth flow for server: ${serverName}`,
            )
          }
        } else if (req.subtype === 'claude_authenticate') {
          // Anthropic OAuth over the control channel. The SDK client owns
          // the user's browser (we're headless in -p mode); we hand back
          // both URLs and wait. Automatic URL → localhost listener catches
          // the redirect if the browser is on this host; manual URL → the
          // success page shows "code#state" for claude_oauth_callback.
          const loginWithClaudeAi = req.loginWithClaudeAi as boolean | undefined

          // Clean up any prior flow. cleanup() closes the localhost listener
          // and nulls the manual resolver. The prior `flow` promise is left
          // pending (AuthCodeListener.close() does not reject) but its object
          // graph becomes unreachable once the server handle is released and
          // is GC'd — no fd or port is held.
          claudeOAuth?.service.cleanup()

          logEvent('tengu_oauth_flow_start', {
            loginWithClaudeAi: (loginWithClaudeAi ?? true) as boolean | number,
          })

          const service = new OAuthService()
          let urlResolver!: (urls: {
            manualUrl: string
            automaticUrl: string
          }) => void
          const urlPromise = new Promise<{
            manualUrl: string
            automaticUrl: string
          }>(resolve => {
            urlResolver = resolve
          })

          const flow = service
            .startOAuthFlow(
              async (manualUrl, automaticUrl) => {
                // automaticUrl is always defined when skipBrowserOpen is set;
                // the signature is optional only for the existing single-arg callers.
                urlResolver({ manualUrl, automaticUrl: automaticUrl! })
              },
              {
                loginWithClaudeAi: (loginWithClaudeAi ?? true) as boolean,
                skipBrowserOpen: true,
              },
            )
            .then(async tokens => {
              // installOAuthTokens: performLogout (clear stale state) →
              // store profile → saveOAuthTokensIfNeeded → clearOAuthTokenCache
              // → clearAuthRelatedCaches. After this resolves, the memoized
              // getClaudeAIOAuthTokens in this process is invalidated; the
              // next API call re-reads keychain/file and works. No respawn.
              await installOAuthTokens(tokens)
              logEvent('tengu_oauth_success', {
                loginWithClaudeAi: (loginWithClaudeAi ?? true) as
                  | boolean
                  | number,
              })
            })
            .finally(() => {
              service.cleanup()
              if (claudeOAuth?.service === service) {
                claudeOAuth = null
              }
            })

          claudeOAuth = { service, flow }

          // Attach the rejection handler before awaiting so a synchronous
          // startOAuthFlow failure doesn't surface as an unhandled rejection.
          // The claude_oauth_callback handler re-awaits flow for the manual
          // path and surfaces the real error to the client.
          void flow.catch(err =>
            logForDebugging(`claude_authenticate flow ended: ${err}`, {
              level: 'info',
            }),
          )

          try {
            // Race against flow: if startOAuthFlow rejects before calling
            // the authURLHandler (e.g. AuthCodeListener.start() fails with
            // EACCES or fd exhaustion), urlPromise would pend forever and
            // wedge the stdin loop. flow resolving first is unreachable in
            // practice (it's suspended on the same urls we're waiting for).
            const { manualUrl, automaticUrl } = await Promise.race([
              urlPromise,
              flow.then(() => {
                throw new Error(
                  'OAuth flow completed without producing auth URLs',
                )
              }),
            ])
            sendControlResponseSuccess(msg, {
              manualUrl,
              automaticUrl,
            })
          } catch (error) {
            sendControlResponseError(msg, errorMessage(error))
          }
        } else if (
          req.subtype === 'claude_oauth_callback' ||
          req.subtype === 'claude_oauth_wait_for_completion'
        ) {
          if (!claudeOAuth) {
            sendControlResponseError(msg, 'No active claude_authenticate flow')
          } else {
            // Inject the manual code synchronously — must happen in stdin
            // message order so a subsequent claude_authenticate doesn't
            // replace the service before this code lands.
            if (req.subtype === 'claude_oauth_callback') {
              claudeOAuth.service.handleManualAuthCodeInput({
                authorizationCode: req.authorizationCode as string,
                state: req.state as string,
              })
            }
            // Detach the await — the stdin reader is serial and blocking
            // here deadlocks claude_oauth_wait_for_completion: flow may
            // only resolve via a future claude_oauth_callback on stdin,
            // which can't be read while we're parked. Capture the binding;
            // claudeOAuth is nulled in flow's own .finally.
            const { flow } = claudeOAuth
            void flow.then(
              () => {
                const accountInfo = getAccountInformation()
                sendControlResponseSuccess(msg, {
                  account: {
                    email: accountInfo?.email,
                    organization: accountInfo?.organization,
                    subscriptionType: accountInfo?.subscription,
                    tokenSource: accountInfo?.tokenSource,
                    apiKeySource: accountInfo?.apiKeySource,
                    apiProvider: getAPIProvider(),
                  },
                })
              },
              (error: unknown) =>
                sendControlResponseError(msg, errorMessage(error)),
            )
          }
        } else if (req.subtype === 'mcp_clear_auth') {
          const serverName = req.serverName as string
          const currentAppState = getAppState()
          const config =
            getMcpConfigByName(serverName) ??
            mcpClients.find(c => c.name === serverName)?.config ??
            currentAppState.mcp.clients.find(c => c.name === serverName)
              ?.config ??
            null
          if (!config) {
            sendControlResponseError(msg, `Server not found: ${serverName}`)
          } else if (config.type !== 'sse' && config.type !== 'http') {
            sendControlResponseError(
              msg,
              `Cannot clear auth for server type "${config.type}"`,
            )
          } else {
            await revokeServerTokens(serverName, config)
            const result = await reconnectMcpServerImpl(serverName, config)
            const prefix = getMcpPrefix(serverName)
            setAppState(prev => ({
              ...prev,
              mcp: {
                ...prev.mcp,
                clients: prev.mcp.clients.map(c =>
                  c.name === (serverName as string) ? result.client : c,
                ),
                tools: [
                  ...reject(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                  ...result.tools,
                ],
                commands: [
                  ...reject(prev.mcp.commands, c =>
                    commandBelongsToServer(c, serverName),
                  ),
                  ...result.commands,
                ],
                resources:
                  result.resources && result.resources.length > 0
                    ? {
                        ...prev.mcp.resources,
                        [serverName]: result.resources,
                      }
                    : omit(prev.mcp.resources, serverName),
              },
            }))
            sendControlResponseSuccess(msg, {})
          }
        } else if (msg.request.subtype === 'apply_flag_settings') {
          // Snapshot the current model before applying — we need to detect
          // model switches so we can inject breadcrumbs and notify listeners.
          const prevModel = getMainLoopModel()

          // Merge the provided settings into the in-memory flag settings
          const existing =
            session.bootstrapStateProvider.getHeadlessControlState()
              .flagSettingsInline ?? {}
          const incoming = msg.request.settings
          // Shallow-merge top-level keys; getSettingsForSource handles
          // the deep merge with file-based flag settings via mergeWith.
          // JSON serialization drops `undefined`, so callers use `null`
          // to signal "clear this key". Convert nulls to deletions so
          // SettingsSchema().safeParse() doesn't reject the whole object
          // (z.string().optional() accepts string | undefined, not null).
          const merged = { ...existing, ...incoming }
          for (const key of Object.keys(merged)) {
            if (merged[key as keyof typeof merged] === null) {
              delete merged[key as keyof typeof merged]
            }
          }
          session.bootstrapStateProvider.patchHeadlessControlState({
            flagSettingsInline: merged,
          })
          // Route through notifyChange so fanOut() resets the settings cache
          // before listeners run. The subscriber at :392 calls
          // applySettingsChange for us. Pre-#20625 this was a direct
          // applySettingsChange() call that relied on its own internal reset —
          // now that the reset is centralized in fanOut, a direct call here
          // would read stale cached settings and silently drop the update.
          // Bonus: going through notifyChange also tells the other subscribers
          // (loadPluginHooks, sandbox-adapter) about the change, which the
          // previous direct call skipped.
          settingsChangeDetector.notifyChange('flagSettings')

          // If the incoming settings include a model change, update the
          // override so getMainLoopModel() reflects it. The override has
          // higher priority than the settings cascade in
          // getUserSpecifiedModelSetting(), so without this update,
          // getMainLoopModel() returns the stale override and the model
          // change is silently ignored (matching set_model at :2811).
          if ('model' in incoming) {
            const mainLoopModelOverride =
              incoming.model != null ? String(incoming.model) : undefined
            if (incoming.model != null) {
              session.bootstrapStateProvider.patchPromptState({
                mainLoopModelOverride,
              })
            } else {
              session.bootstrapStateProvider.patchPromptState({
                mainLoopModelOverride: undefined,
              })
            }
          }

          // If the model changed, inject breadcrumbs so the model sees the
          // mid-conversation switch, and notify metadata listeners (CCR).
          const newModel = getMainLoopModel()
          if (newModel !== prevModel) {
            activeUserSpecifiedModel = newModel
            const modelArg = incoming.model ? String(incoming.model) : 'default'
            session.bootstrap.applyModelChange({
              mainLoopModelOverride:
                incoming.model != null ? String(incoming.model) : undefined,
              resolvedModel: newModel,
            })
            injectModelSwitchBreadcrumbs(modelArg, newModel)
          }

          sendControlResponseSuccess(msg)
        } else if (msg.request.subtype === 'get_settings') {
          const currentAppState = getAppState()
          const model = getMainLoopModel()
          // OpenAI-compatible paths can apply explicit reasoning_effort to
          // custom model strings (e.g. gpt-5.5), so surface the same value that
          // the runtime would actually send.
          const effort = shouldShowEffortUI(model, currentAppState.effortValue)
            ? resolveAppliedEffort(model, currentAppState.effortValue)
            : undefined
          sendControlResponseSuccess(msg, {
            ...getSettingsWithSources(),
            applied: {
              model,
              // Numeric effort (ant-only) → null; SDK schema is string-level only.
              effort: typeof effort === 'string' ? effort : null,
            },
          })
        } else if (msg.request.subtype === 'stop_task') {
          const { task_id: taskId } = msg.request
          try {
            await stopTask(taskId, {
              getAppState,
              setAppState,
            })
            sendControlResponseSuccess(msg, {})
          } catch (error) {
            sendControlResponseError(msg, errorMessage(error))
          }
        } else if (req.subtype === 'generate_session_title') {
          // Fire-and-forget so the Haiku call does not block the stdin loop
          // (which would delay processing of subsequent user messages /
          // interrupts for the duration of the API roundtrip).
          const description = req.description as string
          const persist = req.persist as boolean
          const activeAbortController = managedSession.getAbortController()
          // Reuse the live controller only if it has not already been aborted
          // (e.g. by interrupt()); an aborted signal would cause queryHaiku to
          // immediately throw APIUserAbortError → {title: null}.
          const titleSignal = (
            activeAbortController && !activeAbortController.signal.aborted
              ? activeAbortController
              : createAbortController()
          ).signal
          void (async () => {
            try {
              const title = await generateSessionTitle(description, titleSignal)
              if (title && persist) {
                try {
                  session.bootstrap.persistGeneratedTitle(title)
                } catch (e) {
                  logError(e)
                }
              }
              sendControlResponseSuccess(msg, { title })
            } catch (e) {
              // Unreachable in practice — generateSessionTitle wraps its
              // own body and returns null, saveAiGeneratedTitle is wrapped
              // above. Propagate (not swallow) so unexpected failures are
              // visible to the SDK caller (hostComms.ts catches and logs).
              sendControlResponseError(msg, errorMessage(e))
            }
          })()
        } else if (req.subtype === 'side_question') {
          // Same fire-and-forget pattern as generate_session_title above —
          // the forked agent's API roundtrip must not block the stdin loop.
          //
          // The snapshot captured by stopHooks (for querySource === 'sdk')
          // holds the exact systemPrompt/userContext/systemContext/messages
          // sent on the last main-thread turn. Reusing them gives a byte-
          // identical prefix → prompt cache hit.
          //
          // Fallback (resume before first turn completes — no snapshot yet):
          // rebuild from scratch. buildSideQuestionFallbackParams mirrors
          // QueryEngine.ts:askRuntime()'s system prompt assembly (including
          // --system-prompt / --append-system-prompt) so the rebuilt prefix
          // matches in the common case. May still miss the cache for
          // coordinator mode or memory-mechanics extras — acceptable, the
          // alternative is the side question failing entirely.
          const question = req.question as string
          void (async () => {
            try {
              const saved = getLastCacheSafeParams()
              const cacheSafeParams = saved
                ? {
                    ...saved,
                    // If the last turn was interrupted, the snapshot holds an
                    // already-aborted controller; createChildAbortController in
                    // createSubagentContext would propagate it and the fork
                    // would die before sending a request. The controller is
                    // not part of the cache key — swapping in a fresh one is
                    // safe. Same guard as generate_session_title above.
                    toolUseContext: {
                      ...saved.toolUseContext,
                      abortController: createAbortController(),
                    },
                  }
                : await buildSideQuestionFallbackParams({
                    tools: buildAllTools(getAppState()),
                    commands: runtimeCapabilities.getCommands(),
                    mcpClients: mcpService.getAllClients(
                      getAppState().mcp.clients,
                    ),
                    messages: mutableMessages,
                    readFileState: managedSession.getCommittedReadFileState(),
                    getAppState,
                    setAppState,
                    customSystemPrompt: options.systemPrompt,
                    appendSystemPrompt: options.appendSystemPrompt,
                    thinkingConfig: options.thinkingConfig,
                    agents: runtimeCapabilities.getAgents(),
                  })
              const result = await runSideQuestion({
                question,
                cacheSafeParams,
              })
              sendControlResponseSuccess(msg, { response: result.response })
            } catch (e) {
              sendControlResponseError(msg, errorMessage(e))
            }
          })()
        } else if (
          (feature('PROACTIVE') || feature('KAIROS')) &&
          (msg.request as { subtype: string }).subtype === 'set_proactive'
        ) {
          const req = msg.request as unknown as {
            subtype: string
            enabled: boolean
          }
          if (req.enabled) {
            if (!proactiveModule!.isProactiveActive()) {
              proactiveModule!.activateProactive('command')
              scheduleProactiveTick!()
            }
          } else {
            proactiveModule!.deactivateProactive()
          }
          sendControlResponseSuccess(msg)
        } else if (req.subtype === 'remote_control') {
          if (req.enabled as boolean) {
            if (bridgeHandle) {
              // Already connected
              sendControlResponseSuccess(msg, {
                session_url: getRemoteSessionUrl(
                  bridgeHandle.bridgeSessionId,
                  bridgeHandle.sessionIngressUrl,
                ),
                connect_url: buildBridgeConnectUrl(
                  bridgeHandle.environmentId,
                  bridgeHandle.sessionIngressUrl,
                ),
                environment_id: bridgeHandle.environmentId,
              })
            } else {
              // initReplBridge surfaces gate-failure reasons via
              // onStateChange('failed', detail) before returning null.
              // Capture so the control-response error is actionable
              // ("/login", "disabled by your organization's policy", etc.)
              // instead of a generic "initialization failed".
              let bridgeFailureDetail: string | undefined
              try {
                const { initReplBridge } = await import(
                  'src/bridge/initReplBridge.js'
                )
                const handle = await initReplBridge({
                  onInboundMessage(msg) {
                    const fields = extractInboundMessageFields(msg)
                    if (!fields) return
                    const { content, uuid } = fields
                    enqueue({
                      value: content,
                      mode: 'prompt' as const,
                      uuid,
                      skipSlashCommands: true,
                    })
                    void run()
                  },
                  onPermissionResponse(response) {
                    // Forward bridge permission responses into the
                    // stdin processing loop so they resolve pending
                    // permission requests from the SDK consumer.
                    structuredIO.injectControlResponse(response)
                  },
                  onInterrupt() {
                    abortCurrentHeadlessTurn('remote_control_interrupt')
                  },
                  onSetModel(model) {
                    const resolved =
                      model === 'default' ? getDefaultMainLoopModel() : model
                    activeUserSpecifiedModel = resolved
                    session.bootstrapStateProvider.patchPromptState({
                      mainLoopModelOverride: resolved,
                    })
                  },
                  onSetMaxThinkingTokens(maxTokens) {
                    if (maxTokens === null) {
                      options.thinkingConfig = undefined
                    } else if (maxTokens === 0) {
                      options.thinkingConfig = { type: 'disabled' }
                    } else {
                      options.thinkingConfig = {
                        type: 'enabled',
                        budgetTokens: maxTokens,
                      }
                    }
                  },
                  onStateChange(state, detail) {
                    if (state === 'failed') {
                      bridgeFailureDetail = detail
                    }
                    logForDebugging(
                      `[bridge:sdk] State change: ${state}${detail ? ` — ${detail}` : ''}`,
                    )
                    emitOutput({
                      type: 'system' as StdoutMessage['type'],
                      subtype: 'bridge_state' as string,
                      state,
                      detail,
                      uuid: randomUUID(),
                      session_id:
                        session.bootstrapStateProvider.getSessionIdentity()
                          .sessionId,
                    } as StdoutMessage)
                  },
                  initialMessages:
                    mutableMessages.length > 0 ? mutableMessages : undefined,
                })
                if (!handle) {
                  sendControlResponseError(
                    msg,
                    bridgeFailureDetail ??
                      'Remote Control initialization failed',
                  )
                } else {
                  bridgeHandle = handle
                  bridgeLastForwardedIndex = mutableMessages.length
                  // Forward permission requests to the bridge
                  structuredIO.setOnControlRequestSent(request => {
                    handle.sendControlRequest(request)
                  })
                  // Cancel stale bridge permission prompts when the SDK
                  // consumer resolves a can_use_tool request first.
                  structuredIO.setOnControlRequestResolved(requestId => {
                    handle.sendControlCancelRequest(requestId)
                  })
                  sendControlResponseSuccess(msg, {
                    session_url: getRemoteSessionUrl(
                      handle.bridgeSessionId,
                      handle.sessionIngressUrl,
                    ),
                    connect_url: buildBridgeConnectUrl(
                      handle.environmentId,
                      handle.sessionIngressUrl,
                    ),
                    environment_id: handle.environmentId,
                  })
                }
              } catch (err) {
                sendControlResponseError(msg, errorMessage(err))
              }
            }
          } else {
            // Disable
            if (bridgeHandle) {
              structuredIO.setOnControlRequestSent(undefined)
              structuredIO.setOnControlRequestResolved(undefined)
              await bridgeHandle.teardown()
              bridgeHandle = null
            }
            sendControlResponseSuccess(msg)
          }
        } else {
          // Unknown control request subtype — send an error response so
          // the caller doesn't hang waiting for a reply that never comes.
          sendControlResponseError(
            msg,
            `Unsupported control request subtype: ${(msg.request as { subtype: string }).subtype}`,
          )
        }
        continue
      } else if (message.type === 'control_response') {
        // Replay control_response messages when replay mode is enabled
        if (options.replayUserMessages) {
          emitOutput(message as StdoutMessage)
        }
        continue
      } else if (message.type === 'keep_alive') {
        // Silently ignore keep-alive messages
        continue
      } else if (message.type === 'update_environment_variables') {
        // Handled in structuredIO.ts, but TypeScript needs the type guard
        continue
      } else if (message.type === 'assistant' || message.type === 'system') {
        // History replay from bridge: inject into mutableMessages as
        // conversation context so the model sees prior turns.
        const internalMsgs = toInternalMessages([message as SDKMessage])
        managedSession.appendMessages(internalMsgs)
        // Echo assistant messages back so CCR displays them
        if (message.type === 'assistant' && options.replayUserMessages) {
          emitOutput(message as StdoutMessage)
        }
        continue
      }
      // After handling control, keep-alive, env-var, assistant, and system
      // messages above, only user messages should remain.
      if (message.type !== 'user') {
        continue
      }
      // Type assertion: after the type guard, message is a user message.
      // The union with SDKMessage (any) prevents proper narrowing.
      const userMsg = message as SDKUserMessage

      // First prompt message implicitly initializes if not already done.
      initialized = true

      // Check for duplicate user message - skip if already processed
      if (userMsg.uuid) {
        const sessionId = session.bootstrapStateProvider.getSessionIdentity()
          .sessionId as UUID
        const existsInSession = await doesMessageExistInSession(
          sessionId,
          userMsg.uuid as UUID,
        )

        // Check both historical duplicates (from file) and runtime duplicates (this session)
        if (
          existsInSession ||
          session.control.hasReceivedMessageUuid(userMsg.uuid as UUID)
        ) {
          logForDebugging(`Skipping duplicate user message: ${userMsg.uuid}`)
          // Send acknowledgment for duplicate message if replay mode is enabled
          if (options.replayUserMessages) {
            logForDebugging(
              `Sending acknowledgment for duplicate user message: ${userMsg.uuid}`,
            )
            emitOutput({
              type: 'user',
              content: (userMsg.message as { content?: string })?.content ?? '',
              message: userMsg.message as unknown,
              session_id: sessionId,
              parent_tool_use_id: null,
              uuid: userMsg.uuid as string,
              timestamp: (userMsg as { timestamp?: string }).timestamp,
              isReplay: true,
            } as unknown as StdoutMessage)
          }
          // Historical dup = transcript already has this turn's output, so it
          // ran but its lifecycle was never closed (interrupted before ack).
          // Runtime dups don't need this — the original enqueue path closes them.
          if (existsInSession) {
            notifyCommandLifecycle(userMsg.uuid as string, 'completed')
          }
          // Don't enqueue duplicate messages for execution
          continue
        }

        // Track this UUID to prevent runtime duplicates
        session.control.trackReceivedMessageUuid(userMsg.uuid as UUID)
      }

      enqueue({
        mode: 'prompt' as const,
        // file_attachments rides the protobuf catchall from the web composer.
        // Same-ref no-op when absent (no 'file_attachments' key).
        value: await resolveAndPrepend(
          userMsg,
          (userMsg.message as { content: ContentBlockParam[] }).content,
        ),
        uuid: userMsg.uuid as `${string}-${string}-${string}-${string}-${string}`,
        priority: (userMsg as { priority?: string })
          .priority as import('src/types/textInputTypes.js').QueuePriority,
      })
      // Increment prompt count for attribution tracking and save snapshot
      // The snapshot persists promptCount so it survives compaction
      if (feature('COMMIT_ATTRIBUTION')) {
        setAppState(prev => ({
          ...prev,
          attribution: incrementPromptCount(prev.attribution, snapshot => {
            void recordAttributionSnapshot(snapshot).catch(error => {
              logForDebugging(`Attribution: Failed to save snapshot: ${error}`)
            })
          }),
        }))
      }
      void run()
    }
    inputClosed = true
    cronScheduler?.stop()
    if (!running) {
      await cleanupHeadlessSession()
    }
  })()

  return output
}

/**
 * IDE-triggered channel enable. Derives the ChannelEntry from the connection's
 * pluginSource (IDE can't spoof kind/marketplace — we only take the server
 * name), appends it to session allowedChannels, and runs the full gate. On
 * gate failure, rolls back the append. On success, registers a notification
 * handler that enqueues channel messages at priority:'next' — drainCommandQueue
 * picks them up between turns.
 *
 * Intentionally does NOT register the claude/channel/permission handler that
 * useManageMCPConnections sets up for interactive mode. That handler resolves
 * a pending dialog inside handleInteractivePermission — but print.ts never
 * calls handleInteractivePermission. When SDK permission lands on 'ask', it
 * goes to the consumer's canUseTool callback over stdio; there is no CLI-side
 * dialog for a remote "yes tbxkq" to resolve. If an IDE wants channel-relayed
 * tool approval, that's IDE-side plumbing against its own pending-map. (Also
 * gated separately by tengu_harbor_permissions — not yet shipping on
 * interactive either.)
 */
export { handleMcpSetServers, reconcileMcpServers }
export type {
  DynamicMcpState,
  McpSetServersResult,
  SdkMcpState,
} from './headlessMcp.js'
