import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import {
  getTurnClassifierCount,
  getTurnClassifierDurationMs,
  getTurnHookCount,
  getTurnHookDurationMs,
  getTurnToolCount,
  getTurnToolDurationMs,
  resetTurnClassifierDuration,
  resetTurnHookDuration,
  resetTurnToolDuration,
} from '../../../bootstrap/state.js'
import {
  prepareReplRuntimeQuery,
  runReplRuntimeQuery,
  type ReplQueryRuntimeEvent,
} from '../../../runtime/capabilities/execution/internal/replQueryRuntime.js'
import type { AppState } from '../../../state/AppStateStore.js'
import type { Message as MessageType } from '../../../types/message.js'
import type { EffortValue } from '../../../utils/effort.js'
import type { ProcessUserInputContext } from '../../../utils/processUserInput/processUserInput.js'
import { logQueryProfileReport, queryCheckpoint } from '../../../utils/queryProfiler.js'
import {
  appendReplApiMetricsMessage,
  maybeGenerateReplSessionTitle,
  maybeRefreshCompanionReaction,
  runReplPreQueryHostPrep,
  shortCircuitReplNonQueryTurn,
  syncReplAllowedToolsForTurn,
} from '../../replTurnShell.js'

type ReplMessageStateUpdater = (
  updater: (prev: MessageType[]) => MessageType[],
) => void

type ReplStoreStateUpdater = (updater: (prev: AppState) => AppState) => void

type ReplMcpClients = ProcessUserInputContext['options']['mcpClients']

export type RunReplQueryTurnControllerOptions = {
  turn: {
    messagesIncludingNewMessages: MessageType[]
    newMessages: MessageType[]
    abortController: AbortController
    shouldQuery: boolean
    additionalAllowedTools: string[]
    mainLoopModelParam: string
    effort?: EffortValue
  }
  host: {
    getFreshMcpClients(): ReplMcpClients
    onDiagnosticQueryStart(clients: ReplMcpClients): void
    getConnectedIdeClient(clients: ReplMcpClients): unknown
    closeOpenDiffs(ideClient: unknown): void | Promise<void>
    markProjectOnboardingComplete(): void
    setStoreState: ReplStoreStateUpdater
    bumpConversationId(): void
    clearContextBlocked?(): void
    resetLoadingState(): void
    setAbortController(controller: AbortController | null): void
    setCompanionReaction(updater: (previous: unknown) => unknown): void
    relayPipeInterrupted?(): void
    apiMetricsRef: {
      current: Parameters<typeof appendReplApiMetricsMessage>[0]['entries']
    }
    loadingStartTimeRef: { current: number }
    setMessages: ReplMessageStateUpdater
    messagesRef: { current: MessageType[] }
    onTurnComplete?(messages: MessageType[]): Promise<void> | void
  }
  query: {
    titleDisabled: boolean
    sessionTitle: string | undefined
    agentTitle: string | undefined
    haikuTitleAttemptedRef: { current: boolean }
    generateSessionTitle(
      text: string,
      signal: AbortSignal,
    ): Promise<string | undefined | null>
    setHaikuTitle(title: string | undefined): void
    getToolUseContext(
      messages: MessageType[],
      newMessages: MessageType[],
      abortController: AbortController,
      mainLoopModel: string,
    ): ProcessUserInputContext
    beforePrepareQuery?(): Promise<void>
    mainThreadAgentDefinition: AgentDefinition | undefined
    getExtraUserContext(
      toolUseContext: ProcessUserInputContext,
    ): Record<string, string>
    querySource: Parameters<typeof runReplRuntimeQuery>[0]['querySource']
    canUseTool: Parameters<typeof runReplRuntimeQuery>[0]['canUseTool']
    onQueryEvent(
      event: ReplQueryRuntimeEvent,
    ): void | Promise<void>
    fireCompanionObserver?: (
      messages: MessageType[],
      callback: (reaction: unknown) => void,
    ) => void
  }
}

