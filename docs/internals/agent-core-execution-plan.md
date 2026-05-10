# Agent Core Execution Plan

## 目标

本文定义在当前 `core-clean` 分支上建设完整 Agent Core 的执行方案。

目标不是新增一个薄 wrapper，也不是继续扩展旧 kernel façade。目标是建立新的唯一执行内核：

```text
Host / Adapter
  -> AgentCore
  -> AgentSession
  -> AgentTurn
  -> query()
  -> AgentEventBus
  -> AgentEvent
```

最终状态：

- `src/core` 是执行、session、event、permission、context、state 的 ownership 中心。
- `query.ts` / provider / tools / MCP / session storage 是 engine assets，由 core 调用。
- CLI、headless、REPL、ACP、direct-connect、desktop、HTTP 都是 host / adapter。
- `AgentEvent` 是唯一 core event protocol。
- `SDKMessage`、`stream-json`、ACP `SessionUpdate`、Ink render state、channel reply 都是 adapter output。
- 不引入 `KernelRuntimeEnvelope`、runtime wire protocol 或长期 compatibility projection。

## 当前代码基线

当前 `core-clean` 的真实执行链：

```text
REPL
  src/screens/REPL.tsx
    -> createAgent()
    -> AgentSession.stream()
    -> query()
    -> AgentEvent source-preserving projection
    -> REPL event adapter

Headless
  src/cli/print.ts runHeadless()
    -> createAgent()
    -> AgentSession.stream()
    -> SessionRuntime.submitMessage()
    -> query()
    -> AgentEvent source-preserving projection
    -> stdout adapter

ACP
  src/services/acp/agent.ts
    -> createAgent()
    -> AgentSession.stream()
    -> SessionRuntime.submitMessage()
    -> AgentEvent source-preserving projection
    -> AgentEvent -> ACP SessionUpdate adapter
```

Phase 8 当前清理口径：

- `QueryEngine` 兼容壳已删除，不再作为内部 host 主入口。
- `SessionRuntime.submitMessage()` 暂时仍是 engine asset，承载现有 query lifecycle / transcript / permission / file-state 语义。
- `AgentSession.stream()` 是 host 外层执行口；`SDKMessage` 只允许作为 adapter source 或 output。

旧 kernel façade 已移除。当前 headless 兼容装配入口已经移动到 runtime：

```text
src/runtime/capabilities/execution/HeadlessHost.ts
  -> runHeadlessRuntime()
  -> runHeadless()
```

因此 Agent Core 的施工中心是：

```text
src/runtime/capabilities/execution/SessionRuntime.ts
src/query.ts
src/screens/REPL.tsx
src/cli/print.ts
src/services/acp/agent.ts
src/services/acp/bridge.ts
```

## 目标目录

```text
src/core/
  index.ts
  types.ts
  AgentCore.ts
  AgentSession.ts
  AgentTurn.ts
  AgentEventBus.ts
  AgentPermissionBroker.ts
  AgentContext.ts
  AgentState.ts
  AgentToolRuntime.ts
  createAgent.ts
  adapters/
    queryToAgentEvents.ts
    agentEventsToSdkMessages.ts
    agentEventsToStreamJson.ts
```

说明：

- `src/core` 是主链，不是 package。
- 未来需要发布时，通过主包 subpath export 暴露，例如 `@go-hare/hare-code/core`。
- `packages/*` 继续保留 channel、standalone server、native capability、MCP bridge 等独立模块，不承载 Agent Core。

## Ownership 切分

### AgentCore

职责：

- 创建和管理 `AgentSession`。
- 持有 core-wide lifecycle。
- 注入 engine asset resolver。
- 暴露 `createSession()` / `resumeSession()` / `dispose()`。

不负责：

- stdout 输出。
- Ink 渲染。
- ACP `SessionUpdate`。
- 微信、Chrome、HTTP 包格式。

### AgentSession

职责：

- 持有单会话状态。
- 管理多轮 turn。
- 管理 model / permission mode / cwd / tools / MCP / agents。
- 提供 `stream(input)`。
- 提供 `cancel()` / `setModel()` / `setPermissionMode()` / `getEvents()`。

