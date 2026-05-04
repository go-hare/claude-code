import { describe, expect, test } from 'bun:test'

import type { KernelEvent } from '../../runtime/contracts/events.js'
import type { KernelPermissionRequest } from '../../runtime/contracts/permissions.js'
import {
  createKernelPermissionBroker,
  KernelPermissionBrokerDisposedError,
  KernelPermissionDecisionError,
} from '../permissions.js'

function createClock(): () => string {
  let tick = 0
  return () => {
    const second = String(tick++).padStart(2, '0')
    return `2026-04-27T00:00:${second}.000Z`
  }
}

function createRequest(
  permissionRequestId: string,
  overrides: Partial<KernelPermissionRequest> = {},
): KernelPermissionRequest {
  return {
    permissionRequestId,
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    toolName: 'Bash',
    action: 'tool.call',
    argumentsPreview: { command: 'pwd' },
    risk: 'medium',
    policySnapshot: { mode: 'default' },
    ...overrides,
  }
}

function getKernelEventPayload(envelope: { payload?: unknown }): KernelEvent {
  if (
    typeof envelope.payload !== 'object' ||
    envelope.payload === null ||
    !('type' in envelope.payload)
  ) {
    throw new Error('Expected kernel event payload')
  }
  return envelope.payload as KernelEvent
}

describe('kernel permission facade', () => {
  test('creates a package-level broker and emits permission audit envelopes', async () => {
    let messageId = 1
    const events: unknown[] = []
    const broker = createKernelPermissionBroker({
      runtimeId: 'runtime-1',
      now: createClock(),
      createMessageId: () => `message-${messageId++}`,
      eventSink: envelope => {
        events.push(envelope)
      },
    })

    const pending = broker.requestPermission(createRequest('permission-1'))
    const decision = broker.decide({
      permissionRequestId: 'permission-1',
      decision: 'allow_once',
      decidedBy: 'host',
      reason: 'approved',
    })

    await expect(pending).resolves.toEqual(decision)
    expect(broker.snapshot()).toEqual({
      pendingRequestIds: [],
      finalizedRequestIds: ['permission-1'],
      sessionGrantCount: 0,
      capabilityPlaneCount: 1,
      disposed: false,
    })

    expect(
      events.map(envelope => {
        const event = getKernelEventPayload(envelope as { payload?: unknown })
        return {
          kind: (envelope as { kind?: unknown }).kind,
          runtimeId: (envelope as { runtimeId?: unknown }).runtimeId,
          conversationId: (envelope as { conversationId?: unknown })
            .conversationId,
          eventId: (envelope as { eventId?: unknown }).eventId,
          type: event.type,
          payload: event.payload,
        }
      }),
    ).toEqual([
      {
        kind: 'event',
        runtimeId: 'runtime-1',
        conversationId: 'conversation-1',
        eventId: 'conversation-1:1',
        type: 'permission.requested',
        payload: {
          permissionRequestId: 'permission-1',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          toolName: 'Bash',
          action: 'tool.call',
          argumentsPreview: { command: 'pwd' },
          risk: 'medium',
          policySnapshot: { mode: 'default' },
        },
      },
      {
        kind: 'event',
        runtimeId: 'runtime-1',
        conversationId: 'conversation-1',
        eventId: 'conversation-1:2',
        type: 'permission.resolved',
        payload: {
          permissionRequestId: 'permission-1',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          toolName: 'Bash',
          action: 'tool.call',
          argumentsPreview: { command: 'pwd' },
          risk: 'medium',
          policySnapshot: { mode: 'default' },
          decidedBy: 'host',
          decision: 'allow_once',
          reason: 'approved',
        },
      },
    ])
  })

  test('supports host decision handlers and swallows observer failures', async () => {
    const broker = createKernelPermissionBroker({
      eventSink: () => {
        throw new Error('observer failed')
      },
      decide: request => ({
        permissionRequestId: request.permissionRequestId,
        decision: 'deny',
        decidedBy: 'host',
        reason: 'blocked',
      }),
    })

    await expect(
      broker.requestPermission(createRequest('permission-1')),
    ).resolves.toEqual({
      permissionRequestId: 'permission-1',
      decision: 'deny',
      decidedBy: 'host',
      reason: 'blocked',
    })
  })

  test('exposes stable permission errors through the kernel surface', () => {
    const broker = createKernelPermissionBroker()

    expect(() =>
      broker.decide({
        permissionRequestId: 'missing',
        decision: 'allow_once',
        decidedBy: 'host',
      }),
    ).toThrow(KernelPermissionDecisionError)

    broker.dispose('host disconnected')

    expect(() =>
      broker.requestPermission(createRequest('permission-2')),
    ).toThrow(KernelPermissionBrokerDisposedError)
  })
})
