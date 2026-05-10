import { randomUUID, type UUID } from 'crypto'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import { EMPTY_USAGE } from '@ant/model-provider'
import type { AgentContent, AgentEvent, AgentInput, AgentUsage } from 'src/core/types.js'
import type { StdoutMessage } from 'src/entrypoints/sdk/controlTypes.js'

function textFromContent(content: AgentContent[]): string {
  return content
    .filter((part): part is Extract<AgentContent, { type: 'text' }> => part.type === 'text')
    .map(part => part.text)
    .join('')
}

function toAgentContent(block: ContentBlockParam): AgentContent | undefined {
  if (block.type === 'text') {
    return { type: 'text', text: block.text }
  }
  if (block.type === 'image') {
    return { type: 'image', source: block.source }
  }
  return undefined
}

export function contentBlocksToAgentInput(
  blocks: ContentBlockParam[],
): AgentInput {
  const content = blocks
    .map(toAgentContent)
    .filter((part): part is AgentContent => part !== undefined)
  return { content }
}

function toContentBlock(content: AgentContent): Record<string, unknown> {
  if (content.type === 'text') {
    return { type: 'text', text: content.text }
  }
  if (content.type === 'image') {
    return { type: 'image', source: content.source }
  }
  return {
    type: 'text',
    text: content.text ?? content.uri,
  }
}

function toSdkUsage(usage: AgentUsage | undefined): typeof EMPTY_USAGE {
  if (!usage) return EMPTY_USAGE
  return {
    ...EMPTY_USAGE,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cache_read_input_tokens: usage.cacheReadInputTokens ?? 0,
    cache_creation_input_tokens: usage.cacheCreationInputTokens ?? 0,
  }
}

function eventUuid(): UUID {
  return randomUUID() as UUID
}

function resultOutput(output: unknown): string {
  return typeof output === 'string' ? output : output === undefined ? '' : String(output)
}

export function promptValueToAgentInput(
  prompt: string | ContentBlockParam[],
): AgentInput {
  if (typeof prompt === 'string') {
    return { content: [{ type: 'text', text: prompt }] }
  }

  return contentBlocksToAgentInput(prompt)
}

export function agentEventToHeadlessMessages(event: AgentEvent): StdoutMessage[] {
  switch (event.type) {
    case 'message.started':
      return [
        {
          type: 'stream_event',
          event: {
            type: 'message_start',
            message: {
              id: event.messageId,
              role: event.role,
              content: [],
            },
          },
          parent_tool_use_id: null,
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'message.delta':
      return [
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: event.text },
          },
          parent_tool_use_id: null,
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'message.thinking_delta':
      return [
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'thinking_delta', thinking: event.text },
          },
          parent_tool_use_id: null,
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'message.citation_delta':
      return [
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: {
              type: 'citations_delta',
              citation: event.citation.metadata?.citation ?? event.citation,
            },
          },
          parent_tool_use_id: null,
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'message.completed':
      return [
        {
          type: event.message.role,
          message: {
            role: event.message.role,
            content:
              event.message.role === 'user'
                ? textFromContent(event.message.content)
                : event.message.content.map(toContentBlock),
            id: event.message.id,
            stop_reason: event.message.stopReason,
            model: event.message.model,
            usage: event.message.usage ? toSdkUsage(event.message.usage) : undefined,
          },
          content: textFromContent(event.message.content),
          parent_tool_use_id: null,
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'tool.requested':
      return [
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: {
              id: event.toolCall.id,
              type: 'tool_use',
              name: event.toolCall.name,
              input: event.toolCall.input,
            },
          },
          parent_tool_use_id: event.toolCall.parentToolCallId ?? null,
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'tool.input_delta':
      return [
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            content_block: { id: event.toolCallId },
            delta: { type: 'input_json_delta', partial_json: event.delta },
          },
          parent_tool_use_id: null,
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'tool.progress':
      return [
        {
          type: 'tool_progress',
          tool_use_id: event.toolCallId,
          tool_name:
            typeof event.progress.metadata?.toolName === 'string'
              ? event.progress.metadata.toolName
              : 'tool',
          parent_tool_use_id: null,
          elapsed_time_seconds: event.progress.elapsedTimeSeconds ?? 0,
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'context.compacted':
      return [
        {
          type: 'system',
          subtype: 'compact_boundary',
          compact_metadata: event.metadata?.metadata ?? {},
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'error.retrying':
      return [
        {
          type: 'system',
          subtype: 'api_error',
          error: event.error.message,
          retryAttempt: event.attempt,
          maxRetries: event.maxRetries,
          retryInMs: event.retryDelayMs,
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'turn.completed':
      return [
        {
          type: 'result',
          subtype: 'success',
          duration_ms: event.result.durationMs ?? 0,
          duration_api_ms: event.result.durationApiMs ?? 0,
          is_error: false,
          num_turns: event.result.numTurns ?? 1,
          result: resultOutput(event.result.output),
          stop_reason: event.result.stopReason,
          total_cost_usd: event.result.totalCostUsd ?? event.result.usage?.costUsd ?? 0,
          usage: toSdkUsage(event.result.usage),
          modelUsage: event.result.modelUsage ?? {},
          permission_denials: event.result.permissionDenials ?? [],
          structured_output: event.result.structuredOutput,
          fast_mode_state: event.result.fastModeState,
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'turn.failed':
      return [
        {
          type: 'result',
          subtype:
            event.error.code === 'MAX_TURNS_REACHED'
              ? 'error_max_turns'
              : 'error_during_execution',
          duration_ms: 0,
          duration_api_ms: 0,
          is_error: true,
          num_turns: 1,
          stop_reason: null,
          total_cost_usd: 0,
          usage: EMPTY_USAGE,
          modelUsage: {},
          permission_denials: [],
          errors: [event.error.message],
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    case 'turn.cancelled':
      return [
        {
          type: 'result',
          subtype: 'error_during_execution',
          duration_ms: 0,
          duration_api_ms: 0,
          is_error: true,
          num_turns: 1,
          stop_reason: null,
          total_cost_usd: 0,
          usage: EMPTY_USAGE,
          modelUsage: {},
          permission_denials: [],
          errors: [event.reason ?? 'cancelled'],
          uuid: eventUuid(),
          session_id: event.sessionId,
        } as unknown as StdoutMessage,
      ]
    default:
      return []
  }
}
