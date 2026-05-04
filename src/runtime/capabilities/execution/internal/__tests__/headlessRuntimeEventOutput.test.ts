import { describe, expect, mock, test } from 'bun:test'

import type { KernelRuntimeEnvelopeBase } from '../../../../contracts/events.js'
import {
  createHeadlessRuntimeEventSink,
  toHeadlessRuntimeEventMessage,
} from '../headlessRuntimeEventOutput.js'

function createEnvelope(): KernelRuntimeEnvelopeBase {
  return {
    schemaVersion: 'kernel.runtime.v1',
    messageId: 'message-1',
    sequence: 1,
    timestamp: '2026-04-26T00:00:00.000Z',
    source: 'kernel_runtime',
    kind: 'event',
    runtimeId: 'runtime-1',
    conversationId: 'conversation-1',
    eventId: 'conversation-1:1',
    payload: {
      runtimeId: 'runtime-1',
      conversationId: 'conversation-1',
      eventId: 'conversation-1:1',
      type: 'permission.requested',
      replayable: true,
    },
  }
}

describe('headless runtime event output', () => {
  test('wraps runtime envelopes as SDK stdout messages', () => {
    const envelope = createEnvelope()

    expect(toHeadlessRuntimeEventMessage(envelope, 'session-1')).toEqual({
      type: 'kernel_runtime_event',
      envelope,
      uuid: 'message-1',
      session_id: 'session-1',
    })
  })

  test('does not write runtime envelopes to stream-json output but still calls host sink', () => {
    const envelope = createEnvelope()
    const writes: unknown[] = []
    const hostSink = mock((_envelope: KernelRuntimeEnvelopeBase) => {})
    const sink = createHeadlessRuntimeEventSink(
      {
        write: async message => {
          writes.push(message)
        },
      },
      {
        outputFormat: 'stream-json',
        verbose: true,
        sessionId: 'session-1',
        runtimeEventSink: hostSink,
      },
    )

    sink?.(envelope)

    expect(writes).toEqual([])
    expect(hostSink).toHaveBeenCalledWith(envelope)
  })

  test('does not write non-stream-json output but still calls host sink', () => {
    const envelope = createEnvelope()
    const writes: unknown[] = []
    const hostSink = mock((_envelope: KernelRuntimeEnvelopeBase) => {})
    const sink = createHeadlessRuntimeEventSink(
      {
        write: async message => {
          writes.push(message)
        },
      },
      {
        outputFormat: 'json',
        verbose: true,
        sessionId: 'session-1',
        runtimeEventSink: hostSink,
      },
    )

    sink?.(envelope)

    expect(writes).toEqual([])
    expect(hostSink).toHaveBeenCalledWith(envelope)
  })

  test('returns undefined when no output path needs runtime events', () => {
    expect(
      createHeadlessRuntimeEventSink(
        {
          write: async () => {},
        },
        {
          outputFormat: undefined,
          verbose: undefined,
          sessionId: 'session-1',
        },
      ),
    ).toBeUndefined()
  })
})
