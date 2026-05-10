import type {
  AgentContent,
  AgentEventPayload,
  AgentMessage,
  AgentToolResult,
  AgentUsage,
} from '../types.js'

export type QueryToAgentEventContext = {
  sessionId: string
  turnId: string
}

type QueryLikeEvent = {
  type: string
  [key: string]: unknown
}

type StreamEventMessage = QueryLikeEvent & {
  type: 'stream_event'
  event: {
    type?: string
    index?: number
    message?: { id?: string; role?: string; usage?: unknown }
    content_block?: {
      id?: string
      type?: string
      name?: string
      input?: unknown
      text?: string
      thinking?: string
    }
    delta?: {
      type?: string
      text?: string
      thinking?: string
      partial_json?: string
      citation?: unknown
      citations?: unknown
      stop_reason?: string | null
    }
    usage?: unknown
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>
  }
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function getMessageId(message: QueryLikeEvent): string {
  return stringValue(message.uuid) ?? stringValue(message.id) ?? 'message'
}

function getToolCallId(block: Record<string, unknown> | undefined): string {
  return stringValue(block?.id) ?? 'tool-call'
}

function toAgentUsage(value: unknown): AgentUsage | undefined {
  const usage = asRecord(value)
  if (!usage) return undefined

  const inputTokens = numberValue(usage.input_tokens) ?? 0
  const outputTokens = numberValue(usage.output_tokens) ?? 0
  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens: numberValue(usage.cache_read_input_tokens),
    cacheCreationInputTokens: numberValue(usage.cache_creation_input_tokens),
  }
}

function toAgentContent(content: unknown): AgentContent[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  if (!Array.isArray(content)) {
    return []
  }

  const result: AgentContent[] = []
  for (const block of content) {
    const record = asRecord(block)
    if (!record) continue
    switch (record.type) {
      case 'text':
        result.push({ type: 'text', text: stringValue(record.text) ?? '' })
        break
      case 'image':
        result.push({ type: 'image', source: record.source ?? record })
        break
      default:
        if (typeof record.text === 'string') {
          result.push({ type: 'text', text: record.text })
        }
        break
    }
  }
  return result
}

function toAgentMessage(message: QueryLikeEvent): AgentMessage | undefined {
  const inner = asRecord(message.message)
  if (!inner) return undefined

  const role = stringValue(inner.role)
  if (role !== 'user' && role !== 'assistant' && role !== 'system') {
    return undefined
  }

  return {
    id: getMessageId(message),
    role,
    content: toAgentContent(inner.content),
    stopReason:
      inner.stop_reason === null || typeof inner.stop_reason === 'string'
        ? inner.stop_reason
        : undefined,
    model: stringValue(inner.model),
    usage: toAgentUsage(inner.usage),
  }
}

function toToolResult(message: QueryLikeEvent): AgentToolResult {
  const inner = asRecord(message.message)
  return {
    content: toAgentContent(inner?.content),
    isError: Boolean(message.isError ?? message.is_error),
    metadata: {
      sourceMessageId: getMessageId(message),
    },
  }
}

function projectStreamEvent(
  message: StreamEventMessage,
  context: QueryToAgentEventContext,
): AgentEventPayload[] {
  const event = message.event
  const payloads: AgentEventPayload[] = []

  switch (event.type) {
    case 'message_start': {
      const messageId = stringValue(event.message?.id) ?? getMessageId(message)
      payloads.push({
        type: 'message.started',
        sessionId: context.sessionId,
        turnId: context.turnId,
        messageId,
        role: 'assistant',
      })
      const usage = toAgentUsage(event.message?.usage)
      if (usage) {
        payloads.push({
          type: 'usage.updated',
          sessionId: context.sessionId,
          turnId: context.turnId,
          usage,
        })
      }
      break
    }
    case 'content_block_start': {
      const block = asRecord(event.content_block)
      if (
        block?.type === 'tool_use' ||
        block?.type === 'server_tool_use' ||
        block?.type === 'mcp_tool_use'
      ) {
        payloads.push({
          type: 'tool.requested',
          sessionId: context.sessionId,
          turnId: context.turnId,
          toolCall: {
            id: getToolCallId(block),
            name: stringValue(block.name) ?? 'unknown',
            input: block.input ?? {},
          },
        })
      }
      break
    }
    case 'content_block_delta': {
      const delta = event.delta
      switch (delta?.type) {
        case 'text_delta':
          payloads.push({
            type: 'message.delta',
            sessionId: context.sessionId,
            turnId: context.turnId,
            messageId: getMessageId(message),
            text: delta.text ?? '',
          })
          break
        case 'thinking_delta':
          payloads.push({
            type: 'message.thinking_delta',
            sessionId: context.sessionId,
            turnId: context.turnId,
            messageId: getMessageId(message),
            text: delta.thinking ?? '',
          })
          break
        case 'input_json_delta': {
          const block = asRecord(event.content_block)
          payloads.push({
            type: 'tool.input_delta',
            sessionId: context.sessionId,
            turnId: context.turnId,
            toolCallId: getToolCallId(block),
            delta: delta.partial_json ?? '',
          })
          break
        }
        case 'citations_delta':
          payloads.push({
            type: 'message.citation_delta',
            sessionId: context.sessionId,
            turnId: context.turnId,
            messageId: getMessageId(message),
            citation: {
              metadata: { citation: delta.citation ?? delta.citations ?? delta },
            },
          })
          break
      }
      break
    }
    case 'message_delta': {
      const usage = toAgentUsage(event.usage)
      if (usage) {
        payloads.push({
          type: 'usage.updated',
          sessionId: context.sessionId,
          turnId: context.turnId,
          usage,
        })
      }
      break
    }
  }

  return payloads
}

