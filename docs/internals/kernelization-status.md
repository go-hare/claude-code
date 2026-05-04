# 内核化现状与收口计划

## 口径

本文使用的判断口径如下：

- CLI 是内核的基本功能之一，也是官方主宿主
- 内核化不是把 CLI 边缘化，而是把可复用能力从 CLI/REPL 私有实现里持续下沉
- 对外源码级接入面优先通过 `src/kernel`
- `src/runtime` 是内部能力层，允许继续演进

在这个口径下，判断重点不是“CLI 是否还在主链里”，而是：

1. 执行、server、bridge、daemon、tools、mcp 等能力是否已经从历史主链实现里抽离
2. `src/kernel` 是否已经成为统一 façade
3. 顶层宿主是否正在逐步收口到 kernel-first 的调用方式

## 当前判断

截至 2026-04-28，当前内核化已经进入 **内部 kernel 完整状态**：执行、
事件、权限、capability refresh、multi-session isolation、wire runtime、
headless / interactive capability materialization 与 ACP / host compatibility
adapter 均已按 runtime-first owner 收口。CLI 仍是第一宿主，但 legacy 输出与
transport 只作为兼容投影保留，不再作为内部 source of truth。

一句话概括：

> 当前项目已经完成统一入口、宿主改道、package-level kernel 发布面、runtime-first execution/event/permission/capability/session ownership 与完整测试护栏。后续 public API 扩面或 legacy transport 治理不再属于“补内核完整性”的 blocker；现有 SDK / `stream-json` adapter 保留为兼容投影，不能因内核迁移导致 CLI 行为衰减。

截至 2026-04-28，本轮“内核 + 开发接口封板”也已经完成：

> `@go-hare/hare-code/kernel` 的 public surface、runtime/wire contract、capability lifecycle 与 developer-facing manager 均已收口到可发布状态。`companion`、`Kairos`、`memory`、`context`、`sessions` 已进入 root surface，并且已经连通 in-process / stdio runtime 与 wire protocol。

当前仍可继续深化、但**不再属于 blocker** 的点是：

> `runtime.sessions.resume()` 现在已经返回 live `KernelConversation`、允许继续运行 turn，并会把 transcript 历史消息、todo snapshot、nested memory snapshot、task snapshot、attribution snapshot、file history snapshot、content replacement 记录，以及 context collapse commit / snapshot 一并 hydrate 进 resumed conversation 的 replayable live event state（当前事件类型为 `conversation.transcript_message` / `conversation.todo_snapshot` / `conversation.nested_memory_snapshot` / `conversation.task_snapshot` / `conversation.attribution_snapshot` / `conversation.file_history_snapshot` / `conversation.content_replacement` / `conversation.context_collapse_commit` / `conversation.context_collapse_snapshot`）；`getTranscript()` 仍保留原始 transcript 读取入口。与此同时，headless/runtime turn 也已开始在每轮执行前恢复 nested memory dedupe state，避免 resumed session 在后续 turn 里重复注入已加载的 `CLAUDE.md` / nested memory 附件；task storage 中唯一 open owned task context 也会重新挂回 `activeTaskExecutionContext`。剩余若继续追平的，是更深的 richer tool context / execution context，而不是这些已持久化历史状态、TodoWrite 连续性、nested memory dedupe、task-list snapshot 与 open-task context 的恢复缺口。

### 2026-05-04 内核完成标准复核

按“内核是否拿回语义主权”复核，当前内部 kernel blocker 已清零。

- Turn owner 已收口到一条 canonical lifecycle：`SessionRuntime.submitRuntimeTurn(...)`
  是 runtime turn 入口，`RuntimeConversation` / `RuntimeTurnController` 维护
  turn identity、active execution、abort/finalize 与 replayable terminal state；
  `query.ts`、`QueryEngine`、headless、ACP 与 host launcher 只保留入口适配或
  compatibility projection。
- Context assembly 已拆出硬边界：`modelVisible`、`hostVisible`、
  `operatorDebug` 分离，queued command、task reminder、skill discovery 与
  operator/debug metadata 不再被当成同一类 prompt 拼接物；host/debug-only
  attachment 不进入 model-visible context。
- Event plane 已统一到 runtime envelope / runtime event schema：ACP
  `SessionUpdate`、direct-connect host message、headless `stream-json` 与 legacy
  `SDKMessage` 都是 projection，不再和 canonical runtime events 平级持有真相。
- ACP bridge 已进一步收成 runtime-event-first projection：`turn.output_delta`
  与 `turn.completed` / `turn.failed` 直接由 `KernelEvent` 投影成
  `SessionUpdate` / stopReason；`headless.sdk_message` 只作为复杂 content
  block、usage 与 tool-call 的内部 transitional fallback，且不能覆盖已出现的
  canonical terminal event。
- Capability plane 已形成统一继承链：`runtime supports`、`host grants`、
  `mode permits`、`tool requires` 与 `agent inherits` 通过 capability plane /
  tool policy / permission broker 串联；agent 的 `exact_parent` 继承会被 parent
  capability clamp，不能绕过父执行面的权限边界。
- Coordinator lifecycle 已纳入同一 runtime/capability 语义面：coordinator、
  task、agent run 与 linked task metadata 走 runtime-owned registry /
  capability plane，headless/host 只负责投影 task notification 与 lifecycle
  event。
- 真实 transport smoke 已补齐：direct-connect 使用真实 HTTP + WebSocket
  transport；ACP live stdio 与 built headless CLI 已用本地 OpenAI-compatible
  endpoint 单独跑通；`scripts/kernel-deep-smoke.ts` 已覆盖 source、built Bun 与
  built Node。
- 全量回归结果：`bun run test:all` 通过，`4498 pass / 2 skip / 0 fail`。两个
  skip 是 gated live smoke（built CLI smoke 与 ACP live smoke），已在本轮用真实
  endpoint 单独执行过。

public semver surface 已冻结到 `src/kernel/index.ts` 与 package-level `./kernel`：
`src/kernel/__tests__/publicSurfaceManifest.ts` 是唯一 export manifest，
`surface.test`、`packageEntry.test` 与 `kernel-package-smoke` 共用同一份快照，
并且 package `exports` 被锁定为 `./kernel` 与 `./package.json`。剩余事项不再是
“内核未完成”的 blocker。2026-05-04 后续复核进一步收紧 public surface：
SDKMessage / legacy stream-json projection helper 不再从 root `./kernel` 导出，
只保留为 runtime 内部 transitional bridge。新宿主只应消费
`KernelRuntimeEnvelope` / `KernelEvent` / wire contract，不再把 Agent SDK 当作
第二条 public 接口线。最后只剩发布前按需复跑 optional live smoke，并在后续
public API 扩面时避免把 `src/runtime` internals 误暴露成稳定 contract。

本轮 release-gated smoke 已执行并通过：

- `RUN_BUILT_CLI_SMOKE=1 bun test tests/integration/kernel-built-cli-smoke.test.ts`
  通过，覆盖 built Bun / built Node CLI 的 headless `stream-json` turn。
- `RUN_ACP_LIVE_SMOKE=1 bun test tests/integration/kernel-acp-live-smoke.test.ts`
  通过，覆盖 built ACP stdio transport 到 OpenAI-compatible endpoint。
- `bun run scripts/kernel-deep-smoke.ts --timeout-ms 90000` 通过，覆盖 source
  headless live turn。
- `bun run scripts/kernel-deep-smoke.ts --built --timeout-ms 90000` 通过，覆盖
  source、built Bun 与 built Node live turn。

结合 2026-04-23 本轮收口进展，更准确的补充口径是：

