import type {
  AgentSideConnection,
  ClientCapabilities,
  StopReason,
} from '@agentclientprotocol/sdk'
import type { SDKMessage } from '../../entrypoints/sdk/coreTypes.generated.js'
import type { AgentEvent, AgentEventPayload } from '../../core/types.js'
import {
  agentEventToSdkMessages,
  attachSourceSdkMessage,
} from '../../core/adapters/agentEventSdkWire.js'
import { forwardSessionUpdates, type SessionUsage, type ToolUseCache } from './bridge.js'

export function attachAcpSourceMessage(
  payload: AgentEventPayload,
  message: SDKMessage,
): AgentEventPayload {
  return attachSourceSdkMessage(payload, message)
}

async function* agentEventsToSdkMessages(
  events: AsyncIterable<AgentEvent>,
): AsyncGenerator<SDKMessage, void, unknown> {
  for await (const event of events) {
    for (const message of agentEventToSdkMessages(event)) {
      yield message
    }
  }
}

export function streamAgentEventsToAcpSessionUpdates(
  sessionId: string,
  events: AsyncIterable<AgentEvent>,
  conn: AgentSideConnection,
  abortSignal: AbortSignal,
  toolUseCache: ToolUseCache,
  clientCapabilities?: ClientCapabilities,
  cwd?: string,
  isCancelled?: () => boolean,
): Promise<{ stopReason: StopReason; usage?: SessionUsage }> {
  return forwardSessionUpdates(
    sessionId,
    agentEventsToSdkMessages(events),
    conn,
    abortSignal,
    toolUseCache,
    clientCapabilities,
    cwd,
    isCancelled,
  )
}
