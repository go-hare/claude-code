import { describe, expect, mock, test } from 'bun:test'

import {
  KernelRuntimeEventReplayError,
  consumeKernelRuntimeEventMessage,
  createKernelRuntimeEventFacade,
  getKernelEventFromEnvelope,
  getKernelRuntimeEnvelopeFromMessage,
  isKernelRuntimeEnvelope,
  toKernelRuntimeEventMessage,
} from '../events.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../runtime/contracts/events.js'

function createClock(): () => string {
  let tick = 0
  return () => {
    const second = String(tick++).padStart(2, '0')
    return `2026-04-26T00:00:${second}.000Z`
  }
}

function createMessageIds(): () => string {
  let nextId = 1
  return () => `facade-message-${nextId++}`
}

function createEnvelope(
  overrides: Partial<KernelRuntimeEnvelopeBase<KernelEvent>> = {},
): KernelRuntimeEnvelopeBase<KernelEvent> {
  return {
    schemaVersion: 'kernel.runtime.v1',
    messageId: 'external-message-1',
    sequence: 10,
    timestamp: '2026-04-26T00:00:00.000Z',
    source: 'kernel_runtime',
    kind: 'event',
    runtimeId: 'runtime-1',
    conversationId: 'conversation-1',
    eventId: 'conversation-1:external-1',
    payload: {
      runtimeId: 'runtime-1',
      conversationId: 'conversation-1',
      eventId: 'conversation-1:external-1',
      type: 'headless.protocol_message',
      replayable: true,
      payload: { message: 'hello' },
    },
    ...overrides,
  }
}

describe('kernel runtime event facade', () => {
  test('emits and replays package-level KernelEvent envelopes', () => {
    const observed: KernelRuntimeEnvelopeBase[] = []
    const facade = createKernelRuntimeEventFacade({
      runtimeId: 'runtime-1',
      now: createClock(),
      createMessageId: createMessageIds(),
    })
    facade.subscribe(envelope => {
      observed.push(envelope)
    })

    const started = facade.emit({
      conversationId: 'conversation-1',
      type: 'turn.started',
      replayable: true,
    })
    const transient = facade.emit({
      conversationId: 'conversation-1',
      type: 'turn.delta',
      replayable: false,
    })

    expect(observed).toEqual([started, transient])
    expect(started).toMatchObject({
      schemaVersion: 'kernel.runtime.v1',
      messageId: 'facade-message-1',
      source: 'kernel_runtime',
      kind: 'event',
      eventId: 'conversation-1:1',
      payload: {
        type: 'turn.started',
        replayable: true,
      },
    })
    expect(facade.replay({ conversationId: 'conversation-1' })).toEqual([
      started,
    ])
  })

  test('ingests compatibility kernel_runtime_event messages without forwarding duplicates', () => {
    const envelope = createEnvelope()
    const observed: KernelRuntimeEnvelopeBase[] = []
    const facade = createKernelRuntimeEventFacade({ runtimeId: 'runtime-1' })
    facade.subscribe(envelope => {
      observed.push(envelope)
    })

    const message = {
      type: 'kernel_runtime_event',
      uuid: 'wire-message-1',
      session_id: 'session-1',
      envelope,
    }

    expect(getKernelRuntimeEnvelopeFromMessage(message)).toBe(envelope)
    expect(facade.ingestMessage(message)).toBe(envelope)
    expect(facade.ingestMessage(message)).toBeUndefined()
    expect(observed).toEqual([envelope])
    expect(facade.replay({ conversationId: 'conversation-1' })).toEqual([
      envelope,
    ])
  })

  test('wraps and consumes kernel_runtime_event messages through public helpers', () => {
    const envelope = createEnvelope()
    const sink = mock((_envelope: KernelRuntimeEnvelopeBase) => {})

    const message = toKernelRuntimeEventMessage(envelope, 'session-1')

    expect(message).toEqual({
      type: 'kernel_runtime_event',
      envelope,
      uuid: 'external-message-1',
      session_id: 'session-1',
    })
    expect(consumeKernelRuntimeEventMessage(message, sink)).toBe(true)
    expect(sink).toHaveBeenCalledWith(envelope)
    expect(consumeKernelRuntimeEventMessage({ type: 'assistant' }, sink)).toBe(
      false,
    )
  })

  test('classifies envelopes and extracts semantic KernelEvent payloads', () => {
    const envelope = createEnvelope()

    expect(isKernelRuntimeEnvelope(envelope)).toBe(true)
    expect(getKernelEventFromEnvelope(envelope)).toEqual(envelope.payload)
    expect(
      getKernelEventFromEnvelope({
        ...envelope,
        kind: 'ack',
      }),
    ).toBeUndefined()
  })

  test('preserves expired vs missing replay cursor semantics', () => {
    const first = createEnvelope({
      messageId: 'external-message-1',
      eventId: 'conversation-1:external-1',
      payload: {
        ...createEnvelope().payload!,
        eventId: 'conversation-1:external-1',
      },
    })
    const second = createEnvelope({
      messageId: 'external-message-2',
      eventId: 'conversation-1:external-2',
      payload: {
        ...createEnvelope().payload!,
        eventId: 'conversation-1:external-2',
      },
    })
    const facade = createKernelRuntimeEventFacade({
      runtimeId: 'runtime-1',
      maxReplayEvents: 1,
    })

    expect(facade.ingestEnvelope(first)).toBe(true)
    expect(facade.ingestEnvelope(second)).toBe(true)

    expect(() =>
      facade.replay({
        conversationId: 'conversation-1',
        sinceEventId: 'conversation-1:external-1',
      }),
    ).toThrow(KernelRuntimeEventReplayError)
    try {
      facade.replay({
        conversationId: 'conversation-1',
        sinceEventId: 'missing-event',
      })
    } catch (error) {
      expect(error).toBeInstanceOf(KernelRuntimeEventReplayError)
      expect((error as KernelRuntimeEventReplayError).code).toBe('not_found')
    }
  })

  test('isolates observer failures from facade ingestion', () => {
    const envelope = createEnvelope()
    const observed = mock((_envelope: KernelRuntimeEnvelopeBase) => {})
    const facade = createKernelRuntimeEventFacade({
      runtimeId: 'runtime-1',
      onEvent: () => {
        throw new Error('observer failed')
      },
    })
    facade.subscribe(() => {
      throw new Error('subscriber failed')
    })
    facade.subscribe(observed)

    expect(facade.ingestEnvelope(envelope)).toBe(true)
    expect(observed).toHaveBeenCalledWith(envelope)
  })
})
