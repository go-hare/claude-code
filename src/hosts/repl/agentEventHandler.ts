import type {
  Message,
  RequestStartEvent,
  StreamEvent,
  TombstoneMessage,
  ToolUseSummaryMessage,
} from '../../types/message.js'
import type { AgentEvent } from '../../core/types.js'
import {
  agentEventToSdkMessages,
  getSourceSdkMessage,
} from '../../core/adapters/agentEventSdkWire.js'
import {
  createAssistantMessage,
  createSystemMessage,
} from '../../utils/messages.js'

export type ReplQueryEvent =
  | Message
  | TombstoneMessage
  | StreamEvent
  | RequestStartEvent
  | ToolUseSummaryMessage

export function agentEventToReplQueryEvents(
  event: AgentEvent,
): ReplQueryEvent[] {
  const source = getSourceSdkMessage(event)
  if (source) return [source as unknown as ReplQueryEvent]

  switch (event.type) {
    case 'turn.started':
      return []
    case 'message.delta':
      return [
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: event.text },
          },
        },
      ]
    case 'message.thinking_delta':
      return [
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'thinking_delta', thinking: event.text },
          },
        },
      ]
    case 'message.completed':
      if (event.message.role === 'assistant') {
        return [
          createAssistantMessage({
            content: event.message.content
              .map(content =>
                content.type === 'text'
                  ? content.text
                  : content.type === 'resource'
                    ? (content.text ?? content.uri)
                    : '',
              )
              .filter(Boolean)
              .join('\n'),
            usage: event.message.usage
              ? {
                  input_tokens: event.message.usage.inputTokens,
                  output_tokens: event.message.usage.outputTokens,
                  cache_read_input_tokens:
                    event.message.usage.cacheReadInputTokens ?? 0,
                  cache_creation_input_tokens:
                    event.message.usage.cacheCreationInputTokens ?? 0,
                  cache_creation: {
                    ephemeral_1h_input_tokens: 0,
                    ephemeral_5m_input_tokens: 0,
                  },
                  server_tool_use: {
                    web_search_requests: 0,
                    web_fetch_requests: 0,
                  },
                  service_tier: 'standard',
                  inference_geo: null,
                  iterations: null,
                  speed: 'standard',
                }
              : undefined,
          }),
        ]
      }
      return []
    case 'context.compacted':
    case 'error.retrying':
    case 'turn.failed':
    case 'turn.cancelled':
      return agentEventToSdkMessages(event) as unknown as ReplQueryEvent[]
    case 'error.raised':
      return [
        createSystemMessage(
          event.error.message,
          event.error.retryable ? 'warning' : 'error',
        ),
      ]
    default:
      return []
  }
}
