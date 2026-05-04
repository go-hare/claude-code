import { describe, expect, test } from 'bun:test'

import { RuntimeEventBus } from '../../../core/events/RuntimeEventBus.js'
import type { KernelPermissionRequest } from '../../../contracts/permissions.js'
import {
  getKernelCapabilityDenial,
  isKernelCapabilityPermitted,
  toolCapabilityName,
} from '../../CapabilityPlane.js'
import {
  RuntimePermissionBroker,
  RuntimePermissionBrokerDisposedError,
  RuntimePermissionDecisionError,
} from '../RuntimePermissionBroker.js'

type RuntimeEventEnvelope = ReturnType<RuntimeEventBus['replay']>[number]

function createClock(): () => string {
  let tick = 0
  return () => {
    const second = String(tick++).padStart(2, '0')
    return `2026-04-26T00:00:${second}.000Z`
  }
}

function createEventBus(): RuntimeEventBus {
  let messageId = 1
  return new RuntimeEventBus({
    runtimeId: 'runtime-1',
    now: createClock(),
    createMessageId: () => `message-${messageId++}`,
  })
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
    action: 'run',
    argumentsPreview: { command: 'pwd' },
    risk: 'medium',
    policySnapshot: { mode: 'default' },
    ...overrides,
  }
}

