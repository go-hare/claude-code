import { describe, expect, test } from 'bun:test'

import type { SDKMessage } from '../../../../entrypoints/agentSdkTypes.js'
import {
  createHeadlessSDKMessageRuntimeEvent,
  createTurnOutputDeltaRuntimeEventFromSDKMessage,
  dedupeSDKMessage,
  getCanonicalProjectionForSDKMessage,
  getRuntimeAbortStopReason,
  getSDKMessageFromRuntimeEnvelope,
  getSDKResultTurnOutcome,
  getTextOutputDeltaFromSDKMessage,
  projectRuntimeEnvelopeToLegacySDKMessage,
  projectRuntimeEnvelopeToLegacyRuntimeEventStreamJsonMessage,
  projectRuntimeEnvelopeToLegacySDKStreamJsonMessages,
  projectRuntimeEnvelopeToLegacyStreamJsonMessages,
  projectSDKMessageToLegacyStreamJsonMessages,
} from '../compatProjection.js'
import { RuntimeEventBus } from '../RuntimeEventBus.js'

describe('compatProjection', () => {
  test('wraps SDK messages as runtime events before projecting them back', () => {
    const eventBus = new RuntimeEventBus({
      runtimeId: 'runtime-1',
      createMessageId: () => 'runtime-message-1',
      now: () => '2026-04-27T00:00:00.000Z',
    })
    const sdkMessage = {
      type: 'assistant',
      uuid: 'sdk-1',
      optionalField: undefined,
      message: { content: 'hello' },
    } as SDKMessage & { optionalField?: undefined }

    const envelope = eventBus.emit(
      createHeadlessSDKMessageRuntimeEvent({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        message: sdkMessage,
      }),
    )

    expect(getSDKMessageFromRuntimeEnvelope(envelope)).toEqual({
      type: 'assistant',
      uuid: 'sdk-1',
      message: { content: 'hello' },
    })
    expect(projectRuntimeEnvelopeToLegacySDKMessage(envelope)).toEqual({
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
    const sdkMessage = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      uuid: 'result-1',
    } as SDKMessage
    const envelope = eventBus.emit(
      createHeadlessSDKMessageRuntimeEvent({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        message: sdkMessage,
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
      sdkMessage,
    ])
    expect(
      projectSDKMessageToLegacyStreamJsonMessages(sdkMessage) as unknown[],
    ).toEqual([sdkMessage])
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
      projectRuntimeEnvelopeToLegacySDKStreamJsonMessages(
        envelope,
      ) as unknown[],
    ).toEqual([sdkMessage])
  })

  test('maps SDK result messages to runtime terminal outcomes', () => {
    expect(
      getSDKResultTurnOutcome({
        type: 'result',
        subtype: 'success',
        is_error: false,
        stop_reason: 'end_turn',
      } as SDKMessage),
    ).toEqual({
      eventType: 'turn.completed',
      state: 'completed',
      stopReason: 'end_turn',
    })

    expect(
      getSDKResultTurnOutcome({
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true,
      } as SDKMessage),
    ).toEqual({
      eventType: 'turn.failed',
      state: 'failed',
      stopReason: 'max_turn_requests',
    })

    expect(
      getSDKResultTurnOutcome({
        type: 'result',
        subtype: 'success',
        is_error: false,
      } as SDKMessage, { abortReason: 'interrupt' }),
    ).toEqual({
      eventType: 'turn.failed',
      state: 'failed',
      stopReason: 'interrupt',
    })
  })

  test('projects SDK stream text deltas into canonical runtime output events', () => {
    const sdkMessage = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'hello' },
      },
    } as unknown as SDKMessage

    expect(getTextOutputDeltaFromSDKMessage(sdkMessage)).toBe('hello')
    expect(getCanonicalProjectionForSDKMessage(sdkMessage)).toBe(
      'turn.output_delta',
    )
    expect(
      createTurnOutputDeltaRuntimeEventFromSDKMessage({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        message: sdkMessage,
      }),
    ).toEqual({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      type: 'turn.output_delta',
      replayable: true,
      payload: {
        text: 'hello',
        source: 'sdk_stream_event',
      },
      metadata: {
        compatibilitySource: 'headless.sdk_message',
      },
    })
  })

  test('normalizes abort signals into runtime stop reasons', () => {
    const controller = new AbortController()
    expect(getRuntimeAbortStopReason(controller.signal)).toBeNull()

    controller.abort('interrupt')
    expect(getRuntimeAbortStopReason(controller.signal)).toBe('interrupt')
  })

  test('ignores malformed runtime SDK payloads without stream-json noise', () => {
    const eventBus = new RuntimeEventBus({
      runtimeId: 'runtime-1',
      createMessageId: () => 'runtime-message-1',
      now: () => '2026-04-27T00:00:00.000Z',
    })
    const envelope = eventBus.emit({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      type: 'headless.sdk_message',
      replayable: true,
      payload: { message: 'missing SDK type' },
    })

    expect(getSDKMessageFromRuntimeEnvelope(envelope)).toBeUndefined()
    expect(projectRuntimeEnvelopeToLegacyStreamJsonMessages(envelope)).toEqual(
      [],
    )
  })

  test('dedupes SDK messages without dropping unkeyed events', () => {
    const seen = new Set<string>()
    const order: string[] = []
    const first = { type: 'assistant', uuid: 'message-1' } as SDKMessage
    const second = { type: 'assistant', uuid: 'message-2' } as SDKMessage
    const third = { type: 'assistant', uuid: 'message-3' } as SDKMessage

    expect(dedupeSDKMessage(first, seen, order, 2)).toBe(true)
    expect(dedupeSDKMessage(first, seen, order, 2)).toBe(false)
    expect(
      dedupeSDKMessage(
        { type: 'stream_event' } as SDKMessage,
        seen,
        order,
        2,
      ),
    ).toBe(true)
    expect(dedupeSDKMessage(second, seen, order, 2)).toBe(true)
    expect(dedupeSDKMessage(third, seen, order, 2)).toBe(true)
    expect(dedupeSDKMessage(first, seen, order, 2)).toBe(true)
  })
})
