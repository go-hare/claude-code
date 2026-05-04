import type { SDKMessage } from '../../../../entrypoints/agentSdkTypes.js'
import type { APIError } from '@anthropic-ai/sdk'
import type { UUID } from 'crypto'
import { categorizeRetryableAPIError } from '../../../../services/api/errors.js'
import type {
  AssistantMessage,
  CompactMetadata,
  Message,
  UserMessage,
} from '../../../../types/message.js'
import {
  isNotEmptyMessage,
  normalizeMessages,
} from '../../../../utils/messages.js'
import {
  localCommandOutputToSDKAssistantMessage,
  toSDKCompactMetadata,
} from '../../../../utils/messages/mappers.js'
import { buildSystemInitMessage } from '../../../../utils/messages/systemInit.js'
import {
  applyToolProgressTrackingUpdate,
  projectProgressMessageToSDKMessageProjection,
  type ToolProgressTrackingState,
} from '../../../../utils/queryHelpers.js'
import type {
  QueryProgressMessage,
  QueryStreamEventMessage,
  QuerySystemInitMessage,
  QueryTurnProjectionInput,
  QueryUserReplayMessage,
} from './QueryTurnProjectionTypes.js'

export function isQueryStreamEvent(
  message: QueryTurnProjectionInput,
): message is QueryStreamEventMessage {
  const record = message as Record<string, unknown>
  return (
    record.type === 'stream_event' &&
    typeof record.event === 'object' &&
    record.event !== null
  )
}

export function queryStreamEventToSDKMessage(options: {
  conversationId: string
  message: QueryStreamEventMessage
}): SDKMessage {
  const message: SDKMessage = {
    type: 'stream_event',
    event: options.message.event,
    parent_tool_use_id: options.message.parent_tool_use_id ?? null,
    session_id: options.message.session_id ?? options.conversationId,
  }
  if (options.message.uuid) {
    message.uuid = options.message.uuid
  }
  return message
}

export function queryMessageToCompatibilitySDKMessages(options: {
  conversationId: string
  getProgressProjectionEnvironment: () => {
    now: number
    remoteEnabled: boolean
  }
  message: QueryTurnProjectionInput
  progressTrackingState: ToolProgressTrackingState
}): SDKMessage[] {
  if (isQueryProgressMessage(options.message)) {
    return queryProgressMessageToSDKMessages({
      conversationId: options.conversationId,
      getProgressProjectionEnvironment:
        options.getProgressProjectionEnvironment,
      message: options.message,
      progressTrackingState: options.progressTrackingState,
    })
  }

  if (isQuerySystemInitMessage(options.message)) {
    return [buildSystemInitMessage(options.message.inputs)]
  }

  if (isQueryAssistantMessage(options.message)) {
    return queryAssistantMessageToSDKMessages({
      conversationId: options.conversationId,
      message: options.message,
    })
  }

  if (isQueryUserMessage(options.message)) {
    return queryUserMessageToSDKMessages({
      conversationId: options.conversationId,
      message: options.message,
    })
  }

  if (isQueryToolUseSummaryMessage(options.message)) {
    return [{
      type: 'tool_use_summary',
      summary: options.message.summary,
      preceding_tool_use_ids: options.message.precedingToolUseIds,
      session_id: options.conversationId,
      uuid: options.message.uuid,
    }]
  }

  if (isQueryCompactBoundaryMessage(options.message)) {
    return [{
      type: 'system',
      subtype: 'compact_boundary',
      session_id: options.conversationId,
      uuid: options.message.uuid,
      compact_metadata: toSDKCompactMetadata(options.message.compactMetadata),
    }]
  }

  if (isQueryLocalCommandMessage(options.message)) {
    return [{
      ...localCommandOutputToSDKAssistantMessage(
        options.message.content,
        options.message.uuid as UUID,
      ),
      session_id: options.conversationId,
    }]
  }

  if (isQueryAPIErrorMessage(options.message)) {
    return [{
      type: 'system',
      subtype: 'api_retry',
      attempt: options.message.retryAttempt,
      max_retries: options.message.maxRetries,
      retry_delay_ms: options.message.retryInMs,
      error_status: options.message.error.status ?? null,
      error: categorizeRetryableAPIError(
        options.message.error as unknown as APIError,
      ),
      session_id: options.conversationId,
      uuid: options.message.uuid,
    }]
  }

  if (isQueryQueuedCommandAttachmentMessage(options.message)) {
    return [{
      type: 'user',
      message: {
        role: 'user',
        content: options.message.attachment.prompt,
      },
      session_id: options.conversationId,
      parent_tool_use_id: null,
      uuid:
        options.message.attachment.source_uuid ?? options.message.uuid,
      timestamp: options.message.timestamp,
      isReplay: true,
    }]
  }

  if (isQueryUserReplayMessage(options.message)) {
    return [{
      type: 'user',
      message: options.message.message,
      session_id: options.conversationId,
      parent_tool_use_id: options.message.parentToolUseId ?? null,
      uuid: options.message.uuid,
      timestamp: options.message.timestamp,
      isReplay: options.message.isReplay ?? true,
      ...(options.message.isSynthetic === undefined
        ? {}
        : { isSynthetic: options.message.isSynthetic }),
    }]
  }

  return []
}

function queryProgressMessageToSDKMessages(options: {
  conversationId: string
  getProgressProjectionEnvironment: () => {
    now: number
    remoteEnabled: boolean
  }
  message: QueryProgressMessage
  progressTrackingState: ToolProgressTrackingState
}): SDKMessage[] {
  const environment = options.getProgressProjectionEnvironment()
  const projection = projectProgressMessageToSDKMessageProjection(
    options.message,
    {
      now: environment.now,
      remoteEnabled: environment.remoteEnabled,
      sessionId: options.conversationId,
      trackingState: options.progressTrackingState,
    },
  )
  if (projection.trackingUpdate) {
    applyToolProgressTrackingUpdate(
      options.progressTrackingState,
      projection.trackingUpdate,
    )
  }
  return projection.messages
}

