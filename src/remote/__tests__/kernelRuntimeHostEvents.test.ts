import { describe, expect, mock, test } from 'bun:test'

import type { SDKMessage } from '../../entrypoints/agentSdkTypes.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../runtime/contracts/events.js'
import {
  getCanonicalProjectionFromKernelEvent,
  getCompatibilityProjectionFromKernelEvent,
  getKernelRuntimeLifecycleProjection,
  getKernelRuntimeTerminalProjection,
  getKernelRuntimeTerminalProjectionFromSDKResultMessage,
  getSDKMessageFromKernelRuntimeEnvelope,
  getTextOutputDeltaFromKernelRuntimeEnvelope,
  handleKernelRuntimeHostEvent,
  hasCanonicalProjection,
  hasCompatibilityProjection,
  isKernelTurnTerminalEvent,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeSDKMessageDedupe,
} from '../kernelRuntimeHostEvents.js'

function createEnvelope(
  event: KernelEvent,
): KernelRuntimeEnvelopeBase<KernelEvent> {
  return {
    schemaVersion: 'kernel.runtime.v1',
    messageId: `message-${event.type}`,
    sequence: 1,
    timestamp: '2026-04-27T00:00:00.000Z',
    source: 'kernel_runtime',
    kind: 'event',
    runtimeId: 'runtime-1',
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    eventId: `event-${event.type}`,
    payload: event,
  }
}

function createEvent(type: string, payload?: unknown): KernelEvent {
  return {
    runtimeId: 'runtime-1',
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    eventId: `event-${type}`,
    type,
    replayable: true,
    payload,
  }
}

