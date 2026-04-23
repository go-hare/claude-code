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
      lastResultIsError: false,
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
