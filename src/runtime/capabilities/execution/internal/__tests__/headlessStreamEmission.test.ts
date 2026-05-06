import { describe, expect, test } from 'bun:test'
import { emitHeadlessRuntimeMessage } from '../headlessStreamEmission.js'

describe('emitHeadlessRuntimeMessage', () => {
  test('flushes sdk events before emitting a non-result message', () => {
    const emitted: unknown[] = []
    const result = emitHeadlessRuntimeMessage({
      message: {
        type: 'assistant',
        message: { content: 'hello' },
      } as never,
      output: {
        enqueue(message) {
          emitted.push(message)
        },
      },
      drainProtocolEvents: () =>
        [
          {
            type: 'system',
            subtype: 'task_progress',
          },
        ] as never,
      hasBackgroundTasks: () => false,
      heldBackResult: null,
      heldBackAssistantMessages: [],
    })

    expect(emitted).toEqual([
      {
        type: 'system',
        subtype: 'task_progress',
      },
      {
        type: 'assistant',
        message: { content: 'hello' },
      },
    ])
    expect(result).toEqual({
      heldBackResult: null,
      heldBackAssistantMessages: [],
    })
  })

  test('does not reset a prior result error state for non-result messages', () => {
    const emitted: unknown[] = []
    const result = emitHeadlessRuntimeMessage({
      message: {
        type: 'system',
        subtype: 'task_progress',
      } as never,
      output: {
        enqueue(message) {
          emitted.push(message)
        },
      },
      drainProtocolEvents: () => [] as never,
      hasBackgroundTasks: () => true,
      heldBackResult: {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
      } as never,
      heldBackAssistantMessages: [],
    })

    expect(emitted).toEqual([
      {
        type: 'system',
        subtype: 'task_progress',
      },
    ])
    expect(result.lastResultIsError).toBeUndefined()
    expect(result.heldBackResult).toMatchObject({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
    })
    expect(result.heldBackAssistantMessages).toEqual([])
  })

  test('holds assistant messages while background tasks are running', () => {
    const emitted: unknown[] = []
    const assistantMessage = {
      type: 'assistant',
      message: { content: 'background result' },
      parent_tool_use_id: null,
      uuid: 'assistant-uuid',
      session_id: 'session-1',
    } as const
    const result = emitHeadlessRuntimeMessage({
      message: assistantMessage as never,
      output: {
        enqueue(message) {
          emitted.push(message)
        },
      },
      drainProtocolEvents: () => [] as never,
      hasBackgroundTasks: () => true,
      heldBackResult: null,
      heldBackAssistantMessages: [],
    })

    expect(emitted).toEqual([])
    expect(result.heldBackResult).toBeNull()
    expect(result.heldBackAssistantMessages).toEqual([assistantMessage])
  })

  test('holds back result messages while background tasks are running', () => {
    const emitted: unknown[] = []
    const result = emitHeadlessRuntimeMessage({
      message: {
        type: 'result',
        subtype: 'success',
      } as never,
      output: {
        enqueue(message) {
          emitted.push(message)
        },
      },
      drainProtocolEvents: () => [] as never,
      hasBackgroundTasks: () => true,
      heldBackResult: null,
      heldBackAssistantMessages: [],
    })

    expect(emitted).toEqual([])
    expect(result.lastResultIsError).toBe(false)
    expect(result.heldBackResult).toMatchObject({
      type: 'result',
      subtype: 'success',
    })
    expect(result.heldBackAssistantMessages).toEqual([])
  })

  test('drops later terminal output after a result has been emitted', () => {
    const emitted: unknown[] = []
    const result = emitHeadlessRuntimeMessage({
      message: {
        type: 'result',
        subtype: 'success',
      } as never,
      output: {
        enqueue(message) {
          emitted.push(message)
        },
      },
      drainProtocolEvents: () =>
        [
          {
            type: 'system',
            subtype: 'session_state_changed',
            state: 'idle',
          },
        ] as never,
      hasBackgroundTasks: () => false,
      heldBackResult: null,
      heldBackAssistantMessages: [],
      terminalResultEmitted: true,
    })

    expect(emitted).toEqual([
      {
        type: 'system',
        subtype: 'session_state_changed',
        state: 'idle',
      },
    ])
    expect(result.lastResultIsError).toBeUndefined()
    expect(result.terminalResultEmitted).toBeUndefined()
    expect(result.heldBackResult).toBeNull()
    expect(result.heldBackAssistantMessages).toEqual([])
  })

  test('drops later conversational output after a result has been emitted', () => {
    const emitted: unknown[] = []
    const result = emitHeadlessRuntimeMessage({
      message: {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_cleanup',
              content: 'cleanup complete',
            },
          ],
        },
      } as never,
      output: {
        enqueue(message) {
          emitted.push(message)
        },
      },
      drainProtocolEvents: () => [] as never,
      hasBackgroundTasks: () => false,
      heldBackResult: null,
      heldBackAssistantMessages: [],
      terminalResultEmitted: true,
    })

    expect(emitted).toEqual([])
    expect(result).toEqual({
      heldBackResult: null,
      heldBackAssistantMessages: [],
    })
  })

  test('checks background state after draining sdk task events', () => {
    const emitted: unknown[] = []
    let pending = false
    const result = emitHeadlessRuntimeMessage({
      message: {
        type: 'assistant',
        message: { content: 'launched' },
        parent_tool_use_id: null,
        uuid: 'assistant-uuid',
        session_id: 'session-1',
      } as never,
      output: {
        enqueue(message) {
          emitted.push(message)
        },
      },
      drainProtocolEvents: () => {
        pending = true
        return [
          {
            type: 'system',
            subtype: 'task_started',
            task_type: 'local_agent',
          },
        ] as never
      },
      hasBackgroundTasks: () => pending,
      heldBackResult: null,
      heldBackAssistantMessages: [],
    })

    expect(emitted).toEqual([
      {
        type: 'system',
        subtype: 'task_started',
        task_type: 'local_agent',
      },
    ])
    expect(result.heldBackAssistantMessages).toEqual([
      {
        type: 'assistant',
        message: { content: 'launched' },
        parent_tool_use_id: null,
        uuid: 'assistant-uuid',
        session_id: 'session-1',
      },
    ])
  })
})
