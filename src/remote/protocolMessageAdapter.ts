import type {
  ProtocolAssistantMessage,
  ProtocolCompactBoundaryMessage,
  ProtocolMessage,
  ProtocolPartialAssistantMessage,
  ProtocolResultMessage,
  ProtocolStatusMessage,
  ProtocolSystemMessage,
  ProtocolToolProgressMessage,
  ProtocolUserMessage,
} from 'src/types/protocol/index.js'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
  SystemMessage,
} from '../types/message.js'
import { logForDebugging } from '../utils/debug.js'
import { fromProtocolCompactMetadata } from '../utils/messages/mappers.js'
import { createUserMessage } from '../utils/messages.js'

/**
 * Converts ProtocolMessage from CCR to REPL Message types.
 *
 * The CCR backend sends SDK-format messages via WebSocket. The REPL expects
 * internal Message types for rendering. This adapter bridges the two.
 */

/**
 * Convert an ProtocolAssistantMessage to an AssistantMessage
 */
function convertAssistantMessage(msg: ProtocolAssistantMessage): AssistantMessage {
  return {
    type: 'assistant',
    message: msg.message!,
    uuid: msg.uuid!,
    requestId: undefined,
    timestamp: new Date().toISOString(),
    error: msg.error,
  }
}

/**
 * Convert an ProtocolPartialAssistantMessage (streaming) to a StreamEvent
 */
function convertStreamEvent(msg: ProtocolPartialAssistantMessage): StreamEvent {
  return {
    type: 'stream_event',
    event: msg.event,
  }
}

/**
 * Convert an ProtocolResultMessage to a SystemMessage
 */