export async function runReplQueryTurnController(
  options: RunReplQueryTurnControllerOptions,
): Promise<void> {
  const { turn, host, query } = options

  runReplPreQueryHostPrep({
    shouldQuery: turn.shouldQuery,
    getFreshMcpClients: host.getFreshMcpClients,
    onDiagnosticQueryStart: host.onDiagnosticQueryStart,
    getConnectedIdeClient: host.getConnectedIdeClient,
    closeOpenDiffs: host.closeOpenDiffs,
    markProjectOnboardingComplete: host.markProjectOnboardingComplete,
  })

  maybeGenerateReplSessionTitle({
    newMessages: turn.newMessages,
    titleDisabled: query.titleDisabled,
    sessionTitle: query.sessionTitle,
    agentTitle: query.agentTitle,
    haikuTitleAttemptedRef: query.haikuTitleAttemptedRef,
    generateSessionTitle: query.generateSessionTitle,
    setHaikuTitle: query.setHaikuTitle,
  })

  syncReplAllowedToolsForTurn({
    setStoreState: host.setStoreState,
    additionalAllowedTools: turn.additionalAllowedTools,
  })

  if (
    shortCircuitReplNonQueryTurn({
      shouldQuery: turn.shouldQuery,
      newMessages: turn.newMessages,
      bumpConversationId: host.bumpConversationId,
      clearContextBlocked: host.clearContextBlocked,
      resetLoadingState: host.resetLoadingState,
      setAbortController: host.setAbortController,
    })
  ) {
    return
  }

  const toolUseContext = query.getToolUseContext(
    turn.messagesIncludingNewMessages,
    turn.newMessages,
    turn.abortController,
    turn.mainLoopModelParam,
  )

  queryCheckpoint('query_context_loading_start')
  await query.beforePrepareQuery?.()

  const preparedQuery = await prepareReplRuntimeQuery({
    toolUseContext,
    mainThreadAgentDefinition: query.mainThreadAgentDefinition,
    effort: turn.effort,
    extraUserContext: query.getExtraUserContext(toolUseContext),
  })

  queryCheckpoint('query_context_loading_end')
  queryCheckpoint('query_query_start')
  resetTurnHookDuration()
  resetTurnToolDuration()
  resetTurnClassifierDuration()

  await runReplRuntimeQuery({
    preparedQuery,
    messages: turn.messagesIncludingNewMessages,
    canUseTool: query.canUseTool,
    querySource: query.querySource,
    onQueryEvent: query.onQueryEvent,
    toolUseContext,
    mainThreadAgentDefinition: query.mainThreadAgentDefinition,
    effort: turn.effort,
  })

  maybeRefreshCompanionReaction({
    fireCompanionObserver: query.fireCompanionObserver,
    messages: host.messagesRef.current,
    setCompanionReaction: host.setCompanionReaction,
  })

  queryCheckpoint('query_end')

  if (turn.abortController.signal.aborted) {
    host.relayPipeInterrupted?.()
  }

  if (process.env.USER_TYPE === 'ant' && host.apiMetricsRef.current.length > 0) {
    const hookMs = getTurnHookDurationMs()
    const hookCount = getTurnHookCount()
    const toolMs = getTurnToolDurationMs()
    const toolCount = getTurnToolCount()
    const classifierMs = getTurnClassifierDurationMs()
    const classifierCount = getTurnClassifierCount()

    appendReplApiMetricsMessage({
      entries: host.apiMetricsRef.current,
      loadingStartTimeMs: host.loadingStartTimeRef.current,
      setMessages: updater => {
        host.setMessages(prev => {
          const withBaseMetrics = updater(prev)
          const apiMetricsMessage = withBaseMetrics.at(-1)
          if (
            apiMetricsMessage?.type !== 'system' ||
            apiMetricsMessage.subtype !== 'api_metrics'
          ) {
            return withBaseMetrics
          }

          const nextMessages = withBaseMetrics.slice()
          nextMessages[nextMessages.length - 1] = {
            ...apiMetricsMessage,
            hookDurationMs: hookMs > 0 ? hookMs : undefined,
            hookCount: hookCount > 0 ? hookCount : undefined,
            toolDurationMs: toolMs > 0 ? toolMs : undefined,
            toolCount: toolCount > 0 ? toolCount : undefined,
            classifierDurationMs: classifierMs > 0 ? classifierMs : undefined,
            classifierCount: classifierCount > 0 ? classifierCount : undefined,
          }
          return nextMessages
        })
      },
    })
  }

  host.resetLoadingState()
  logQueryProfileReport()
  await host.onTurnComplete?.(host.messagesRef.current)
}
