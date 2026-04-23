import { describe, expect, mock, test } from 'bun:test'

import { runReplCancelShell } from '../replCancelShell.js'

describe('replCancelShell', () => {
  test('no-ops for elicitation dialogs', () => {
    const forceEndQuery = mock(() => {})

    const handled = runReplCancelShell({
      focusedInputDialog: 'elicitation',
      pauseProactive: mock(() => {}),
      forceEndQuery,
      clearIdleSkip: mock(() => {}),
      partialStreamingText: 'partial',
      appendPartialAssistantMessage: mock((_text: string) => {}),
      resetLoadingState: mock(() => {}),
      shouldClearTokenBudget: true,
      clearTokenBudget: mock(() => {}),
      abortToolUseConfirm: mock(() => {}),
      clearToolUseConfirmQueue: mock(() => {}),
      promptQueue: [],
      clearPromptQueue: mock(() => {}),
      abortCurrentRequest: mock(() => {}),
      isRemoteMode: false,
      cancelRemoteRequest: mock(() => {}),
      clearAbortController: mock(() => {}),
      notifyTurnCancelled: mock(() => {}),
    })

    expect(handled).toBe(false)
    expect(forceEndQuery).not.toHaveBeenCalled()
  })

  test('handles a normal local cancel and preserves partial streaming text', () => {
    const appendPartialAssistantMessage = mock((_text: string) => {})
    const abortCurrentRequest = mock(() => {})
    const notifyTurnCancelled = mock(() => {})

    const handled = runReplCancelShell({
      focusedInputDialog: undefined,
      pauseProactive: mock(() => {}),
      forceEndQuery: mock(() => {}),
      clearIdleSkip: mock(() => {}),
      partialStreamingText: 'partial answer',
      appendPartialAssistantMessage,
      resetLoadingState: mock(() => {}),
      shouldClearTokenBudget: true,
      clearTokenBudget: mock(() => {}),
      abortToolUseConfirm: mock(() => {}),
      clearToolUseConfirmQueue: mock(() => {}),
      promptQueue: [],
      clearPromptQueue: mock(() => {}),
      abortCurrentRequest,
      isRemoteMode: false,
      cancelRemoteRequest: mock(() => {}),
      clearAbortController: mock(() => {}),
      notifyTurnCancelled,
    })

    expect(handled).toBe(true)
    expect(appendPartialAssistantMessage).toHaveBeenCalledWith(
      'partial answer',
    )
    expect(abortCurrentRequest).toHaveBeenCalledTimes(1)
    expect(notifyTurnCancelled).toHaveBeenCalledTimes(1)
  })

  test('aborts tool-permission queue without touching the request signal', () => {
    const abortToolUseConfirm = mock(() => {})
    const clearToolUseConfirmQueue = mock(() => {})
    const abortCurrentRequest = mock(() => {})

    runReplCancelShell({
      focusedInputDialog: 'tool-permission',
      pauseProactive: mock(() => {}),
      forceEndQuery: mock(() => {}),
      clearIdleSkip: mock(() => {}),
      partialStreamingText: undefined,
      appendPartialAssistantMessage: mock((_text: string) => {}),
      resetLoadingState: mock(() => {}),
      shouldClearTokenBudget: false,
      clearTokenBudget: mock(() => {}),
      abortToolUseConfirm,
      clearToolUseConfirmQueue,
      promptQueue: [],
      clearPromptQueue: mock(() => {}),
      abortCurrentRequest,
      isRemoteMode: false,
      cancelRemoteRequest: mock(() => {}),
      clearAbortController: mock(() => {}),
      notifyTurnCancelled: mock(() => {}),
    })

    expect(abortToolUseConfirm).toHaveBeenCalledTimes(1)
    expect(clearToolUseConfirmQueue).toHaveBeenCalledTimes(1)
    expect(abortCurrentRequest).not.toHaveBeenCalled()
  })

  test('rejects queued prompts and aborts the local request in prompt mode', () => {
    const firstReject = mock((_error: Error) => {})
    const secondReject = mock((_error: Error) => {})
    const clearPromptQueue = mock(() => {})
    const abortCurrentRequest = mock(() => {})

    runReplCancelShell({
      focusedInputDialog: 'prompt',
      pauseProactive: mock(() => {}),
      forceEndQuery: mock(() => {}),
      clearIdleSkip: mock(() => {}),
      partialStreamingText: undefined,
      appendPartialAssistantMessage: mock((_text: string) => {}),
      resetLoadingState: mock(() => {}),
      shouldClearTokenBudget: false,
      clearTokenBudget: mock(() => {}),
      abortToolUseConfirm: mock(() => {}),
      clearToolUseConfirmQueue: mock(() => {}),
      promptQueue: [{ reject: firstReject }, { reject: secondReject }],
      clearPromptQueue,
      abortCurrentRequest,
      isRemoteMode: false,
      cancelRemoteRequest: mock(() => {}),
      clearAbortController: mock(() => {}),
      notifyTurnCancelled: mock(() => {}),
    })

    expect(firstReject).toHaveBeenCalledTimes(1)
    expect(secondReject).toHaveBeenCalledTimes(1)
    expect(clearPromptQueue).toHaveBeenCalledTimes(1)
    expect(abortCurrentRequest).toHaveBeenCalledTimes(1)
  })

  test('routes cancel through the remote session when in remote mode', () => {
    const cancelRemoteRequest = mock(() => {})
    const abortCurrentRequest = mock(() => {})

    runReplCancelShell({
      focusedInputDialog: undefined,
      pauseProactive: mock(() => {}),
      forceEndQuery: mock(() => {}),
      clearIdleSkip: mock(() => {}),
      partialStreamingText: undefined,
      appendPartialAssistantMessage: mock((_text: string) => {}),
      resetLoadingState: mock(() => {}),
      shouldClearTokenBudget: false,
      clearTokenBudget: mock(() => {}),
      abortToolUseConfirm: mock(() => {}),
      clearToolUseConfirmQueue: mock(() => {}),
      promptQueue: [],
      clearPromptQueue: mock(() => {}),
      abortCurrentRequest,
      isRemoteMode: true,
      cancelRemoteRequest,
      clearAbortController: mock(() => {}),
      notifyTurnCancelled: mock(() => {}),
    })

    expect(cancelRemoteRequest).toHaveBeenCalledTimes(1)
    expect(abortCurrentRequest).not.toHaveBeenCalled()
  })
})