当前迁移来源：

- `SessionRuntime` 的 `mutableMessages`、`readFileState`、abort controller、usage、permission denials。
- `ACP` 里的 per-session `appState`、commands、models、modes。
- `headless` 里的 mutable message/read-file cache/session resume 状态。

### AgentTurn

职责：

- 接收 `AgentInput`。
- 承载单次 turn 生命周期与取消控制。
- 执行 input processing。
- 组装 system prompt / user context / system context。
- 调用 `query()`。
- 把 `query()` 输出投射为 `AgentEvent`。
- 负责 turn terminal event：`turn.completed` / `turn.failed` / `turn.cancelled`。

当前迁移来源：

- `SessionRuntime.submitMessage()` 中 input processing、system prompt、record transcript、query loop projection。
- `REPL` 中直接调用 `query()` 前的 context assembly。
- 当前代码先落的是 turn 实体壳；raw stream 的具体投射仍由 `AgentTurnExecutor` adapter 负责，后续再向 `AgentTurn` 内聚。

### AgentEventBus

职责：

- 为每个 session 维护 `sequence`。
- 发布 `AgentEvent`。
- 支持 subscribe。
- 支持 replay / backlog。
- 识别 terminal event。

必须提供：

```ts
publish(event: AgentEventPayload): AgentEvent
subscribe(listener: (event: AgentEvent) => void): () => void
replay(options?: { sinceSequence?: number; limit?: number }): AgentEvent[]
```

### AgentPermissionBroker

职责：

- 统一 permission lifecycle。
- 发出 `permission.requested` / `permission.resolved`。
- 处理 mode、session grants、deny tracking、cancel/timeout。
- 向 `query()` 提供 `canUseTool` adapter。

当前迁移来源：

- `SessionRuntime` 里的 `wrappedCanUseTool` 与 `permissionDenials`。
- ACP 的 `createAcpCanUseTool(...)`。
- REPL 的 interactive permission flow。
- headless 的 permission prompt tool flow。

### AgentContext

职责：

- 统一系统上下文组装。
- 统一 slash command / input processing。
- 统一 skill/plugin/memory prompt loading。
- 统一 model / thinking config。

当前迁移来源：

- `SessionRuntime.submitMessage()` 中 `fetchSystemPromptParts`、`processUserInput`、`getSlashCommandToolSkills`、`loadAllPluginsCacheOnly`。
- `REPL` 中 `getSystemPrompt`、`getUserContext`、`getSystemContext`、`buildEffectiveSystemPrompt`。

### AgentState

职责：

- 持有 core session state。
- 封装现有 `AppState` 依赖。
- 管理 transcript / session storage。
- 管理 `FileStateCache` / file history / attribution state。

要求：

- 初期允许内部使用 `AppState`，但不能让 host 继续各自 own 一份独立 session state。
- Host 只能提供 state seed 或 UI-specific state，不再 own core state。

### AgentToolRuntime

职责：

- 将 tool lifecycle 语义事件化。
- 统一 tool request / input delta / start / progress / complete / fail。
- 保留现有 tool implementation，不重写工具系统。

当前迁移来源：

- `query()` 的 raw stream tool_use / tool_result。
- `normalizeMessage()` 的 `tool_progress`。
- ACP bridge 的 tool info / tool result conversion。

## 阶段计划

### Phase 0：合同冻结

状态：已完成第一步。

文档：

- `docs/internals/agent-core-event-contract.md`

要求：

- `AgentEvent` 是唯一 core event protocol。
- 任何 host 需要新语义，先扩 contract，再改 adapter。

### Phase 1：建立 `src/core` 骨架

新增：

```text
src/core/types.ts
src/core/index.ts
src/core/AgentEventBus.ts
src/core/AgentCore.ts
src/core/AgentSession.ts
src/core/AgentTurn.ts
src/core/createAgent.ts
```

内容：