> headless 的依赖方向已经完成第一轮纠偏：`HeadlessRuntime` 不再直接回落到 `src/cli/print.ts`，CLI 仍然是第一宿主，但 headless 可复用执行实现已经开始向 `src/runtime/capabilities/execution/internal/*` 下沉。

> 同时，runtime-vs-host state split 已进入 runtime-owned 事实来源阶段：
> `bootstrapProvider`、`SessionRuntime.submitRuntimeTurn(...)`、
> `RuntimeEventBus`、`RuntimePermissionBroker`、wire router conversation
> snapshot / active execution journal 与 runtime capability materializer 已形成
> 内部主链；`RuntimeExecutionSession` 不再声明 `submitMessage(...)`，ACP
> 也直接消费 `submitRuntimeTurn(...)` 的 runtime envelope 流。legacy
> SDK-message / `stream-json` 只作为最终 transport 兼容投影。

> 宿主瘦身这边也继续往前推进了一轮：`main.tsx` 已把 shared launch context 和 shared startup assembly 收口到独立 helper，`kernel/serverHost.ts` 也已摘掉对 `server/*` / `hosts/server/*` 历史兼容层的依赖，直接接到 runtime-owned server capability。

> `bridgeMain.ts` 也已开始第一轮宿主装配上提：`spawner / logger / initial session`、相关 `bridge pointer refresh` 生命周期、`stdin / signal / spawn-mode toggle` 这类宿主控制 wiring、`resume / reuseEnvironmentId` 的启动编排，以及 `registration / reconnect failure mapping` 现在都经由 `src/kernel/bridge.ts` 提供，`bridgeMain.ts` 本身进一步退回到参数、UI 与控制流协调。

> `REPL.tsx` 这边也继续往前收了一刀：前台 `onQuery` orchestration、background query orchestration、initial message orchestration，以及 startup messages 注入 effect 都已从主文件上提到独立 controller/helper，当前主文件进一步退回到状态接线和视图组装。

> 如果要对外长期承诺 kernel API，当前建议冻结的只有 root surface：`src/kernel/index.ts` 与 package-level `./kernel`。`src/kernel/*` leaf 模块继续视为 host-internal surface，不纳入公开 semver 承诺面。

### 与 `docs/headless-embed-kernel-interfaces.md` 对应的状态快照

下面这组记录用于承接接口文档里不宜展开过长的“当前内部落地点”：

- headless / interactive CLI 的 `commands`、`tools`、`agents` 装配，已由 `src/runtime/capabilities/execution/headlessCapabilityMaterializer.ts` 与相关 refresh bundle 收口；CLI headless launcher 仍保留 host 职责，但缺省装配已不再要求调用方显式传全量对象。
- 正式的 kernel public headless launch/executor 入口已经成立；host-side `runHeadlessLaunch(...)` 的 startup orchestration 已下沉到 kernel public path，CLI host 进一步退回参数解析、host 输入与结果消费。
- `main/commandAssembly.ts` 的 bundled skills / builtin plugins 预热已下沉到 `src/runtime/capabilities/commands/RuntimeCommandSources.ts`；interactive CLI 的 command / agent preload、运行期 refresh 也已收口到同一 materializer family。
- headless refresh 已进入 `src/runtime/capabilities/execution/internal/headlessRuntimeCapabilityBundle.ts`，统一处理 plugin reload、command / agent materialization、plugin MCP diff 与 hook hot-reload setup。
- MCP runtime ownership 已分别进入 `RuntimeHeadlessMcpService` 与 `RuntimeInteractiveMcpService`：前者承接 SDK seed、dynamic server、connect / reconnect / status；后者承接 config load、pending reconciliation、stale cleanup、two-phase connect、manual reconnect、enable / disable、automatic reconnect、channel handler 注册 / 卸载与 `tools/prompts/resources list_changed` refresh。React hook 侧只保留 UI adapter callback。
- hook / plugin 初装配已新增 runtime service adapter：`RuntimeHookService` 负责 plugin hook reload / count / cache lifecycle，`RuntimePluginService` 负责 interactive REPL 初始 plugin commands / agents / hooks / MCP / LSP materialization。`useManagePlugins(...)` 进一步退回 notification / telemetry adapter。
- startup 期的 MCP prefetch 与 startup hook warmup 已收进 runtime startup service / kernel public headless launch path；`main.tsx` 只保留 host 条件与 warning renderer。相关本地 OpenAI-compatible endpoint deep smoke 也已通过，说明 host startup 装配链路已能复用真实 provider endpoint。
- `SessionRuntime.submitRuntimeTurn(...)` 已成为 runtime-first 执行出口，统一输出 `turn.started`、`headless.sdk_message`、`turn.completed` / `turn.failed` runtime envelope；`RuntimeExecutionSession` 不再声明 `submitMessage(...)`，`QueryEngine.ts` 不再 re-export `ask`。`submitMessage(...)` 与 `ask(...)` 只保留内部 transitional projection shim，不进入 public kernel surface。
- headless stream 输出已改成 runtime-first publisher：`createHeadlessRuntimeStreamPublisher(...)` 先写入 `RuntimeEventBus`，legacy `stream-json` stdout 再作为兼容写出。ACP prompt path 也已直接消费 `QueryEngine.submitRuntimeTurn(...)` 的 runtime envelope，避免 ACP 再回到 SDK-message 投影作为执行主流。
- public event taxonomy 已按当前代码边界进入 package root：`KernelEvent` 仍是 generic semantic event，`KernelRuntimeEnvelopeBase` 承载 `ack / event / error / pong`；`KERNEL_RUNTIME_EVENT_TAXONOMY`、`KernelRuntimeEventType`、`getKernelRuntimeEventCategory(...)`、`isKernelRuntimeEventOfType(...)` 与 `isKernelTurnTerminalEvent(...)` 已可对外使用。payload-specific discriminated union 仍属于 future。
- `collectKernelRuntimeEventEnvelopes(...)` 与 `runtime.publishHostEvent(...)`
  现在也已进入 kernel public surface：host 不必再绕 raw wire client
  收窄 replay 结果，runtime-level host event 也不再只能经由底层
  `publish_host_event` command 发送。
- 默认 kernel runtime 的 MCP live plane 也已进一步 runtime-owned：共享的
  `createDefaultKernelRuntimeMcpPlane(...)` 现在同时供默认 `mcpRegistry` 与
  默认 `toolCatalog` 复用，`list_mcp_resources` / `list_mcp_tools` 不再只是空
  壳，默认 `list_tools` / `call_tool` 也能消费同一份 MCP snapshot，而不是只看
  builtin tools。
- `createKernelRuntime(...)` 现在已把 runtime-level `provider` /
  `defaultProvider` init contract 暴露到 public surface；provider 默认值不再只留在 wire router 内部测试语义。
- `runtime.permissions.onEvent(...)` / `replay(...)` 与 typed permission helper
  已进入 public runtime façade；`permission.requested` /
  `permission.resolved` 事件 payload 现在直接携带完整 request / decision
  语义，不再要求 host 自己从 raw envelope 补足上下文。
- `runtime.hooks.onEvent(...)` / `replay(...)` 与 typed hook helper
  也已进入 public runtime façade；`hooks.reloaded` / `hooks.ran` /
  `hooks.registered` 事件 payload 现在可直接经由
  `getKernelHookRegistrySnapshot(...)` / `getKernelHookRunResult(...)` /
  `getKernelHookMutationResult(...)` 消费，无需 host 自己拆 raw envelope。
