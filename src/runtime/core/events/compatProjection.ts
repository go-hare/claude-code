import type { SDKMessage } from '../../../entrypoints/agentSdkTypes.js'
import type { StdoutMessage } from '../../../entrypoints/sdk/controlTypes.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../contracts/events.js'
import { toKernelRuntimeEventMessage } from '../../../utils/kernelRuntimeEventMessage.js'
import { jsonParse, jsonStringify } from '../../../utils/slowOperations.js'
import { getKernelEventFromEnvelope } from './KernelRuntimeEventFacade.js'

export type SDKResultTurnOutcome = {
  eventType: 'turn.completed' | 'turn.failed'
  state: 'completed' | 'failed'
  stopReason: string | null
}

export type SDKBackedRuntimeEventType = 'turn.output_delta'

export type LegacyStreamJsonProjectionOptions = {
  sessionId?: string
  includeRuntimeEvent?: boolean
  includeSDKMessage?: boolean
}

export function cloneSDKMessageForRuntimeEvent(message: SDKMessage): SDKMessage {
  return jsonParse(jsonStringify(message)) as SDKMessage
}

export function sdkMessageToRuntimeEvent({
  conversationId,
  turnId,
  message,
  metadata,
}: {
  conversationId: string
  turnId?: string
  message: SDKMessage
  metadata?: Record<string, unknown>
}): KernelEvent {
  return {
    conversationId,
    turnId,
    type: 'headless.sdk_message',
    replayable: true,
    payload: cloneSDKMessageForRuntimeEvent(message),
    ...(metadata ? { metadata } : {}),
  }
}

export const createHeadlessSDKMessageRuntimeEvent = sdkMessageToRuntimeEvent

export function createTurnOutputDeltaRuntimeEventFromSDKMessage({
  conversationId,
  turnId,
  message,
}: {
  conversationId: string
  turnId?: string
  message: SDKMessage
}): KernelEvent | undefined {
  const text = getTextOutputDeltaFromSDKMessage(message)
  if (!text) {
    return undefined
  }

  return {
    conversationId,
    turnId,
    type: 'turn.output_delta',
    replayable: true,
    payload: {
      text,
      source: 'sdk_stream_event',
    },
    metadata: {
      compatibilitySource: 'headless.sdk_message',
    },
  }
}

export function getCanonicalProjectionForSDKMessage(
  message: SDKMessage,
): SDKBackedRuntimeEventType | undefined {
  return getTextOutputDeltaFromSDKMessage(message)
    ? 'turn.output_delta'
    : undefined
}

export function getTextOutputDeltaFromSDKMessage(
  message: SDKMessage,
): string | undefined {
  const record = message as Record<string, unknown>
  if (record.type !== 'stream_event') {
    return undefined
  }

  const event = record.event as Record<string, unknown> | undefined
  if (event?.type !== 'content_block_delta') {
    return undefined
  }

  const delta = event.delta as Record<string, unknown> | undefined
  if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
    return delta.text.length > 0 ? delta.text : undefined
  }
  return undefined
}

export function runtimeEnvelopeToSDKMessage(
  envelope: KernelRuntimeEnvelopeBase,
): SDKMessage | undefined {
  const event = getKernelEventFromEnvelope(envelope)
  if (event?.type !== 'headless.sdk_message') {
    return undefined
  }
  return isSDKMessageLike(event.payload) ? event.payload : undefined
}

export const getSDKMessageFromRuntimeEnvelope = runtimeEnvelopeToSDKMessage
export const projectRuntimeEnvelopeToLegacySDKMessage =
  runtimeEnvelopeToSDKMessage

export function getSDKResultTurnOutcome(
  message: SDKMessage,
  options: { abortReason?: string | null } = {},
): SDKResultTurnOutcome {
  if (options.abortReason) {
    return {
      eventType: 'turn.failed',
      state: 'failed',
      stopReason: options.abortReason,
    }
  }

  const failed = isErrorSDKResultMessage(message)
  return {
    eventType: failed ? 'turn.failed' : 'turn.completed',
    state: failed ? 'failed' : 'completed',
    stopReason: stopReasonFromSDKResultMessage(message),
  }
}

export function isErrorSDKResultMessage(message: SDKMessage): boolean {
  const record = message as Record<string, unknown>
  return record.is_error === true
}

export function stopReasonFromSDKResultMessage(
  message: SDKMessage,
): string | null {
  const record = message as Record<string, unknown>
  if (typeof record.stop_reason === 'string') {
    return record.stop_reason
  }
  switch (record.subtype) {
    case 'error_max_budget_usd':
    case 'error_max_turns':
    case 'error_max_structured_output_retries':
      return 'max_turn_requests'
    default:
      return null
  }
}

