import { describe, expect, test } from 'bun:test'

import type { ProtocolMessage } from 'src/types/protocol/index.js'
import {
  createHeadlessProtocolMessageRuntimeEvent,
  createTurnOutputDeltaRuntimeEventFromProtocolMessage,
  dedupeProtocolMessage,
  getCanonicalProjectionForProtocolMessage,
  getRuntimeAbortStopReason,
  getProtocolMessageFromRuntimeEnvelope,
  getProtocolResultTurnOutcome,
  getTextOutputDeltaFromProtocolMessage,
  projectRuntimeEnvelopeToLegacyProtocolMessage,
  projectRuntimeEnvelopeToLegacyRuntimeEventStreamJsonMessage,
  projectRuntimeEnvelopeToLegacyProtocolStreamJsonMessages,
  projectRuntimeEnvelopeToLegacyStreamJsonMessages,
  projectProtocolMessageToLegacyStreamJsonMessages,
} from '../compatProjection.js'
import { RuntimeEventBus } from '../RuntimeEventBus.js'

describe('compatProjection', () => {
  test('wraps protocol messages as runtime events before projecting them back', () => {
    const eventBus = new RuntimeEventBus({
      runtimeId: 'runtime-1',
      createMessageId: () => 'runtime-message-1',
      now: () => '2026-04-27T00:00:00.000Z',
    })
    const protocolMessage = {
      type: 'assistant',
      uuid: 'sdk-1',
      optionalField: undefined,
      message: { content: 'hello' },
    } as ProtocolMessage & { optionalField?: undefined }

    const envelope = eventBus.emit(
      createHeadlessProtocolMessageRuntimeEvent({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        message: protocolMessage,
      }),
    )

    expect(getProtocolMessageFromRuntimeEnvelope(envelope)).toEqual({
      type: 'assistant',
      uuid: 'sdk-1',
      message: { content: 'hello' },
    })
    expect(projectRuntimeEnvelopeToLegacyProtocolMessage(envelope)).toEqual({
      type: 'assistant',
      uuid: 'sdk-1',
      message: { content: 'hello' },
    })
  })

  test('projects runtime envelopes to legacy stream-json messages', () => {
    const eventBus = new RuntimeEventBus({
      runtimeId: 'runtime-1',
      createMessageId: () => 'runtime-message-1',
      now: () => '2026-04-27T00:00:00.000Z',
    })
    const protocolMessage = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      uuid: 'result-1',
    } as ProtocolMessage
    const envelope = eventBus.emit(
      createHeadlessProtocolMessageRuntimeEvent({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        message: protocolMessage,
      }),
    )

    const projected = projectRuntimeEnvelopeToLegacyStreamJsonMessages(envelope, {
      sessionId: 'session-1',
      includeRuntimeEvent: true,
    })
    expect(projected as unknown[]).toEqual([
      {
        type: 'kernel_runtime_event',
        envelope,
        uuid: 'runtime-message-1',
        session_id: 'session-1',
      },
      protocolMessage,
    ])
    expect(
      projectProtocolMessageToLegacyStreamJsonMessages(protocolMessage) as unknown[],
    ).toEqual([protocolMessage])
    expect(
      projectRuntimeEnvelopeToLegacyRuntimeEventStreamJsonMessage(envelope, {
        sessionId: 'session-1',
      }) as unknown,
    ).toEqual({
      type: 'kernel_runtime_event',
      envelope,
      uuid: 'runtime-message-1',
      session_id: 'session-1',
    })
    expect(
      projectRuntimeEnvelopeToLegacyProtocolStreamJsonMessages(
        envelope,
      ) as unknown[],
    ).toEqual([protocolMessage])
  })

  test('maps protocol result messages to runtime terminal outcomes', () => {
    expect(
      getProtocolResultTurnOutcome({
        type: 'result',
        subtype: 'success',
        is_error: false,
        stop_reason: 'end_turn',
      } as ProtocolMessage),
    ).toEqual({
      eventType: 'turn.completed',
      state: 'completed',
      stopReason: 'end_turn',
    })

    expect(
      getProtocolResultTurnOutcome({
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true,
      } as ProtocolMessage),
    ).toEqual({
      eventType: 'turn.failed',
      state: 'failed',
      stopReason: 'max_turn_requests',
    })

    expect(
      getProtocolResultTurnOutcome({
        type: 'result',
        subtype: 'success',
        is_error: false,
      } as ProtocolMessage, { abortReason: 'interrupt' }),
    ).toEqual({
      eventType: 'turn.failed',
      state: 'failed',
      stopReason: 'interrupt',
    })
  })

  test('projects protocol stream text deltas into canonical runtime output events', () => {
    const protocolMessage = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'hello' },
      },
    } as unknown as ProtocolMessage

    expect(getTextOutputDeltaFromProtocolMessage(protocolMessage)).toBe('hello')
    expect(getCanonicalProjectionForProtocolMessage(protocolMessage)).toBe(
      'turn.output_delta',
    )
    expect(
      createTurnOutputDeltaRuntimeEventFromProtocolMessage({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        message: protocolMessage,
      }),
    ).toEqual({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      type: 'turn.output_delta',
      replayable: true,
      payload: {
        text: 'hello',
        source: 'protocol_stream_event',
      },
      metadata: {
        compatibilitySource: 'headless.protocol_message',
      },
    })
  })

  test('normalizes abort signals into runtime stop reasons', () => {
    const controller = new AbortController()
    expect(getRuntimeAbortStopReason(controller.signal)).toBeNull()

    controller.abort('interrupt')
    expect(getRuntimeAbortStopReason(controller.signal)).toBe('interrupt')
  })

  test('ignores malformed runtime protocol payloads without stream-json noise', () => {
    const eventBus = new RuntimeEventBus({
      runtimeId: 'runtime-1',
      createMessageId: () => 'runtime-message-1',
      now: () => '2026-04-27T00:00:00.000Z',
    })
    const envelope = eventBus.emit({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      type: 'headless.protocol_message',
      replayable: true,
      payload: { message: 'missing SDK type' },
    })

    expect(getProtocolMessageFromRuntimeEnvelope(envelope)).toBeUndefined()
    expect(projectRuntimeEnvelopeToLegacyStreamJsonMessages(envelope)).toEqual(
      [],
    )
  })

  test('dedupes protocol messages without dropping unkeyed events', () => {
    const seen = new Set<string>()
    const order: string[] = []
    const first = { type: 'assistant', uuid: 'message-1' } as ProtocolMessage
    const second = { type: 'assistant', uuid: 'message-2' } as ProtocolMessage
    const third = { type: 'assistant', uuid: 'message-3' } as ProtocolMessage

    expect(dedupeProtocolMessage(first, seen, order, 2)).toBe(true)
    expect(dedupeProtocolMessage(first, seen, order, 2)).toBe(false)
    expect(
      dedupeProtocolMessage(
        { type: 'stream_event' } as ProtocolMessage,
        seen,
        order,
        2,
      ),
    ).toBe(true)
    expect(dedupeProtocolMessage(second, seen, order, 2)).toBe(true)
    expect(dedupeProtocolMessage(third, seen, order, 2)).toBe(true)
    expect(dedupeProtocolMessage(first, seen, order, 2)).toBe(true)
  })
})