- 落地 `AgentEvent` / supporting types。
- 落地 `AgentEventBus`。
- 建立最小 `AgentCore` / `AgentSession` 接口。
- 暂不改 host。

验收：

```bash
bun run typecheck
bun test src/core
```

### Phase 2：core-owned turn projection

新增：

```text
src/core/adapters/queryToAgentEvents.ts
```

目标：

- `query()` 的输出只作为 engine raw stream。
- `AgentTurn` 承载 turn 生命周期，消费 executor 投射出来的 `AgentEvent` 流。
- 不经过 `SDKMessage` 投射 `AgentEvent`。

必须覆盖：

```text
stream_request_start -> request.started
message_start/content_block_start -> message.started/tool.requested
text_delta -> message.delta
thinking_delta -> message.thinking_delta
citations_delta -> message.citation_delta
input_json_delta -> tool.input_delta
assistant Message -> message.completed
user Message -> message.completed(role=user) or turn.input_accepted
tombstone -> message.tombstone
tool progress -> tool.progress
tool result -> tool.completed/tool.failed
compact boundary -> context.compacted
api retry -> error.retrying
result terminal -> turn.completed/turn.failed
usage -> usage.updated
```

验收：

```bash
bun test src/core/__tests__/queryToAgentEvents.test.ts
bun run typecheck
```

### Phase 3：迁移 `SessionRuntime` 到 `AgentSession`

目标：

- `AgentSession.stream(input)` 成为 headless / ACP 可用的 core execution path。
- `SessionRuntime.submitMessage()` 不再是主设计中心。

做法：

- 从 `SessionRuntime.submitMessage()` 中抽出 input/context/query/terminal 逻辑到 `AgentTurn`。
- `SessionRuntime` 暂时保留为 engine asset，后续继续把 turn 语义下沉到 `AgentTurn`。
- `ask()` 顶层 helper 已删除，不再作为 headless 或源码兼容路径。

注意：

- 这是工程过渡，不是长期双轨。
- 长期核心只认 `AgentEvent`。

验收：

```bash
bun test src/runtime/capabilities/execution
bun test src/core
bun run typecheck
```

### Phase 4：迁移 headless host

目标：

```text
runHeadless()
  -> createAgent()
  -> AgentSession.stream()
  -> AgentEvent
  -> headless output adapter
```

新增：

```text
src/hosts/headless/agentEventOutput.ts
```

职责：

- `AgentEvent -> text`
- `AgentEvent -> json`
- `AgentEvent -> stream-json`

规则：

- `stream-json` 是 output format，不是 core protocol。
- headless 不再直接消费 `SDKMessage`。

验收：

```bash
bun run dev -- -p "hello"
bun run dev -- -p --output-format stream-json "hello"
bun test src/cli
```

### Phase 5：迁移 ACP host

目标：

```text
ACP PromptRequest
  -> AgentSession.stream()
  -> AgentEvent
  -> ACP SessionUpdate
```

新增：

```text
src/services/acp/agentEventBridge.ts
```

替换：

- `forwardSessionUpdates(SDKMessage -> ACP SessionUpdate)`
- `runtime.submitMessage(...)`

保留：

- ACP protocol package。
- ACP session/mode/model public behavior。

验收：

```bash
bun test src/services/acp
```

需要 smoke：

- prompt。
- tool call。
- permission request。
- cancel。
- mode/model update。

### Phase 6：迁移 direct-connect / server / remote-control

目标：

- server/direct-connect 不再通过 SDK message 语义间接接入 core。
- remote-control 只做 transport / presentation adapter。

落点：

```text
src/runtime/capabilities/server/*
src/server/*
src/remote/*
```

验收：

```bash
bun test src/runtime/capabilities/server
bun test src/server
```

### Phase 7：迁移 REPL

状态：已落地第一刀。

REPL 最后迁，因为它现在最复杂。

当前：

```text
src/screens/REPL.tsx
  -> query()
  -> onQueryEvent()
  -> Ink/AppState
```

目标：

