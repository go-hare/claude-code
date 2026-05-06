import { describe, expect, mock, test } from 'bun:test'

import {
  BoundedUUIDSet,
  handleIngressMessage,
  shouldReportRunningForMessage,
  shouldReportRunningForMessages,
} from '../bridgeMessaging.js'
import type { KernelRuntimeEnvelopeBase } from '../../runtime/contracts/events.js'
import { createUserMessage } from '../../utils/messages.js'

describe('bridge running-state classification', () => {
  test('treats real user prompts as turn-starting work', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({ content: 'please inspect the repo' }),
      ),
    ).toBe(true)
  })

  test('keeps tool-result style user messages eligible during mid-turn attach', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: '<local-command-stdout>done</local-command-stdout>',
          toolUseResult: { ok: true },
        }),
      ),
    ).toBe(true)
  })

  test('ignores local slash-command scaffolding that should not reopen a turn', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content:
            '<local-command-caveat>Caveat: hidden local command scaffolding</local-command-caveat>',
          isMeta: true,
        }),
      ),
    ).toBe(false)

    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content:
            '<system-reminder>\nProactive mode is now enabled. You will receive periodic <tick> prompts.\n</system-reminder>',
          isMeta: true,
        }),
      ),
    ).toBe(false)
  })

  test('still marks real automation triggers as running', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: '<tick>2:56:47 PM</tick>',
          isMeta: true,
        }),
      ),
    ).toBe(true)

    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: 'scheduled job: refresh analytics cache',
          isMeta: true,
        }),
      ),
    ).toBe(true)
  })

  test('classifies batches by any work-starting message', () => {
    const scaffoldingOnly = [
      createUserMessage({
        content:
          '<local-command-caveat>Caveat: hidden local command scaffolding</local-command-caveat>',
        isMeta: true,
      }),
      createUserMessage({
        content:
          '<system-reminder>\nProactive mode is now enabled.\n</system-reminder>',
        isMeta: true,
      }),
    ]
    expect(shouldReportRunningForMessages(scaffoldingOnly)).toBe(false)

    expect(
      shouldReportRunningForMessages([
        ...scaffoldingOnly,
        createUserMessage({
          content: '<tick>2:57:17 PM</tick>',
          isMeta: true,
        }),
      ]),
    ).toBe(true)
  })
})

describe('bridge ingress runtime envelopes', () => {
  test('routes kernel_runtime_event to runtime callback without forwarding as inbound user message', () => {
    const onInboundMessage = mock((_message: unknown) => {})
    const onRuntimeEvent = mock((_envelope: KernelRuntimeEnvelopeBase) => {})
    const message = createRuntimeEventMessage()

    handleIngressMessage(
      JSON.stringify(message),
      new BoundedUUIDSet(10),
      new BoundedUUIDSet(10),
      onInboundMessage,
      undefined,
      undefined,
      onRuntimeEvent,
    )

    expect(onRuntimeEvent).toHaveBeenCalledWith(message.envelope)
    expect(onInboundMessage).not.toHaveBeenCalled()
  })

  test('falls back headless.protocol_message payloads into the SDK ingress path', () => {
    const onInboundMessage = mock((_message: unknown) => {})
    const onRuntimeEvent = mock((_envelope: KernelRuntimeEnvelopeBase) => {})
    const protocolMessage = {
      type: 'user',
      uuid: 'runtime-user-1',
      session_id: 'session-1',
      message: {
        role: 'user',
        content: 'hello through runtime',
      },
    }
    const message = createRuntimeEventMessage(protocolMessage)

    handleIngressMessage(
      JSON.stringify(message),
      new BoundedUUIDSet(10),
      new BoundedUUIDSet(10),
      onInboundMessage,
      undefined,
      undefined,
      onRuntimeEvent,
    )

    expect(onRuntimeEvent).toHaveBeenCalledWith(message.envelope)
    expect(onInboundMessage).toHaveBeenCalledWith(protocolMessage)
  })
})

function createRuntimeEventMessage(protocolMessage?: unknown) {
  return {
    type: 'kernel_runtime_event',
    uuid: 'message-1',
    session_id: 'session-1',
    envelope: {
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
        type: 'headless.protocol_message',
        replayable: true,
        ...(protocolMessage === undefined ? {} : { payload: protocolMessage }),
      },
    },
  } as const
}