async function tick(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function requireEventPayload(envelope: RuntimeEventEnvelope) {
  if (!envelope.payload) {
    throw new Error('Expected permission audit envelope payload')
  }
  return envelope.payload
}

describe('RuntimePermissionBroker', () => {
  test('resolves a pending request from a host decision and emits audit events', async () => {
    const eventBus = createEventBus()
    const broker = new RuntimePermissionBroker({ eventBus })
    const request = createRequest('permission-1')

    const pending = broker.requestPermission(request)
    expect(broker.snapshot().pendingRequestIds).toEqual(['permission-1'])

    const decision = broker.decide({
      permissionRequestId: 'permission-1',
      decision: 'allow_once',
      decidedBy: 'host',
      reason: 'approved',
    })

    await expect(pending).resolves.toEqual(decision)
    expect(broker.snapshot()).toMatchObject({
      pendingRequestIds: [],
      finalizedRequestIds: ['permission-1'],
      sessionGrantCount: 0,
      capabilityPlaneCount: 1,
    })
    const plane = broker.getCapabilityPlane('permission-1')!
    expect(isKernelCapabilityPermitted(plane, toolCapabilityName('Bash'))).toBe(
      true,
    )
    expect(plane).toMatchObject({
      runtimeSupports: ['tool:Bash'],
      hostGrants: ['tool:Bash'],
      modePermits: ['tool:Bash'],
      toolRequires: ['tool:Bash'],
      metadata: {
        source: 'permission_broker',
        permissionRequestId: 'permission-1',
        decision: 'allow_once',
        decidedBy: 'host',
      },
    })

    expect(
      eventBus.replay({ conversationId: 'conversation-1' }).map(envelope => ({
        type: requireEventPayload(envelope).type,
        payload: projectPermissionAuditPayload(
          requireEventPayload(envelope).payload,
        ),
      })),
    ).toEqual([
      {
        type: 'permission.requested',
        payload: {
          permissionRequestId: 'permission-1',
          toolName: 'Bash',
          action: 'run',
          risk: 'medium',
          decidedBy: undefined,
          decision: undefined,
          reason: undefined,
        },
      },
      {
        type: 'permission.resolved',
        payload: {
          permissionRequestId: 'permission-1',
          toolName: 'Bash',
          action: 'run',
          risk: 'medium',
          decidedBy: 'host',
          decision: 'allow_once',
          reason: 'approved',
        },
      },
    ])
  })

  test('keeps duplicate request and duplicate decision idempotent', async () => {
    const broker = new RuntimePermissionBroker()
    const request = createRequest('permission-1')

    const firstPending = broker.requestPermission(request)
    const duplicatePending = broker.requestPermission(request)

    expect(duplicatePending).toBe(firstPending)

    const firstDecision = broker.decide({
      permissionRequestId: 'permission-1',
      decision: 'deny',
      decidedBy: 'host',
      reason: 'no',
    })
    const duplicateDecision = broker.decide({
      permissionRequestId: 'permission-1',
      decision: 'allow_once',
      decidedBy: 'host',
      reason: 'late',
    })

    await expect(firstPending).resolves.toEqual(firstDecision)
    expect(duplicateDecision).toEqual(firstDecision)
  })

  test('records pending and denied permission states as capability planes', async () => {
    const broker = new RuntimePermissionBroker()
    const pending = broker.requestPermission(createRequest('permission-1'))

    expect(broker.getCapabilityPlane('permission-1')).toMatchObject({
      runtimeSupports: ['tool:Bash'],
      hostGrants: [],
      modePermits: [],
      toolRequires: ['tool:Bash'],
      metadata: {
        source: 'permission_broker',
        permissionRequestId: 'permission-1',
      },
    })

    broker.decide({
      permissionRequestId: 'permission-1',
      decision: 'deny',
      decidedBy: 'policy',
      reason: 'blocked by rule',
    })
    await expect(pending).resolves.toMatchObject({
      decision: 'deny',
    })

    expect(
      getKernelCapabilityDenial(
        broker.getCapabilityPlane('permission-1')!,
        toolCapabilityName('Bash'),
      ),
    ).toMatchObject({
      capability: 'tool:Bash',
      actor: 'mode',
      reason: 'permission_deny',
      metadata: {
        decidedBy: 'policy',
        reason: 'blocked by rule',
      },
    })
  })

  test('times out unresolved requests with fail-closed deny', async () => {
    const eventBus = createEventBus()
    const broker = new RuntimePermissionBroker({ eventBus })

    const decision = await broker.requestPermission(
      createRequest('permission-timeout', { timeoutMs: 0 }),
    )

    expect(decision).toEqual({
      permissionRequestId: 'permission-timeout',
      decision: 'deny',
      decidedBy: 'timeout',
      reason: 'Permission request timed out',
    })
    expect(
      eventBus
        .replay({ conversationId: 'conversation-1' })
        .map(envelope => requireEventPayload(envelope).type),
    ).toEqual(['permission.requested', 'permission.resolved'])
  })

  test('reuses allow_session decisions for matching requests', async () => {
    const eventBus = createEventBus()
    const broker = new RuntimePermissionBroker({ eventBus })

    const first = broker.requestPermission(createRequest('permission-1'))
    broker.decide({
      permissionRequestId: 'permission-1',
      decision: 'allow_session',
      decidedBy: 'host',
      reason: 'session approved',
    })

    await expect(first).resolves.toMatchObject({
      decision: 'allow_session',
      decidedBy: 'host',
    })

    await expect(
      broker.requestPermission(createRequest('permission-2')),
    ).resolves.toMatchObject({
      permissionRequestId: 'permission-2',
      decision: 'allow_session',
      decidedBy: 'policy',
      metadata: {
        grantedBy: 'permission-1',
      },
    })

    expect(broker.snapshot().sessionGrantCount).toBe(1)
    expect(
      eventBus
        .replay({ conversationId: 'conversation-1' })
        .map(envelope => requireEventPayload(envelope).type),
    ).toEqual([
      'permission.requested',
      'permission.resolved',
      'permission.requested',
      'permission.resolved',
    ])
  })

  test('does not reuse allow_session decisions across conversations', async () => {
    const broker = new RuntimePermissionBroker()

    const first = broker.requestPermission(createRequest('permission-1'))
    broker.decide({
      permissionRequestId: 'permission-1',
      decision: 'allow_session',
      decidedBy: 'host',
      reason: 'session approved',
    })
    await expect(first).resolves.toMatchObject({
      decision: 'allow_session',
    })

    const second = broker.requestPermission(
      createRequest('permission-2', {
        conversationId: 'conversation-2',
      }),
    )

    expect(broker.snapshot()).toMatchObject({
      pendingRequestIds: ['permission-2'],
      sessionGrantCount: 1,
    })

    broker.decide({
      permissionRequestId: 'permission-2',
      decision: 'deny',
      decidedBy: 'host',
    })
    await expect(second).resolves.toMatchObject({
      permissionRequestId: 'permission-2',
      decision: 'deny',
    })
  })

  test('expires stale allow_session grants before reuse', async () => {
    const broker = new RuntimePermissionBroker({
      now: () => '2026-04-26T00:00:10.000Z',
    })

    const first = broker.requestPermission(createRequest('permission-1'))
    broker.decide({
      permissionRequestId: 'permission-1',
      decision: 'allow_session',
      decidedBy: 'host',
      expiresAt: '2026-04-26T00:00:00.000Z',
    })
    await expect(first).resolves.toMatchObject({
      decision: 'allow_session',
    })

    const second = broker.requestPermission(createRequest('permission-2'))

    expect(broker.snapshot()).toMatchObject({
      pendingRequestIds: ['permission-2'],
      sessionGrantCount: 0,
    })

    broker.decide({
      permissionRequestId: 'permission-2',
      decision: 'allow_once',
      decidedBy: 'host',
    })
    await expect(second).resolves.toMatchObject({
      decision: 'allow_once',
    })
  })

  test('denies pending requests when the host disconnects', async () => {
    const broker = new RuntimePermissionBroker()
    const pending = broker.requestPermission(createRequest('permission-1'))

    broker.dispose('host disconnected')

    await expect(pending).resolves.toEqual({
      permissionRequestId: 'permission-1',
      decision: 'deny',
      decidedBy: 'runtime',
      reason: 'host disconnected',
    })
    expect(() =>
      broker.requestPermission(createRequest('permission-2')),
    ).toThrow(RuntimePermissionBrokerDisposedError)
  })

  test('rejects decisions for unknown request ids', () => {
    const broker = new RuntimePermissionBroker()

    expect(() =>
      broker.decide({
        permissionRequestId: 'missing',
        decision: 'allow_once',
        decidedBy: 'host',
      }),
    ).toThrow(RuntimePermissionDecisionError)
  })

  test('passes an abort signal to the injected decision handler', async () => {
    let capturedSignal: AbortSignal | undefined
    const broker = new RuntimePermissionBroker({
      decide: (_request, signal) => {
        capturedSignal = signal
        return new Promise(() => {})
      },
    })

    const pending = broker.requestPermission(
      createRequest('permission-1', { timeoutMs: 0 }),
    )
    await tick()

    await expect(pending).resolves.toMatchObject({
      decidedBy: 'timeout',
      decision: 'deny',
    })
    expect(capturedSignal?.aborted).toBe(true)
  })
})

function projectPermissionAuditPayload(payload: unknown): Record<string, unknown> {
  const record = payload as Record<string, unknown>
  return {
    permissionRequestId: record.permissionRequestId,
    toolName: record.toolName,
    action: record.action,
    risk: record.risk,
    decidedBy: record.decidedBy,
    decision: record.decision,
    reason: record.reason,
  }
}
