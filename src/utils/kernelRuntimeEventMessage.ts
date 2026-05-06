import type { ProtocolStdoutMessage } from 'src/types/protocol/controlTypes.js'
import type {
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../runtime/contracts/events.js'

export type KernelRuntimeEventMessage = {
  type: 'kernel_runtime_event'
  envelope: KernelRuntimeEnvelopeBase
  uuid: string
  session_id: string
}

export function toKernelRuntimeEventMessage(
  envelope: KernelRuntimeEnvelopeBase,
  sessionId: string,
): KernelRuntimeEventMessage {
  return {
    type: 'kernel_runtime_event',
    envelope,
    uuid: envelope.messageId,
    session_id: sessionId,
  }
}

export function getKernelRuntimeEnvelopeFromProtocolStdoutMessage(
  message: ProtocolStdoutMessage,
): KernelRuntimeEnvelopeBase | undefined {
  return getKernelRuntimeEnvelopeFromMessage(message)
}

export function getKernelRuntimeEnvelopeFromMessage(
  message: unknown,
): KernelRuntimeEnvelopeBase | undefined {
  if (typeof message !== 'object' || message === null) {
    return undefined
  }

  const record = message as Record<string, unknown>
  if (record.type !== 'kernel_runtime_event') {
    return undefined
  }

  const envelope = record.envelope
  if (!isKernelRuntimeEnvelope(envelope)) {
    return undefined
  }
  return envelope
}

export function consumeKernelRuntimeEventMessage(
  message: unknown,
  sink?: KernelRuntimeEventSink,
): boolean {
  const envelope = getKernelRuntimeEnvelopeFromMessage(message)
  if (!envelope) {
    return false
  }

  try {
    sink?.(envelope)
  } catch {
    // Runtime event observation must not affect legacy transport behavior.
  }
  return true
}

export function isKernelRuntimeEnvelope(
  value: unknown,
): value is KernelRuntimeEnvelopeBase {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    record.schemaVersion === 'kernel.runtime.v1' &&
    typeof record.messageId === 'string' &&
    typeof record.sequence === 'number' &&
    typeof record.timestamp === 'string' &&
    record.source === 'kernel_runtime' &&
    isRuntimeEnvelopeKind(record.kind)
  )
}

function isRuntimeEnvelopeKind(value: unknown): boolean {
  return (
    value === 'ack' ||
    value === 'event' ||
    value === 'error' ||
    value === 'pong'
  )
}