export function getRuntimeAbortStopReason(
  signal: AbortSignal | undefined,
): string | null {
  if (!signal?.aborted) {
    return null
  }

  const reason = signal.reason
  if (typeof reason === 'string' && reason.length > 0) {
    return reason
  }
  if (reason instanceof Error && reason.message.length > 0) {
    return reason.message
  }
  return 'aborted'
}

export function sdkMessageToStreamJsonMessages(
  message: SDKMessage,
): StdoutMessage[] {
  return [message as unknown as StdoutMessage]
}

export const projectSDKMessageToLegacyStreamJsonMessages =
  sdkMessageToStreamJsonMessages

export function runtimeEnvelopeToLegacyRuntimeEventStreamJsonMessage(
  envelope: KernelRuntimeEnvelopeBase,
  options: Pick<LegacyStreamJsonProjectionOptions, 'sessionId'> = {},
): StdoutMessage {
  return toKernelRuntimeEventMessage(
    envelope,
    options.sessionId ?? envelope.conversationId ?? '',
  ) as unknown as StdoutMessage
}

export const projectRuntimeEnvelopeToLegacyRuntimeEventStreamJsonMessage =
  runtimeEnvelopeToLegacyRuntimeEventStreamJsonMessage

export function runtimeEnvelopeToLegacySDKStreamJsonMessages(
  envelope: KernelRuntimeEnvelopeBase,
): StdoutMessage[] {
  const sdkMessage = runtimeEnvelopeToSDKMessage(envelope)
  return sdkMessage ? sdkMessageToStreamJsonMessages(sdkMessage) : []
}

export const projectRuntimeEnvelopeToLegacySDKStreamJsonMessages =
  runtimeEnvelopeToLegacySDKStreamJsonMessages

export function runtimeEnvelopeToStreamJsonMessages(
  envelope: KernelRuntimeEnvelopeBase,
  options: LegacyStreamJsonProjectionOptions = {},
): StdoutMessage[] {
  const messages: StdoutMessage[] = []
  if (options.includeRuntimeEvent) {
    messages.push(
      runtimeEnvelopeToLegacyRuntimeEventStreamJsonMessage(envelope, {
        sessionId: options.sessionId,
      }),
    )
  }

  if (options.includeSDKMessage !== false) {
    messages.push(...runtimeEnvelopeToLegacySDKStreamJsonMessages(envelope))
  }
  return messages
}

export const projectRuntimeEnvelopeToLegacyStreamJsonMessages =
  runtimeEnvelopeToStreamJsonMessages

export class KernelRuntimeSDKMessageDedupe {
  private readonly seen = new Set<string>()
  private readonly order: string[] = []

  constructor(private readonly maxSize = 512) {}

  shouldProcess(message: SDKMessage): boolean {
    return dedupeSDKMessage(message, this.seen, this.order, this.maxSize)
  }

  clear(): void {
    this.seen.clear()
    this.order.length = 0
  }
}

export class KernelRuntimeOutputDeltaDedupe {
  private readonly seen = new Set<string>()
  private readonly order: string[] = []

  constructor(private readonly maxSize = 512) {}

  shouldProcess(envelope: KernelRuntimeEnvelopeBase): boolean {
    const key = envelope.eventId ?? envelope.messageId
    if (!key) {
      return true
    }
    return dedupeKey(key, this.seen, this.order, this.maxSize)
  }

  clear(): void {
    this.seen.clear()
    this.order.length = 0
  }
}

export function dedupeSDKMessage(
  message: SDKMessage,
  seen: Set<string>,
  order: string[],
  maxSize = 512,
): boolean {
  const key = getSDKMessageDedupeKey(message)
  if (!key) {
    return true
  }
  return dedupeKey(key, seen, order, maxSize)
}

export function getSDKMessageDedupeKey(
  message: SDKMessage,
): string | undefined {
  if (typeof message.uuid === 'string' && message.uuid.length > 0) {
    return `uuid:${message.uuid}`
  }
  const nestedMessage = message.message
  if (
    typeof nestedMessage === 'object' &&
    nestedMessage !== null &&
    'id' in nestedMessage &&
    typeof (nestedMessage as { id?: unknown }).id === 'string'
  ) {
    return `${message.type}:message:${(nestedMessage as { id: string }).id}`
  }
  return undefined
}

export function isSDKMessageLike(value: unknown): value is SDKMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

function dedupeKey(
  key: string,
  seen: Set<string>,
  order: string[],
  maxSize: number,
): boolean {
  if (seen.has(key)) {
    return false
  }
  seen.add(key)
  order.push(key)
  while (order.length > maxSize) {
    const oldest = order.shift()
    if (oldest) {
      seen.delete(oldest)
    }
  }
  return true
}