- 默认 runtime hook catalog 现在也已向内收一刀：通过
  `registerHook(...metadata.callback)` 注册的 callback hook，执行时不再写回
  bootstrap 全局 hook registry，而是由 kernel 默认 hook catalog 本地执行。
  仍未收完的是 plugin/startup hook 这条更大的 global registry 注入链。
- `runtime.commands.onEvent(...)` / `replay(...)`、`runtime.tools.onEvent(...)`
  / `replay(...)`、`runtime.skills.onEvent(...)` / `replay(...)` 现在也已进入
  public runtime façade；`commands.executed` / `tools.called` /
  `skills.reloaded` / `skills.context_resolved` 已有 typed helper
  `getKernelCommandExecutionResult(...)`、`getKernelToolCallResult(...)`、
  `getKernelSkillSnapshot(...)`、
  `getKernelSkillPromptContextResult(...)`，host 不必再从 raw envelope 手拆
  command/tool/skill payload。
- session continuation 也开始从 headless print loop 往 runtime 中心收：`resumeSessionAt`
  已进入 `resume_session` wire path 与 `runtime.sessions.resume(...)` façade，
  transcript 裁剪语义由共享 helper 统一，headless bootstrap 与 wire router 不再
  各写一套 message slicing 逻辑。
- MCP OAuth callback 与 clear-auth 的 desktop-required 主链也已进入默认
  runtime MCP registry：`authenticate_mcp` / `runtime.mcp.authenticate(...)`
  可携带 `callbackUrl`，默认 registry 通过 `skipBrowserOpen +
  onWaitingForCallback` 注入现有 OAuth flow，然后清 auth cache 并 reconnect；
  `clearAuth(...)` 走同一 lifecycle registry。
- 真实 worker 路径的 session/output 回归已补上：`kernel-runtime` NDJSON 进程
  级 smoke 会先 `resume_session(resumeSessionAt)`，再对同一 conversation
  运行 process-backed headless executor，并断言 `headless.sdk_message`、
  `turn.output_delta` 与 `turn.completed` 同时保持。
- `runtime.agents.onEvent(...)` / `replay(...)` 与
  `runtime.tasks.onEvent(...)` / `replay(...)` 现在也已进入 public runtime
  façade；`agents.spawned` / `agents.run.cancelled` /
  `tasks.created` / `tasks.updated` / `tasks.assigned` 已有 typed helper，
  host 不必再从 generic runtime event 里手拆 agent/task payload。
- `KernelTranscript` / `getSessionTranscript(...)` 也已补齐 richer resumed
  state：`taskSnapshot`、`todoSnapshot`、`nestedMemorySnapshot`、
  `attributionSnapshots`、`fileHistorySnapshots`、`contentReplacements`、
  `contextCollapseCommits`、`contextCollapseSnapshot` 已进入 public transcript
  shape；session continuation 的 replayable state 不再只是 router 私有类型。
- `compatProjection` / `headlessStreamEmission` 这一层已降级为 runtime 内部
  transitional bridge：runtime envelope <-> SDKMessage / legacy stream-json
  projection 只服务当前执行链迁移，不再经由 root `src/kernel` 稳定导出。
- interrupted-turn auto resume 当前也已升级为 public headless run option，并保留
  `CLAUDE_CODE_RESUME_INTERRUPTED_TURN` env fallback；是否自动续跑被打断 turn
  不再是纯内部私有开关。
- public agents/tasks mutate 第一刀与 agent executor lifecycle 第一层均已进入 runtime contract、wire codec/router/client、in-process / stdio transport client、SDK façade 与 package declaration：`spawn_agent`、`create_task`、`update_task`、`assign_task`、`list_agent_runs`、`get_agent_run`、`get_agent_output`、`cancel_agent_run` 已走同一套 runtime-owned registry。默认 registry 也已接上 process-backed agent executor；仍未开放的是 coordinator 专用 invoke schema 与 in-process `AgentTool` / `ToolUseContext` 级复用。
- `KernelRuntime.coordinator` 也已不再只有 `assignTask(...)` /
  `spawnWorker(...)` 两个分散 helper：当前 `invoke(...)` 会在同一条 runtime-owned
  链路里串起必要的 task create / assign、worker spawn，以及 task execution
  linkage 回写（`linkedBackgroundTaskId` / `linkedAgentId`）。
- 默认 `agentRegistry.spawnAgent(...)` 现在也会在有 `taskId` 时自动把
  `taskExecution.linkedBackgroundTaskId` / `linkedAgentId` 与 `ownedFiles`
  回写到 task storage；host 不再需要在 `spawn_agent` 成功后额外手搓一次
  metadata patch 才能把 run registry 和 task registry 串起来。

截至 2026-04-30，这组状态快照对应的对齐判断是：

> desktop / worker / embedding 的后续讨论，应先以 `CLI headless` 为能力基线，再检查 public `kernel` / `wire protocol` 是否已经对齐；不要直接拿 desktop 暴露出来的问题反推共享 runtime contract。

当前已经成立的结构是：

- CLI 仍是主宿主，但不再独占核心能力
- `src/runtime` 是内部能力层，继续承载执行、server、bridge、daemon 等真正实现
- `src/kernel` 已成为对外统一 façade，集中暴露 headless、direct-connect、server、bridge、daemon 的统一接入面

这意味着项目现在已经不是：

- CLI 一把梭
- 各宿主各自直连内部深路径

而是：

- 顶层宿主逐步只认 kernel
- runtime 继续作为内部能力层演进
- kernel 负责向外部 consumer 提供较稳定的接入边界

## 完成度清单

### 已完成

#### 1. kernel 统一入口已建立

`src/kernel/index.ts` 已统一导出：

- headless
- headless MCP / startup
- direct-connect / server
- bridge
- daemon

这一步已经不再是问题，统一入口本身已经成立。

#### 2. headless 顶层 launch/executor 已收口到 kernel public path

正式的 kernel public headless launch/executor 入口现已成立；它负责承接
headless environment materialization、MCP connect、startup orchestration 与
bootstrap state 写入，再下钻到 `runKernelHeadless()` /
`runHeadlessRuntime()`。`KernelHeadlessEnvironment` /
`KernelHeadlessSession` 对外契约继续保留，作为 lower-level headless building
blocks。

这意味着 headless 的接入归属已经清晰，外部现在可以通过正式 kernel public
launch path 稳定接入，而不必继续复用 host-side wrapper。

#### 3. headless 依赖方向第一轮纠偏已完成

当前已经完成：

- `src/runtime/capabilities/execution/HeadlessRuntime.ts` 不再直接 import `src/cli/print.ts`
- `src/cli/print.ts` 已收缩为 CLI compatibility wrapper
- runtime internal 已建立第一轮模块簇：
  - `headlessSession.ts`
  - `headlessSessionControl.ts`
  - `headlessRuntimeLoop.ts`
  - `headlessControl.ts`
  - `headlessBootstrap.ts`
  - `headlessHostIO.ts`
  - `headlessMcp.ts`
- `StructuredIO` / `RemoteIO` / `ndjsonSafeStringify` / transport stack 已迁到 `src/runtime/capabilities/execution/internal/io/*`
- `installOAuthTokens` 已迁到 `src/services/oauth/installOAuthTokens.ts`

这意味着：

- CLI 仍然保留第一宿主地位
- 但 runtime 已经开始真正拥有 headless 实现，而不是继续直接依赖 CLI 私有模块
- headless runtime internal 子树已不再直接 import `src/cli/*`

#### 4. server / direct-connect 顶层宿主已进入 host-facing kernel 装配

`src/kernel/serverHost.ts` 已统一暴露：