export function projectQueryEventToAgentEvents(
  message: QueryLikeEvent,
  context: QueryToAgentEventContext,
): AgentEventPayload[] {
  switch (message.type) {
    case 'stream_request_start':
      return [{ type: 'request.started', requestId: `${context.turnId}:request` }]
    case 'stream_event':
      return projectStreamEvent(message as StreamEventMessage, context)
    case 'assistant': {
      const agentMessage = toAgentMessage(message)
      return agentMessage
        ? [
            {
              type: 'message.completed',
              sessionId: context.sessionId,
              turnId: context.turnId,
              message: agentMessage,
            },
          ]
        : []
    }
    case 'user': {
      const agentMessage = toAgentMessage(message)
      if (!agentMessage) return []
      const messageId = agentMessage.id
      return [
        {
          type: 'turn.input_accepted',
          sessionId: context.sessionId,
          turnId: context.turnId,
          messageId,
        },
        {
          type: 'message.completed',
          sessionId: context.sessionId,
          turnId: context.turnId,
          message: agentMessage,
        },
      ]
    }
    case 'progress':
      return [
        {
          type: 'tool.progress',
          sessionId: context.sessionId,
          turnId: context.turnId,
          toolCallId: stringValue(message.parentToolUseID) ?? getMessageId(message),
          progress: {
            message: stringValue(asRecord(message.data)?.message),
            elapsedTimeSeconds: numberValue(asRecord(message.data)?.elapsedTimeSeconds),
            metadata: asRecord(message.data),
          },
        },
      ]
    case 'tombstone': {
      const tombstone = asRecord(message.message)
      return [
        {
          type: 'message.tombstone',
          sessionId: context.sessionId,
          turnId: context.turnId,
          messageId: stringValue(tombstone?.uuid) ?? getMessageId(message),
        },
      ]
    }
    case 'system': {
      if (message.subtype === 'compact_boundary') {
        return [
          {
            type: 'context.compacted',
            sessionId: context.sessionId,
            turnId: context.turnId,
            metadata: { metadata: asRecord(message.compactMetadata) },
          },
        ]
      }
      if (message.subtype === 'api_error') {
        return [
          {
            type: 'error.retrying',
            sessionId: context.sessionId,
            turnId: context.turnId,
            error: {
              message: stringValue(message.error) ?? 'API request failed',
              cause: message.error,
            },
            attempt: numberValue(message.retryAttempt) ?? 0,
            maxRetries: numberValue(message.maxRetries) ?? 0,
            retryDelayMs: numberValue(message.retryInMs) ?? 0,
          },
        ]
      }
      return []
    }
    case 'attachment': {
      const attachment = asRecord(message.attachment)
      if (attachment?.type === 'max_turns_reached') {
        return [
          {
            type: 'turn.failed',
            sessionId: context.sessionId,
            turnId: context.turnId,
            error: {
              message: `Reached maximum number of turns (${String(
                attachment.maxTurns ?? 'unknown',
              )})`,
              code: 'MAX_TURNS_REACHED',
              metadata: attachment,
            },
          },
        ]
      }
      return []
    }
    case 'tool_use_summary':
      return [
        {
          type: 'tool.progress',
          sessionId: context.sessionId,
          turnId: context.turnId,
          toolCallId: getMessageId(message),
          progress: {
            message: 'Tool use summary updated',
            metadata: {
              summary: message.summary,
              precedingToolUseIds: message.precedingToolUseIds,
            },
          },
        },
      ]
    case 'result': {
      const usage = toAgentUsage(message.usage)
      const terminal: AgentEventPayload =
        message.is_error === true
          ? {
              type: 'turn.failed',
              sessionId: context.sessionId,
              turnId: context.turnId,
              error: {
                message: Array.isArray(message.errors)
                  ? message.errors.join('\n')
                  : 'Turn failed',
                code: stringValue(message.subtype),
                metadata: asRecord(message),
              },
            }
          : {
              type: 'turn.completed',
              sessionId: context.sessionId,
              turnId: context.turnId,
            result: {
              stopReason:
                message.stop_reason === null ||
                typeof message.stop_reason === 'string'
                  ? message.stop_reason
                  : null,
              isError: false,
              output: message.result,
              usage,
              durationMs: numberValue(message.duration_ms),
              durationApiMs: numberValue(message.duration_api_ms),
              numTurns: numberValue(message.num_turns),
              totalCostUsd: numberValue(message.total_cost_usd),
              modelUsage: asRecord(message.modelUsage),
              permissionDenials: Array.isArray(message.permission_denials)
                ? message.permission_denials
                : undefined,
              structuredOutput: message.structured_output,
              fastModeState: message.fast_mode_state,
            },
          }
      return usage
        ? [
            {
              type: 'usage.updated',
              sessionId: context.sessionId,
              turnId: context.turnId,
              usage,
            },
            terminal,
          ]
        : [terminal]
    }
    default:
      return []
  }
}

export function projectToolResultMessageToAgentEvent(
  message: QueryLikeEvent,
  context: QueryToAgentEventContext,
  toolCallId: string,
): AgentEventPayload {
  const result = toToolResult(message)
  return result.isError
    ? {
        type: 'tool.failed',
        sessionId: context.sessionId,
        turnId: context.turnId,
        toolCallId,
        error: {
          message: 'Tool call failed',
          metadata: result.metadata,
        },
      }
    : {
        type: 'tool.completed',
        sessionId: context.sessionId,
        turnId: context.turnId,
        toolCallId,
        result,
      }
}
