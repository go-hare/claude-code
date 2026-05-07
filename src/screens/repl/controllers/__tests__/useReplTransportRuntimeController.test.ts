import { describe, expect, test } from 'bun:test'

import { createReplTransportRuntimeController } from '../useReplTransportRuntimeController.js'
import type { Message as MessageType } from '../../../../types/message.js'

describe('createReplTransportRuntimeController', () => {
  test('buffers runtime output deltas and flushes them as an assistant message', () => {
    let messages: MessageType[] = []
    let streamingText: string | null | undefined
    let responseLength = 0

    const controller = createReplTransportRuntimeController({
      runtimeId: 'runtime-test',
      setMessages(updater) {
        messages = updater(messages)
      },
      setStreamingText(next) {
        streamingText = next
      },
      setResponseLength(updater) {
        responseLength = updater(responseLength)
      },
      appendStreamingText(updater) {
        streamingText = updater(streamingText ?? null)
      },
    })

    controller.handleRuntimeOutputDelta('hello ')
    controller.handleRuntimeOutputDelta('kernel')

    expect(responseLength).toBe('hello kernel'.length)
    expect(streamingText).toBe('hello kernel')
    expect(messages).toHaveLength(0)

    controller.handleRuntimeTurnTerminal()

    expect(streamingText).toBe(null)
    expect(messages).toHaveLength(1)
    const message = messages[0]
    expect(message).toBeDefined()
    if (!message || message.type !== 'assistant' || !message.message) {
      throw new Error('expected assistant message')
    }
    expect(message.message.content).toEqual([
      {
        type: 'text',
        text: 'hello kernel',
      },
    ])
  })

  test('ignores empty runtime output and terminal without buffered text', () => {
    let messages: MessageType[] = []
    let responseLength = 0

    const controller = createReplTransportRuntimeController({
      runtimeId: 'runtime-empty-test',
      setMessages(updater) {
        messages = updater(messages)
      },
      setStreamingText() {},
      setResponseLength(updater) {
        responseLength = updater(responseLength)
      },
      appendStreamingText() {},
    })

    controller.handleRuntimeOutputDelta('')
    controller.handleRuntimeTurnTerminal()

    expect(responseLength).toBe(0)
    expect(messages).toEqual([])
  })
})
