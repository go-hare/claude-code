import { describe, expect, mock, test } from 'bun:test'

import {
  appendReplApiMetricsMessage,
  finalizeReplCompletedTurnHostShell,
  maybeGenerateReplSessionTitle,
  maybeRefreshCompanionReaction,
  runReplPreQueryHostPrep,
  shortCircuitReplNonQueryTurn,
  syncReplAllowedToolsForTurn,
} from '../replTurnShell.js'

describe('replTurnShell', () => {
  test('syncs allowed tools only when the turn changes them', () => {
    let state = {
      toolPermissionContext: {
        alwaysAllowRules: {
          command: ['Read'],
        },
      },
    } as any
    const setStoreState = (updater: (prev: typeof state) => typeof state) => {
      state = updater(state)
    }

    syncReplAllowedToolsForTurn({
      setStoreState,
      additionalAllowedTools: ['Read'],
    })
    expect(state.toolPermissionContext.alwaysAllowRules.command).toEqual([
      'Read',
    ])

    syncReplAllowedToolsForTurn({
      setStoreState,
      additionalAllowedTools: ['Write'],
    })
    expect(state.toolPermissionContext.alwaysAllowRules.command).toEqual([
      'Write',
    ])
  })

  test('runs pre-query host prep only for real query turns', () => {
    const onDiagnosticQueryStart = mock((_clients: string[]) => {})
    const getConnectedIdeClient = mock((_clients: string[]) => 'ide')
    const closeOpenDiffs = mock((_ideClient: string) => {})
    const markProjectOnboardingComplete = mock(() => {})

    runReplPreQueryHostPrep({
      shouldQuery: true,
      getFreshMcpClients: () => ['mcp-a'],
      onDiagnosticQueryStart,
      getConnectedIdeClient,
      closeOpenDiffs,
      markProjectOnboardingComplete,
    })

    expect(onDiagnosticQueryStart).toHaveBeenCalledWith(['mcp-a'])
    expect(getConnectedIdeClient).toHaveBeenCalledWith(['mcp-a'])
    expect(closeOpenDiffs).toHaveBeenCalledWith('ide')
    expect(markProjectOnboardingComplete).toHaveBeenCalledTimes(1)
  })

  test('starts a session title only for the first real prose message', async () => {
    const attempted = { current: false }
    const generateSessionTitle = mock(async () => 'A new title')
    let title: string | undefined

    maybeGenerateReplSessionTitle({
      newMessages: [
        {
          type: 'user',
          isMeta: false,
          message: { content: 'help me with this task' },
        },
      ] as any,
      titleDisabled: false,
      sessionTitle: undefined,
      agentTitle: undefined,
      haikuTitleAttemptedRef: attempted,
      generateSessionTitle,
      setHaikuTitle: nextTitle => {
        title = nextTitle
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(generateSessionTitle).toHaveBeenCalledTimes(1)
    expect(title).toBe('A new title')
    expect(attempted.current).toBe(true)
  })

  test('short-circuits non-query compact turns through the host shell', () => {
    const resetLoadingState = mock(() => {})
    const setAbortController = mock((_controller: AbortController | null) => {})
    const bumpConversationId = mock(() => {})
    const clearContextBlocked = mock(() => {})

    const shortCircuited = shortCircuitReplNonQueryTurn({
      shouldQuery: false,
      newMessages: [
        {
          type: 'system',
          subtype: 'compact_boundary',
          message: { content: 'boundary' },
        },
      ] as any,
      bumpConversationId,
      clearContextBlocked,
      resetLoadingState,
      setAbortController,
    })

    expect(shortCircuited).toBe(true)
    expect(bumpConversationId).toHaveBeenCalledTimes(1)
    expect(clearContextBlocked).toHaveBeenCalledTimes(1)
    expect(resetLoadingState).toHaveBeenCalledTimes(1)
    expect(setAbortController).toHaveBeenCalledWith(null)
  })

  test('refreshes companion reaction through the injected observer callback', async () => {
    const fireCompanionObserver = mock(
      (messages: unknown[], callback: (reaction: unknown) => void) => {
        expect(messages).toHaveLength(1)
        callback('smile')
      },
    )
    let reaction: unknown = 'idle'

    maybeRefreshCompanionReaction({
      fireCompanionObserver,
      messages: [{ type: 'assistant' }] as any,
      setCompanionReaction: updater => {
        reaction = updater(reaction)
      },
    })

    await Promise.resolve()

    expect(fireCompanionObserver).toHaveBeenCalledTimes(1)
    expect(reaction).toBe('smile')
  })

  test('appends aggregated api metrics as a host-shell message', () => {
    let messages: unknown[] = []

    appendReplApiMetricsMessage({
      entries: [
        {
          ttftMs: 120,
          firstTokenTime: 1_000,
          lastTokenTime: 2_000,
          responseLengthBaseline: 0,
          endResponseLength: 16,
        },
        {
          ttftMs: 240,
          firstTokenTime: 2_000,
          lastTokenTime: 3_000,
          responseLengthBaseline: 0,
          endResponseLength: 32,
        },
      ],
      loadingStartTimeMs: Date.now() - 500,
      setMessages: updater => {
        messages = updater(messages as any)
      },
    })

    expect(messages).toHaveLength(1)
    expect((messages[0] as { type?: string }).type).toBe('system')
  })

  test('finalizes completed turns through host-shell helpers', () => {
    let state = {
      tungstenActiveSession: { id: 'session-1' },
      tungstenPanelAutoHidden: false,
    } as any
    const setTungstenAutoHidden = (updater: (prev: typeof state) => typeof state) => {
      state = updater(state)
    }
    const signalPipeDone = mock(() => {})
    const sendBridgeResult = mock(() => {})
    const setAbortController = mock((_controller: AbortController | null) => {})

    finalizeReplCompletedTurnHostShell({
      shouldSignalPipeDone: true,
      signalPipeDone,
      sendBridgeResult,
      shouldAutoHideTungsten: true,
      setTungstenAutoHidden,
      setAbortController,
    })

    expect(signalPipeDone).toHaveBeenCalledTimes(1)
    expect(sendBridgeResult).toHaveBeenCalledTimes(1)
    expect(state.tungstenPanelAutoHidden).toBe(true)
    expect(setAbortController).toHaveBeenCalledWith(null)
  })
})
