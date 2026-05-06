import type { ProtocolMessage } from 'src/types/protocol/index.js'
import type { ProtocolStdoutMessage } from 'src/types/protocol/controlTypes.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../contracts/events.js'
import { toKernelRuntimeEventMessage } from '../../../utils/kernelRuntimeEventMessage.js'
import { jsonParse, jsonStringify } from '../../../utils/slowOperations.js'
import { getKernelEventFromEnvelope } from './KernelRuntimeEventFacade.js'

export type ProtocolResultTurnOutcome = {
  eventType: 'turn.completed' | 'turn.failed'
  state: 'completed' | 'failed'
  stopReason: string | null
}

export type ProtocolBackedRuntimeEventType = 'turn.output_delta'

export type LegacyStreamJsonProjectionOptions = {
  sessionId?: string
  includeRuntimeEvent?: boolean
  includeProtocolMessage?: boolean
}

export function cloneProtocolMessageForRuntimeEvent(message: ProtocolMessage): ProtocolMessage {
  return jsonParse(jsonStringify(message)) as ProtocolMessage
}

export function protocolMessageToRuntimeEvent({
  conversationId,
  turnId,
  message,
  metadata,
}: {
  conversationId: string
  turnId?: string
  message: ProtocolMessage
  metadata?: Record<string, unknown>
}): KernelEvent {
  return {
    conversationId,
    turnId,
    type: 'headless.protocol_message',
    replayable: true,
    payload: cloneProtocolMessageForRuntimeEvent(message),
    ...(metadata ? { metadata } : {}),
  }
}

export const createHeadlessProtocolMessageRuntimeEvent = protocolMessageToRuntimeEvent

export function createTurnOutputDeltaRuntimeEventFromProtocolMessage({
  conversationId,
  turnId,
  message,
}: {
  conversationId: string
  turnId?: string
  message: ProtocolMessage
}): KernelEvent | undefined {
  const text = getTextOutputDeltaFromProtocolMessage(message)
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
      source: 'protocol_stream_event',
    },
    metadata: {
      compatibilitySource: 'headless.protocol_message',
    },
  }
}

export function getCanonicalProjectionForProtocolMessage(
  message: ProtocolMessage,
): ProtocolBackedRuntimeEventType | undefined {
  return getTextOutputDeltaFromProtocolMessage(message)
    ? 'turn.output_delta'
    : undefined
}

export function projectSemanticRuntimeEventsFromProtocolMessage({
  conversationId,
  turnId,
  message,
}: {
  conversationId: string
  turnId?: string
  message: ProtocolMessage
}): KernelEvent[] {
  const events: KernelEvent[] = []
  const topLevelAssistantText = getTopLevelAssistantTextFromProtocolMessage(message)
  if (topLevelAssistantText) {
    events.push({
      conversationId,
      turnId,
      type: 'turn.delta',
      replayable: true,
      payload: {
        kind: 'assistant_message',
        text: topLevelAssistantText,
      },
    })
  }

  events.push(
    ...projectSemanticToolUseRuntimeEventsFromProtocolMessage({
      conversationId,
      turnId,
      message,
    }),
  )
  return events
}