- `createDirectConnectSession`
- `connectDirectHostSession`
- `applyDirectConnectSessionState`
- `getDirectConnectErrorMessage`
- `assembleServerHost`
- `runConnectHeadless`
- `startServer`

同时 `main.tsx` 与 CLI host command 已优先经过 kernel host-facing helper，而不是直接拼接 `server/*` 细节。

当前已经成立的收口包括：

- `main.tsx` 的 direct-connect 进入 `connectDirectHostSession(...)`
- `main.tsx` 的 headless 主链进入正式 kernel public headless launch/executor 入口，再下钻到 `runKernelHeadless(...)`
- CLI `open <cc-url>` 进入同一个 `connectDirectHostSession(...)`
- CLI `server` 命令通过 `assembleServerHost(...)` 完成默认 backend / session manager / logger 装配

这意味着 Phase 2 的第一段已经不再只是“把符号从 kernel 转发出去”，而是开始把宿主通用的归一化与装配职责吸收到 kernel。

#### 5. server runtime contracts 已完成第一轮下沉

当前已经完成：

- `src/runtime/capabilities/server/contracts.ts`
- `SessionManager.ts` 改为依赖：
  - `SessionRuntimeBackend`
  - `SessionLogger`
- `RuntimeDirectConnectSession.ts` 改为依赖：
  - `SessionRuntimeHandle`
  - `SessionLogger`
- `DangerousBackend` 现在是 `SessionRuntimeBackend` 的默认实现
- `createServerLogger()` 现在是 `SessionLogger` 的默认实现
- `kernel/serverHost.ts` 继续作为默认 backend / logger / session manager 的唯一默认装配点

这意味着 server 这一侧已经从：

- `runtime -> 具体默认实现`

收敛为：

- `runtime -> contracts`
- `kernel -> 默认实现装配`

#### 6. bridge / daemon 顶层入口已进入 host-facing kernel 装配

`bridgeMain.ts`、`createSession.ts`、`workerRegistry.ts` 现在都已经优先依赖 `src/kernel/bridge.ts` / `src/kernel/daemon.ts`，顶层宿主不再明显依赖 runtime 深路径。

当前已经成立的收口包括：

- `kernel/bridge.ts` 已新增 headless bridge 默认 deps 装配与 `runBridgeHeadless(...)`
- `bridgeMain.ts` 的 headless 入口改经由 kernel helper，而不是在宿主层手工拼接默认 deps
- `hosts/remote-control/index.ts` 已改为通过 `kernel/bridge.ts` 暴露 host-facing surface
- `bridgeMain.ts` 的 session title / session fetch / initial session 创建已改用 kernel bridge session API export
- `kernel/daemon.ts` 已新增 daemon 默认 deps 装配与 `runDaemonWorker(...)`
- `hosts/daemon/index.ts` 已改为通过 `kernel/daemon.ts` 暴露 host-facing surface
- `workerRegistry.ts` 已退为 kernel daemon 入口的兼容导出

也就是说，bridge / daemon 已不再只是“宿主只认 kernel”，而是开始把宿主通用 wiring 上提到 kernel。

#### 6. 最小 kernel contract / surface 护栏已落地

当前已经有以下最小护栏：

- `src/kernel/__tests__/headless.test.ts`
- `src/kernel/__tests__/serverHost.test.ts`
- `src/kernel/__tests__/bridge.test.ts`
- `src/kernel/__tests__/daemon.test.ts`
- `src/kernel/__tests__/surface.test.ts`
- `src/kernel/__tests__/importDiscipline.test.ts`
- `src/kernel/__tests__/packageEntry.test.ts`
- `tests/integration/kernel-package-smoke.test.ts`
- `tests/integration/kernel-headless-smoke.test.ts`
- `tests/integration/kernel-server-smoke.test.ts`
- `src/runtime/capabilities/server/__tests__/contracts.test.ts`
- `src/runtime/capabilities/bridge/__tests__/contracts.test.ts`
- `src/runtime/capabilities/server/__tests__/DirectConnectSessionApi.test.ts`
- `src/daemon/__tests__/workerRegistry.test.ts`
- `src/main/__tests__/modeDispatch.test.ts`

它们已经覆盖了最小的：

- surface / delegation / façade 断言
- bridge / daemon host-facing helper 断言
- 宿主 import discipline 结构护栏
- package-level kernel entry smoke
- runtime contracts focused guard

说明 kernel 已不再是“无护栏状态”。

#### 7. package-level kernel 发布面已收口

当前已经具备：

- `src/entrypoints/kernel.ts`
- `dist/kernel.js`
- `package.json` 的 `./kernel` export

截至 2026-04-24，这一层已经可以按“完成”记：

- `src/entrypoints/kernel.ts` 已稳定 re-export `src/kernel/index.ts`
- `package.json` 的 `./kernel` export 指向 `./dist/kernel.js`
- `bun run build` 后，`@go-hare/hare-code/kernel` 可真实导入
- `runKernelHeadless`、`createDefaultKernelHeadlessEnvironment`、`createDirectConnectSession`、`runBridgeHeadless`、`runDaemonWorker` 在 built package entry 上可用
- `createKernelSession === createDirectConnectSession`

也就是说，这一层已经不只是“入口骨架存在”，而是已经具备发布级可导入 surface。

#### 8. kernel root public surface 已具备冻结条件

截至 2026-04-24，若目标是对外长期承诺 kernel API，当前建议冻结的只有：

- `src/kernel/index.ts`
- `src/entrypoints/kernel.ts`
- `package.json` 的 `./kernel` export

当前已经完成：

- `src/kernel/index.ts` 已明确声明：它是唯一的源码级公开 kernel surface
- `src/entrypoints/kernel.ts` 已明确声明：它是唯一的 package-level kernel semver 承诺面
- `src/kernel/__tests__/surface.test.ts` 已锁定源码级稳定导出集合
- `src/kernel/__tests__/packageEntry.test.ts` 已锁定 entrypoint 稳定导出集合
- `tests/integration/kernel-package-smoke.test.ts` 已锁定 built package `@go-hare/hare-code/kernel` 的稳定导出集合

当前稳定 root surface 的导出集合由
`src/kernel/__tests__/surface.test.ts`、
`src/kernel/__tests__/packageEntry.test.ts` 与
`tests/integration/kernel-package-smoke.test.ts` 共同锁定。2026-04-24 的首轮冻结集合包括：

- `DirectConnectError`
- `applyDirectConnectSessionState`
- `assembleServerHost`
- `connectDefaultKernelHeadlessMcp`
- `connectDirectHostSession`
- `connectResponseSchema`
- `createDefaultKernelHeadlessEnvironment`
- `createDirectConnectSession`
- `createKernelHeadlessSession`
- `createKernelHeadlessStore`
- `createKernelSession`
- `getDirectConnectErrorMessage`
- `prepareKernelHeadlessStartup`
- `runBridgeHeadless`
- `runConnectHeadless`
- `runDaemonWorker`
- `runKernelHeadless`
- `runKernelHeadlessClient`
- `startKernelServer`
- `startServer`

截至 2026-05-01，headless root surface 的主要口径已继续更新为：

- 正式 kernel public headless launch/executor 入口是 CLI headless 的主 public path
- startup orchestration 已并入该 public path，不再把 host-side wrapper 视为正式入口
- `prepareKernelHeadlessStartup`、`createDefaultKernelHeadlessEnvironment`、`runKernelHeadless` 继续保留，但语义上退回为 lower-level building blocks，而不是推荐给外部 host 的主编排入口

这意味着：

- 可以对 `@go-hare/hare-code/kernel` 做长期 semver 承诺
- 但不应把 `src/kernel/*` leaf 模块一起当成公开冻结 API
- leaf 模块继续按 host-internal / implementation surface 处理

