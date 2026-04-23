import { beforeEach, describe, expect, test } from 'bun:test'
import { createHeadlessStreamCollector } from '../headlessStreaming.js'

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
})
