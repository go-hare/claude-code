import { describe, expect, mock, test } from 'bun:test'

import { maybeRestoreCancelledReplTurn } from '../replTurnRestore.js'

describe('replTurnRestore', () => {
  test('restores the last user message after a user-cancelled empty turn', () => {
    const removeLastFromHistory = mock(() => {})
    const restoreMessage = mock((_message: unknown) => {})
    const userMessage = {
      type: 'user',
      uuid: 'user-1',
      isMeta: false,
      message: { content: 'restore me' },
    } as any

    const restored = maybeRestoreCancelledReplTurn({
      abortReason: 'user-cancel',
      hasActiveQuery: false,
      inputValue: '',
      commandQueueLength: 0,
      viewingAgentTaskId: undefined,
      messages: [
        userMessage,
        {
          type: 'assistant',
          uuid: 'assistant-1',
          message: { content: 'Synthetic interruption response' },
          isSynthetic: true,
        },
      ] as any,
      removeLastFromHistory,
      restoreMessage,
    })

    expect(restored).toBe(true)
    expect(removeLastFromHistory).toHaveBeenCalledTimes(1)
    expect(restoreMessage).toHaveBeenCalledWith(userMessage)
  })

  test('skips restore when the user has already typed new input', () => {
    const removeLastFromHistory = mock(() => {})
    const restoreMessage = mock((_message: unknown) => {})

    const restored = maybeRestoreCancelledReplTurn({
      abortReason: 'user-cancel',
      hasActiveQuery: false,
      inputValue: 'new input already typed',
      commandQueueLength: 0,
      viewingAgentTaskId: undefined,
      messages: [] as any,
      removeLastFromHistory,
      restoreMessage,
    })

    expect(restored).toBe(false)
    expect(removeLastFromHistory).not.toHaveBeenCalled()
    expect(restoreMessage).not.toHaveBeenCalled()
  })

  test('skips restore after a meaningful assistant response', () => {
    const removeLastFromHistory = mock(() => {})
    const restoreMessage = mock((_message: unknown) => {})

    const restored = maybeRestoreCancelledReplTurn({
      abortReason: 'user-cancel',
      hasActiveQuery: false,
      inputValue: '',
      commandQueueLength: 0,
      viewingAgentTaskId: undefined,
      messages: [
        {
          type: 'user',
          uuid: 'user-1',
          isMeta: false,
          message: { content: 'do work' },
        },
        {
          type: 'assistant',
          uuid: 'assistant-1',
          message: {
            content: [{ type: 'text', text: 'real answer' }],
          },
        },
      ] as any,
      removeLastFromHistory,
      restoreMessage,
    })

    expect(restored).toBe(false)
    expect(removeLastFromHistory).not.toHaveBeenCalled()
    expect(restoreMessage).not.toHaveBeenCalled()
  })
})