截至 2026-04-28，root surface 已继续扩展并稳定锁定以下能力族：

- runtime / wire：`createKernelRuntime`、wire router / client / transport、runtime event façade 与 taxonomy helper
- developer-facing manager：`createKernelCompanionRuntime`、`createKernelKairosRuntime`、`createKernelMemoryManager`、`createKernelContextManager`、`createKernelSessionManager`
- permission/runtime event：permission broker、runtime envelope/event codec 与 replay helper

源码级和 built package 级的**精确**导出清单以测试中的 expected export set 为最终事实源，而不是本文手工枚举。

对 headless 这一族，当前推荐外部 host 依赖的 public 入口层级是：

1. 正式 kernel public headless launch/executor 入口
2. `runKernelHeadless()` / `KernelHeadlessSession` 这类 lower-level headless building blocks
3. 更底层的 leaf helper 不纳入外部 semver 承诺面

#### 9. developer-facing runtime interface 已完成封板

截至 2026-04-28，以下 developer-facing runtime interface 已进入“完成”状态：

- `createKernelRuntime()` / `KernelRuntime` / `KernelConversation` / `KernelTurn`
- `commands` / `tools` / `mcp` / `hooks` / `skills` / `plugins`
- `agents` / `tasks`
- `companion` / `Kairos` / `memory` / `context` / `sessions`

并且当前完成不是只停留在 package surface：

- in-process runtime 已提供同一套 manager
- stdio runtime 已提供同一套 wire client / transport 行为
- `companion` / `Kairos` event 已通过 runtime event bus 暴露为统一事件面
- `sessions.resume()` 已返回 live `KernelConversation`
- public `index.d.ts`、surface test、package smoke 与 runtime integration test 已同步锁定

当前可以对外承诺的准确口径是：

> 这轮内核化封板已经完成；后续只剩更深的 runtime parity 与体验增强，不再是“补全内核/开发接口”的收尾工作。

### 历史半完成项（已由 2026-04-27 内核收口覆盖）

#### 1. runtime contracts 覆盖状态

2026-04-23 时 `server` 先完成 contracts 下沉，`bridge / daemon / 其他 capability`
还在追赶。2026-04-27 后，internal kernel 的执行、事件、权限、capability、
session ownership 已经按 runtime-first 收口；后续如果继续改，是 public surface
扩面或历史 compatibility transport 治理。现有 SDK / `stream-json` adapter
保留为兼容投影，不作为当前阶段的删除目标。

这意味着：

- `server/direct-connect` 这块已经开始从 façade 升级为轻编排层
- `bridge/daemon` 这块也已经开始从 façade 升级为轻编排层
- 更深一层的 runtime contract 化不再是当前 internal kernel blocker

#### 2. 测试护栏状态

当前已经有最小 contract / surface 护栏，但还不等于已经具备完整的长期稳定矩阵。

尤其还缺更强的：

- 更大范围的 consumer/import 组合回归
- 更接近真实运行参数的 kernel headless / server e2e 覆盖

#### 3. kernel 已有发布入口与 smoke 护栏，但全量稳定性仍要靠后续验证维持

从当前工程现实看，package-level 发布面已经打通；后续问题更多会出现在 kernel contracts / runtime ownership / shared session core，而不是 `./kernel` export 本身。

### 已完成补充

#### 9. headless 实现收口：主链已切到 runtime，session / streaming / post-turn seam 已完成

`main.tsx` 和 `src/kernel/headless.ts` 已统一经过 runtime 级 `HeadlessRuntime` 入口。

当前已经不再是：

- `HeadlessRuntime -> cli/print.ts`

而是已经变成：

- `HeadlessRuntime -> internal/headlessSession.ts -> internal/headlessRuntimeLoop.ts`

同时，`headlessSession.ts` 已不再是纯 barrel，而是成为显式 session boundary；它现在负责创建 per-session context，并把 session-local cleanup / 去重状态显式传给 `headlessRuntimeLoop.ts`。

`runHeadlessStreaming(...)` 与主执行循环虽然仍在同一个文件中，但和它直接相关的可复用细分职责已经继续下沉到以下 runtime internal seams：

- `headlessBootstrap.ts`
- `headlessControl.ts`
- `headlessSessionControl.ts`
- `headlessHostIO.ts`
- `headlessMcp.ts`
- `headlessBridgeForwarding.ts`
- `headlessMcpRuntime.ts`
- `headlessPlugins.ts`
- `headlessStreaming.ts`
- `headlessStreamEmission.ts`
- `headlessPostTurn.ts`

同时，`HeadlessCore.ts` 已经退出主链并被删除；原先挂在其中的 MCP diff helper 已独立到 `headlessMcp.ts`，而 outer streaming / result emission / post-turn flush 也已经从 `headlessRuntimeLoop.ts` 大块内联逻辑中抽出。

也就是说，当前已经完成“先改依赖方向”“把 CLI 共享实现迁出 CLI 私有路径”，并把 headless 主链压平到 session / streaming / post-turn 的 runtime-owned seams；`headlessStreaming` 已改成 runtime-first publisher，`SessionRuntime` 已提供 `submitRuntimeTurn(...)`，ACP prompt / bridge 已直接消费 runtime envelope，legacy SDK-message 只在 `headless.sdk_message` payload projection 边界出现。

### 历史未完成项的当前结论

以下条目是 2026-04-23 记录的历史未完成项。按 2026-04-27 的内部 kernel
完整标准，它们已经不再是 blocker；剩余工作若继续推进，应归类为 public API
扩面或 legacy transport 治理。legacy SDK internal path 已从 runtime
owner 链路移除；`stream-json` adapter 保留是 CLI 机器协议兼容策略，
不是“没清干净”的残留。

#### 1. kernel 内部链路进一步压平

当前仍可描述为：
- `kernel -> server`
- `kernel -> bridge/runtime`
- `kernel -> daemon/runtime`

而不是更纯粹的：

- `kernel` 直接成为稳定主编排层

当前已通过 runtime-first execution / event / permission / capability owner
收口，不再作为内部 kernel blocker。

#### 3. 更完整的 kernel contract / integration 测试矩阵

最小测试已经足够证明“结构收口正在发生”，但还不足以证明“对外长期稳定”。

当前完整内核收口已通过定向 runtime/ACP/headless/SessionRuntime 测试与
`bun run test:all`；更大的 public compatibility matrix 属于后续发布治理。

## 工程验证状态

截至 2026-04-28（最终封板复核），当前工程验证结果如下：

- 已通过：`bun run typecheck`
- 已通过：`bun run build`
- 已通过：`bun run test:all`
  - 4332 pass / 0 fail
- 已通过：kernel runtime 定向测试，包括：
  - `src/runtime/capabilities/execution/internal/__tests__/headlessRuntimeTurnId.test.ts`
  - `src/runtime/capabilities/execution/internal/__tests__/headlessStreaming.test.ts`
  - `src/runtime/capabilities/execution/internal/__tests__/headlessRuntimeEventOutput.test.ts`
  - `src/runtime/capabilities/execution/internal/__tests__/headlessConversationAdapter.test.ts`
  - `tests/integration/kernel-runtime-wire-smoke.test.ts`
  - `tests/integration/kernel-runtime-wire-transport.test.ts`
  - `tests/integration/kernel-runtime-wire-crash-recovery.test.ts`
  - `src/kernel/__tests__/runtime.test.ts`
- 已通过：`scripts/kernel-deep-smoke.ts --built`
  - current source / built Bun / built Node 均产生 runtime-first
    `kernel_runtime_event` + `headless.sdk_message`
  - smoke 守卫确认没有 `turnId: ""` 的 runtime envelope
