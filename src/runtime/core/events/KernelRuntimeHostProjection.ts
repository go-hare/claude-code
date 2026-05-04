import type { SDKMessage } from '../../../entrypoints/agentSdkTypes.js'
import {
  getSDKResultTurnOutcome,
  getSDKMessageFromRuntimeEnvelope as getSDKMessageFromKernelRuntimeEnvelope,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeSDKMessageDedupe,
} from './compatProjection.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../../contracts/events.js'
import type { RuntimeTaskNotificationPayload } from '../../contracts/task.js'
import type { RuntimeCoordinatorLifecyclePayload } from '../../contracts/team.js'
import { getKernelEventFromEnvelope } from './KernelRuntimeEventFacade.js'

export type KernelRuntimeHostStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'max_turn_requests'
  | 'cancelled'

export type KernelRuntimeTerminalProjection = {
  eventType: 'turn.completed' | 'turn.failed'
  isError: boolean
  runtimeStopReason: string | null | undefined
  hostStopReason: KernelRuntimeHostStopReason
}

export type KernelRuntimeCoordinatorLifecycleEventType =
  | 'handoff.started'
  | 'handoff.completed'
  | 'handoff.failed'
  | 'team.idle_wait_started'
  | 'team.idle_reached'
  | 'team.shutdown_requested'
  | 'team.shutdown_approved'
  | 'team.shutdown_completed'
  | 'team.cleanup_started'
  | 'team.cleanup_completed'
  | 'team.cleanup_failed'

export type KernelRuntimeTaskNotificationProjection = {
  kind: 'tasks.notification'
  taskId: string
  status: RuntimeTaskNotificationPayload['status']
  payload: RuntimeTaskNotificationPayload
}

export type KernelRuntimeCoordinatorLifecycleProjection = {
  kind: 'coordinator.lifecycle'
  eventType: KernelRuntimeCoordinatorLifecycleEventType
  phase: RuntimeCoordinatorLifecyclePayload['phase']
  state: RuntimeCoordinatorLifecyclePayload['state']
  payload: RuntimeCoordinatorLifecyclePayload
}

export type KernelRuntimeLifecycleProjection =
  | KernelRuntimeTaskNotificationProjection
  | KernelRuntimeCoordinatorLifecycleProjection

export type KernelRuntimeHostEventCallbacks = {
  onRuntimeEvent?: KernelRuntimeEventSink
  onRuntimeHeartbeat?: (
    envelope: KernelRuntimeEnvelopeBase,
    event: KernelEvent,
  ) => void
  onOutputDelta?: (
    delta: KernelRuntimeTextOutputDelta,
    envelope: KernelRuntimeEnvelopeBase,
    event: KernelEvent,
  ) => void
  onSDKMessage?: (
    message: SDKMessage,
    envelope: KernelRuntimeEnvelopeBase,
    event: KernelEvent,
  ) => void
  onTurnTerminal?: (
    envelope: KernelRuntimeEnvelopeBase,
    event: KernelEvent,
    projection: KernelRuntimeTerminalProjection,
  ) => void
  onLifecycle?: (
    projection: KernelRuntimeLifecycleProjection,
    envelope: KernelRuntimeEnvelopeBase,
    event: KernelEvent,
  ) => void
}

export type KernelRuntimeTextOutputDelta = {
  text: string
}

export function handleKernelRuntimeHostEvent(
  envelope: KernelRuntimeEnvelopeBase,
  callbacks: KernelRuntimeHostEventCallbacks,
): void {
  callbacks.onRuntimeEvent?.(envelope)

  const event = getKernelEventFromEnvelope(envelope)
  if (!event) {
    return
  }

  callbacks.onRuntimeHeartbeat?.(envelope, event)
  const sdkMessage = getSDKMessageFromKernelRuntimeEnvelope(envelope)
  if (sdkMessage) {
    callbacks.onSDKMessage?.(sdkMessage, envelope, event)
  }
  const outputDelta = getTextOutputDeltaFromKernelRuntimeEnvelope(envelope)
  if (outputDelta) {
    callbacks.onOutputDelta?.(outputDelta, envelope, event)
  }
  if (isKernelTurnTerminalEvent(event)) {
    callbacks.onTurnTerminal?.(
      envelope,
      event,
      getKernelRuntimeTerminalProjection(event),
    )
  }
  const lifecycleProjection = getKernelRuntimeLifecycleProjection(event)
  if (lifecycleProjection) {
    callbacks.onLifecycle?.(lifecycleProjection, envelope, event)
  }
}

