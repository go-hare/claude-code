import type {
  KernelPermissionDecision,
  KernelPermissionDecisionValue,
  KernelPermissionRequest,
  KernelPermissionRequestId,
} from '../runtime/contracts/permissions.js'
import { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import type { KernelRuntimeEventSink } from '../runtime/contracts/events.js'
import {
  RuntimePermissionBroker,
  RuntimePermissionBrokerDisposedError,
  RuntimePermissionDecisionError,
  type RuntimePermissionDecisionHandler,
} from '../runtime/capabilities/permissions/RuntimePermissionBroker.js'

export {
  RuntimePermissionBrokerDisposedError as KernelPermissionBrokerDisposedError,
  RuntimePermissionDecisionError as KernelPermissionDecisionError,
}

export type KernelPermissionDecisionHandler = RuntimePermissionDecisionHandler

export type KernelPermissionSessionGrantKeyFactory = (
  request: KernelPermissionRequest,
) => string

export type KernelPermissionBrokerSnapshot = {
  pendingRequestIds: KernelPermissionRequestId[]
  finalizedRequestIds: KernelPermissionRequestId[]
  sessionGrantCount: number
  capabilityPlaneCount: number
  disposed: boolean
}

export type KernelPermissionBroker = {
  requestPermission(
    request: KernelPermissionRequest,
  ): Promise<KernelPermissionDecision>
  decide(decision: KernelPermissionDecision): KernelPermissionDecision
  dispose(reason?: string): void
  snapshot(): KernelPermissionBrokerSnapshot
}

export type KernelPermissionBrokerOptions = {
  runtimeId?: string
  maxReplayEvents?: number
  eventSink?: KernelRuntimeEventSink
  decide?: KernelPermissionDecisionHandler
  defaultTimeoutMs?: number
  timeoutDecision?: Extract<KernelPermissionDecisionValue, 'deny' | 'abort'>
  now?: () => string
  createMessageId?: () => string
  createSessionGrantKey?: KernelPermissionSessionGrantKeyFactory
}

export function createKernelPermissionBroker(
  options: KernelPermissionBrokerOptions = {},
): KernelPermissionBroker {
  const eventBus = new RuntimeEventBus({
    runtimeId: options.runtimeId ?? 'kernel-runtime',
    maxReplayEvents: options.maxReplayEvents,
    now: options.now,
    createMessageId: options.createMessageId,
  })

  if (options.eventSink) {
    eventBus.subscribe(envelope => {
      try {
        options.eventSink?.(envelope)
      } catch {
        // Host observation must not affect permission decisions.
      }
    })
  }

  return new RuntimePermissionBroker({
    eventBus,
    decide: options.decide,
    defaultTimeoutMs: options.defaultTimeoutMs,
    timeoutDecision: options.timeoutDecision,
    now: options.now,
    createSessionGrantKey: options.createSessionGrantKey,
  })
}