- 已通过：changed-file lint
  - `headlessRuntimeLoop.ts`
  - `headlessRuntimeTurnId.ts`
  - `headlessRuntimeTurnId.test.ts`
- 整仓 `bun run lint` 未作为内核完成 blocker：当前失败来自既有 lint 存量，
  例如 `src/Tool.ts` 的 useless continue 与 `src/bridge/bridgeMain.ts` /
  CLI 文件中的 unused suppression，和本轮 runtime turn identity 收口无关。

## 防回归原则

后续如果发现 kernel 边界回归，应遵循以下原则：

1. 先收调用入口，再决定是否搬实现
2. 先统一顶层宿主引用，再清理内部深路径
3. 不把“入口收口”和“发布导出”混成一个提交
4. headless 优先先改依赖方向，再按 `session / control / bootstrap` seam 继续拆内部实现
5. CLI 始终保留第一宿主地位，剥离的是可复用核心实现，不是 CLI 宿主身份
6. 等接口边界稳定后再补更强的 contract / smoke tests

## 历史推荐执行阶段

### Phase 1

状态：已完成

`refactor(runtime): 将 headless 执行核心下沉到 runtime internal`

当前已完成：

- `HeadlessRuntime.ts` 不再直接依赖 `src/cli/print.ts`
- `src/cli/print.ts` 已退为 compatibility wrapper
- `headlessControl` / `headlessBootstrap` / `headlessSession` seam 已立起来
- `headlessSessionControl` / `headlessRuntimeLoop` / `headlessMcp` 已继续将会话控制、运行循环和 MCP diff 拆开
- `headlessHostIO` 已将 `headlessRuntimeLoop` 中最明显的 host IO 职责抽离
- `headlessPlugins` / `headlessStreaming` / `headlessStreamEmission` / `headlessPostTurn` 已继续把 plugin lifecycle、outer streaming、mid-turn emission、post-turn flush 从 loop 中拆出
- `HeadlessCore.ts` 已退出主链并删除
- `headlessSession.ts` 已成为显式 session boundary，而不是纯 barrel
- session-local cleanup / UUID 去重 / orphaned permission 状态已变为 per-session context
- `StructuredIO` / `RemoteIO` / transport / `ndjsonSafeStringify` 已迁到 runtime internal `io/*`
- `installOAuthTokens` 已迁到非 CLI 的共享 service 路径

#### 10. runtime state seam 与 shared session core 准备已进入可执行状态

当前已经完成：

- `bootstrapProvider.ts` 已从 `runtime/core/state/adapters.ts` 中独立出来，`adapters.ts` 只保留 provider 装配职责
- `SessionRuntime.ts` / `TurnEngine.ts` 已不再直接依赖 `src/bootstrap/state.js`
- headless 主链现在会显式把 bootstrap-backed provider 沿 `HeadlessRuntime -> headlessSession -> headlessRuntimeLoop -> askRuntime()` 传下去
- `headlessBootstrap.ts` / `RemoteIO.ts` 已摘掉对 `src/bootstrap/state.js` 的直接依赖
- `runtime/capabilities/server/SessionRegistry.ts` 已把 `SessionManager` 里的 `sessions map + indexStore` 所有权抽成 runtime-owned registry
- `RuntimeDirectConnectSession` 的 backlog replay / detach / idle-timeout / stop 行为已补上最小生命周期测试
- `RuntimeDirectConnectSession` 已把 websocket-style socket contract 收成通用 `SessionRuntimeSink`
- `HostRuntime.ts` 现在只负责 `WebSocket -> SessionRuntimeSink` 适配；对外 `ws_url` / `/sessions/:id/ws` 协议保持不变
- `SessionManager.ts` 已开始依赖 `RuntimeManagedSession` + `SessionLifecycleFactory` contract，不再直接 `new RuntimeDirectConnectSession(...)`
- `SessionManager` 的 `registry` 现在也可显式注入，manager/session lifecycle/persistence 边界比之前清楚一层
- execution 侧的 `askRuntime()` 现在也开始依赖 `ExecutionSessionFactory`，不再直接 `new SessionRuntime(...)`
- `SessionRuntime.ts` 已暴露最小 `RuntimeExecutionSession` contract，headless/CLI 共用的 execution session owner 开始有稳定 seam
- `headlessManagedSession.ts` 已开始接管 `headlessRuntimeLoop.ts` 里的 `mutableMessages` / `readFileState` / `abortController` 这类 session-local 状态，loop 正在退回编排层
- interrupted-turn replay 也开始走 `headlessManagedSession.ts`，不再由 `headlessRuntimeLoop.ts` 直接操作消息缓冲
- `runtime/contracts/session.ts` 已补出共享 `RuntimeSessionIndexEntry` / `RuntimeSessionIndexStore` / `IndexedRuntimeSession` seam，server 的 `RuntimeSessionRegistry` 不再绑死 server-only index 类型
- headless 侧现在也开始复用 `RuntimeSessionRegistry`：`HeadlessSessionContext` 已持有 runtime-owned registry，`headlessManagedSession` 会产出最小 index entry，并通过 owner callback 做 add / sync / remove
- `headlessManagedSession.ts` 现在不只管理 interrupted-turn / read-file cache / abort controller，也开始接住 `appendMessages(...)` 这类 message buffer 更新，loop 对 `mutableMessages` 的直接写入继续减少
- `headlessManagedSession.ts` 已有最小 attach/sink seam：`attachSink(...)` / `detachSink(...)` / `emitOutput(...)` 已落地，`headlessRuntimeLoop.ts` 的核心 `StdoutMessage` 主路径开始经由 session owner 发出
- `HeadlessSessionContext` 对复用的 `RuntimeSessionRegistry` 也已补出最小 query seam：当前 runtime 已可 `get/list/liveCount` 当前进程内的 indexed headless session，而不只是单向 add/sync/remove
- `runtime/contracts/session.ts` 已开始承接共享 sink/attach seam：server 的 `SessionRuntimeSink` 与 headless 的 `HeadlessManagedSessionSink` 都开始站在同一条 `RuntimeSessionSink` / `AttachableRuntimeSession` 契约上
- `RuntimeSessionRegistry` 已从 `runtime/capabilities/server/SessionRegistry.ts` 抽到 `runtime/core/session/RuntimeSessionRegistry.ts`；server 旧路径只保留兼容 re-export，execution/headless 不再反向依赖 server capability 目录来拿 shared registry
- `headlessSessionBootstrap.ts` 已开始接管 `continue/resume/fork` 路径里的 session identity / metadata / file-pointer side effects，`headlessBootstrap.ts` 不再直接摸这些 session storage 细节
- `headlessSessionBootstrap.ts` 也开始吃进 session metadata persistence / update seam：agent setting、model metadata 变更、AI generated title 这些 side effects 已不再由 `headlessRuntimeLoop.ts` 直接落到 session storage 或 metadata 通知
- `loadInitialMessages()` 现在开始退回 source selection / validation / load-result shaping；loaded conversation 的 AppState/session 采纳重新回到 session bootstrap seam
- resumed conversation 的 coordinator-mode warning / agentDefinitions refresh / `saveMode()` 也开始走 session bootstrap seam，`headlessBootstrap.ts` 进一步退回 load/shaping 层
- startup hooks 产出的 `initialUserMessage` 也开始作为 load-result 返回，`headlessRuntimeLoop.ts` 不再直接读取 `sessionStart.ts` 的 side channel

这一步的意义不是“shared session core 已完成”，而是：