```text
REPL input
  -> AgentSession.stream()
  -> AgentEvent
  -> REPL event adapter
  -> Ink/AppState
```

新增：

```text
src/hosts/repl/agentEventHandler.ts
```

当前落地：

```text
src/screens/REPL.tsx
  -> createAgent()
  -> AgentSession.stream()
  -> query()
  -> SDK/query event
  -> AgentEvent source-preserving projection
  -> src/hosts/repl/agentEventHandler.ts
  -> onQueryEvent()
  -> Ink/AppState
```

说明：

- `query()` 不再由 REPL host 直接作为外层执行口消费；外层执行口已经切到 `AgentSession.stream()`。
- `onQueryEvent()` / `handleMessageFromStream()` 仍保留，作为 REPL UI adapter，不在本阶段重写 Ink 状态机。
- source SDK/query event 会挂在 `AgentEvent` 上并优先回放，避免破坏 tombstone、progress、tool summary、stream block lifecycle 等 REPL 私有 UI 语义。
- core-native fallback 由 `agentEventToReplQueryEvents()` 提供，用于没有 source event 的 `AgentEvent`。

要求：

- 保留 interactive permission UX。
- 保留 prompt processing。
- 保留 proactive/buddy/Kairos 相关 host behavior。
- 保留 metrics/logging。

验收：

```bash
bun test src/hosts/repl/__tests__/agentEventHandler.test.ts
bun test src/core src/hosts/headless/__tests__/agentEventOutput.test.ts src/services/acp src/server/__tests__/directConnectManager.test.ts src/remote/__tests__/RemoteSessionManager.test.ts src/runtime/capabilities/server
bun run typecheck
bun run build
```

手动 smoke：

- 普通问答。
- tool permission。
- slash command。
- compact。
- cancel。
- subagent progress。

### Phase 8：清理旧中心

状态：已落地第一刀。

完成所有 host 迁移后：

- `QueryEngine` 兼容壳不再存在。
- `submitMessage()` 不再作为 core 输出。
- `ask()` 顶层 helper 不再存在。
- `SDKMessage` 不再作为核心协议。
- 旧 kernel façade 不再存在。

当前已完成：

- ACP 配置类型直接使用 `SessionRuntimeConfig`。
- `src/QueryEngine.ts` 已删除，不再保留 deprecated source compatibility shim。
- `ask()` 顶层 helper 已从 `SessionRuntime` 删除。
- 旧 `src/kernel` façade 已删除。
- 文档基线已更新为 `AgentSession.stream()` 是 REPL/headless/ACP 的外层执行口。

当前仍保留：

- `SessionRuntime.submitMessage()`：仍承载现有 query lifecycle、transcript、permission、file-state、usage 语义，是待继续下沉到 AgentTurn/AgentSession 的 engine asset，不是 core protocol。
- `SDKMessage` source-preserving projection：用于旧 stdout、ACP、REPL UI、remote/direct-connect 的行为保持；后续要逐步收窄为 adapter-only。
- `src/entrypoints/core.ts` 是包级 Agent Core 入口，不承载 runtime host compatibility。

允许保留：

- `SDKMessage` adapter，用于旧 stdout 或外部格式输出。

不允许保留：

- 第二套 core protocol。
- `KernelRuntimeEnvelope`。
- runtime wire protocol。
- long-lived compat projection 主链。

## 验收矩阵

最低验收：

```bash
bun run typecheck
bun test src/core
bun test src/runtime/capabilities/execution
bun test src/services/acp
bun test src/cli
```

功能 smoke：

```text
CLI interactive prompt
headless -p text output
headless -p --output-format stream-json
ACP prompt
ACP permission request
ACP cancel
direct-connect session
tool call lifecycle
subagent progress
compact
resume
```

架构验收：

- 所有 host 都通过 `AgentCore` / `AgentSession` 执行。
- `query()` 只作为 core 内部 engine asset。
- `AgentEvent` 是唯一 core protocol。
- Host/channel 只做 adapter。
- 没有新增 `KernelRuntimeEnvelope` / wire protocol / compat projection 主线。
