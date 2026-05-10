import type { SDKMessage } from '../../entrypoints/sdk/coreTypes.generated.js'
import type { StdoutMessage } from '../../entrypoints/sdk/controlTypes.js'
import type { AgentEvent, AgentEventPayload } from '../types.js'
import { projectQueryEventToAgentEvents } from './queryToAgentEvents.js'
import { agentEventToHeadlessMessages } from '../../hosts/headless/agentEventOutput.js'

const sourceSdkMessage = Symbol('sourceSdkMessage')

export type SourceSdkEventPayload = AgentEventPayload & {
  [sourceSdkMessage]?: SDKMessage
}

export function attachSourceSdkMessage(
  payload: AgentEventPayload,
  message: SDKMessage,
): AgentEventPayload {
  ;(payload as SourceSdkEventPayload)[sourceSdkMessage] = message
  return payload
}

export function getSourceSdkMessage(event: AgentEvent): SDKMessage | undefined {
  return (event as SourceSdkEventPayload)[sourceSdkMessage]
}

export function projectSdkMessageToAgentEventPayloads(
  message: SDKMessage,
  context: { sessionId: string; turnId: string },
): AgentEventPayload[] {
  return projectQueryEventToAgentEvents(message, context).map(payload =>
    attachSourceSdkMessage(payload, message),
  )
}

export function agentEventToSdkMessages(event: AgentEvent): SDKMessage[] {
  const source = getSourceSdkMessage(event)
  if (source) return [source]
  return agentEventToHeadlessMessages(event).map(
    message => message as unknown as SDKMessage,
  )
}

export function agentEventToStdoutMessages(event: AgentEvent): StdoutMessage[] {
  return agentEventToSdkMessages(event).map(
    message => message as unknown as StdoutMessage,
  )
}
