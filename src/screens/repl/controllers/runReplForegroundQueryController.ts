import { feature } from 'bun:bundle'
import type { QueryGuard } from '../../../utils/QueryGuard.js'
import { count } from '../../../utils/array.js'
import { logEvent } from '../../../services/analytics/index.js'
import type { AppState } from '../../../state/AppStateStore.js'
import {
  createTurnDurationMessage,
  getContentText,
  type StreamingToolUse,
} from '../../../utils/messages.js'
import type {
  Message as MessageType,
  UserMessage,
} from '../../../types/message.js'
import type { QueuedCommand } from '../../../types/textInputTypes.js'
import type { EffortValue } from '../../../utils/effort.js'
import { isLoggableMessage } from '../../../utils/sessionStorage.js'
import { finalizeReplCompletedTurnHostShell } from '../../replTurnShell.js'
import {
  captureReplTurnBudgetInfo,
  finalizeReplTurnDurationShell,
  type ReplTurnBudgetInfo,
} from '../../replTurnCompletion.js'
import { maybeRestoreCancelledReplTurn } from '../../replTurnRestore.js'

type SetMessages = (
  updater: (prev: MessageType[]) => MessageType[],
) => void

export type RunReplForegroundQueryControllerOptions = {
  turn: {
    newMessages: MessageType[]
    abortController: AbortController
    shouldQuery: boolean
    additionalAllowedTools: string[]
    mainLoopModelParam: string
    input?: string
    effort?: EffortValue
    queuedCommand?: QueuedCommand
  }
  runtime: {
    runTurn(
      messagesIncludingNewMessages: MessageType[],
      newMessages: MessageType[],
      abortController: AbortController,
      shouldQuery: boolean,
      additionalAllowedTools: string[],
      mainLoopModelParam: string,
      effort?: EffortValue,
    ): Promise<void>
    queryGuard: QueryGuard
  }
  host: {
    setMessages: SetMessages
    messagesRef: { current: MessageType[] }
    resetTimingRefs(): void
    responseLengthRef: { current: number }
    snapshotOutputTokensForTurn(nextBudget: number | null): void
    getCurrentTurnTokenBudget(): number | null
    parseTokenBudget(input: string): number | null
    apiMetricsRef: {
      current: Array<{
        ttftMs: number
        firstTokenTime: number
        lastTokenTime: number
        responseLengthBaseline: number
        endResponseLength: number
      }>
    }
    setStreamingToolUses(next: StreamingToolUse[]): void
    setStreamingText(next: string | null): void
    mrOnBeforeQuery(
      input: string,
      latestMessages: MessageType[],
      newMessageCount: number,
    ): Promise<unknown>
    onBeforeQueryCallback?: (
      input: string,
      latestMessages: MessageType[],
    ) => Promise<boolean>
    pipeReturnHadErrorRef: { current: boolean }
    relayPipeError?(message: string): void
    setLastQueryCompletionTime(timeMs: number): void
    skipIdleCheckRef: { current: boolean }
    resetLoadingState(): void
    mrOnTurnComplete(
      messages: MessageType[],
      aborted: boolean,
    ): Promise<void>
    signalPipeDone(): void
    sendBridgeResult(): void
    setTungstenAutoHidden(
      updater: (prev: AppState) => AppState,
    ): void
    setAbortController(controller: AbortController | null): void
    loadingStartTimeRef: { current: number }
    totalPausedMsRef: { current: number }
    getTurnOutputTokens(): number
    getBudgetContinuationCount(): number
    proactiveActive: boolean
    hasRunningSwarmAgents(): boolean
    recordDeferredSwarmStartTime(timeMs: number): void
    recordDeferredBudgetInfo(info: ReplTurnBudgetInfo): void
    inputValueRef: { current: string }
    getCommandQueueLength(): number
    viewingAgentTaskId: string | null | undefined
    removeLastFromHistory(): void
    restoreMessage(message: UserMessage): void
    enqueuePrompt(value: string): void
    enqueueQueuedCommand?(command: QueuedCommand): void
  }
}