export function isKernelTurnTerminalEvent(event: KernelEvent): boolean {
  return event.type === 'turn.completed' || event.type === 'turn.failed'
}

export function getTextOutputDeltaFromKernelRuntimeEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): KernelRuntimeTextOutputDelta | undefined {
  const event = getKernelEventFromEnvelope(envelope)
  if (event?.type !== 'turn.output_delta') {
    return undefined
  }
  const payload = getKernelRuntimeEventPayloadRecord(event)
  if (!payload || 'message' in payload) {
    return undefined
  }
  return typeof payload.text === 'string'
    ? { text: payload.text }
    : undefined
}

export function getKernelRuntimeTerminalProjection(
  event: KernelEvent,
): KernelRuntimeTerminalProjection {
  const runtimeStopReason = getKernelRuntimeStopReason(event)
  return {
    eventType: event.type === 'turn.failed' ? 'turn.failed' : 'turn.completed',
    isError: event.type === 'turn.failed',
    runtimeStopReason,
    hostStopReason: toKernelRuntimeHostStopReason(event, runtimeStopReason),
  }
}

export function getKernelRuntimeTerminalProjectionFromSDKResultMessage(
  message: SDKMessage,
  options: { aborted?: boolean } = {},
): KernelRuntimeTerminalProjection | undefined {
  if ((message as Record<string, unknown>).type !== 'result') {
    return undefined
  }

  const outcome = getSDKResultTurnOutcome(message)
  return {
    eventType: outcome.eventType,
    isError: outcome.state === 'failed',
    runtimeStopReason: outcome.stopReason,
    hostStopReason: getKernelRuntimeHostStopReasonFromSDKResultMessage(
      message,
      options,
    ),
  }
}

export function getKernelRuntimeOutputText(event: KernelEvent): string | undefined {
  const payload = getKernelRuntimeEventPayloadRecord(event)
  return typeof payload?.text === 'string' ? payload.text : undefined
}

export function getKernelRuntimeStopReason(
  event: KernelEvent,
): string | null | undefined {
  const payload = getKernelRuntimeEventPayloadRecord(event)
  const stopReason = payload?.stopReason
  return typeof stopReason === 'string' || stopReason === null
    ? stopReason
    : undefined
}

export function getKernelRuntimeFailedError(event: KernelEvent): unknown {
  return getKernelRuntimeEventPayloadRecord(event)?.error
}

export function getCanonicalProjectionFromKernelEvent(
  event: KernelEvent,
): string | undefined {
  const projection = event.metadata?.canonicalProjection
  return typeof projection === 'string' ? projection : undefined
}

export function hasCanonicalProjection(
  event: KernelEvent,
  projection: string,
): boolean {
  return getCanonicalProjectionFromKernelEvent(event) === projection
}

export function getCompatibilityProjectionFromKernelEvent(
  event: KernelEvent,
): string | undefined {
  const projection = event.metadata?.compatibilityProjection
  return typeof projection === 'string' ? projection : undefined
}

export function hasCompatibilityProjection(
  event: KernelEvent,
  projection: string,
): boolean {
  return getCompatibilityProjectionFromKernelEvent(event) === projection
}

export function getKernelRuntimeLifecycleProjection(
  event: KernelEvent,
): KernelRuntimeLifecycleProjection | undefined {
  const taskNotification = getKernelRuntimeTaskNotificationProjection(event)
  if (taskNotification) {
    return taskNotification
  }
  return getKernelRuntimeCoordinatorLifecycleProjection(event)
}

export function getKernelRuntimeTaskNotificationProjection(
  event: KernelEvent,
): KernelRuntimeTaskNotificationProjection | undefined {
  if (event.type !== 'tasks.notification') {
    return undefined
  }
  const payload = getKernelRuntimeEventPayloadRecord(event)
  if (!isRuntimeTaskNotificationPayload(payload)) {
    return undefined
  }
  return {
    kind: 'tasks.notification',
    taskId: payload.taskId,
    status: payload.status,
    payload,
  }
}

