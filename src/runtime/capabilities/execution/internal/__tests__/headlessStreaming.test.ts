import { beforeEach, describe, expect, test } from 'bun:test'
import { RuntimeEventBus } from '../../../../core/events/RuntimeEventBus.js'
import {
  createHeadlessRuntimeStreamPublisher,
  createHeadlessStreamCollector,
} from '../headlessStreaming.js'

describe('createHeadlessStreamCollector', () => {
  const originalEnv = process.env.CLAUDE_CODE_STREAMLINED_OUTPUT

  beforeEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_CODE_STREAMLINED_OUTPUT
    } else {
      process.env.CLAUDE_CODE_STREAMLINED_OUTPUT = originalEnv
    }
  })

  test('tracks only result-bearing messages for final output', async () => {
    const collector = createHeadlessStreamCollector({
      outputFormat: undefined,
      verbose: false,
    })
    const writes: unknown[] = []
    const structuredIO = {
      write: async (message: unknown) => {
        writes.push(message)
      },
    }

    await collector.handleMessage(
      structuredIO as never,
      {
        type: 'system',
        subtype: 'task_progress',
      } as never,
    )
    await collector.handleMessage(
      structuredIO as never,
      {
        type: 'assistant',
        message: { content: 'hello' },
      } as never,
    )

    expect(writes).toEqual([])
    expect(collector.getMessages()).toEqual([])
    expect(collector.getLastMessage()).toEqual({
      type: 'assistant',
      message: { content: 'hello' },
    })
  })

  test('collects full array in json verbose mode', async () => {
    const collector = createHeadlessStreamCollector({
      outputFormat: 'json',
      verbose: true,
    })

    await collector.handleMessage(
      { write: async () => {} } as never,
      {
        type: 'assistant',
        message: { content: 'hello' },
      } as never,
    )

    expect(collector.getMessages()).toEqual([
      {
        type: 'assistant',
        message: { content: 'hello' },
      },
    ])
  })

  test('publishes runtime protocol message envelopes before legacy stream-json output', async () => {
    const eventBus = new RuntimeEventBus({
      runtimeId: 'runtime-1',
      createMessageId: () => 'message-1',
      now: () => '2026-04-27T00:00:00.000Z',
    })
    const collector = createHeadlessStreamCollector(
      {
        outputFormat: 'stream-json',
        verbose: true,
      },
      createHeadlessRuntimeStreamPublisher({
        eventBus,
        conversationId: 'conversation-1',
        getTurnId: () => 'turn-1',
      }),
    )
    const writes: unknown[] = []
    const runtimeEventCountsAtWrite: number[] = []

    await collector.handleMessage(
      {
        write: async (message: unknown) => {
          runtimeEventCountsAtWrite.push(eventBus.replay().length)
          writes.push(message)
        },
      } as never,
      {
        type: 'assistant',
        message: { content: 'hello' },
        optionalField: undefined,
      } as never,
    )

    const runtimeEnvelopes = eventBus.replay()

    expect(writes).toEqual([
      {
        type: 'assistant',
        message: { content: 'hello' },
        optionalField: undefined,
      },
    ])
    expect(runtimeEventCountsAtWrite).toEqual([1])
    expect(runtimeEnvelopes).toHaveLength(1)
    expect(runtimeEnvelopes[0]).toMatchObject({
      kind: 'event',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      payload: {
        type: 'headless.protocol_message',
        payload: {
          type: 'assistant',
          message: { content: 'hello' },
        },
      },
    })
  })
})