export async function runReplForegroundQueryController(
  options: RunReplForegroundQueryControllerOptions,
): Promise<boolean> {
  const { turn, runtime, host } = options
  const requeueTurnCommand = (): void => {
    if (turn.queuedCommand && host.enqueueQueuedCommand) {
      host.enqueueQueuedCommand(turn.queuedCommand)
      return
    }

    turn.newMessages
      .filter((message): message is UserMessage =>
        message.type === 'user' && !message.isMeta,
      )
      .map(message =>
        getContentText(message.message.content as string | Parameters<typeof getContentText>[0]),
      )
      .filter((message): message is string => message !== null)
      .forEach(message => {
        host.enqueuePrompt(message)
      })
  }

  const thisGeneration = runtime.queryGuard.tryStart()
  if (thisGeneration === null) {
    logEvent('tengu_concurrent_onquery_detected', {})
    requeueTurnCommand()
    logEvent('tengu_concurrent_onquery_enqueued', {})
    return false
  }

  let executed = false
  try {
    host.pipeReturnHadErrorRef.current = false
    host.resetTimingRefs()
    host.setMessages(previous => [...previous, ...turn.newMessages])
    host.responseLengthRef.current = 0
    if (feature('TOKEN_BUDGET')) {
      const parsedBudget = turn.input
        ? host.parseTokenBudget(turn.input)
        : null
      host.snapshotOutputTokensForTurn(
        parsedBudget ?? host.getCurrentTurnTokenBudget(),
      )
    }
    host.apiMetricsRef.current = []
    host.setStreamingToolUses([])
    host.setStreamingText(null)

    const latestMessages = host.messagesRef.current

    if (turn.input) {
      await host.mrOnBeforeQuery(
        turn.input,
        latestMessages,
        turn.newMessages.length,
      )
    }

    if (host.onBeforeQueryCallback && turn.input) {
      const shouldProceed = await host.onBeforeQueryCallback(
        turn.input,
        latestMessages,
      )
      if (!shouldProceed) {
        requeueTurnCommand()
        return false
      }
    }

    try {
      await runtime.runTurn(
        latestMessages,
        turn.newMessages,
        turn.abortController,
        turn.shouldQuery,
        turn.additionalAllowedTools,
        turn.mainLoopModelParam,
        turn.effort,
      )
      executed = true
    } catch (error) {
      if (feature('UDS_INBOX')) {
        host.pipeReturnHadErrorRef.current = true
        host.relayPipeError?.(
          error instanceof Error ? error.message : String(error),
        )
      }
      throw error
    }
  } finally {
    if (runtime.queryGuard.end(thisGeneration)) {
      host.setLastQueryCompletionTime(Date.now())
      host.skipIdleCheckRef.current = false
      host.resetLoadingState()

      await host.mrOnTurnComplete(
        host.messagesRef.current,
        turn.abortController.signal.aborted,
      )

      let shouldSignalPipeDone = false
      if (feature('UDS_INBOX')) {
        shouldSignalPipeDone = !host.pipeReturnHadErrorRef.current
      }

      finalizeReplCompletedTurnHostShell({
        shouldSignalPipeDone,
        signalPipeDone: host.signalPipeDone,
        sendBridgeResult: host.sendBridgeResult,
        shouldAutoHideTungsten:
          process.env.USER_TYPE === 'ant' &&
          !turn.abortController.signal.aborted,
        setTungstenAutoHidden: host.setTungstenAutoHidden as Parameters<
          typeof finalizeReplCompletedTurnHostShell
        >[0]['setTungstenAutoHidden'],
        setAbortController: host.setAbortController,
      })

      let budgetInfo: ReplTurnBudgetInfo | undefined
      if (feature('TOKEN_BUDGET')) {
        budgetInfo = captureReplTurnBudgetInfo({
          tokenBudget: host.getCurrentTurnTokenBudget(),
          isAborted: turn.abortController.signal.aborted,
          getTurnOutputTokens: host.getTurnOutputTokens,
          getBudgetContinuationCount: host.getBudgetContinuationCount,
          clearTurnBudget: () => {
            host.snapshotOutputTokensForTurn(null)
          },
        })
      }

      const turnDurationMs =
        Date.now() -
        host.loadingStartTimeRef.current -
        host.totalPausedMsRef.current

      finalizeReplTurnDurationShell({
        turnDurationMs,
        budgetInfo,
        isAborted: turn.abortController.signal.aborted,
        proactiveActive: host.proactiveActive,
        hasRunningSwarmAgents: host.hasRunningSwarmAgents(),
        loadingStartTimeMs: host.loadingStartTimeRef.current,
        recordDeferredSwarmStartTime: host.recordDeferredSwarmStartTime,
        recordDeferredBudgetInfo: host.recordDeferredBudgetInfo,
        appendTurnDurationMessage: (nextTurnDurationMs, nextBudgetInfo) => {
          host.setMessages(previous => [
            ...previous,
            createTurnDurationMessage(
              nextTurnDurationMs,
              nextBudgetInfo,
              count(previous, isLoggableMessage),
            ),
          ])
        },
      })
    }

    maybeRestoreCancelledReplTurn({
      abortReason: turn.abortController.signal.reason,
      hasActiveQuery: runtime.queryGuard.isActive,
      inputValue: host.inputValueRef.current,
      commandQueueLength: host.getCommandQueueLength(),
      viewingAgentTaskId: host.viewingAgentTaskId,
      messages: host.messagesRef.current,
      removeLastFromHistory: host.removeLastFromHistory,
      restoreMessage: host.restoreMessage,
    })
  }

  return executed
}