export function getKernelRuntimeCoordinatorLifecycleProjection(
  event: KernelEvent,
): KernelRuntimeCoordinatorLifecycleProjection | undefined {
  if (!isCoordinatorLifecycleEventType(event.type)) {
    return undefined
  }
  const payload = getKernelRuntimeEventPayloadRecord(event)
  if (!isRuntimeCoordinatorLifecyclePayload(payload)) {
    return undefined
  }
  return {
    kind: 'coordinator.lifecycle',
    eventType: event.type,
    phase: payload.phase,
    state: payload.state,
    payload,
  }
}

function getKernelRuntimeHostStopReasonFromSDKResultMessage(
  message: SDKMessage,
  options: { aborted?: boolean },
): KernelRuntimeHostStopReason {
  if (options.aborted) {
    return 'cancelled'
  }

  const record = message as Record<string, unknown>
  const subtype = typeof record.subtype === 'string' ? record.subtype : undefined
  const isError = record.is_error === true
  const stopReason =
    typeof record.stop_reason === 'string' ? record.stop_reason : null

  switch (subtype) {
    case 'success':
      if (stopReason === 'max_tokens') {
        return 'max_tokens'
      }
      if (isError) {
        return 'end_turn'
      }
      return 'end_turn'
    case 'error_during_execution':
      return stopReason === 'max_tokens' ? 'max_tokens' : 'end_turn'
    case 'error_max_budget_usd':
    case 'error_max_turns':
    case 'error_max_structured_output_retries':
      return 'max_turn_requests'
    default:
      return 'end_turn'
  }
}

function toKernelRuntimeHostStopReason(
  event: KernelEvent,
  runtimeStopReason: string | null | undefined,
): KernelRuntimeHostStopReason {
  if (runtimeStopReason === 'max_tokens') {
    return 'max_tokens'
  }
  if (
    runtimeStopReason === 'max_turn_requests' ||
    runtimeStopReason === 'max_turns' ||
    runtimeStopReason === 'error_max_turns'
  ) {
    return 'max_turn_requests'
  }
  if (isRuntimeAbortStopReason(runtimeStopReason)) {
    return 'cancelled'
  }
  if (event.type === 'turn.failed') {
    return 'end_turn'
  }
  return 'end_turn'
}

function isRuntimeAbortStopReason(value: string | null | undefined): boolean {
  if (!value) {
    return false
  }
  const normalized = value.toLowerCase()
  return (
    normalized === 'interrupt' ||
    normalized === 'cancelled' ||
    normalized === 'canceled' ||
    normalized === 'abort' ||
    normalized === 'aborted'
  )
}

function getKernelRuntimeEventPayloadRecord(
  event: KernelEvent,
): Record<string, unknown> | undefined {
  return isRecord(event.payload) ? event.payload : undefined
}

function isRuntimeTaskNotificationPayload(
  value: unknown,
): value is RuntimeTaskNotificationPayload {
  if (!isRecord(value)) {
    return false
  }
  const status = value.status
  return (
    typeof value.taskId === 'string' &&
    (value.toolUseId === undefined || typeof value.toolUseId === 'string') &&
    (status === 'completed' || status === 'failed' || status === 'stopped') &&
    typeof value.outputFile === 'string' &&
    typeof value.summary === 'string' &&
    value.source === 'queued_task_notification'
  )
}

function isRuntimeCoordinatorLifecyclePayload(
  value: unknown,
): value is RuntimeCoordinatorLifecyclePayload {
  return (
    isRecord(value) &&
    typeof value.phase === 'string' &&
    typeof value.state === 'string' &&
    typeof value.source === 'string'
  )
}

function isCoordinatorLifecycleEventType(
  type: string,
): type is KernelRuntimeCoordinatorLifecycleEventType {
  return (
    type === 'handoff.started' ||
    type === 'handoff.completed' ||
    type === 'handoff.failed' ||
    type === 'team.idle_wait_started' ||
    type === 'team.idle_reached' ||
    type === 'team.shutdown_requested' ||
    type === 'team.shutdown_approved' ||
    type === 'team.shutdown_completed' ||
    type === 'team.cleanup_started' ||
    type === 'team.cleanup_completed' ||
    type === 'team.cleanup_failed'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export {
  getSDKMessageFromKernelRuntimeEnvelope,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeSDKMessageDedupe,
}
