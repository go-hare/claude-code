export type AgentEventBase = {
  id: string
  sequence: number
  timestamp: string
  sessionId?: string
  turnId?: string
  parentId?: string
}

export type AgentRole = 'user' | 'assistant' | 'system'

export type AgentContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: unknown }
  | { type: 'resource'; uri: string; name?: string; text?: string }

export type AgentInput = {
  content: AgentContent[]
  metadata?: Record<string, unknown>
}

export type AgentUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  costUsd?: number
  contextWindow?: number
}

export type AgentMessage = {
  id: string
  role: AgentRole
  content: AgentContent[]
  stopReason?: string | null
  model?: string
  usage?: AgentUsage
}

export type AgentToolCall = {
  id: string
  name: string
  input: unknown
  parentToolCallId?: string | null
}

export type AgentToolProgress = {
  message?: string
  elapsedTimeSeconds?: number
  metadata?: Record<string, unknown>
}

export type AgentToolResult = {
  content: AgentContent[]
  isError?: boolean
  metadata?: Record<string, unknown>
}

export type AgentPermissionOption = {
  id: string
  label: string
  behavior: 'allow' | 'deny' | 'ask'
  metadata?: Record<string, unknown>
}

export type AgentPermissionRequest = {
  id: string
  toolCallId?: string
  toolName: string
  input: unknown
  options: AgentPermissionOption[]
}

export type AgentPermissionDecision = {
  behavior: 'allow' | 'deny' | 'ask'
  updatedPermissions?: unknown
}

export type AgentTurnResult = {
  stopReason: string | null
  isError: boolean
  output?: unknown
  usage?: AgentUsage
  durationMs?: number
  durationApiMs?: number
  numTurns?: number
  totalCostUsd?: number
  modelUsage?: Record<string, unknown>
  permissionDenials?: unknown[]
  structuredOutput?: unknown
  fastModeState?: unknown
}

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'waiting_for_permission'
  | 'compacting'
  | 'cancelled'
  | 'completed'
  | 'failed'

export type AgentCitation = {
  url?: string
  title?: string
  citedText?: string
  metadata?: Record<string, unknown>
}

export type AgentPlanEntry = {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: 'low' | 'medium' | 'high'
}

export type AgentPlan = {
  entries: AgentPlanEntry[]
  metadata?: Record<string, unknown>
}

export type AgentCompactionMetadata = {
  trigger?: string
  summary?: string
  metadata?: Record<string, unknown>
}

export type AgentError = {
  message: string
  code?: string
  retryable?: boolean
  cause?: unknown
  metadata?: Record<string, unknown>
}

export type AgentEventPayload =
  | { type: 'request.started'; requestId: string }
  | { type: 'session.started'; sessionId: string; cwd: string }
  | { type: 'session.resumed'; sessionId: string; cwd: string }
  | { type: 'session.closed'; sessionId: string; reason?: string }
  | { type: 'turn.started'; sessionId: string; turnId: string; input: AgentInput }
  | { type: 'turn.input_accepted'; sessionId: string; turnId: string; messageId: string }
  | { type: 'turn.completed'; sessionId: string; turnId: string; result: AgentTurnResult }
  | { type: 'turn.failed'; sessionId: string; turnId: string; error: AgentError }
  | { type: 'turn.cancelled'; sessionId: string; turnId: string; reason?: string }
  | { type: 'message.started'; sessionId: string; turnId: string; messageId: string; role: AgentRole }
  | { type: 'message.delta'; sessionId: string; turnId: string; messageId: string; text: string }
  | { type: 'message.thinking_delta'; sessionId: string; turnId: string; messageId: string; text: string }
  | { type: 'message.citation_delta'; sessionId: string; turnId: string; messageId: string; citation: AgentCitation }
  | { type: 'message.completed'; sessionId: string; turnId: string; message: AgentMessage }
  | { type: 'message.tombstone'; sessionId: string; turnId: string; messageId: string }
  | { type: 'tool.requested'; sessionId: string; turnId: string; toolCall: AgentToolCall }
  | { type: 'tool.input_delta'; sessionId: string; turnId: string; toolCallId: string; delta: string }
  | { type: 'tool.started'; sessionId: string; turnId: string; toolCallId: string }
  | { type: 'tool.progress'; sessionId: string; turnId: string; toolCallId: string; progress: AgentToolProgress }
  | { type: 'tool.completed'; sessionId: string; turnId: string; toolCallId: string; result: AgentToolResult }
  | { type: 'tool.failed'; sessionId: string; turnId: string; toolCallId: string; error: AgentError }
  | { type: 'permission.requested'; sessionId: string; turnId: string; request: AgentPermissionRequest }
  | { type: 'permission.resolved'; sessionId: string; turnId: string; requestId: string; decision: AgentPermissionDecision }
  | { type: 'plan.updated'; sessionId: string; turnId: string; plan: AgentPlan }
  | { type: 'terminal.output'; sessionId: string; turnId: string; terminalId: string; stream: 'stdout' | 'stderr'; data: string }
  | { type: 'terminal.exit'; sessionId: string; turnId: string; terminalId: string; exitCode: number | null; signal?: string | null }
  | { type: 'usage.updated'; sessionId: string; turnId?: string; usage: AgentUsage }
  | { type: 'status.changed'; sessionId: string; turnId?: string; status: AgentStatus }
  | { type: 'context.compacting'; sessionId: string; turnId: string }
  | { type: 'context.compaction_delta'; sessionId: string; turnId: string; text: string }
  | { type: 'context.compacted'; sessionId: string; turnId: string; metadata?: AgentCompactionMetadata }
  | { type: 'error.retrying'; sessionId: string; turnId: string; error: AgentError; attempt: number; maxRetries: number; retryDelayMs: number }
  | { type: 'error.raised'; sessionId: string; turnId?: string; error: AgentError }

export type AgentEvent = AgentEventBase & AgentEventPayload

export type AgentEventListener = (event: AgentEvent) => void

export type AgentEventReplayOptions = {
  sinceSequence?: number
  limit?: number
}

export type AgentTurnExecutionContext = {
  sessionId: string
  turnId: string
  cwd: string
}

export type AgentTurnExecutor = (
  input: AgentInput,
  context: AgentTurnExecutionContext,
) => AsyncIterable<AgentEventPayload>

export type AgentSessionOptions = {
  id?: string
  cwd: string
  executor?: AgentTurnExecutor
}

export type AgentCoreOptions = {
  cwd: string
  executor?: AgentTurnExecutor
}
