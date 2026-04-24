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
      drainSdkEvents: () =>
        [
          {
            type: 'system',
            subtype: 'task_progress',
          },
        ] as never,
      hasBackgroundTasks: false,
      heldBackResult: null,
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
      drainSdkEvents: () => [] as never,
      hasBackgroundTasks: true,
      heldBackResult: {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
      } as never,
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
      drainSdkEvents: () => [] as never,
      hasBackgroundTasks: true,
      heldBackResult: null,
    })

    expect(emitted).toEqual([])
    expect(result.lastResultIsError).toBe(false)
    expect(result.heldBackResult).toMatchObject({
      type: 'result',
      subtype: 'success',
    })
  })
})
