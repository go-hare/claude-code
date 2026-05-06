import type { ProtocolMessage } from 'src/types/protocol/index.js'
import type { Message } from '../../../../types/message.js'
import type { SystemInitInputs } from '../../../../utils/messages/systemInit.js'
import type { KernelEvent } from '../../../contracts/events.js'
import type { LegacyTurnStreamItem } from '../TurnEngine.js'

export type QueryTurnMessageProjectionOptions = {
  includeCompatibility?: boolean
}

export type QueryTurnTerminalResult = {
  type: 'query_result'
  isError: boolean
  stopReason: string | null
  subtype?: string
  durationMs?: number
  durationApiMs?: number
  turnCount?: number
  usage?: Record<string, number>
  modelUsage?: Record<string, unknown>
  totalCostUsd?: number
  protocolMessage?: ProtocolMessage
}

export type QueryUserReplayMessage = {
  type: 'query_user_replay'
  message: Record<string, unknown>
  uuid?: string
  timestamp?: unknown
  isReplay?: boolean
  isSynthetic?: boolean
  parentToolUseId?: string | null
}

export type QuerySystemInitMessage = {
  type: 'query_system_init'
  inputs: SystemInitInputs
}

export type QueryStreamEventMessage = {
  type: 'stream_event'
  event: Record<string, unknown>
  session_id?: string
  parent_tool_use_id?: string | null
  uuid?: string
}

export type QueryProgressMessage = Message & {
  type: 'progress'
}

export type QueryTurnMessageProjection = {
  events: KernelEvent[]
  compatibilityMessages: ProtocolMessage[]
}

export type QueryTurnProjectionInput =
  | LegacyTurnStreamItem
  | QueryTurnTerminalResult
  | QuerySystemInitMessage
  | QueryUserReplayMessage
  | QueryStreamEventMessage
  | QueryProgressMessage
