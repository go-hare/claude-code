import { describe, expect, mock, test } from 'bun:test'

import { QueryGuard } from '../../../../utils/QueryGuard.js'
import { runReplForegroundQueryController } from '../runReplForegroundQueryController.js'

describe('runReplForegroundQueryController', () => {
  test('enqueues user prompts when a foreground query is already running', async () => {
    const queryGuard = new QueryGuard()
    expect(queryGuard.tryStart()).not.toBeNull()
    const enqueuePrompt = mock(() => {})
    const runTurn = mock(async () => {})

    await expect(
      runReplForegroundQueryController({
        turn: {
          newMessages: [
            {
              type: 'user',
              isMeta: false,
              message: { content: 'hello world' },
            },
          ] as any,
          abortController: new AbortController(),
          shouldQuery: true,
          additionalAllowedTools: [],
          mainLoopModelParam: 'sonnet',
        },
        runtime: {
          runTurn,
          queryGuard,
        },
        host: createHostHarness({
          enqueuePrompt,
        }),
      }),
    ).resolves.toBe(false)

    expect(enqueuePrompt).toHaveBeenCalledWith('hello world')
    expect(runTurn).toHaveBeenCalledTimes(0)
  })

  test('re-enqueues original queued commands when a foreground query is already running', async () => {
    const queryGuard = new QueryGuard()
    expect(queryGuard.tryStart()).not.toBeNull()
    const enqueuePrompt = mock(() => {})
    const enqueueQueuedCommand = mock(() => {})
    const runTurn = mock(async () => {})
    const queuedCommand = {
      value: 'scheduled follow-up',
      mode: 'prompt',
      autonomy: {
        runId: 'run-1',
        trigger: 'scheduled-task',
      },
    }

    await expect(
      runReplForegroundQueryController({
        turn: {
          newMessages: [
            {
              type: 'user',
              isMeta: false,
              message: { content: 'scheduled follow-up' },
            },
          ] as any,
          abortController: new AbortController(),
          shouldQuery: true,
          additionalAllowedTools: [],
          mainLoopModelParam: 'sonnet',
          queuedCommand: queuedCommand as any,
        },
        runtime: {
          runTurn,
          queryGuard,
        },
        host: createHostHarness({
          enqueuePrompt,
          enqueueQueuedCommand,
        }),
      }),
    ).resolves.toBe(false)

    expect(enqueueQueuedCommand).toHaveBeenCalledWith(queuedCommand)
    expect(enqueuePrompt).not.toHaveBeenCalled()
    expect(runTurn).toHaveBeenCalledTimes(0)
  })

  test('re-enqueues original queued command when onBeforeQuery vetoes execution', async () => {
    const queryGuard = new QueryGuard()
    const enqueueQueuedCommand = mock(() => {})
    const runTurn = mock(async () => {})
    const queuedCommand = {
      value: 'scheduled follow-up',
      mode: 'prompt',
      autonomy: {
        runId: 'run-2',
        trigger: 'scheduled-task',
      },
    }
    const host = createHostHarness({
      enqueueQueuedCommand,
    })
    host.onBeforeQueryCallback = mock(async () => false)

    await expect(
      runReplForegroundQueryController({
        turn: {
          newMessages: [
            {
              type: 'user',
              isMeta: false,
              message: { content: 'scheduled follow-up' },
            },
          ] as any,
          abortController: new AbortController(),
          shouldQuery: true,
          additionalAllowedTools: [],
          mainLoopModelParam: 'sonnet',
          input: 'scheduled follow-up',
          queuedCommand: queuedCommand as any,
        },
        runtime: {
          runTurn,
          queryGuard,
        },
        host,
      }),
    ).resolves.toBe(false)

    expect(enqueueQueuedCommand).toHaveBeenCalledWith(queuedCommand)
    expect(runTurn).not.toHaveBeenCalled()
  })

  test('runs foreground query and finalizes host state on success', async () => {
    const queryGuard = new QueryGuard()
    const abortController = new AbortController()
    const runTurn = mock(async (messagesIncludingNewMessages: any[]) => {
      expect(messagesIncludingNewMessages).toHaveLength(1)
    })
    const host = createHostHarness({
      loadingStartTimeMs: Date.now() - 31_000,
    })

    await expect(
      runReplForegroundQueryController({
        turn: {
          newMessages: [
            {
              type: 'user',
              isMeta: false,
              message: { content: 'ship it' },
            },
          ] as any,
          abortController,
          shouldQuery: true,
          additionalAllowedTools: ['Read'],
          mainLoopModelParam: 'sonnet',
          input: 'ship it',
        },
        runtime: {
          runTurn,
          queryGuard,
        },
        host,
      }),
    ).resolves.toBe(true)

    expect(host.mrOnBeforeQuery).toHaveBeenCalledTimes(1)
    expect(runTurn).toHaveBeenCalledTimes(1)
    expect(host.resetLoadingState).toHaveBeenCalledTimes(1)
    expect(host.mrOnTurnComplete).toHaveBeenCalledTimes(1)
    expect(host.sendBridgeResult).toHaveBeenCalledTimes(1)
    expect(host.setAbortController).toHaveBeenCalledWith(null)
    expect(host.state.messages.length).toBeGreaterThanOrEqual(1)
  })
})