- runtime-vs-host state split 已不再只停留在 contract 定义，而是开始走真实注入路径
- server/direct-connect 这边也已经开始把 session ownership 从单一 `SessionManager` 类往可复用 runtime core 结构迁移
- session core 和 transport adapter 的分界已经开始形成；outward protocol
  transport-neutralization 已归类为后续 public transport 扩面
- manager 这一层已经开始从“知道具体 session 类怎么构造”转成“只编排 lifecycle contract”；shared session core 的 CLI/headless 差异已由 runtime-first execution / session owner seam 承接
- CLI/headless 一侧的 execution session owner 已从具体类实例化转成 contract + factory 模式，并补齐 `submitRuntimeTurn(...)` runtime-first 出口
- shared session core 这一段已经收到了可提交 stop point；REPL split 也已经开始第一刀，`replQueryRuntime` helper 进入 `runtime/capabilities/execution/internal/*`
- `REPL.tsx` 不再自己保留全部 query-param 装配逻辑；本地 turn 主链、background query 和 partial compact 已开始共用同一条 runtime-side query-preparation seam
- REPL split 第二刀也已开始：`replTurnShell` 已接管 session title、allowed-tools sync、non-query short-circuit、companion refresh 与 API metrics 这类 host-shell 副作用，`onQueryImpl` 继续向“宿主编排壳”收缩
- REPL split 第三刀也已开始：`replTurnShell` 继续吃进了 pre-query IDE/onboarding 预处理，以及 `queryGuard.end()` 内的 pipe done / bridge result / tungsten auto-hide / abort-controller clear 这类完成态宿主收尾
- REPL split 第四刀也已开始：turn budget capture 与 turn-duration/deferred-swarm 这类 completion tail 已从 `onQuery` finally 主链抽到独立 helper，剩下更集中的主要尾巴已经接近 user-cancel auto-restore
- REPL split 第五刀也已开始：`user-cancel auto-restore` 的 guard / history rewind / prompt restore 已从 `onQuery` finally 主链抽到独立 helper，`REPL.tsx` 在这一段里更接近纯宿主参数组装
- REPL split 第六刀也已开始：`onCancel` 的 proactive pause / partial-stream preserve / token-budget clear / prompt or remote cancel routing / turn-cancel notify 已收成独立 cancel shell，`REPL.tsx` 不再直接持有整块取消收尾
- REPL split 第七刀也已开始：`initialMessage` 的 clear-context / permission 注入 / first-turn hook 预热 / submit-vs-query 分流 已收成独立 bootstrap shell，`REPL.tsx` 在启动期只保留 effect 触发与 ref 管理
- headless bootstrap ownership 走 session seam；hydration / resume 数据装载保留在
  `loadInitialMessages()` 作为 load/shaping adapter，不再作为内部内核 blocker
- headless/shared session core 这边已经完成 `index` 接入；attach / persist 的
  server/direct-connect 差异归类为 host transport adapter
- headless state ownership 也继续往前推了一刀：`mainThreadAgentType` / `initJsonSchema` / `allowedChannels` / `registeredHooks` 已进入 `RuntimeBootstrapStateProvider` 的显式 seam，`headlessControl.ts`、`headlessSessionControl.ts`、`headlessRuntimeLoop.ts` 不再直接从 `bootstrap/state` 读取或写入这些状态
- headless 的 loaded-conversation adoption 现在已经从 `loadInitialMessages()`
  挪回 loop + session bootstrap seam；teleport / coordinator-mode refresh /
  startup hooks 这些 host-adjacent 行为已由 runtime startup / materializer
  service adapter 承接
- headless 的 interrupted-turn replay 已经不是 loop 私有逻辑，但 command queue / startup hooks / coordinator refresh 仍在 loop 或 bootstrap 路径外层
- coordinator-mode refresh 已不再留在 `loadInitialMessages()`，但 startup hooks 与 teleport 仍然是当前这条线剩下的主要 host-adjacent 尾巴
- startup hooks 里的 `initialUserMessage` 已不再由 loop 直接读取侧信道，但 hook promise 的调度与 startup hook 执行本身仍在 bootstrap/load 路径外层
- headless managed session 也开始带上 runtime-owned 的 session identity / lifecycle contract；server 的 `RuntimeManagedSession` 与 headless 的 `HeadlessManagedSession` 现在至少共享同一条 `RuntimeSessionLifecycle` seam，headless cleanup 也开始经由 `stopAndWait()` 收口
- execution 侧的 `RuntimeExecutionSession` 也已经接上同一条 lifecycle seam，`askRuntime()` 在 one-shot 路径里会显式 `stopAndWait()` 收尾；deprecated `ask()` 只作为 SDK-message projection shim 保留。这意味着 shared session lifecycle 已不只停留在 headless helper，而是进入 execution factory 的真实接入面

验收标准：

- `HeadlessRuntime.ts` 不再直接 import `src/cli/print.ts`
- runtime internal 不再直接 import `src/cli/*`
- `cli/print.ts` 退为 compatibility wrapper
- headless 核心按 runtime internal seam 拆开，session / streaming / post-turn seam 已完成，主线不再堆在历史 CLI 私有路径中

### Phase 2

状态：已完成

`refactor(kernel): 将 server/direct-connect 升级为 host-facing 轻编排层`

目标：

- 让 `src/kernel/serverHost.ts` 从 symbol re-export 升级为 host-facing 装配边界
- 吸收 direct-connect / server 启动中的通用归一化和默认装配
- 让 `main.tsx` 与 CLI host commands 更少了解 `server/*` 深路径细节

当前已完成：

- `src/kernel/serverHost.ts` 已新增：
  - `connectDirectHostSession(...)`
  - `applyDirectConnectSessionState(...)`
  - `getDirectConnectErrorMessage(...)`
  - `assembleServerHost(...)`
- `main.tsx` 与 CLI `open` 命令已共用 direct-connect host helper
- CLI `server` 命令已改由 kernel 组装默认 backend / session manager / logger
- 定向验证已覆盖：
  - `src/kernel/__tests__/serverHost.test.ts`
  - `src/runtime/capabilities/server/__tests__/DirectConnectSessionApi.test.ts`
  - `src/main/__tests__/modeDispatch.test.ts`

### Phase 3

状态：已完成

`refactor(kernel): 将 bridge / daemon 宿主装配上提到 kernel`

目标：

- bridge 利用现有 injected-deps seam，把 host assembly 从 `bridgeMain.ts` 上提到 `src/kernel/bridge.ts`
- daemon 只做 thin upgrade，把 `workerRegistry.ts` 当前的 wiring 继续收薄到 kernel

当前已完成：

- `src/kernel/bridge.ts` 已新增：
  - `createBridgeHeadlessDeps(...)`
  - `runBridgeHeadless(...)`
- `bridgeMain.ts` 的 headless bridge 默认 deps 装配已改由 kernel 提供
- `bridgeMain.ts` 中原先直连 `./createSession.js` 的 session API call site 已改用 kernel bridge export
- `src/kernel/daemon.ts` 已新增：
  - `createDaemonWorkerDeps()`
  - `runDaemonWorker(...)`
- `workerRegistry.ts` 已收薄为 kernel daemon 兼容导出
- 定向验证已覆盖：
  - `src/kernel/__tests__/bridge.test.ts`
  - `src/kernel/__tests__/daemon.test.ts`
  - `src/kernel/__tests__/surface.test.ts`
  - `src/daemon/__tests__/workerRegistry.test.ts`

### Phase 4

状态：已完成

`test(kernel): 补 contract / seam / smoke 护栏`

目标：