describe('kernel runtime host events', () => {
  test('routes runtime envelopes through host callbacks', () => {
    const envelope = createEnvelope(createEvent('turn.started'))
    const onRuntimeEvent = mock((_envelope: KernelRuntimeEnvelopeBase) => {})
    const onRuntimeHeartbeat = mock(
      (_envelope: KernelRuntimeEnvelopeBase, _event: KernelEvent) => {},
    )
    const onTurnTerminal = mock(
      (_envelope: KernelRuntimeEnvelopeBase, _event: KernelEvent) => {},
    )

    handleKernelRuntimeHostEvent(envelope, {
      onRuntimeEvent,
      onRuntimeHeartbeat,
      onTurnTerminal,
    })

    expect(onRuntimeEvent).toHaveBeenCalledWith(envelope)
    expect(onRuntimeHeartbeat).toHaveBeenCalledWith(envelope, envelope.payload)
    expect(onTurnTerminal).not.toHaveBeenCalled()
  })

  test('classifies turn completed and failed as terminal host signals', () => {
    expect(isKernelTurnTerminalEvent(createEvent('turn.completed'))).toBe(true)
    expect(isKernelTurnTerminalEvent(createEvent('turn.failed'))).toBe(true)
    expect(isKernelTurnTerminalEvent(createEvent('turn.started'))).toBe(false)
    expect(isKernelTurnTerminalEvent(createEvent('headless.sdk_message'))).toBe(
      false,
    )
  })

  test('projects runtime terminal events into host stop reasons', () => {
    expect(
      getKernelRuntimeTerminalProjection(
        createEvent('turn.completed', { stopReason: 'max_tokens' }),
      ),
    ).toEqual({
      eventType: 'turn.completed',
      isError: false,
      runtimeStopReason: 'max_tokens',
      hostStopReason: 'max_tokens',
    })
    expect(
      getKernelRuntimeTerminalProjection(
        createEvent('turn.failed', { stopReason: 'interrupt' }),
      ),
    ).toMatchObject({
      eventType: 'turn.failed',
      isError: true,
      runtimeStopReason: 'interrupt',
      hostStopReason: 'cancelled',
    })
    expect(
      getKernelRuntimeTerminalProjection(
        createEvent('turn.failed', { stopReason: 'error_max_turns' }),
      ).hostStopReason,
    ).toBe('max_turn_requests')
  })

  test('routes terminal projection to host consumers', () => {
    const event = createEvent('turn.failed', { stopReason: 'aborted' })
    const envelope = createEnvelope(event)
    const onTurnTerminal = mock(
      (
        _envelope: KernelRuntimeEnvelopeBase,
        _event: KernelEvent,
        _projection: unknown,
      ) => {},
    )

    handleKernelRuntimeHostEvent(envelope, { onTurnTerminal })

    expect(onTurnTerminal).toHaveBeenCalledWith(
      envelope,
      event,
      expect.objectContaining({
        isError: true,
        hostStopReason: 'cancelled',
      }),
    )
  })

  test('reads canonical projection metadata from runtime events', () => {
    const event = {
      ...createEvent('headless.sdk_message'),
      metadata: { canonicalProjection: 'turn.output_delta' },
    }

    expect(getCanonicalProjectionFromKernelEvent(event)).toBe(
      'turn.output_delta',
    )
    expect(hasCanonicalProjection(event, 'turn.output_delta')).toBe(true)
    expect(hasCanonicalProjection(event, 'turn.completed')).toBe(false)
    expect(
      getCanonicalProjectionFromKernelEvent(
        createEvent('headless.sdk_message'),
      ),
    ).toBeUndefined()
  })

  test('reads compatibility projection metadata from runtime events', () => {
    const event = {
      ...createEvent('tasks.notification'),
      metadata: { compatibilityProjection: 'headless.sdk_task_notification' },
    }

    expect(getCompatibilityProjectionFromKernelEvent(event)).toBe(
      'headless.sdk_task_notification',
    )
    expect(
      hasCompatibilityProjection(event, 'headless.sdk_task_notification'),
    ).toBe(true)
    expect(hasCompatibilityProjection(event, 'headless.sdk_message')).toBe(false)
  })

  test('extracts SDK payloads from headless.sdk_message envelopes', () => {
    const sdkMessage: SDKMessage = {
      type: 'result',
      subtype: 'success',
      uuid: 'sdk-message-1',
    }
    const envelope = createEnvelope(
      createEvent('headless.sdk_message', sdkMessage),
    )

    expect(getSDKMessageFromKernelRuntimeEnvelope(envelope)).toBe(sdkMessage)
    expect(
      getSDKMessageFromKernelRuntimeEnvelope(
        createEnvelope(createEvent('turn.completed')),
      ),
    ).toBeUndefined()
  })

  test('routes headless.sdk_message payloads to host SDK consumers', () => {
    const sdkMessage: SDKMessage = {
      type: 'assistant',
      uuid: 'sdk-message-1',
    }
    const envelope = createEnvelope(
      createEvent('headless.sdk_message', sdkMessage),
    )
    const onSDKMessage = mock(
      (
        _message: SDKMessage,
        _envelope: KernelRuntimeEnvelopeBase,
        _event: KernelEvent,
      ) => {},
    )

    handleKernelRuntimeHostEvent(envelope, { onSDKMessage })

    expect(onSDKMessage).toHaveBeenCalledWith(
      sdkMessage,
      envelope,
      envelope.payload,
    )
  })

  test('projects coordinator lifecycle events through host callbacks', () => {
    const event = createEvent('handoff.completed', {
      phase: 'handoff',
      state: 'completed',
      source: 'queued_task_notification',
      taskId: 'task-1',
      summary: 'done',
    })
    const envelope = createEnvelope(event)
    const onLifecycle = mock(
      (
        _projection: unknown,
        _envelope: KernelRuntimeEnvelopeBase,
        _event: KernelEvent,
      ) => {},
    )

    expect(getKernelRuntimeLifecycleProjection(event)).toMatchObject({
      kind: 'coordinator.lifecycle',
      eventType: 'handoff.completed',
      phase: 'handoff',
      state: 'completed',
    })

    handleKernelRuntimeHostEvent(envelope, { onLifecycle })

    expect(onLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'coordinator.lifecycle',
        eventType: 'handoff.completed',
      }),
      envelope,
      event,
    )
  })

  test('projects task notification events through host callbacks', () => {
    const event = createEvent('tasks.notification', {
      taskId: 'task-1',
      toolUseId: 'tool-1',
      status: 'completed',
      outputFile: '/tmp/task-1.txt',
      summary: 'done',
      source: 'queued_task_notification',
    })
    const envelope = createEnvelope(event)
    const onLifecycle = mock(
      (
        _projection: unknown,
        _envelope: KernelRuntimeEnvelopeBase,
        _event: KernelEvent,
      ) => {},
    )

    expect(getKernelRuntimeLifecycleProjection(event)).toMatchObject({
      kind: 'tasks.notification',
      taskId: 'task-1',
      status: 'completed',
    })

    handleKernelRuntimeHostEvent(envelope, { onLifecycle })

    expect(onLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'tasks.notification',
        taskId: 'task-1',
      }),
      envelope,
      event,
    )
  })

  test('extracts semantic text output deltas without re-rendering SDK-backed deltas', () => {
    const semanticEnvelope = createEnvelope(
      createEvent('turn.output_delta', { text: 'hello' }),
    )
    const sdkBackedEnvelope = createEnvelope(
      createEvent('turn.output_delta', {
        text: 'duplicate',
        message: { type: 'result' },
      }),
    )

    expect(getTextOutputDeltaFromKernelRuntimeEnvelope(semanticEnvelope)).toEqual(
      { text: 'hello' },
    )
    expect(
      getTextOutputDeltaFromKernelRuntimeEnvelope(sdkBackedEnvelope),
    ).toBeUndefined()
    expect(
      getTextOutputDeltaFromKernelRuntimeEnvelope(
        createEnvelope(createEvent('turn.completed')),
      ),
    ).toBeUndefined()
  })

  test('routes semantic output deltas to host consumers', () => {
    const envelope = createEnvelope(
      createEvent('turn.output_delta', { text: 'runtime text' }),
    )
    const onOutputDelta = mock(
      (
        _delta: { text: string },
        _envelope: KernelRuntimeEnvelopeBase,
        _event: KernelEvent,
      ) => {},
    )

    handleKernelRuntimeHostEvent(envelope, { onOutputDelta })

    expect(onOutputDelta).toHaveBeenCalledWith(
      { text: 'runtime text' },
      envelope,
      envelope.payload,
    )
  })

  test('projects SDK result terminal semantics through shared host mapping', () => {
    expect(
      getKernelRuntimeTerminalProjectionFromSDKResultMessage({
        type: 'result',
        subtype: 'success',
        is_error: false,
        stop_reason: 'max_tokens',
      } as SDKMessage),
    ).toMatchObject({
      eventType: 'turn.completed',
      hostStopReason: 'max_tokens',
    })

    expect(
      getKernelRuntimeTerminalProjectionFromSDKResultMessage({
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true,
      } as SDKMessage),
    ).toMatchObject({
      eventType: 'turn.failed',
      hostStopReason: 'max_turn_requests',
    })

    expect(
      getKernelRuntimeTerminalProjectionFromSDKResultMessage(
        {
          type: 'result',
          subtype: 'success',
          is_error: false,
        } as SDKMessage,
        { aborted: true },
      ),
    ).toMatchObject({
      hostStopReason: 'cancelled',
    })
  })

  test('dedupes SDK messages by stable uuid while allowing unkeyed deltas', () => {
    const dedupe = new KernelRuntimeSDKMessageDedupe(2)
    const first: SDKMessage = { type: 'assistant', uuid: 'message-1' }
    const second: SDKMessage = { type: 'assistant', uuid: 'message-2' }
    const third: SDKMessage = { type: 'assistant', uuid: 'message-3' }

    expect(dedupe.shouldProcess(first)).toBe(true)
    expect(dedupe.shouldProcess(first)).toBe(false)
    expect(dedupe.shouldProcess({ type: 'stream_event' })).toBe(true)
    expect(dedupe.shouldProcess({ type: 'stream_event' })).toBe(true)
    expect(dedupe.shouldProcess(second)).toBe(true)
    expect(dedupe.shouldProcess(third)).toBe(true)
    expect(dedupe.shouldProcess(first)).toBe(true)
  })

  test('dedupes output deltas by runtime envelope cursor', () => {
    const dedupe = new KernelRuntimeOutputDeltaDedupe(2)
    const first = {
      ...createEnvelope(createEvent('turn.output_delta', { text: 'a' })),
      eventId: 'event-output-a',
    }
    const second = createEnvelope({
      ...createEvent('turn.output_delta', { text: 'b' }),
      eventId: 'event-output-b',
    })
    const third = {
      ...createEnvelope(createEvent('turn.output_delta', { text: 'c' })),
      eventId: 'event-output-c',
    }

    expect(dedupe.shouldProcess(first)).toBe(true)
    expect(dedupe.shouldProcess(first)).toBe(false)
    expect(dedupe.shouldProcess(second)).toBe(true)
    expect(dedupe.shouldProcess(third)).toBe(true)
    expect(dedupe.shouldProcess(first)).toBe(true)
  })
})