function convertResultMessage(msg: ProtocolResultMessage): SystemMessage {
  const isError = msg.subtype !== 'success'
  const content = isError
    ? msg.errors?.join(', ') || 'Unknown error'
    : 'Session completed successfully'

  return {
    type: 'system',
    subtype: 'informational',
    content,
    level: isError ? 'warning' : 'info',
    uuid: msg.uuid!,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Convert an ProtocolSystemMessage (init) to a SystemMessage
 */
function convertInitMessage(msg: ProtocolSystemMessage): SystemMessage {
  return {
    type: 'system',
    subtype: 'informational',
    content: `Remote session initialized (model: ${msg.model})`,
    level: 'info',
    uuid: msg.uuid!,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Convert an ProtocolStatusMessage to a SystemMessage
 */
function convertStatusMessage(msg: ProtocolStatusMessage): SystemMessage | null {
  if (!msg.status) {
    return null
  }

  return {
    type: 'system',
    subtype: 'informational',
    content:
      msg.status === 'compacting'
        ? 'Compacting conversation…'
        : `Status: ${msg.status}`,
    level: 'info',
    uuid: msg.uuid!,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Convert an ProtocolToolProgressMessage to a SystemMessage.
 * We use a system message instead of ProgressMessage since the Progress type
 * is a complex union that requires tool-specific data we don't have from CCR.
 */
function convertToolProgressMessage(
  msg: ProtocolToolProgressMessage,
): SystemMessage {
  return {
    type: 'system',
    subtype: 'informational',
    content: `Tool ${msg.tool_name} running for ${msg.elapsed_time_seconds}s…`,
    level: 'info',
    uuid: msg.uuid!,
    timestamp: new Date().toISOString(),
    toolUseID: msg.tool_use_id,
  }
}

/**
 * Convert an ProtocolCompactBoundaryMessage to a SystemMessage
 */
function convertCompactBoundaryMessage(
  msg: ProtocolCompactBoundaryMessage,
): SystemMessage {
  return {
    type: 'system',
    subtype: 'compact_boundary',
    content: 'Conversation compacted',
    level: 'info',
    uuid: msg.uuid!,
    timestamp: new Date().toISOString(),
    compactMetadata: fromProtocolCompactMetadata(msg.compact_metadata),
  }
}

/**
 * Result of converting an ProtocolMessage
 */
export type ConvertedMessage =
  | { type: 'message'; message: Message }
  | { type: 'stream_event'; event: StreamEvent }
  | { type: 'ignored' }

type ConvertOptions = {
  /** Convert user messages containing tool_result content blocks into UserMessages.
   * Used by direct connect mode where tool results come from the remote server
   * and need to be rendered locally. CCR mode ignores user messages since they
   * are handled differently. */
  convertToolResults?: boolean
  /**
   * Convert user text messages into UserMessages for display. Used when
   * converting historical events where user-typed messages need to be shown.
   * In live WS mode these are already added locally by the REPL so they're
   * ignored by default.
   */
  convertUserTextMessages?: boolean
}

/**
 * Convert an ProtocolMessage to REPL message format
 */
export function convertProtocolMessage(
  msg: ProtocolMessage,
  opts?: ConvertOptions,
): ConvertedMessage {
  switch (msg.type) {
    case 'assistant':
      return { type: 'message', message: convertAssistantMessage(msg as ProtocolAssistantMessage) }

    case 'user': {
      const userMsg = msg as ProtocolUserMessage
      const content = userMsg.message?.content
      // Tool result messages from the remote server need to be converted so
      // they render and collapse like local tool results. Detect via content
      // shape (tool_result blocks) — parent_tool_use_id is NOT reliable: the
      // agent-side normalizeMessage() hardcodes it to null for top-level
      // tool results, so it can't distinguish tool results from prompt echoes.
      const isToolResult =
        Array.isArray(content) && content.some(b => b.type === 'tool_result')
      if (opts?.convertToolResults && isToolResult) {
        return {
          type: 'message',
          message: createUserMessage({
            content,
            toolUseResult: userMsg.tool_use_result,
            uuid: userMsg.uuid,
            timestamp: userMsg.timestamp,
          }),
        }
      }
      // When converting historical events, user-typed messages need to be
      // rendered (they weren't added locally by the REPL). Skip tool_results
      // here — already handled above.
      if (opts?.convertUserTextMessages && !isToolResult) {
        if (typeof content === 'string' || Array.isArray(content)) {
          return {
            type: 'message',
            message: createUserMessage({
              content,
              toolUseResult: userMsg.tool_use_result,
              uuid: userMsg.uuid,
              timestamp: userMsg.timestamp,
            }),
          }
        }
      }
      // User-typed messages (string content) are already added locally by REPL.
      // In CCR mode, all user messages are ignored (tool results handled differently).
      return { type: 'ignored' }
    }

    case 'stream_event':
      return { type: 'stream_event', event: convertStreamEvent(msg as ProtocolPartialAssistantMessage) }

    case 'result':
      // Only show result messages for errors. Success results are noise
      // in multi-turn sessions (isLoading=false is sufficient signal).
      if ((msg as ProtocolResultMessage).subtype !== 'success') {
        return { type: 'message', message: convertResultMessage(msg as ProtocolResultMessage) }
      }
      return { type: 'ignored' }

    case 'system': {
      const sysMsg = msg as ProtocolSystemMessage
      if (sysMsg.subtype === 'init') {
        return { type: 'message', message: convertInitMessage(sysMsg) }
      }
      if (sysMsg.subtype === 'status') {
        const statusMsg = convertStatusMessage(msg as ProtocolStatusMessage)
        return statusMsg
          ? { type: 'message', message: statusMsg }
          : { type: 'ignored' }
      }
      if (sysMsg.subtype === 'compact_boundary') {
        return {
          type: 'message',
          message: convertCompactBoundaryMessage(msg as ProtocolCompactBoundaryMessage),
        }
      }
      // hook_response and other subtypes
      logForDebugging(
        `[protocolMessageAdapter] Ignoring system message subtype: ${sysMsg.subtype}`,
      )
      return { type: 'ignored' }
    }

    case 'tool_progress':
      return { type: 'message', message: convertToolProgressMessage(msg as ProtocolToolProgressMessage) }

    case 'auth_status':
      // Auth status is handled separately, not converted to a display message
      logForDebugging('[protocolMessageAdapter] Ignoring auth_status message')
      return { type: 'ignored' }

    case 'tool_use_summary':
      // Tool use summaries are SDK-only events, not displayed in REPL
      logForDebugging('[protocolMessageAdapter] Ignoring tool_use_summary message')
      return { type: 'ignored' }

    case 'rate_limit_event':
      // Rate limit events are SDK-only events, not displayed in REPL
      logForDebugging('[protocolMessageAdapter] Ignoring rate_limit_event message')
      return { type: 'ignored' }

    case 'task_state':
      // Bridge-only task snapshots are consumed by the web panel, not REPL UIs.
      logForDebugging('[protocolMessageAdapter] Ignoring task_state message')
      return { type: 'ignored' }

    default: {
      // Gracefully ignore unknown message types. The backend may send new
      // types before the client is updated; logging helps with debugging
      // without crashing or losing the session.
      logForDebugging(
        `[protocolMessageAdapter] Unknown message type: ${(msg as { type: string }).type}`,
      )
      return { type: 'ignored' }
    }
  }
}

/**
 * Check if an ProtocolMessage indicates the session has ended
 */
export function isSessionEndMessage(msg: ProtocolMessage): boolean {
  return msg.type === 'result'
}

/**
 * Check if an ProtocolResultMessage indicates success
 */
export function isSuccessResult(msg: ProtocolResultMessage): boolean {
  return msg.subtype === 'success'
}

/**
 * Extract the result text from a successful ProtocolResultMessage
 */
export function getResultText(msg: ProtocolResultMessage): string | null {
  if (msg.subtype === 'success') {
    return msg.result ?? null
  }
  return null
}