function queryAssistantMessageToSDKMessages(options: {
  conversationId: string
  message: QueryAssistantMessage
}): SDKMessage[] {
  return normalizeMessages([options.message as AssistantMessage])
    .filter(isNotEmptyMessage)
    .map(message => ({
      type: 'assistant',
      message: message.message,
      parent_tool_use_id: null,
      session_id: options.conversationId,
      uuid: message.uuid,
      error: message.error,
    }))
}

function queryUserMessageToSDKMessages(options: {
  conversationId: string
  message: QueryUserMessage
}): SDKMessage[] {
  return normalizeMessages([options.message as UserMessage]).map(message => ({
    type: 'user',
    message: message.message,
    parent_tool_use_id: null,
    session_id: options.conversationId,
    uuid: message.uuid,
    timestamp: message.timestamp,
    isSynthetic: message.isMeta || message.isVisibleInTranscriptOnly,
    tool_use_result: message.mcpMeta
      ? {
          content: message.toolUseResult,
          ...(message.mcpMeta as Record<string, unknown>),
        }
      : message.toolUseResult,
  }))
}

type QueryAssistantMessage = Message & {
  type: 'assistant'
  message: NonNullable<Message['message']>
}

function isQueryAssistantMessage(
  message: QueryTurnProjectionInput,
): message is QueryAssistantMessage {
  const record = message as Record<string, unknown>
  return (
    record.type === 'assistant' &&
    typeof record.message === 'object' &&
    record.message !== null
  )
}

type QueryUserMessage = Message & {
  type: 'user'
  message: NonNullable<Message['message']>
}

function isQueryUserMessage(
  message: QueryTurnProjectionInput,
): message is QueryUserMessage {
  const record = message as Record<string, unknown>
  return (
    record.type === 'user' &&
    typeof record.message === 'object' &&
    record.message !== null
  )
}

type QueryToolUseSummaryMessage = {
  type: 'tool_use_summary'
  summary: unknown
  precedingToolUseIds: unknown
  uuid?: string
}

function isQueryToolUseSummaryMessage(
  message: QueryTurnProjectionInput,
): message is QueryToolUseSummaryMessage {
  const record = message as Record<string, unknown>
  return record.type === 'tool_use_summary'
}

type QueryCompactBoundaryMessage = {
  type: 'system'
  subtype: 'compact_boundary'
  compactMetadata: CompactMetadata
  uuid?: string
}

function isQueryCompactBoundaryMessage(
  message: QueryTurnProjectionInput,
): message is QueryCompactBoundaryMessage {
  const record = message as Record<string, unknown>
  return (
    record.type === 'system' &&
    record.subtype === 'compact_boundary' &&
    typeof record.compactMetadata === 'object' &&
    record.compactMetadata !== null
  )
}

type QueryLocalCommandMessage = {
  type: 'system'
  subtype: 'local_command'
  content: string
  uuid: string
}

function isQueryLocalCommandMessage(
  message: QueryTurnProjectionInput,
): message is QueryLocalCommandMessage {
  const record = message as Record<string, unknown>
  return (
    record.type === 'system' &&
    record.subtype === 'local_command' &&
    typeof record.content === 'string' &&
    typeof record.uuid === 'string' &&
    (record.content.includes('<local-command-stdout>') ||
      record.content.includes('<local-command-stderr>'))
  )
}

type QueryQueuedCommandAttachmentMessage = {
  type: 'attachment'
  attachment: {
    type: 'queued_command'
    prompt: unknown
    source_uuid?: string
  }
  uuid?: string
  timestamp?: unknown
}

function isQueryQueuedCommandAttachmentMessage(
  message: QueryTurnProjectionInput,
): message is QueryQueuedCommandAttachmentMessage {
  const record = message as Record<string, unknown>
  const attachment = record.attachment as Record<string, unknown> | undefined
  return (
    record.type === 'attachment' &&
    attachment?.type === 'queued_command' &&
    'prompt' in attachment
  )
}

function isQueryProgressMessage(
  message: QueryTurnProjectionInput,
): message is QueryProgressMessage {
  const record = message as Record<string, unknown>
  return record.type === 'progress'
}

function isQuerySystemInitMessage(
  message: QueryTurnProjectionInput,
): message is QuerySystemInitMessage {
  const record = message as Record<string, unknown>
  return (
    record.type === 'query_system_init' &&
    typeof record.inputs === 'object' &&
    record.inputs !== null
  )
}

function isQueryUserReplayMessage(
  message: QueryTurnProjectionInput,
): message is QueryUserReplayMessage {
  const record = message as Record<string, unknown>
  return (
    record.type === 'query_user_replay' &&
    typeof record.message === 'object' &&
    record.message !== null
  )
}

type QueryAPIErrorMessage = {
  type: 'system'
  subtype: 'api_error'
  retryAttempt: unknown
  maxRetries: unknown
  retryInMs: unknown
  error: {
    status?: number | null
    [key: string]: unknown
  }
  uuid?: string
}

function isQueryAPIErrorMessage(
  message: QueryTurnProjectionInput,
): message is QueryAPIErrorMessage {
  const record = message as Record<string, unknown>
  return (
    record.type === 'system' &&
    record.subtype === 'api_error' &&
    typeof record.error === 'object' &&
    record.error !== null
  )
}