function createHostHarness(overrides?: {
  enqueuePrompt?: (value: string) => void
  enqueueQueuedCommand?: (command: unknown) => void
  loadingStartTimeMs?: number
}) {
  const state = {
    messages: [] as any[],
    tungstenActiveSession: undefined as any,
    tungstenPanelAutoHidden: false,
  }
  const setMessages = (updater: (prev: any[]) => any[]) => {
    state.messages = updater(state.messages)
    messagesRef.current = state.messages
  }
  const messagesRef = { current: state.messages }
  const responseLengthRef = { current: 0 }
  const apiMetricsRef = { current: [] as any[] }
  const pipeReturnHadErrorRef = { current: false }
  const skipIdleCheckRef = { current: true }
  const loadingStartTimeRef = {
    current: overrides?.loadingStartTimeMs ?? Date.now(),
  }
  const totalPausedMsRef = { current: 0 }
  const inputValueRef = { current: '' }
  const enqueuePrompt = overrides?.enqueuePrompt ?? mock(() => {})
  const enqueueQueuedCommand =
    overrides?.enqueueQueuedCommand ?? mock((_command: unknown) => {})

  return {
    state,
    setMessages,
    messagesRef,
    responseLengthRef,
    apiMetricsRef,
    pipeReturnHadErrorRef,
    skipIdleCheckRef,
    loadingStartTimeRef,
    totalPausedMsRef,
    inputValueRef,
    resetTimingRefs: mock(() => {}),
    snapshotOutputTokensForTurn: mock((_value: number | null) => {}),
    getCurrentTurnTokenBudget: mock(() => null),
    parseTokenBudget: mock((_input: string) => null),
    setStreamingToolUses: mock((_next: unknown[]) => {}),
    setStreamingText: mock((_next: string | null) => {}),
    mrOnBeforeQuery: mock(async () => {}),
    onBeforeQueryCallback: undefined as
      | ((input: string, latestMessages: any[]) => Promise<boolean>)
      | undefined,
    relayPipeError: mock((_message: string) => {}),
    setLastQueryCompletionTime: mock((_timeMs: number) => {}),
    resetLoadingState: mock(() => {}),
    mrOnTurnComplete: mock(async () => {}),
    signalPipeDone: mock(() => {}),
    sendBridgeResult: mock(() => {}),
    setTungstenAutoHidden: (updater: (prev: typeof state) => typeof state) => {
      const next = updater(state)
      Object.assign(state, next)
    },
    setAbortController: mock((_controller: AbortController | null) => {}),
    getTurnOutputTokens: mock(() => 0),
    getBudgetContinuationCount: mock(() => 0),
    proactiveActive: false,
    hasRunningSwarmAgents: () => false,
    recordDeferredSwarmStartTime: mock((_timeMs: number) => {}),
    recordDeferredBudgetInfo: mock((_info: unknown) => {}),
    getCommandQueueLength: () => 0,
    viewingAgentTaskId: null,
    removeLastFromHistory: mock(() => {}),
    restoreMessage: mock((_message: unknown) => {}),
    enqueuePrompt,
    enqueueQueuedCommand,
  } as any
}