export function getTextOutputDeltaFromProtocolMessage(
  message: ProtocolMessage,
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

function projectSemanticToolUseRuntimeEventsFromProtocolMessage({
  conversationId,
  turnId,
  message,
}: {
  conversationId: string
  turnId?: string
  message: ProtocolMessage
}): KernelEvent[] {
  const record = asRecord(message)
  const parentToolUseId =
    typeof record?.parent_tool_use_id === 'string' &&
    record.parent_tool_use_id.length > 0
      ? record.parent_tool_use_id
      : undefined
  if (record?.type === 'stream_event') {
    const event = asRecord(record.event)
    const contentBlock = asRecord(event?.content_block)
    if (
      event?.type === 'content_block_start' &&
      contentBlock?.type === 'tool_use' &&
      typeof contentBlock.id === 'string'
    ) {
      return [
        createTurnProgressRuntimeEvent({
          conversationId,
          turnId,
          kind: 'tool_use_start',
          toolUseId: contentBlock.id,
          parentToolUseId,
          toolName:
            typeof contentBlock.name === 'string'
              ? contentBlock.name
              : undefined,
          toolInput: contentBlock.input,
        }),
      ]
    }
    return []
  }

  const protocolMessage = asRecord(record?.message)
  const content = Array.isArray(protocolMessage?.content)
    ? protocolMessage.content
    : []
  if (record?.type === 'assistant') {
    return content.flatMap(block => {
      const contentBlock = asRecord(block)
      if (
        contentBlock?.type !== 'tool_use' ||
        typeof contentBlock.id !== 'string'
      ) {
        return []
      }
      return [
        createTurnProgressRuntimeEvent({
          conversationId,
          turnId,
          kind: 'tool_use_start',
          toolUseId: contentBlock.id,
          parentToolUseId,
          toolName:
            typeof contentBlock.name === 'string'
              ? contentBlock.name
              : undefined,
          toolInput: contentBlock.input,
        }),
      ]
    })
  }

  if (record?.type === 'user') {
    return content.flatMap(block => {
      const contentBlock = asRecord(block)
      if (
        contentBlock?.type !== 'tool_result' ||
        typeof contentBlock.tool_use_id !== 'string'
      ) {
        return []
      }
      return [
        createTurnProgressRuntimeEvent({
          conversationId,
          turnId,
          kind: 'tool_use_done',
          toolUseId: contentBlock.tool_use_id,
          parentToolUseId,
          content: contentBlock.content,
          isError: contentBlock.is_error === true,
        }),
      ]
    })
  }

  return []
}

function getTopLevelAssistantTextFromProtocolMessage(message: ProtocolMessage): string {
  const record = asRecord(message)
  if (record?.type !== 'assistant') {
    return ''
  }
  if (
    typeof record.parent_tool_use_id === 'string' &&
    record.parent_tool_use_id.length > 0
  ) {
    return ''
  }
  const protocolMessage = asRecord(record.message)
  const content = Array.isArray(protocolMessage?.content)
    ? protocolMessage.content
    : []
  return content
    .map(block => {
      const contentBlock = asRecord(block)
      return contentBlock?.type === 'text' &&
        typeof contentBlock.text === 'string'
        ? contentBlock.text
        : ''
    })
    .join('')
}

function createTurnProgressRuntimeEvent(options: {
  conversationId: string
  turnId?: string
  kind: 'tool_use_start' | 'tool_use_done'
  toolUseId: string
  parentToolUseId?: string
  toolName?: string
  toolInput?: unknown
  content?: unknown
  isError?: boolean
}): KernelEvent {
  return {
    conversationId: options.conversationId,
    turnId: options.turnId,
    type: 'turn.progress',
    replayable: true,
    payload: {
      kind: options.kind,
      toolUseId: options.toolUseId,
      ...(options.parentToolUseId
        ? { parentToolUseId: options.parentToolUseId }
        : {}),
      ...(options.toolName ? { toolName: options.toolName } : {}),
      ...(options.toolInput === undefined
        ? {}
        : { toolInput: options.toolInput }),
      ...(options.content === undefined ? {} : { content: options.content }),
      ...(options.isError === undefined ? {} : { isError: options.isError }),
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

export function runtimeEnvelopeToProtocolMessage(
  envelope: KernelRuntimeEnvelopeBase,
): ProtocolMessage | undefined {
  const event = getKernelEventFromEnvelope(envelope)
  if (event?.type !== 'headless.protocol_message') {
    return undefined
  }
  return isProtocolMessageLike(event.payload) ? event.payload : undefined
}

export const getProtocolMessageFromRuntimeEnvelope = runtimeEnvelopeToProtocolMessage
export const projectRuntimeEnvelopeToLegacyProtocolMessage =
  runtimeEnvelopeToProtocolMessage

export function getProtocolResultTurnOutcome(
  message: ProtocolMessage,
  options: { abortReason?: string | null } = {},
): ProtocolResultTurnOutcome {
  if (options.abortReason) {
    return {
      eventType: 'turn.failed',
      state: 'failed',
      stopReason: options.abortReason,
    }
  }

  const failed = isErrorProtocolResultMessage(message)
  return {
    eventType: failed ? 'turn.failed' : 'turn.completed',
    state: failed ? 'failed' : 'completed',
    stopReason: stopReasonFromProtocolResultMessage(message),
  }
}

export function isErrorProtocolResultMessage(message: ProtocolMessage): boolean {
  const record = message as Record<string, unknown>
  return record.is_error === true
}

export function stopReasonFromProtocolResultMessage(
  message: ProtocolMessage,
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

export function protocolMessageToStreamJsonMessages(
  message: ProtocolMessage,
): ProtocolStdoutMessage[] {
  return [message as unknown as ProtocolStdoutMessage]
}

export const projectProtocolMessageToLegacyStreamJsonMessages =
  protocolMessageToStreamJsonMessages

export function runtimeEnvelopeToLegacyRuntimeEventStreamJsonMessage(
  envelope: KernelRuntimeEnvelopeBase,
  options: Pick<LegacyStreamJsonProjectionOptions, 'sessionId'> = {},
): ProtocolStdoutMessage {
  return toKernelRuntimeEventMessage(
    envelope,
    options.sessionId ?? envelope.conversationId ?? '',
  ) as unknown as ProtocolStdoutMessage
}

export const projectRuntimeEnvelopeToLegacyRuntimeEventStreamJsonMessage =
  runtimeEnvelopeToLegacyRuntimeEventStreamJsonMessage

export function runtimeEnvelopeToLegacyProtocolStreamJsonMessages(
  envelope: KernelRuntimeEnvelopeBase,
): ProtocolStdoutMessage[] {
  const protocolMessage = runtimeEnvelopeToProtocolMessage(envelope)
  return protocolMessage ? protocolMessageToStreamJsonMessages(protocolMessage) : []
}

export const projectRuntimeEnvelopeToLegacyProtocolStreamJsonMessages =
  runtimeEnvelopeToLegacyProtocolStreamJsonMessages

export function runtimeEnvelopeToStreamJsonMessages(
  envelope: KernelRuntimeEnvelopeBase,
  options: LegacyStreamJsonProjectionOptions = {},
): ProtocolStdoutMessage[] {
  const messages: ProtocolStdoutMessage[] = []
  if (options.includeRuntimeEvent) {
    messages.push(
      runtimeEnvelopeToLegacyRuntimeEventStreamJsonMessage(envelope, {
        sessionId: options.sessionId,
      }),
    )
  }

  if (options.includeProtocolMessage !== false) {
    messages.push(...runtimeEnvelopeToLegacyProtocolStreamJsonMessages(envelope))
  }
  return messages
}

export const projectRuntimeEnvelopeToLegacyStreamJsonMessages =
  runtimeEnvelopeToStreamJsonMessages

export class KernelRuntimeProtocolMessageDedupe {
  private readonly seen = new Set<string>()
  private readonly order: string[] = []

  constructor(private readonly maxSize = 512) {}

  shouldProcess(message: ProtocolMessage): boolean {
    return dedupeProtocolMessage(message, this.seen, this.order, this.maxSize)
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

export function dedupeProtocolMessage(
  message: ProtocolMessage,
  seen: Set<string>,
  order: string[],
  maxSize = 512,
): boolean {
  const key = getProtocolMessageDedupeKey(message)
  if (!key) {
    return true
  }
  return dedupeKey(key, seen, order, maxSize)
}

export function getProtocolMessageDedupeKey(
  message: ProtocolMessage,
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

export function isProtocolMessageLike(value: unknown): value is ProtocolMessage {
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
