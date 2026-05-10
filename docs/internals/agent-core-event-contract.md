# Agent Core Event Contract

## 口径

Agent Core 的目标是建立一条新的唯一执行与事件主线，而不是继续扩展
`kernel` / `runtime wire` / `compat projection`。

本文只定义事件合同，不定义具体实现步骤。后续代码改造必须以本文为准。

核心规则：

- `AgentEvent` 是 Agent Core 唯一 core event protocol。
- `SDKMessage`、`stream-json`、ACP `SessionUpdate`、Ink render state、微信回复、Chrome 扩展消息、HTTP/SSE/WebSocket packet 都是 host / adapter 输出，不是 core contract。
- raw provider stream event 不外露；core 只暴露语义事件。
- channel 不直接消费 core。微信、Chrome、Web UI、Telegram、Slack 等属于 channel layer；真正消费 core 的是 host / adapter layer。

目标分层：

```text
Channel Layer
  WeChat / Chrome Extension / Web UI / Telegram / Slack
        |
        v
Host / Adapter Layer
  CLI / Headless / ACP / HTTP / Desktop / Direct Connect
        |
        v
Agent Core
  createAgent() / AgentSession / AgentEvent
        |
        v
Engine Assets
  query.ts / tools / providers / MCP / config / session storage
```

## Event Envelope

所有事件共享同一 envelope。事件类型本身只表达执行语义，不表达传输格式。

```ts
export type AgentEventBase = {
  id: string
  sequence: number
  timestamp: string
  sessionId?: string
  turnId?: string
  parentId?: string
}

export type AgentEvent = AgentEventBase & AgentEventPayload
```

字段语义：

- `id`：事件唯一 ID。
- `sequence`：同一 session 内单调递增序号。
- `timestamp`：ISO 时间戳。
- `sessionId`：Agent session ID。
- `turnId`：用户一次输入触发的一轮执行 ID。
- `parentId`：用于表达子任务、子 agent、工具调用、嵌套事件的父事件或父调用。

## Event Payload

当前最终版事件集如下。

```ts
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
```

## Supporting Types

```ts
export type AgentRole = 'user' | 'assistant' | 'system'

export type AgentInput = {
  content: AgentContent[]
  metadata?: Record<string, unknown>
}

export type AgentContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: unknown }
  | { type: 'resource'; uri: string; name?: string; text?: string }

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

export type AgentPermissionRequest = {
  id: string
  toolCallId?: string
  toolName: string
  input: unknown
  options: AgentPermissionOption[]
}

export type AgentPermissionOption = {
  id: string
  label: string
  behavior: 'allow' | 'deny' | 'ask'
  metadata?: Record<string, unknown>
}

export type AgentPermissionDecision = {
  behavior: 'allow' | 'deny' | 'ask'
  updatedPermissions?: unknown
}

export type AgentUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  costUsd?: number
  contextWindow?: number
}

export type AgentTurnResult = {
  stopReason: string | null
  isError: boolean
  output?: unknown
  usage?: AgentUsage
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

export type AgentPlan = {
  entries: AgentPlanEntry[]
  metadata?: Record<string, unknown>
}

export type AgentPlanEntry = {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: 'low' | 'medium' | 'high'
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
```

## Source Mapping

当前代码中的事件来源必须映射到 `AgentEvent`，而不是继续成为新的 core contract。

| Current source | Core mapping |
| --- | --- |
| `query()` `stream_request_start` | `request.started` |
| raw `message_start` / `content_block_start` | `message.started` / `tool.requested` |
| raw `text_delta` | `message.delta` |
| raw `thinking_delta` | `message.thinking_delta` |
| raw `citations_delta` | `message.citation_delta` |
| raw `input_json_delta` | `tool.input_delta` |
| assistant `Message` | `message.completed` |
| user replay / accepted prompt | `turn.input_accepted` or `message.completed` with `role: 'user'` |
| `tombstone` | `message.tombstone` |
| tool progress messages | `tool.progress` |
| tool result blocks | `tool.completed` or `tool.failed` |
| permission prompt lifecycle | `permission.requested` / `permission.resolved` |
| `compact_boundary` | `context.compacted` |
| compaction stream content | `context.compaction_delta` |
| API retry system message | `error.retrying` |
| `result` success | `turn.completed` plus `usage.updated` |
| `result` error | `turn.failed` plus `usage.updated` |
| ACP `plan` update | `plan.updated` |
| ACP terminal output metadata | `terminal.output` / `terminal.exit` |

## Adapter Boundary

Adapters may project `AgentEvent` into their own output formats:

- headless host may project to `text`, `json`, or `stream-json`.
- ACP host may project to ACP `SessionUpdate`.
- REPL host may project to Ink message state.
- direct-connect / remote-control may project to WebSocket or SSE packets.
- channel adapters such as WeChat may project to channel-specific replies.

Adapters must not define additional core event kinds. If an adapter needs a new
semantic event, the event must be added to this contract first.

## Non-Goals

This contract deliberately does not define:

- transport framing;
- JSON-RPC / wire protocol;
- stdout line format;
- ACP-specific payload shape;
- Ink rendering state;
- channel-specific card or reply schema;
- provider raw stream event passthrough.