- 扩展 `src/kernel/__tests__/*` 的 seam tests
- 补 `execution internal` 的 focused tests
- 增加少量 kernel headless / direct-connect smoke

当前已完成：

- 新增 `importDiscipline.test.ts`，锁定：
  - `main.tsx`
  - `bridgeMain.ts`
  - `workerRegistry.ts`
  - `registerCliHostCommands.ts`
  不回退到已收口的深路径
- 新增 `packageEntry.test.ts`，验证：
  - `package.json` 的 `./kernel` export 存在
  - `src/entrypoints/kernel.ts` 真实 re-export kernel stable surface
- 新增 `tests/integration/kernel-package-smoke.test.ts`，验证：
  - `./kernel` export 指向 `dist/kernel.js`
  - `@go-hare/hare-code/kernel` 可被真实导入
  - 核心 kernel 导出在 built package entry 上可用
  - package-only worker 脚本只 import `@go-hare/hare-code/kernel`，即可调用
    `runKernelRuntimeWireProtocol(...)` 跑通最小 ping
- 新增 bridge / daemon seam tests：
  - `src/kernel/__tests__/bridge.test.ts`
  - `src/kernel/__tests__/daemon.test.ts`
- 已完成 package-level built entry smoke：
  - `bun run build`
  - `node -e "import('./dist/kernel.js')"`

### Runtime Contracts

状态：历史记录。2026-04-27 内部 runtime contracts 与相关验证已收口；bridge /
daemon 深路径清理继续归类为 public surface / legacy cleanup，不再作为内部内核 blocker。

`refactor(runtime): 收口 runtime contracts`

当前已完成：

- `src/runtime/capabilities/server/contracts.ts`
- `SessionManager.ts` / `RuntimeDirectConnectSession.ts` 改为依赖 runtime-owned contracts
- `DangerousBackend` / `createServerLogger()` 作为默认实现保留在 server 层
- `BackoffConfig` 已从 `bridgeMain.ts` 下沉到 `bridge/types.ts`
- `HeadlessBridgeEntry.ts` 不再反向依赖 `bridgeMain.ts`

但当前仍不能写成“这一层已经稳定完成”，因为：

- `server / bridge / daemon` runtime contracts 相关测试在全量验证中仍未全绿
- `DirectConnectSessionApi` 相关 runtime 测试当前也仍有失败
- 这说明 contracts 结构虽然已经落下，但稳定性和实现对齐仍未收完

## 建议的 5 个 commit（历史拆分视角）

### Commit 1

状态：已完成第一轮入口收口

`refactor(kernel): 收口 headless 入口`

目标：

- 让 `main.tsx` 和 kernel headless 主链不再直接依赖 `cli/print.ts`
- 先建立 runtime 级的 headless 入口，再决定是否进一步搬迁实现

建议涉及文件：

- `src/main.tsx`
- `src/kernel/headless.ts`
- `src/runtime/capabilities/execution/index.ts`
- `src/runtime/capabilities/execution/HeadlessRuntime.ts`（建议新增）
- `src/cli/print.ts`

验收标准：

- `main.tsx` 不再直接动态导入 `src/cli/print.js`
- `runKernelHeadless()` 不再直接引用 CLI 命名模块
- `examples/kernel-headless-embed.ts` 保持可用

### Commit 2

状态：已完成第一轮宿主装配收口

`refactor(kernel): 统一直连与服务宿主装配`

目标：

- 让 direct-connect / server 的顶层宿主装配更明确地经过 kernel
- 减少 CLI host command 对 `server/*` 装配细节的直接拼接

建议涉及文件：

- `src/main.tsx`
- `src/kernel/index.ts`
- `src/kernel/serverHost.ts`（建议新增）
- `src/hosts/cli/registerCliHostCommands.ts`
- `src/server/createDirectConnectSession.ts`
- `src/server/server.ts`

验收标准：

- `main.tsx` 的 direct-connect 主链只从 kernel 取入口
- CLI `server` / `open` 相关命令优先使用 kernel 暴露的能力
- `examples/kernel-direct-connect.ts` 保持可用

### Commit 3

状态：已完成第一轮 bridge / daemon 顶层入口收口

`refactor(kernel): 收口 bridge 与 daemon 顶层入口`

目标：

- bridge / daemon 顶层宿主不再直接引用 runtime capability 深路径
- 顶层统一通过 kernel façade 访问桥接和守护能力

建议涉及文件：

- `src/bridge/bridgeMain.ts`
- `src/bridge/createSession.ts`
- `src/daemon/workerRegistry.ts`
- `src/kernel/bridge.ts`
- `src/kernel/daemon.ts`

验收标准：

- bridge / daemon 顶层入口不再直接 import runtime bridge/daemon 深路径
- 相关顶层类型与 helper 都能从 kernel 获取

### Commit 4

状态：历史记录。当前完整内核收口已补齐 runtime-first execution / event /
permission / capability / session 相关测试，并通过全量验证。

`test(kernel): 补 kernel contract tests`

目标：

- 为 `src/kernel` 公开面建立独立护栏
- 防止后续宿主回退到深路径调用

建议涉及文件：

- `src/kernel/__tests__/headless.test.ts`（建议新增）
- `src/kernel/__tests__/surface.test.ts`（建议新增）
- `tests/integration/kernel-headless.test.ts`（可选）
- `tests/integration/kernel-direct-connect.test.ts`（可选）

验收标准：

- headless 和 direct-connect 至少各有一条显式 kernel 回归
- `src/kernel` 公开面有最小 surface 断言

### Commit 5

状态：已完成 package-level 发布级收口；root public surface 已具备冻结条件

`chore(build): 将 kernel 升级为发布级入口`

目标：

- 把今天的“源码级稳定面”升级为“包级稳定面”
- 在不破坏 CLI 分发主链的前提下，为 kernel 建立正式导出边界

建议涉及文件：

- `package.json`
- `build.ts`
- `tsconfig.build.json`（建议新增）
- `README.md`
- `README_EN.md`
- `examples/README.md`

验收标准：

- package 具备明确的 kernel export
- build 产物包含 kernel 入口
- 至少有一个最小 consumer 能从包级入口导入 kernel

当前已完成：

- `src/kernel/index.ts` 已显式声明 root public surface 的 semver 边界
- `src/entrypoints/kernel.ts` 已显式声明 package-level `./kernel` 是唯一稳定入口
- `surface.test.ts` / `packageEntry.test.ts` / `kernel-package-smoke.test.ts` 已锁定精确导出集合
- `@go-hare/hare-code/kernel` built entry 已与源码级 `src/kernel/index.ts` surface 对齐
- package-level worker smoke 已覆盖“worker 代码只依赖
  `@go-hare/hare-code/kernel`”的最小协议 runner 场景

## 推荐落刀顺序

推荐严格按以下顺序推进：

1. headless 入口收口
2. direct-connect / server 宿主装配收口
3. bridge / daemon 顶层入口收口
4. kernel contract tests
5. kernel 发布级导出

原因：

- 第 1 到 3 步解决的是“谁是正式入口”
- 第 4 步解决的是“接口稳定性如何被约束”
- 第 5 步解决的是“如何作为正式导出面对外发布”

如果提前做第 5 步，就容易把一个仍在演进的源码接口过早固定成发布承诺。

## 当前结论

按当前项目的设计目标，CLI 仍然是 kernel 的一部分，而不是 kernel 化的反例。

因此，当前阶段更准确的判断不是“CLI 还没退场，所以内核化不彻底”，而是：

> CLI 主宿主地位已经明确，runtime 能力层已经形成，kernel 统一接入面已经成型；现在真正剩下的是最后一轮入口归属、测试护栏和发布边界收口。
