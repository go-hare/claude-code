# hare-code 公共 Kernel / CLI 能力接口清单

## 1. 目的

本文整理新 `claude-code` 内核要开放的公共接口与语言无关运行协议。

目标不是只适配桌面端。目标是把 CLI 背后的 runtime 能力整体从 CLI host 里抽出来，经由 `@go-hare/hare-code/kernel` 与常驻 runtime wire protocol 暴露给任意 host：CLI、desktop、daemon、remote、worker、Python/Go SDK、未来机器人宿主都走同一套能力面。

边界一句话：

- 要开放：CLI 的行为能力、协议、状态、事件、配置和扩展系统。
- 不开放：Ink/React 终端 UI、按键布局、终端组件渲染细节。

阶段性进展、封板口径与内部收口细节统一沉淀在
`docs/internals/kernelization-status.md`；本文只保留会影响 public contract
判断的最小现状。

### 1.1 完整状态原则

状态：`Normative`

本文描述的是 public kernel / runtime contract 的完整目标状态，不是 MVP、headless-only 方案或桌面端私有集成说明。

实现可以按风险拆分、按能力分批落地，但接口蓝图不能按 MVP 缩小目标。任何阶段性实现都必须回答它最终如何进入完整 contract：

- `@go-hare/hare-code/kernel` 的进程内 API。
- `KernelRuntimeWireProtocol` 的语言无关协议。
- `KernelEvent` 的统一语义事件面。
- `KernelRuntimeCapabilities` 的完整能力解析、加载、reload 与错误可观察性。

因此，文档中的 commands、tools、hooks、skills、plugins、MCP、agents、companion、Kairos、memory、sessions 都是完整状态下的 public runtime capability。阶段性实现只能标注完成度，不能把这些能力从目标 contract 中删除。

### 1.2 主执行链路

状态：`Normative`

先用一张图固定本文讨论的主链路。后文所有“对齐”“缺口”“不应纳入 public contract”的判断，默认都以这条链路为参照：

```mermaid
flowchart LR
  A["`src/main.tsx`"] --> B["正式 kernel public headless launch/executor 入口"]
  B --> C["`runKernelHeadless(...)` / runtime-owned headless execution"]
  C --> D["`@go-hare/hare-code/kernel`"]

  D --> E["`createKernelRuntime()` / `KernelRuntime`"]
  E --> F["`KernelConversation` / `runTurn()` / `waitForTurn()`"]
  F --> G["`KernelEvent` / `turn.output_delta` / `turn.completed`"]

  E --> H["`KernelRuntimeWireProtocol`"]
  H --> I["desktop worker / Python / Go / robot host"]

  J["interactive REPL / Ink UI / keybindings / deep link banner"] -. "host-private" .-> B
```

图里的判断边界是：

- `CLI headless` 是当前产品执行基线，重点是把一次非交互请求跑成结果。
- `@go-hare/hare-code/kernel` 与 `KernelRuntimeWireProtocol` 是 public contract 的正式承载面。
- interactive REPL / Ink UI / keybindings / desktop 私有 glue 属于 host-private layer，不是 embedding 最小 contract。

下文如果需要简写，会用 `runKernelHeadlessLaunch(...)` 指代这条正式的
kernel public headless launch/executor 路径；若最终导出名有微调，应以实际
kernel public export 为准。

### 1.3 状态标签说明

- `Normative`：定义 public contract、边界、约束或判断口径。
- `Implemented`：表示当前代码或 public surface 已有落地，可按现状理解。
- `Future`：表示该能力已进入蓝图，但当前不能按“已完成”理解。

## 2. 当前结论与阅读导引

状态：`Normative` `Implemented`

- JS/TS 进程内公共入口是 `@go-hare/hare-code/kernel`。
- 其它语言 host 的公共入口是常驻 `KernelRuntime` 进程暴露的 wire protocol；Python/Go/机器人 SDK 只是这个协议的 typed client。
- CLI 不再是这些能力的唯一 owner，而是 public kernel 的第一个 host。
- 新增给外部 host 用的能力必须从 `claude-code/src/kernel/index.ts` 导出，并进入 package `./kernel` surface。
- 外部 host 不直接 import `claude-code/src/runtime/*`、`src/bootstrap/*`、`src/screens/*`、`src/commands/*`、`src/utils/plugins/*`、`src/skills/*` 等内部源码路径。
- desktop worker 仍然建议保留，用来隔离进程级全局状态、stdout patch 和多会话并发；但 worker 内部也只 import `@go-hare/hare-code/kernel`。
- desktop worker 对 Electron Main 暴露的控制面不能写成桌面私有协议；它必须是 `KernelRuntimeWireProtocol` 的一个本地传输实现。
- 不把旧 SDK facade 扩成新的 public API：
  `createHeadlessChatSession()`、`session.stream()`、
  `electron/vendor/hare-code-sdk.js` 这套旧 facade 不作为新开放面恢复；
  现有 SDK message / `stream-json` adapter 只作为 runtime 内部 transitional
  bridge 保留，不进入 root `./kernel` public surface。新宿主必须消费
  `KernelRuntimeEnvelope` / `KernelEvent` / wire contract。
- 任何对外接口都按完整 runtime contract 设计；不以“先能跑一个 headless turn”为接口边界。

为减少“目标 contract”“当前落地”“desktop 对齐约束”混在一起的阅读负担，本章按以下顺序展开：

1. 先说明当前内部落地点，回答“代码现在已经收到了哪里”。
2. 再记录影响判断口径的两个 checkpoint，回答“当前共识是什么”。
3. 最后给出 `CLI headless` vs public interface 的对齐结论，以及 desktop 讨论边界，回答“后续该如何继续扩 public surface”。

其中，时点性进展与较长的内部收口记录见
`docs/internals/kernelization-status.md`；本章只保留会改变接口判断的摘要。

### 2.1 当前内部落地点：runtime capability materializer / refresh bundle

状态：`Implemented`

当前落地点分两层：内部 kernel ownership 收口，以及第一批 public SDK / wire
contract。详细清单见 `docs/internals/kernelization-status.md` 中的“接口文档对应的状态快照”；这里仅保留会影响 contract 判断的摘要：

- headless / interactive CLI 的 `commands`、`tools`、`agents` 装配，已经进入 runtime-owned materializer / refresh bundle，CLI host 不再是唯一装配 owner。
- 正式的 kernel public headless launch/executor 入口已经成立；startup orchestration 也随该入口一起进入 kernel public path，不再停留在 host-side wrapper。
- MCP、hooks、plugins、startup warmup 等宿主期装配，已经有 runtime service / adapter 收口，React/CLI 层逐步退回 UI 与 host callback。
- `SessionRuntime.submitRuntimeTurn(...)`、`RuntimeEventBus` 与 runtime-first stream publisher 已经成为执行主链；`submitMessage(...)` / `ask(...)` 只保留兼容投影。
- ACP 已直接消费 runtime envelope，legacy SDK-message / `stream-json` 仅保留 transport compatibility，不再是内部执行事实源。
- ACP projection 当前优先消费 `KernelEvent`：纯 `turn.output_delta` 与 terminal
  lifecycle 不再依赖 SDKMessage；SDKMessage fallback 只服务尚未 native 化的
  content block、usage 与 tool-call 投影。
- public event taxonomy、agents/tasks mutate contract 与 agent run lifecycle 已进入 package root、wire、client 主链。
- `createKernelRuntime(...)` 现在已正式透传 runtime-level `provider` /
  `defaultProvider` init contract；`runtime.permissions.onEvent(...)` /
  `replay(...)` 与 typed helper 已可直接消费 `permission.requested` /
  `permission.resolved`，无需 host 再手拆 raw envelope。
- `KernelTranscript` / `get_session_transcript` 也已对齐 richer resumed state：
  `taskSnapshot`、`todoSnapshot`、`nestedMemorySnapshot`、
  `attributionSnapshots`、`fileHistorySnapshots`、`contentReplacements`、
  `contextCollapseCommits`、`contextCollapseSnapshot` 现在都进入 public
  transcript shape；resume replay 已不再只是内部 router 私有状态。
- legacy output compatibility projection 已降级为内部 transitional bridge：
  runtime envelope <-> SDKMessage / stream-json projection 继续服务当前 CLI
  执行链迁移，但不再作为 `@go-hare/hare-code/kernel` 的 public adapter。
- interrupted-turn auto resume 也不再只是
  `CLAUDE_CODE_RESUME_INTERRUPTED_TURN` 环境变量私有开关；当前 public
  headless run options 已可显式表达该策略，同时继续保留 env fallback 兼容。
- 当前边界仍然是：runtime 拥有 headless 默认能力装配与 startup orchestration，CLI 是第一个 host；未完成的 MCP / hook / plugin 深层执行能力不能提前宣称为 public contract 已齐备。

### 2.2 2026-04-28 封板补充口径

状态：`Implemented`

截至 2026-04-28，本轮封板补充口径如下：

> 文档中列出的 commands、tools、hooks、skills、plugins、MCP、agents、companion、Kairos、memory、context、sessions 已全部进入当前 `KernelRuntime` surface，并已连通 in-process / stdio runtime 与 wire protocol。它们不再是“后续阶段再开放”的能力域。

当前仍可继续深化、但已不再构成接口缺口的点是：

> `sessions.resume()` 现在已返回 live `KernelConversation`、允许继续运行 turn，并会把 transcript 历史消息、todo snapshot、nested memory snapshot、task snapshot、attribution snapshot、file history snapshot、content replacement 记录，以及 context collapse commit / snapshot 一并 hydrate 到 resumed conversation 的 replayable live event state（当前事件类型为 `conversation.transcript_message` / `conversation.todo_snapshot` / `conversation.nested_memory_snapshot` / `conversation.task_snapshot` / `conversation.attribution_snapshot` / `conversation.file_history_snapshot` / `conversation.content_replacement` / `conversation.context_collapse_commit` / `conversation.context_collapse_snapshot`）；原始 transcript 仍可通过 `getTranscript()` 独立读取。与此同时，headless/runtime turn 也会在每轮执行前恢复 nested memory dedupe state，避免 resumed session 在后续 turn 里重复注入已加载的 `CLAUDE.md` / nested memory 附件；task storage 里的唯一 open owned task context 也会重新挂回 `activeTaskExecutionContext`。后续若继续追平更深的 CLI resume parity，重点将转到更 rich 的 tool context / execution context，而不再是这些已持久化历史状态、TodoWrite 连续性、nested memory dedupe、task-list snapshot 与 open-task context 的恢复缺口。

### 2.3 2026-04-30 对齐审查补充：先对齐 CLI headless，再讨论 desktop

状态：`Normative`

本轮审查结论补一句更硬的话：

> 后续所有 desktop / worker / embedding 讨论，都应先以 `CLI headless` 为能力基线，再检查 public `kernel` / `wire protocol` 是否已经对齐。不要直接拿 desktop 暴露出来的问题反推共享 runtime contract。

这里需要明确区分两层：

- `CLI headless` 是产品执行路径，目标是“把一次非交互请求跑成结果”。
- public `kernel` / `wire protocol` 是外部 host 可稳定依赖的最小 contract，目标是“定义外部可以依赖什么”，而不是冻结 CLI 当前所有内部 orchestration 细节。

因此，后续所有“CLI 和开放接口功能一致”的讨论，默认比较对象应是：

1. `claude-code/src/main.tsx` -> 正式 kernel public headless launch/executor 入口 -> `runKernelHeadless(...)`
2. `@go-hare/hare-code/kernel` 的 public surface + `KernelRuntimeWireProtocol`

而不是：

- interactive REPL / Ink UI
- deep link banner
- terminal keybindings
- 任何 desktop 私有的 permission modal / session bookkeeping / Electron IPC

### 2.4 为什么基线是 CLI headless，而不是 interactive REPL

状态：`Normative`

原因不是 interactive REPL 不重要，而是 embedding host 当前真正要复用的能力，本质上是：

- 创建 runtime / conversation
- 发起 turn
- 处理中间 output / permission / terminal event
- 续接 session
- 中断 / 停止

这些都属于 `CLI headless` 和 runtime owner 链路的能力边界；它们不是 REPL 终端 UI 的能力边界。

换句话说：

- interactive REPL 更多是“产品壳”
- `CLI headless` 才是当前最接近外部 host embedding 的执行基线

### 2.5 当前对齐结论：命令面已齐，基础执行契约已收口到正式 kernel launch path

状态：`Implemented`

截至 2026-04-30，public wire contract 的 `KernelRuntimeCommandType` 已覆盖：

- conversations / turns / permissions
- commands / tools
- MCP / hooks / skills / plugins
- agents / tasks / teams
- companion / Kairos / memory / sessions / host events

同时，正式 kernel public headless launch/executor 入口已经成立，startup orchestration 也已随该入口进入 kernel public path，不再需要 host-side wrapper 继续承接主编排。

这仍不等于“public interface 已经和 CLI headless 完全等价”。当前剩余差距主要转到：

- provider / auth / fallback model 的稳定语义钉实
- permission broker 的 CLI 等价策略承诺
- output / terminal event 的长期兼容边界

### 2.6 差异表：CLI headless vs public interface

状态：`Implemented`

| 能力域 | CLI headless 已有 | public interface 现状 | 当前判断 |
| --- | --- | --- | --- |
| turn 基础执行 | 正式 kernel public headless launch/executor 入口 -> `runKernelHeadless()` 跑完整非交互 turn | 正式 headless launch/executor 入口 + `createConversation()` / `runTurn()` / `waitForTurn()` / `abortTurn()` | 正式入口已具备 |
| workspace / session | `cwd`、`continue`、`resume`、`resumeSessionAt`、`rewindFiles` | public headless launch `runOptions` 已透传 `continue` / `resume` / `resumeSessionAt` / `rewindFiles`；wire sessions 已有 `list_sessions`、`resume_session`、`get_session_transcript` | desktop worker package path 已齐；future 只剩把更多续接语义做成 long-running conversation first-class API |
| provider | `userSpecifiedModel`、`fallbackModel`、CLI 环境里的 provider 解析 | `RuntimeProviderSelection`、`provider`、`defaultProvider`、`providerOverride`、`authRef` | runtime init / conversation / turn 三层 precedence 已进入 public path |
| permissions | `permissionPromptToolName`、`toolPermissionContext`、headless permission runtime | `decide_permission` + broker contract + typed permission events/helper | 基础 contract 已齐，CLI 等价策略仍需继续钉实 |
| attachments | headless runtime 可消费 input / attachments | `run_turn.attachments` 已有 | 基础具备 |
| MCP / tools / hooks / skills / plugins | CLI headless 启动前装配完整运行环境 | wire surface 已有 list / call / reload / connect / mutate | 命令面完整 |
| agents / tasks / teams / Kairos / companion / memory | CLI / runtime 已具备能力域 | wire surface 已有对应命令 | 命令面完整，但激活与装配条件不够清楚 |
| output / events | output format、partial messages、replay user messages、runtime envelopes | public headless launch `runOptions` 已暴露 `verbose` / `outputFormat` / `replayUserMessages` / `includePartialMessages`；typed runtime events 已有回归；SDK / stream-json projection 只保留为 internal bridge | desktop-required output knobs 已齐；future 是 CLI terminal 展示策略的长期兼容，不是缺事件或缺 knob |
| startup orchestration | startup hooks、prefetch、session persistence、auth status、effort、advisor、fast mode | 已进入正式 kernel public headless launch path | 不再是缺口 |
| interactive / TUI | `launchRepl()`、banner、deep link、terminal UX | public interface 无 | 不应进入 embedding 最小契约 |

### 2.7 当前已冻结的最小 public embedding contract

状态：`Normative`

在继续 desktop / worker 设计之前，下列五项现在都应按正式 public contract 理解；其中第 1 项已经连同 startup orchestration 一起进入 kernel public path，剩余项继续作为语义稳定化重点：

1. 官方 headless turn executor
   - 现在已经存在正式、公开、可测试的“CLI headless 等价 turn 执行入口”
   - 该入口同时承接 startup orchestration，而不是继续把这层编排留在 host wrapper

2. provider resolution contract
   - `RuntimeProviderSelection`
   - `authRef`
   - `baseURL`
   - `fallback model`
   - 不同 provider scope 的解析语义

3. permission broker contract
   - host 如何收到 permission request
   - host 如何回传 decision
   - `decidedBy` / `decision` / request 生命周期的稳定语义

4. session continuation contract
   - `workspacePath`
   - `sessionId`
   - resume / replay / transcript 的边界
   - richer resumed state 的 transcript / replay 对齐

5. output / terminal event contract
   - 哪些 runtime events 是 public
   - 哪些仍只是内部事件
   - `output_delta` / `completed` / `failed` / terminal error 的稳定语义

### 2.8 当前不应纳入最小 public contract 的内容

状态：`Normative`

下列内容当前应明确视为 CLI 或 host 私有层，而不是 kernel embedding 最小 contract：

- Ink / React 终端 UI
- terminal keybindings
- deep link banner
- desktop 私有 permission modal
- desktop 私有 session bookkeeping
- Electron IPC / HTTP bridge
- 为单一 host 止血而打进共享层的 fallback

### 2.9 对 desktop 讨论的约束

状态：`Normative`

在上述最小 contract 明确之前，desktop 侧的任何设计 / bugfix 讨论都应遵守：

1. 先判断问题是否发生在 desktop 私有 glue
2. 再判断 CLI headless 是否已有对应能力
3. 只有 CLI headless 已有、且 public contract 缺失时，才允许提出新的 shared runtime surface

简化成一句话就是：

> 先做 `CLI headless` vs public interface 的对齐，再做 desktop 适配；不要反过来。

## 3. 公共入口形态

状态：`Normative`

公共入口分三层：

1. `@go-hare/hare-code/kernel`：JS/TS host 的进程内 API。
2. `KernelRuntimeWireProtocol`：非 JS host、desktop main/worker、机器人 host 共用的语言无关协议。
3. 各语言 SDK：Python/Go/Rust 等只做 wire protocol 的 typed client，不重新实现 CLI runtime 能力。

JS/TS host 示例：

示例：

```ts
import {
  createKernelRuntime,
  createKernelHeadlessController,
  createKernelHeadlessInputQueue,
  createKernelHeadlessProviderEnv,
  normalizeKernelHeadlessEvent,
  resolveKernelRuntimeCapabilities,
  reloadKernelRuntimeCapabilities,
} from '@go-hare/hare-code/kernel'
```

约束：

- `src/kernel/index.ts` 是源码层唯一 public 导出口。
- `@go-hare/hare-code/kernel` 是 package 级 semver surface。
- `src/kernel/*` 叶子模块可以存在，但外部 host 只依赖 package entry。
- runtime 内部 seam 可以继续演进；host contract 由 `@go-hare/hare-code/kernel` 承担。
- `KernelRuntimeWireProtocol` 的 schema 与 `KernelRuntime` / `KernelEvent` 同步演进；新增能力必须同时考虑 package API 与 wire protocol 可序列化形态。

## 4. 要开放的 CLI 能力范围

状态：`Normative`

这些能力都属于 CLI runtime capability，不是桌面专用能力：

- 会话与执行：conversation、turn、stream-json、abort、resume、dispose、multi-session isolation。
- Provider 与认证：Anthropic/OpenAI-compatible provider 配置、model override、auth token/env 映射。
- Command 系统：slash commands、command metadata、command execution、command reload。
- Tool 系统：builtin tools、MCP tools、plugin tools、host-provided tools、tool policy、permission request。
- Hook 系统：SessionStart、PreToolUse、PostToolUse、PostToolUseFailure、Stop、SubagentStop、PreCompact、PostCompact。
- Skills：bundled/user/project/managed/MCP/plugin skills，prompt context 注入和 skill discovery。
- Plugins：marketplace、本地、managed、user/project scope plugins，及其 commands、agents、hooks、MCP、skills、tools。
- MCP：server config、client lifecycle、tool/prompts/resources 暴露、permission bridge。
- Agent / Coordinator / Subagent：agents、coordinator mode、subagent spawn、task tools、owned files/write guard、worker result。
- Pet / Companion：companion state、hatch/rehatch/mute/unmute/pet、reaction side request、reaction event。
- Kairos / Proactive：常驻助手、tick、brief、channel/webhook event、dream/memory、push notification。
- Memory / Context / Compaction：project/user memory、session transcript、context assembly、auto/manual compaction hooks。
- Session / Logs / Background：session list/resume、logs、background/daemon worker lifecycle。
- Events：把 CLI 内部 message、tool、hook、plugin、skill、companion、Kairos 状态统一转成 public kernel events。
  当前 package root 也已开放 `collectKernelRuntimeEventEnvelopes(...)` 与
  `runtime.publishHostEvent(...)`，host 可直接消费 typed runtime event
  envelope 并发布 host-level semantic event，而不必绕 raw wire client。

## 5. Public Runtime 总入口

状态：`Normative` `Implemented`

已新增：`claude-code/src/kernel/runtime.ts`

这是 public runtime API 的第一层 in-process façade；当前内部 kernel 完整性不依赖
该入口，但它已经从 `@go-hare/hare-code/kernel` 导出。当前 façade 已继续补上
`transportConfig.kind = 'stdio'` 的进程 transport 便利入口，以及
`KernelTurn` object、`KernelConversation.waitForTurn(...)` /
`runTurnAndWait(...)` 的 terminal turn 等待 API。当前 `KernelRuntime` 上已有
capability、commands、tools、MCP、hooks、skills、plugins、agents、tasks、
permission 这些第一层 host-facing manager；其中 extension manager 仍是
以 boundary-first 方式开放：commands/tools 已补上 `execute_command` /
`call_tool` wire contract、SDK façade、optional executor hook 与默认 executor；
默认 command executor 能执行 non-interactive local command 和 prompt command
projection；默认 tool executor 能通过非交互 `ToolUseContext` 执行 builtin tool
validation、permission mode、progress 与 result；MCP 已补上
connect/auth/set-enabled lifecycle；hooks 已补上 `run_hook` / `register_hook`
contract 与默认非交互 runner；skills 已补上 `resolve_skill_context` contract；plugins 已补上
`set_plugin_enabled` / `install_plugin` / `uninstall_plugin` / `update_plugin` lifecycle mutation；agents/tasks 已补上 `spawn_agent` 与
agent run status/output/result/cancel、task create/update/assignment 这一组
mutate/invoke wire contract。仍未内建的是 MCP OAuth 浏览器 UX host policy、
plugin marketplace discovery/options 和 coordinator 专用 invocation 深化。

```ts
export function createKernelRuntime(
  options: KernelRuntimeOptions,
): Promise<KernelRuntime>

export type KernelRuntime = {
  readonly id: string
  readonly workspacePath: string
  readonly host: KernelRuntimeHostIdentity
  readonly transportKind: KernelRuntimeTransportKind
  readonly state: KernelRuntimeState
  readonly capabilities: KernelRuntimeCapabilities
  readonly commands: KernelRuntimeCommands
  readonly tools: KernelRuntimeTools
  readonly mcp: KernelRuntimeMcp
  readonly hooks: KernelRuntimeHooks
  readonly skills: KernelRuntimeSkills
  readonly plugins: KernelRuntimePlugins
  readonly agents: KernelRuntimeAgents
  readonly tasks: KernelRuntimeTasks
  readonly permissions: KernelRuntimePermissions
  start(): Promise<void>
  createConversation(options?: KernelConversationOptions): Promise<KernelConversation>
  reloadCapabilities(scope?: KernelCapabilityReloadScope): Promise<readonly KernelCapabilityDescriptor[]>
  decidePermission(decision: KernelPermissionDecision): Promise<KernelPermissionDecision>
  onEvent(handler: KernelRuntimeEventSink): () => void
  replayEvents(request?: KernelRuntimeEventReplayOptions): Promise<KernelRuntimeEnvelopeBase[]>
  dispose(reason?: string): Promise<void>
}

export type KernelConversation = {
  readonly id: string
  readonly workspacePath: string
  readonly sessionId: string | undefined
  snapshot(): KernelConversationSnapshot
  startTurn(prompt: string | readonly unknown[], options?: KernelRunTurnOptions): Promise<KernelTurn>
  runTurn(prompt: string | readonly unknown[], options?: KernelRunTurnOptions): Promise<KernelTurnSnapshot>
  waitForTurn(turnId: string, options?: KernelWaitForTurnOptions): Promise<KernelTurnSnapshot>
  runTurnAndWait(prompt: string | readonly unknown[], options?: KernelRunTurnAndWaitOptions): Promise<KernelTurnSnapshot>
  abortTurn(turnId: string, options?: KernelAbortTurnOptions): Promise<KernelTurnSnapshot>
  onEvent(handler: KernelRuntimeEventSink): () => void
  replayEvents(options?: Omit<KernelRuntimeEventReplayOptions, 'conversationId'>): Promise<KernelRuntimeEnvelopeBase[]>
  dispose(reason?: string): Promise<void>
}

export type KernelTurn = {
  readonly id: string
  readonly conversationId: string
  snapshot(): KernelTurnSnapshot
  wait(options?: KernelWaitForTurnOptions): Promise<KernelTurnSnapshot>
  abort(options?: KernelAbortTurnOptions): Promise<KernelTurnSnapshot>
  onEvent(handler: KernelRuntimeEventHandler): () => void
  replayEvents(options?: KernelTurnEventReplayOptions): Promise<KernelRuntimeEventEnvelope[]>
}
```

语义：

- `createKernelRuntime()` 是 JS in-process public runtime 能力总入口；当前默认
  复用 wire router / in-process transport，也可通过 `transportConfig.kind =
  'stdio'` 启动 source-level `kernel-runtime` runner。后续 transport 缺口是 IPC /
  WebSocket / Unix socket 这类非 NDJSON 承载层。
- 正式 kernel public headless launch/executor 入口是 CLI headless 等价的 public path；它负责把 startup orchestration 一并收进 kernel public path，再下钻到 runtime-owned headless execution。
- `runTurn(...)` 返回 turn 已启动 snapshot；`waitForTurn(...)` /
  `runTurnAndWait(...)` 订阅同一个 runtime envelope stream 并解析
  `turn.completed` / `turn.failed`，避免 SDK consumer 自己实现终态等待和 replay
  竞态处理。
- `startTurn(...)` 返回 `KernelTurn` object；它把 turn-scoped
  `onEvent(...)`、`replayEvents(...)`、`wait(...)` 和 `abort(...)` 收在同一个
  public object 上，方便 JS/TS SDK consumer 按 turn 管理生命周期。
- `createKernelHeadlessController()` 是 conversation/headless execution 的专用 facade，可以由 runtime 创建，也可以单独用于轻量 headless embed。
- CLI、desktop、daemon、remote host 的差异通过 `KernelRuntimeOptions.host` 和 capability intent 表达，而不是通过 import 不同内部模块表达。

## 6. 常驻 Runtime Wire Protocol

状态：`Normative`

建议新增：

- `claude-code/src/kernel/wireProtocol.ts`
- `claude-code/src/entrypoints/kernel-runtime.ts` 或等价 runner

必须从 `@go-hare/hare-code/kernel` 导出协议类型，并提供一个可启动的常驻 runtime runner。

`KernelRuntimeWireProtocol` 是语言无关 contract，不是桌面端私有协议。它服务于：

- desktop main <-> conversation worker。
- Python / Go / Rust SDK。
- 机器人宿主进程。
- 未来 daemon / remote / worker host。

协议消息必须是 JSON serializable，字段使用稳定 wire name，不暴露 TypeScript class、React/Ink object、runtime internal object、AbortController 或 bootstrap singleton。

### 6.1 Host -> KernelRuntime

```ts
export type KernelRuntimeCommand =
  | KernelRuntimeInitCommand
  | KernelRuntimeConnectHostCommand
  | KernelRuntimeDisconnectHostCommand
  | KernelRuntimeCreateConversationCommand
  | KernelRuntimeRunTurnCommand
  | KernelRuntimeAbortTurnCommand
  | KernelRuntimeDecidePermissionCommand
  | KernelRuntimeDisposeConversationCommand
  | KernelRuntimeReloadCapabilitiesCommand
  | KernelRuntimeCatalogCommand
  | KernelRuntimeAgentTaskCommand
  | KernelRuntimePublishHostEventCommand
  | KernelRuntimeSubscribeEventsCommand
  | KernelRuntimePingCommand
```

基础命令集合：

- `init_runtime`
  - 字段：`requestId`、`host`、`workspacePath`、`provider`、`auth`、`model`、`capabilities`、`metadata`。
- `connect_host` / `disconnect_host`
  - 字段：host identity、`sinceEventId`、disconnect `policy` / `reason`。
- `create_conversation`
  - 字段：`requestId`、`conversationId`、`workspacePath`、`sessionMeta`、`capabilityIntent`。
- `run_turn`
  - 字段：`requestId`、`conversationId`、`turnId`、`prompt`、`attachments`、`metadata`。
- `abort_turn`
  - 字段：`requestId`、`conversationId`、`turnId`、`reason`。
- `dispose_conversation`
  - 字段：`requestId`、`conversationId`、`reason`。
- `decide_permission`
  - 字段：`permissionRequestId`、`decision`、`decidedBy`、`reason`、`expiresAt`。
- `reload_capabilities`
  - 字段：`requestId`、`scope`、`capabilities`。
- catalog / registry 命令
  - `list_commands`、`execute_command`、`list_tools`、`call_tool`、
    `list_mcp_servers`、`list_mcp_tools`、
    `list_mcp_resources`、`reload_mcp`、`list_hooks`、`reload_hooks`、
    `list_skills`、`reload_skills`、`list_plugins`、`reload_plugins`、
    `list_agents`、`reload_agents`、`list_tasks`、`get_task`。
- extension lifecycle 命令
  - `connect_mcp`、`authenticate_mcp`、`set_mcp_enabled`、`run_hook`、
    `register_hook`、`resolve_skill_context`、`set_plugin_enabled`、
    `install_plugin`、`uninstall_plugin`、`update_plugin`。
- agents / tasks mutate 命令
  - `spawn_agent`、`list_agent_runs`、`get_agent_run`、
    `get_agent_output`、`cancel_agent_run`、`create_task`、`update_task`、
    `assign_task`。
- `publish_host_event`
  - 字段：`requestId`、`event`。
- `subscribe_events`
  - 字段：`requestId`、`conversationId?`、`sinceEventId?`、`filters?`。
- `ping`
  - 字段：`requestId`。

### 6.2 KernelRuntime -> Host

```ts
export type KernelRuntimeEnvelope =
  | KernelRuntimeAckEnvelope
  | KernelRuntimeEventEnvelope
  | KernelRuntimeErrorEnvelope
  | KernelRuntimePongEnvelope
```

基础 envelope 类型：

- `ack`
  - 字段：`requestId?`、`runtimeId?`、`conversationId?`、`turnId?`、`payload?`。
- `event`
  - 字段：`eventId?`、`conversationId?`、`turnId?`、`payload: KernelEvent`。
- `error`
  - 字段：`requestId?`、`error: KernelRuntimeErrorPayload`、`conversationId?`、`turnId?`。
- `pong`
  - 字段：`requestId?`、`runtimeId?`。

注意：`runtime.ready`、`conversation.ready`、`turn.started`、
`turn.completed`、`conversation.disposed`、`capabilities.reloaded` 等是
`KernelEvent.type` 的 taxonomy 名称，不是 envelope kind。当前 public
`KernelRuntimeEnvelopeKind` 只包含 `ack | event | error | pong`；host 不应把
生命周期事件编码成新的 envelope kind。

### 6.3 Envelope 字段规范

所有 wire message 都必须包在稳定 envelope 中。transport 可以不同，但 envelope schema 不能变成 desktop / Python / robot 各自的私有格式。

```ts
export type KernelRuntimeEnvelopeBase = {
  schemaVersion: 'kernel.runtime.v1'
  messageId: string
  requestId?: string
  conversationId?: string
  turnId?: string
  eventId?: string
  sequence: number
  timestamp: string
  source: 'kernel_runtime'
  kind: KernelRuntimeEnvelopeKind
  payload?: unknown
  error?: KernelRuntimeErrorPayload
  metadata?: Record<string, unknown>
}

export type KernelRuntimeErrorPayload = {
  code: KernelRuntimeErrorCode
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}
```

字段语义：

- `schemaVersion` 用于协议升级，不跟 npm package version 混用。
- `messageId` 是 envelope 自身唯一 ID；`requestId` 用于关联 host command。
- `conversationId` / `turnId` 只在对应作用域内出现；runtime-level 事件可以为空。
- `eventId` 只用于可 replay 的语义事件；ack / pong 不强制分配 eventId。
- `sequence` 是当前 transport stream 内单调递增序号，用于乱序检测。
- `timestamp` 使用 ISO 8601 UTC 字符串。
- `source` 固定为 `kernel_runtime`；host 转发到 SSE / IPC 时不得改写语义来源。
- `payload` 必须 JSON serializable，不得包含 class instance、function、AbortController、React object、Ink object 或 bootstrap singleton。
- `error.code` 必须稳定，host 可以基于 code 做 UI、重试和审计。

### 6.4 传输与兼容

- 本地 desktop worker 可以用 stdin/stdout NDJSON、Node IPC 或 fork IPC 承载同一协议。
- 其它语言 SDK 默认连接常驻 kernel process；传输可以是 HTTP、WebSocket、stdio NDJSON 或 Unix socket，但消息 schema 必须一致。
- 若控制事件和 runtime stream 共用 stdout，必须使用 envelope 分流，例如 `source: "kernel_runtime"`，不能把 raw `StdoutMessage` 当作协议层事件。
- `KernelEvent` 是唯一语义事件面；desktop SSE、Python callback、机器人事件循环都只是 host 映射。
- 当前 public surface 已提供 `KernelRuntimeWireTransport` /
  `KernelRuntimeWireClient` wrapper；`in-process` 与 `stdio` 两个 transport
  共用同一套 command / event 语义，host 不应再手写 NDJSON requestId /
  ack 关联逻辑。
- 协议必须支持 event replay：`eventId` 单调递增，host 可通过 `sinceEventId` 恢复断线后的事件。
- 当前 internal runner 已支持 opt-in event journal：
  `HARE_KERNEL_RUNTIME_EVENT_JOURNAL=<path>` 或
  `KernelRuntimeWireProtocolOptions.eventJournalPath` 会持久化 replayable
  event，并在进程重启后重新 hydrate replay buffer。
- 当前 internal runner 已支持 opt-in conversation snapshot journal：
  `HARE_KERNEL_RUNTIME_CONVERSATION_JOURNAL=<path>` 或
  `KernelRuntimeWireProtocolOptions.conversationJournalPath` 会持久化每个
  conversation 的最新 snapshot；进程重启后再次 `create_conversation` 会按
  `conversationId` 恢复 snapshot，把 crash 前 `running / aborting`
  conversation 归一化为 `detached`，并保留 active turn lock，后续
  `run_turn` 必须返回 `busy`，或由 host 先 `abort_turn` 清理。
- 上述 journal 只恢复事件 replay 与 conversation / active turn 状态，不等同于
  恢复 active tool / model execution；真正的执行续跑仍需要 durable tool/model
  execution contract。
- 同一 conversation 同一时间只允许一个 active turn；并发 turn 必须返回 `busy` 或要求 host 先 `abort_turn`。

### 6.5 多会话隔离

完整状态必须支持多 conversation / 多 host / 多 worker 并存。隔离边界不能只靠 host 约定，必须写入 kernel contract。

- 每个 `KernelConversation` 拥有独立的 message state、tool permission context、MCP connection view、hook context、task registry view、event buffer 和 active turn lock。
- conversation-local state 不得通过 process-global singleton 暴露给 host；必须经 runtime-owned session state 或显式 provider seam 访问。
- 同一 runtime 可以管理多个 conversation，但同一 conversation 同一时间只能有一个 active turn。
- 不同 conversation 的 stdout/stderr、tool progress、permission request、hook result、companion reaction、Kairos event 必须带 `conversationId` 或明确标记为 runtime-level event。
- worker/process 级隔离用于处理 stdout patch、bootstrap singleton 和 native/global side effect；但 worker 内 API 仍只能依赖 `@go-hare/hare-code/kernel`。
- `dispose_conversation` 后必须停止该 conversation 的 tool execution、MCP subscriptions、hook callbacks、task updates 和 pending side request；不得影响其它 conversation。
- 当前 wire transport wrapper 已维护 client-local live subscription scope：
  host 订阅某个 conversation 后，`in-process` / `stdio` live event fan-out
  不再把其它 conversation 的 event 推给该 client；runtime-level event 仍可
  广播。`create_conversation` 已拒绝同 `conversationId` 下不同
  `sessionId` / `workspacePath` 的复用，journal recovery 遇到 `sessionId`
  不匹配会跳过旧 snapshot。

### 6.6 Abort 与竞态语义

`abort_turn` 不是 best-effort UI 操作，而是协议级状态转换。以下竞态必须有稳定结果：

- abort-before-start：如果 `turnId` 尚未进入 running，返回稳定 `ack` /
  `error`，不得随后再发送 `turn.started`。
- abort-during-model-stream：停止模型 stream，发送 `turn.abort_requested`，
  最终以 `turn.completed` + `stopReason: "aborted"` 或 `turn.failed` 收敛，
  并标记是否已有 partial output。
- abort-during-tool：优先触发 tool cancellation；无法取消的 tool 必须继续隔离执行结果，不得把结果写回已 aborted turn。
- abort-after-complete：返回幂等 ack，不能把 completed turn 回退成 aborted。
- duplicate abort：同一 `turnId` 多次 abort 必须幂等，后续 envelope 复用最终状态。
- host disconnect：runtime 根据 conversation policy 决定 detach、continue 或 abort，并通过 replayable event 记录结果；当前 wire command 已提供 `connect_host` / `disconnect_host`，默认 policy 为 `detach`，可显式使用 `abort_active_turns` 终止 active turn。
- runtime dispose：必须先阻止新 turn，再 abort / drain active turn，最后释放 conversation resources。

### 6.7 与 JS API 的关系

- `createKernelRuntime()` 是 JS in-process API。
- `KernelRuntimeWireProtocol` 是同一语义 contract 的 out-of-process 形态。
- JS worker runner 可以用 `createKernelRuntime()` 实现 wire protocol。
- Python/Go/机器人 SDK 只认 wire protocol，不 import TS package，不读取 `src/*`。

## 7. 会话与 Headless 执行接口

状态：`Normative`

建议文件：

- `claude-code/src/kernel/headlessController.ts`
- `claude-code/src/kernel/headlessInputQueue.ts`
- `claude-code/src/kernel/headlessProvider.ts`
- `claude-code/src/kernel/events.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelHeadlessController = {
  readonly sessionId: string
  readonly state: KernelHeadlessControllerState
  start(): Promise<void>
  runTurn(request: KernelHeadlessRunTurnRequest): Promise<KernelHeadlessTurnStarted>
  abortTurn(request?: KernelHeadlessAbortRequest): Promise<void>
  dispose(reason?: string): Promise<void>
  onEvent(handler: (event: KernelHeadlessEvent) => void): () => void
}

export type KernelHeadlessInputQueue = AsyncIterable<string> & {
  pushUserTurn(turn: KernelHeadlessQueuedUserTurn): void
  pushInterrupt(request: KernelHeadlessQueuedInterrupt): void
  close(reason?: string): void
}
```

要求：

- `abortTurn()` 优先通过 SDK control `interrupt` 实现。
- controller 保证同一 conversation 单 active turn。
- raw `StdoutMessage` 必须归一化为 public `KernelHeadlessEvent`，不能要求 host 理解 runtime 内部对象。

## 8. Runtime Capabilities

状态：`Normative` `Implemented`

当前落地点：

- `src/runtime/contracts/capability.ts` 定义
  `KernelCapabilityDescriptor`、`KernelCapabilityStatus`、
  `KernelCapabilityReloadScope` 与 unavailable error code。
- `src/runtime/capabilities/defaultRuntimeCapabilities.ts` 定义 runtime 默认
  capability 名称、依赖、lazy / reloadable / optional 状态和按需 loader。
- `src/kernel/runtime.ts` 在 `KernelRuntime.capabilities` 上定义 host-facing
  descriptor API：raw list / get、view projection、family group、filter 和
  scoped reload。
- `src/kernel/capabilities.ts` 承载 descriptor -> host view 的 family / filter /
  group helper；这些 helper 面向 host 展示和能力选择，不等同于具体
  command/tool invoke schema。

```ts
export const KERNEL_CAPABILITY_FAMILIES = [
  'core',
  'execution',
  'model',
  'extension',
  'security',
  'host',
  'autonomy',
  'observability',
] as const

export type KernelRuntimeCapabilities = {
  list(): readonly KernelCapabilityDescriptor[]
  views(): readonly KernelCapabilityView[]
  get(name: KernelCapabilityName): KernelCapabilityDescriptor | undefined
  getView(name: KernelCapabilityName): KernelCapabilityView | undefined
  filter(filter?: KernelCapabilityFilter): readonly KernelCapabilityView[]
  groupByFamily(): KernelCapabilityGroups
  listByFamily(family: KernelCapabilityFamily): readonly KernelCapabilityView[]
  reload(scope?: KernelCapabilityReloadScope): Promise<readonly KernelCapabilityDescriptor[]>
}
```

语义：

- `list()` 返回 runtime 当前已知的 raw descriptor snapshot；host 不应根据
  import 内部模块来判断能力是否存在。
- `views()` / `getView()` 是给 host 展示和选择用的 projection，在 descriptor
  之外补 `family`、`ready`、`loaded`、`unavailable`、`optional`。
- `filter(...)` 支持按 `names`、`family`、`status`、`lazy`、
  `reloadable`、`optional`、`unavailable` 过滤，返回稳定排序后的
  `KernelCapabilityView[]`。
- `groupByFamily()` / `listByFamily(...)` 只做 descriptor view 分组，不触发
  loader，不代表该 family 下的具体 manager / invoke API 已经可用。
- `reload(scope)` 与 `runtime.reloadCapabilities(scope)` 等价，通过
  `reload_capabilities` wire command 进入 resolver；当前 reload 是
  descriptor / loader state refresh，返回新的 descriptor snapshot，并发出
  `capabilities.reloaded` event。

### 8.1 Capability families

当前 host-facing family 是展示和过滤维度，不改变底层 descriptor 的平面名称。

| Family | 当前 default capability names | 说明 |
| --- | --- | --- |
| `core` | `runtime`、`events` | runtime 生命周期与 event bus。 |
| `execution` | `conversation`、`turn`、`execution`、`memory`、`sessions` | conversation / turn 执行、记忆和会话能力。 |
| `model` | `provider` | model provider / auth 之前的模型源能力。 |
| `extension` | `plugins`、`skills`、`mcp`、`commands`、`tools`、`hooks`、`agents`、`tasks` | CLI 扩展系统能力；当前已开放 descriptor / reload / lifecycle / invoke 的第一层 public SDK contract，commands/tools 已有默认 executor，MCP auth interactive、hook runner 与 marketplace/options 仍通过 runtime service / host hook 收口。 |
| `security` | `permissions`、`auth` | permission broker、auth 依赖和安全决策能力。 |
| `host` | `server`、`bridge`、`daemon`、`background` | server / bridge / daemon / background host 能力。 |
| `autonomy` | `companion`、`kairos` | companion / Kairos 等主动能力；`kairos` 当前是 optional capability。 |
| `observability` | `logs` | logs / observability 能力。 |

未知 capability name 的 host view 默认归到 `extension`，避免新增 capability
让旧 host 直接崩掉；是否真的可调用仍以 descriptor `status` 和后续 manager API
为准。

### 8.2 Capability descriptor / status

完整状态下，capability resolver 必须同时支持完整声明与按需加载。

```ts
export type KernelCapabilityDescriptor = {
  name: KernelCapabilityName
  status: 'declared' | 'loading' | 'ready' | 'degraded' | 'failed' | 'disabled'
  lazy: boolean
  dependencies: KernelCapabilityName[]
  reloadable: boolean
  error?: KernelCapabilityError
  metadata?: Record<string, unknown>
}
```

状态语义：

| Status | 当前语义 |
| --- | --- |
| `declared` | resolver 已知道该 capability，且当前 enabled，但尚未完成 loader。 |
| `loading` | 当前 capability 或其依赖正在加载。 |
| `ready` | loader 成功完成；无 loader 的 capability 被 require 后也可进入 ready。 |
| `degraded` | contract 预留状态；当前默认 resolver 尚未主动产出。 |
| `failed` | loader 抛错；`error` 必须携带可观察失败信息。 |
| `disabled` | enabled policy 返回 false；例如 `kairos` 在未启用相关 feature env 时可处于 disabled。 |

加载 / intent 语义：

- resolver `listDescriptors()` 返回完整 descriptor 集合，即使某些 capability
  尚未加载。
- host intent 决定启用范围；kernel policy 决定默认、依赖和安全降级。
- `create_conversation.capabilityIntent` 当前支持
  `capabilities`、`requiredCapabilities`、`require`、`requires`、`load` 等
  字段，也支持 `{ tools: true }` 这类 boolean field。wire router 会映射到
  resolver `requireCapability(...)`，成功后产生 `capabilities.required`
  runtime event，并在 payload 中携带最新 descriptors。
- lazy capability 可以在 command execution、tool lookup、event subscription、
  host request、conversation intent 或 reload 后下一次 require 时触发加载。
- 加载失败必须进入 descriptor、manager API 和 public event；不能只写 debug log。
- reload 作用域已进入 public contract：单 capability、依赖闭包、workspace
  scope、runtime scope。
- capability 之间的依赖由 resolver 管理；host 不直接 import 内部 loader 或手工拼装 CLI 加载顺序。
- 禁用 capability 时，相关 commands/tools/hooks/events 必须给出稳定的 unavailable error，而不是消失成空列表。

### 8.3 已落地 / Future 边界

状态：`Implemented` `Future`

已落地：

- descriptor contract、status union、reload scope 与 error shape。
- 默认 capability graph：`runtime`、`events`、`conversation`、`turn`、
  `permissions`、`provider`、`auth`、`plugins`、`skills`、`mcp`、
  `commands`、`tools`、`hooks`、`agents`、`tasks`、`memory`、`sessions`、
  `execution`、`server`、`bridge`、`daemon`、`companion`、`kairos`、
  `background`、`logs`。
- resolver `listDescriptors()` / `getDescriptor()` / `requireCapability()` /
  `reloadCapabilities(...)`，以及 dependency closure reload。
- `KernelRuntime.capabilities` 的 host-facing list / get / view / filter /
  group / reload API 形态；这是 descriptor projection，不代表 per-family
  invoke manager 已完成。
- `KernelRuntime.commands` / `KernelRuntime.tools` 的 catalog + invoke
  contract：`list_commands` / `list_tools` / `execute_command` / `call_tool`
  wire command、in-process / stdio client method、SDK façade `list(...)` /
  `get(...)` / `execute(...)` / `call(...)`、command/tool descriptor filter、
  `commands.executed` / `tools.called` event 与 package declaration 已落地。
  默认 router 通过 optional catalog executor hook 调用，并在未注入 custom
  executor 时使用内建默认 executor：command executor 复用 command registry
  执行 non-interactive local command / prompt projection；tool executor 复用
  builtin tool registry 与非交互 `ToolUseContext` 执行 validation、
  permission mode、progress 与 structured result。不把内部
  `processSlashCommand(...)` 或完整 `ToolUseContext` 直接变成 public API。
- `KernelRuntime.mcp` 的 readonly / status / reload manager：
  `list_mcp_servers` / `list_mcp_tools` / `list_mcp_resources` / `reload_mcp`
  wire command、server/resource/tool binding snapshot 与 SDK façade 已落地。
- `KernelRuntime.mcp` 的 lifecycle contract：`connect_mcp` /
  `authenticate_mcp` / `set_mcp_enabled` wire command、in-process / stdio
  client method、SDK façade `connect(...)` / `authenticate(...)` /
  `clearAuth(...)` / `setEnabled(...)` / `enable(...)` / `disable(...)` 与
  `mcp.connected` / `mcp.authenticated` / `mcp.enabled_changed` event 已落地。
  默认 registry 已能按配置尝试 reconnect 与持久化 enable/disable；完整 OAuth
  交互仍由 host / runtime MCP service hook 注入。
- 默认 kernel runtime 的 MCP live plane 也已补齐到同一条主链：共享
  `createDefaultKernelRuntimeMcpPlane(...)` 现在同时供默认 `mcpRegistry`
  与默认 `toolCatalog` 复用，`list_mcp_resources` / `list_mcp_tools` /
  `list_tools` / `call_tool` 已不再分裂成 builtin-only 与 MCP-only 两套视图。
- `KernelRuntime.hooks` / `KernelRuntime.skills` / `KernelRuntime.plugins` 的
  catalog / lifecycle manager：`list_hooks` / `reload_hooks` / `run_hook` /
  `register_hook`、`list_skills` / `reload_skills` /
  `resolve_skill_context`、`list_plugins` / `reload_plugins` /
  `set_plugin_enabled` / `install_plugin` / `uninstall_plugin` /
  `update_plugin` wire command、in-process / stdio client method、SDK
  façade、filter、mutation result、`hooks.reloaded` / `hooks.ran` /
  `hooks.registered` /
  `skills.context_resolved` / `plugins.enabled_changed` /
  `plugins.installed` / `plugins.uninstalled` / `plugins.updated` event、
  `runtime.hooks.onEvent(...)` / `replay(...)` typed facade 与 package
  declaration 已落地。默认 skill resolver 已能通过 prompt command 生成
  prompt content；其中通过 `registerHook(...metadata.callback)` 注册的本地
  callback hook 已开始由 kernel 默认 hook catalog 直接执行，不再依赖
  bootstrap 全局 hook registry。默认 hook runner 已能在 runtime catalog 内
  执行 settings / bootstrap-registered / plugin hook matchers；plugin
  marketplace/options lifecycle 仍由 host / runtime service hook 注入，避免把
  内部 UI callback 泄到 public API。
- `KernelRuntime.commands` / `KernelRuntime.tools` / `KernelRuntime.skills`
  现在也已补齐 typed event facade：`runtime.commands.onEvent(...)` /
  `replay(...)`、`runtime.tools.onEvent(...)` / `replay(...)`、
  `runtime.skills.onEvent(...)` / `replay(...)` 均已进入 package root。
  `commands.executed` / `tools.called` / `skills.reloaded` /
  `skills.context_resolved` payload 可直接通过
  `getKernelCommandExecutionResult(...)` / `getKernelToolCallResult(...)` /
  `getKernelSkillSnapshot(...)` /
  `getKernelSkillPromptContextResult(...)` 消费，不再要求 host 自己拆 raw
  replay envelope。
- session continuation 的集中化也开始落地：`resumeSessionAt` 不再只存在于
  headless print loop，现已进入 `resume_session` wire 主链与
  `runtime.sessions.resume(...)` façade；runtime wire router 与 headless
  bootstrap 复用同一套 transcript slicing helper，而不是继续各自维护一套
  resume message 裁剪语义。
- MCP OAuth callback 的 desktop-required 主链已落地：`authenticate_mcp`
  / `KernelRuntime.mcp.authenticate(...)` 可携带 `callbackUrl`，默认 runtime MCP
  registry 会用 `skipBrowserOpen + onWaitingForCallback` 把 host 提交的 callback
  URL 注入现有 `performMCPOAuthFlow`，再清 auth cache 并 reconnect server；
  `clearAuth(...)` 也走同一 lifecycle registry，不再要求 host 绕过 runtime
  私自处理 token 清理。
- `KernelRuntime.agents` / `KernelRuntime.tasks` 的 registry / task-list
  manager：`list_agents` / `reload_agents` / `spawn_agent`、`list_tasks` /
  `get_task` / `create_task` / `update_task` / `assign_task` 以及
  `list_agent_runs` / `get_agent_run` / `get_agent_output` /
  `cancel_agent_run` wire command、in-process / stdio client method、SDK
  façade、filter / mutation result 与 package declaration 已落地。task
  mutation 默认复用现有 task-list 存储与 TaskCreated / TaskCompleted hook；
  agent spawn 是 runtime-owned spawner contract，run lifecycle 由同一个
  runtime registry 管理，真实 executor 可由 host / runner 注入，不能回退成
  host 私有 side-channel。`KernelRuntime.coordinator.invoke(...)` 现在也已补上
  第一层组合操作：同一条 runtime-owned chain 内可串起 task create /
  assign、worker spawn 与 `taskExecution` linkage 回写。默认
  `agentRegistry.spawnAgent(...)` 在携带 `taskId` 时也会自动把
  `linkedBackgroundTaskId` / `linkedAgentId` 与 `ownedFiles` 回写到 task
  storage，不再要求 host 自己补一轮 metadata patch。与此同时，
  `runtime.agents.onEvent(...)` / `replay(...)` 与
  `runtime.tasks.onEvent(...)` / `replay(...)` 也已开放 typed facade，
  `agents.spawned` / `agents.run.cancelled` / `tasks.created` /
  `tasks.updated` / `tasks.assigned` 不再要求 host 自己拆 raw envelope。
- `reload_capabilities` wire command、`capabilities.required` /
  `capabilities.reloaded` event。
- runtime-owned materializer / refresh bundle 已接住 headless / interactive
  command、agent、plugin、MCP、hook、startup refresh 的主要装配责任。
- `degraded` capability policy 已进入 resolver：optional 或显式
  `degradeOnFailure` capability 加载失败时会保留 error 并进入 `degraded`，
  非 optional capability 仍保持 `failed` / unavailable 语义。

仍是 future，不能写成已完成：

- 更完整的 command 参数 schema 与 plugin / MCP tool 深层 executor matrix；
  当前默认 command/tool executor 已能覆盖 builtin non-interactive local
  command、prompt command projection 与 builtin tool call，但不代表所有
  plugin / MCP / interactive UI 命令都已具备 hostless 执行语义。
- 完整 MCP OAuth 浏览器自动打开策略、错误展示与跨 host UX；
  callback URL completion 与 clear-auth runtime lifecycle 已有默认 registry
  path；浏览器打开、错误文案与远程宿主交互属于 host-owned UX，
  不能写成 kernel 默认自动打开已完成。
- plugin marketplace discovery/options lifecycle、
  更深的 coordinator / subagent executor。默认 hook runner、hook run /
  register、skill prompt context resolve、plugin enable / disable / install /
  uninstall / update 的第一层 public contract 已落地；`KernelRuntime.coordinator.invoke(...)` 也已形成第一层
  invocation schema；剩余是把 plugin marketplace/options executor、更深的
  coordinator / subagent executor 写入该 run registry。
- 跨 host 的 degraded 展示文案与长期兼容矩阵。
- descriptor snapshot 与 manager object 之间的长期 semver 兼容矩阵。

## 9. Command 系统

状态：`Normative` `Implemented`

建议文件：`claude-code/src/kernel/commands.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

当前落地点：

- public SDK 已开放 catalog 与 execute contract。
- `src/runtime/contracts/command.ts` 定义 `RuntimeCommandDescriptor`、
  `RuntimeCommandGraphEntry`、`RuntimeCommandExecuteRequest` 与
  `RuntimeCommandExecutionResult`。
- `src/runtime/capabilities/commands/runtimeCommandGraph.ts` 把内部
  `Command` union 投影成稳定 descriptor，不泄露 Ink / lazy load /
  `processSlashCommand(...)` 执行细节。
- wire 层已新增 `list_commands` 与 `execute_command`；
  `KernelRuntime.commands.list(...)` / `descriptors(...)` / `get(...)` /
  `execute(...)` 走同一 wire client，in-process 和 stdio 行为一致。
- router 通过 `commandCatalog.executeCommand(...)` optional hook 执行并发出
  `commands.executed` event；默认 catalog 已内建 non-interactive local
  command / prompt projection executor，custom catalog 未提供 executor 时才返回
  unavailable。

```ts
export type KernelCommandRegistry = {
  list(filter?: KernelCommandFilter): Promise<readonly KernelCommandEntry[]>
  descriptors(filter?: KernelCommandFilter): Promise<readonly KernelCommandDescriptor[]>
  get(name: string): Promise<KernelCommandEntry | undefined>
  execute(
    nameOrRequest: string | KernelCommandExecuteRequest,
    options?: Omit<KernelCommandExecuteRequest, 'name'>,
  ): Promise<KernelCommandExecutionResult>
}
```

范围：

- 内置 slash commands。
- plugin commands。
- skills/commands 目录派生出的命令。
- host-provided commands。

要求：

- command metadata、execute request/result 与 SDK façade 已进入 public API；
  不能直接公开现有 `Command` union 或 `processSlashCommand(...)`。
- 默认 executor 已在 runtime capability 层内建；后续补更完整参数 schema 和
  plugin / MCP / interactive UI 命令矩阵时，仍不能让 host 绕回 CLI 私有实现。
- CLI 的菜单、快捷键、Ink 渲染不进入 public API。

## 10. Tool / Permission / MCP 系统

状态：`Normative` `Implemented`

建议文件：

- `claude-code/src/kernel/tools.ts`
- `claude-code/src/kernel/permissions.ts`
- `claude-code/src/kernel/mcp.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

当前落地点：

- public SDK 已开放 agent registry / task-list manager，并补上
  `KernelRuntime.agents.spawn(...)`、`KernelRuntime.tasks.create(...)` /
  `update(...)` / `assign(...)` 这一组 runtime-owned invoke / mutate contract。
  task mutation 默认落到现有 task-list 存储；agent spawn 返回 stable
  `runId`，并可通过 `runs(...)` / `status(...)` / `output(...)` /
  `result(...)` / `cancel(...)` 走同一 runtime-owned run registry。默认
  agent registry 已内置 process-backed executor，真实执行不再要求 host 自己维护
  pending run；自定义 host 仍可替换 `KernelRuntimeWireAgentRegistry`，或用
  `agentExecutor: false` 禁用默认执行器。
- `src/runtime/contracts/agent.ts` 定义 agent descriptor / snapshot；
  `KernelRuntime.agents.list(...)` / `all(...)` / `get(...)` / `snapshot()` /
  `reload()` / `spawn(...)` / `runs(...)` / `status(...)` / `output(...)` /
  `result(...)` / `cancel(...)` 通过 `list_agents` / `reload_agents` /
  `spawn_agent` / `list_agent_runs` / `get_agent_run` /
  `get_agent_output` / `cancel_agent_run` wire command 读取 / 调用同一个
  runtime agent registry。
- `src/runtime/contracts/task.ts` 定义 coordinator task descriptor / snapshot；
  `KernelRuntime.tasks.list(...)` / `get(...)` / `snapshot()` /
  `create(...)` / `update(...)` / `assign(...)` 通过 `list_tasks` /
  `get_task` / `create_task` / `update_task` / `assign_task` wire command 读取 /
  修改同一个 runtime task-list registry。

```ts
export type KernelToolCatalog = {
  list(filter?: KernelToolFilter): Promise<readonly KernelToolDescriptor[]>
  get(name: string): Promise<KernelToolDescriptor | undefined>
  call(
    nameOrRequest: string | KernelToolCallRequest,
    input?: unknown,
    options?: Omit<KernelToolCallRequest, 'toolName' | 'input'>,
  ): Promise<KernelToolCallResult>
}

export type KernelPermissionBridge = {
  request(request: KernelPermissionRequest): Promise<KernelPermissionDecision>
}

export type KernelMcpManager = {
  listServers(): KernelMcpServerDescriptor[]
  listTools(): KernelToolDescriptor[]
  connect(request?: KernelMcpConnectRequest): Promise<KernelMcpConnectionSnapshot>
  disconnect(serverName: string): Promise<void>
}
```

范围：

- builtin tools。
- MCP tools。
- plugin tools。
- host-provided tools。
- tool allow/deny policy。
- permission request/decision schema。

要求：

- tool descriptor catalog 与 call contract 已经落地为 SDK surface：
  `list_tools` / `call_tool` wire command、`KernelRuntime.tools.list(...)` /
  `get(...)` / `call(...)`、source/safety/provenance/schema projection、
  `KernelToolCallRequest` / `KernelToolCallResult` 与 public declaration。
- router 通过 `toolCatalog.callTool(...)` optional hook 执行并发出
  `tools.called` event；默认 catalog 已内建 builtin tool executor，覆盖
  validation、permission mode、progress 和 structured result。完整
  `ToolUseContext` / permission / hook / progress 私有对象仍不能直接暴露。
- permission UI 属于 host；permission request/decision schema 属于 kernel。
- MCP server lifecycle 与 tool catalog 要能被 host 查询和 reload。

### 10.1 Permission 决策生命周期

状态：`Normative` `Implemented`

permission 是 kernel 与 host 之间的协议，不是 UI callback。完整状态必须覆盖请求、展示、决策、超时、审计和回放。

```ts
export type KernelPermissionRequest = {
  permissionRequestId: string
  conversationId: string
  turnId?: string
  toolName: string
  action: string
  argumentsPreview: unknown
  risk: KernelPermissionRisk
  policySnapshot: KernelToolPolicySnapshot
  timeoutMs?: number
  metadata?: Record<string, unknown>
}

export type KernelPermissionDecision = {
  permissionRequestId: string
  decision: 'allow' | 'deny' | 'allow_once' | 'allow_session' | 'abort'
  decidedBy: 'host' | 'policy' | 'timeout' | 'runtime'
  reason?: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}
```

要求：

- permission request 必须以 `KernelPermissionEvent` 形式可观察，并可由 wire protocol 传给 host。
- 当前 wire protocol 已提供 `decide_permission` command，字段复用
  `KernelPermissionDecision`：`permissionRequestId`、`decision`、`decidedBy`、
  `reason?`、`expiresAt?`、`metadata?`。host 不需要 import runtime 内部
  broker，只通过 wire command 提交决策。
- `KernelRuntimeWireClient.decidePermission(...)` 已覆盖 `in-process` 与
  `stdio` transport；未知 `permissionRequestId` 必须返回 stable `not_found`，
  不得静默成功。
- `KernelRuntimeWireTurnExecutionContext.permissionBroker` 让 in-process
  executor 可以直接挂起在 runtime broker 上；host 通过同一个
  `decide_permission` command 推进执行。旧 SDK / REPL prompt path 必须
  收敛成 compatibility adapter，而不是继续自持不可 replay 的 pending
  permission state。
- 当前 source-level 统一注册点是 `hasPermissionsToUseTool(...)`。host 在
  `ToolUseContext.runtimePermission` 注入会话级 `RuntimePermissionBroker` 后，
  ask 决策会先注册 `KernelPermissionRequest`，allow / deny 决策会在
  permission evaluation 层完成 audit finalization；这避免 REPL、SDK、
  headless、ACP 各自维护独立 pending map。
- `ToolUseContext.runtimePermission` 是 legacy permission pipeline 与 runtime
  permission contract 之间的兼容 seam。它可以携带 `permissionBroker`、
  `getConversationId()`、`getTurnId()` 和 request controller registry；host
  只注入 context，不直接调用 runtime 内部 adapter。
- SDK stdio / structured IO 的 compatibility layer 已按 broker-first
  语义改造：`StructuredIO.createCanUseTool(...)` 可以注入共享
  `RuntimePermissionBroker`，legacy `control_request` / `control_response`
  只负责兼容旧 host protocol；外部 host 通过 broker / wire decision
  resolve 时，runtime 会取消旧 stdio prompt，避免双 source of truth。
- MCP `--permission-prompt-tool` 和 sandbox network ask 已按同一原则接入
  broker-first glue；legacy MCP tool call 与 synthetic stdout `can_use_tool`
  只保留为 compatibility transport，决策仍归一到
  `KernelPermissionDecision` / `permissionRequestId`。
- remote / direct-connect / SSH compatibility transports 必须保留并传递
  `toolUseID` 与 decision classification；direct-connect 还必须消费
  `control_cancel_request` 清理本地 pending prompt，避免用户响应 stale
  permission request。
- REPL local permission queue 与 bridge remote permission response 已按
  compatibility adapter 方式接入 runtime broker：REPL 仍保留现有 Ink UI 与
  bridge callback protocol，但 `KernelPermissionRequest` 先以 `toolUseID`
  注册，最终 allow / deny / abort 归一成 `KernelPermissionDecision`；bridge
  remote response metadata 保留 `resolvedBy = repl_bridge_remote` 与原始
  permission tool output。
- ACP session 已给 `QueryEngine` 注入会话级 runtime permission context，避免
  ACP 的 `canUseTool` path 绕过统一 broker。direct-connect / remote / SSH
  继续保留现有 transport message，但必须传递 `toolUseID` 和 decision
  classification，让 broker 可以按同一 `permissionRequestId` 审计。
- host 负责展示和采集用户决策；kernel 负责 policy evaluation、默认拒绝、超时处理和审计事件。
- timeout 未决时默认拒绝或 abort，不能默认 allow。
- decision 必须绑定 `permissionRequestId`，不能只靠 toolName / turnId 推断。
- 允许范围必须显式区分 once、session、workspace、policy rule；不得把一次同意扩展成长期授权。
- permission error、deny、timeout、host disconnect 都必须产生稳定 public event。

## 11. Hooks 系统

状态：`Normative` `Implemented`

建议文件：`claude-code/src/kernel/hooks.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelHookRegistry = {
  list(eventName?: KernelHookEventName): KernelHookDefinition[]
  register(hook: KernelHookDefinition): Promise<KernelHookRegistration>
  unregister(registrationId: string): Promise<void>
  run(request: KernelHookRunRequest): Promise<KernelHookRunResult>
}

export type KernelHookEventName =
  | 'SessionStart'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Stop'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
```

要求：

- 当前 public SDK 已开放 hook catalog 与第一层 run / register contract。
  `KernelRuntime.hooks.list(...)` / `reload(...)` / `run(...)` /
  `register(...)` 分别走 `list_hooks` / `reload_hooks` / `run_hook` /
  `register_hook` wire command。
- `src/runtime/contracts/hook.ts` 定义 `RuntimeHookDescriptor`、
  `RuntimeHookSource`、`RuntimeHookType`、`RuntimeHookRunRequest`、
  `RuntimeHookRunResult`、`RuntimeHookRegisterRequest` 与
  `RuntimeHookMutationResult`。
- 默认 router 已内建非交互 hook runner，可执行 settings hooks、
  bootstrap-registered hooks 与显式加载的 plugin hook matchers；CLI UI
  callback 与 private `ToolUseContext` 仍不得泄入 public API。
- hooks 可以来自 settings、agent frontmatter、plugins、host-provided hooks。
- `registeredHooks` 进入 runtime bootstrap seam，不让 host 直接写 bootstrap singleton。
- hook 运行过程和结果要输出 `hooks.ran` / `hooks.registered` public event。

## 12. Skills / Plugins 系统

状态：`Normative` `Implemented`

建议文件：

- `claude-code/src/kernel/skills.ts`
- `claude-code/src/kernel/plugins.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelSkillCatalog = {
  list(): KernelSkillDescriptor[]
  resolve(name: string): KernelSkillDescriptor | null
  getPromptContext(names?: string[]): Promise<KernelSkillPromptContext>
  reload(request?: KernelSkillReloadRequest): Promise<KernelSkillCatalogSnapshot>
}

export type KernelPluginManager = {
  list(): KernelPluginDescriptor[]
  getErrors(): KernelPluginError[]
  reload(request?: KernelPluginReloadRequest): Promise<KernelPluginReloadResult>
}
```

要求：

- 当前 public SDK 已开放 skill catalog + prompt context resolve，以及 plugin
  status catalog + enable / disable / install / uninstall / update lifecycle mutation。
- `src/runtime/contracts/skill.ts` 与 `src/runtime/contracts/plugin.ts` 定义
  descriptor / snapshot / mutation result；`KernelRuntime.skills.list(...)` /
  `get(...)` / `reload(...)` / `resolveContext(...)` 与
  `KernelRuntime.plugins.list(...)` / `status()` / `reload()` /
  `setEnabled(...)` / `enable(...)` / `disable(...)` / `install(...)` /
  `uninstall(...)` 通过 `list_skills` /
  `reload_skills` / `resolve_skill_context`、`list_plugins` /
  `reload_plugins` / `set_plugin_enabled` / `install_plugin` /
  `uninstall_plugin` / `update_plugin` wire command 读取和修改同一 runtime catalog。
- 默认 skill resolver 已通过 prompt command 生成 prompt content。plugin enable /
  disable 默认通过 settings-first `setPluginEnabledOp(...)` 落地，install /
  uninstall/update 默认通过 `installPluginOp(...)` / `uninstallPluginOp(...)` /
  `updatePluginOp(...)` 落地；marketplace discovery/options 仍是后续更深
  lifecycle。
- skills 加载覆盖 bundled、user、project、managed、MCP、plugin skills。
- plugins 加载覆盖 marketplace、本地、managed、user/project scope plugins。
- plugin 产生的 commands、agents、hooks、MCP、skills、tools 必须进入统一 capability resolver；当前 commands / agents / hooks / plugin MCP diff 已有 runtime-owned adapter，interactive MCP connection manager 的 config/connect/reconnect/toggle/channel/list_changed lifecycle 已进入 `RuntimeInteractiveMcpService`，channel allowlist 由 host option 注入，React 层只保留 UI adapter callback。
- loading errors 与 lifecycle mutation 必须通过 public manager API 和 public
  event 暴露。

## 13. Agents / Coordinator / Task 系统

状态：`Normative` `Implemented`

建议文件：

- `claude-code/src/kernel/agents.ts`
- `claude-code/src/kernel/tasks.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelAgentRegistry = {
  list(): KernelAgentDescriptor[]
  resolve(name: string): KernelAgentDescriptor | null
  spawn(request: KernelAgentSpawnRequest): Promise<KernelAgentSpawnResult>
  runs(filter?: KernelAgentRunFilter): Promise<KernelAgentRunDescriptor[]>
  status(runId: string): Promise<KernelAgentRunDescriptor | undefined>
  output(runId: string, options?: KernelAgentOutputOptions): Promise<KernelAgentOutput>
  result(runId: string): Promise<unknown>
  cancel(runId: string, options?: KernelAgentCancelOptions): Promise<KernelAgentCancelResult>
}

export type KernelTaskManager = {
  create(request: KernelTaskCreateRequest): Promise<KernelTaskMutationResult>
  update(request: KernelTaskUpdateRequest): Promise<KernelTaskMutationResult>
  assign(request: KernelTaskAssignRequest): Promise<KernelTaskMutationResult>
  list(filter?: KernelTaskListFilter): Promise<KernelTask[]>
  get(taskId: string): Promise<KernelTask | null>
}
```

范围：

- built-in agents。
- project/user/plugin agents。
- coordinator mode。
- subagent spawn。
- task tools。
- owned files / write guard。
- worker result validation。

要求：

- 当前 public SDK 已落地 `KernelRuntime.agents.spawn(...)` 与
  `KernelRuntime.agents.runs/status/output/result/cancel(...)`，以及
  `KernelRuntime.tasks.create/update/assign(...)` 的 wire contract；task mutation
  必须复用现有 task storage / hooks / metadata 语义，agent spawn 默认经
  process-backed executor 复用 CLI/headless `--agent` 主链路，并把
  output/result/cancel 写回 runtime-owned run registry；不允许 host 绕过
  kernel 自己维护一套私有 pending 状态。
- coordinator prompt、allowed tools、task APIs、write guard 必须作为同一个 contract 验证。
- host 可以自己展示 agent/team UI；kernel 负责 agent/task 行为和事件。

## 14. Pet / Companion 系统

状态：`Normative`

建议文件：`claude-code/src/kernel/companion.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelCompanionRuntime = {
  getState(): Promise<KernelCompanionState | null>
  dispatch(action: KernelCompanionAction): Promise<KernelCompanionState | null>
  reactToTurn(request: KernelCompanionReactionRequest): Promise<void>
  onEvent(handler: (event: KernelCompanionEvent) => void): () => void
}
```

范围：

- companion state。
- hatch / rehatch。
- mute / unmute。
- pet action。
- turn 后 reaction。

要求：

- companion reaction 是 side request，不阻塞主 turn。
- reaction 失败必须以 public event 或 error event 可见，不能静默吞掉。
- sprite、头像、气泡、终端像素画属于 host renderer，不属于 kernel API。

## 15. Kairos / Proactive 系统

状态：`Normative`

建议文件：`claude-code/src/kernel/kairos.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelKairosRuntime = {
  getStatus(): KernelKairosStatus
  enqueueEvent(event: KernelKairosExternalEvent): Promise<void>
  tick(request?: KernelKairosTickRequest): Promise<void>
  suspend(reason?: string): Promise<void>
  resume(reason?: string): Promise<void>
  onEvent(handler: (event: KernelKairosEvent) => void): () => void
}
```

范围：

- `kairosEnabled`。
- proactive tick。
- brief 输出。
- channel/webhook event。
- dream / memory consolidation。
- push notification。
- long-running assistant mode。

要求：

- Kairos 不应只是 boolean flag；它要成为可观察、可暂停、可恢复、可注入事件的 public capability。
- host 决定展示为通知、日志、频道消息、后台任务还是 UI badge。

## 16. Memory / Context / Session 系统

状态：`Normative`

建议文件：

- `claude-code/src/kernel/memory.ts`
- `claude-code/src/kernel/context.ts`
- `claude-code/src/kernel/sessions.ts`

必须从 `@go-hare/hare-code/kernel` 导出。

```ts
export type KernelMemoryManager = {
  list(): Promise<KernelMemoryDescriptor[]>
  read(id: string): Promise<KernelMemoryDocument>
  update(request: KernelMemoryUpdateRequest): Promise<KernelMemoryDocument>
}

export type KernelSessionManager = {
  list(filter?: KernelSessionListFilter): Promise<KernelSessionDescriptor[]>
  resume(sessionId: string): Promise<KernelConversation>
  getTranscript(sessionId: string): Promise<KernelTranscript>
}
```

范围：

- AGENTS.md / project context。
- user/project memory。
- transcript。
- compaction。
- session list/resume。
- background/daemon session status。

要求：

- context assembly 和 compaction hook 结果要可观察。
- host 可以自己展示 memory/session UI；kernel 负责数据和行为 contract。

## 17. Event Surface

状态：`Normative` `Implemented`

当前落地点：

- `src/runtime/contracts/events.ts` 定义 generic `KernelEvent` 与
  `KernelRuntimeEnvelopeBase`。
- `src/kernel/runtime.ts` 暴露 `KernelRuntime.onEvent(...)` /
  `replayEvents(...)`、`KernelConversation.onEvent(...)` /
  `replayEvents(...)`，以及 turn-scoped `KernelTurn.onEvent(...)` /
  `replayEvents(...)`。
- `src/kernel/runtimeEvents.ts` 定义 `KernelRuntimeEventEnvelope` /
  `KernelRuntimeEventHandler`、`KERNEL_RUNTIME_EVENT_TAXONOMY`、
  `KERNEL_RUNTIME_EVENT_TYPES`、`KernelRuntimeEventType`、event category /
  taxonomy lookup，以及 envelope-level guard / collector；root surface 通过
  `runtime.ts` 统一导出这些 public names。
- `src/kernel/events.ts` 暴露 compatibility event facade helper：
  `createKernelRuntimeEventFacade(...)`、
  `toKernelRuntimeEventMessage(...)`、
  `getKernelRuntimeEnvelopeFromMessage(...)`、
  `getKernelEventFromEnvelope(...)`、
  `consumeKernelRuntimeEventMessage(...)` 与 `isKernelRuntimeEnvelope(...)`。

```ts
export type KernelEvent = {
  runtimeId?: string
  conversationId?: string
  turnId?: string
  type: string
  eventId?: string
  replayable: boolean
  payload?: unknown
  metadata?: Record<string, unknown>
}

export type KernelRuntimeEventEnvelope =
  KernelRuntimeEnvelopeBase<KernelEvent> & {
    kind: 'event'
    payload: KernelEvent
  }
```

要求：

- 不把 CLI 内部 message/render object 泄漏给 host。
- 文本流、工具进度、权限请求、hook 结果、plugin error、companion reaction、Kairos tick 都通过统一 event surface 出来。
- 桌面端 SSE 只是 `KernelEvent` 的一个 host 映射，不是内核协议本身。
- 所有事件都必须能被 `KernelRuntimeEnvelope` 承载，且具备稳定 replay / ordering / scope 语义。
- compatibility transport 可以继续发送旧 `SDKMessage` / `control_*`，但
  runtime-owned events 必须以 `type: "kernel_runtime_event"` 包装
  `KernelRuntimeEnvelope` 双写；host 入口必须把它路由到 runtime event sink，
  不得把它当未知 UI message 丢弃。
- 当前阶段已经把 event type taxonomy 与基础 helper 代码化；`KernelEvent`
  本身仍保持 generic event object，payload-specific discriminated union 以后可在
  不改变 wire schema 的前提下继续补。

### 17.1 Public event taxonomy

当前 public taxonomy 使用 `<domain>.<name>` 命名。稳定字段分两层：

- envelope 稳定字段：`schemaVersion`、`messageId`、`requestId?`、
  `runtimeId?`、`conversationId?`、`turnId?`、`eventId?`、`sequence`、
  `timestamp`、`source`、`kind`、`payload?`、`error?`、`metadata?`。
- event 稳定字段：`runtimeId?`、`conversationId?`、`turnId?`、`type`、
  `eventId?`、`replayable`、`payload?`、`metadata?`。

| Domain | 当前 stable event type | Scope | Replay | 稳定 payload 字段 |
| --- | --- | --- | --- | --- |
| runtime | `runtime.ready` | runtime | yes | `runtimeId`、`workspacePath` |
| host | `host.connected`、`host.reconnected`、`host.disconnected` | runtime | yes | `host` 或 `hostId`、`policy?`、`reason?`、`abortedTurnIds?`、`sinceEventId?`、`replayedEvents?` |
| conversation | `conversation.ready`、`conversation.recovered`、`conversation.disposed`、`conversation.snapshot_failed` | conversation | ready/recovered/disposed yes；snapshot_failed no | `KernelConversationSnapshot` 字段；disposed 额外 `reason`；snapshot_failed 至少 `message` |
| turn | `turn.started`、`turn.abort_requested`、`turn.output_delta`、`turn.completed`、`turn.failed` | turn | yes by default | `KernelTurnSnapshot` 字段；`turn.output_delta` 是 renderer-neutral delta payload，当前 host 可消费 `text` 等序列化字段 |
| headless internal bridge | `headless.sdk_message` | turn | yes | SDKMessage payload；只作为内部 transitional projection，不是 public host contract，也不是新的 semantic source of truth |
| permission | `permission.requested`、`permission.resolved` | conversation/turn | yes | `permissionRequestId`、`toolName`、`action`、`risk`、`decision?`、`decidedBy?`、`reason?` |
| capability | `capabilities.required`、`capabilities.reloaded` | runtime/conversation | yes | `capabilities`、`descriptors`、`scope?` |
| extension | `commands.executed`、`tools.called`、`mcp.reloaded`、`mcp.connected`、`mcp.authenticated`、`mcp.enabled_changed`、`hooks.reloaded`、`hooks.ran`、`hooks.registered`、`skills.reloaded`、`skills.context_resolved`、`plugins.reloaded`、`plugins.enabled_changed`、`plugins.installed`、`plugins.uninstalled`、`plugins.updated`、`agents.reloaded`、`agents.spawned`、`agents.run.cancelled`、`tasks.created`、`tasks.updated`、`tasks.assigned` | runtime | yes | per-family command result / tool result / MCP lifecycle / hook result / skill context / plugin mutation / agent or task mutation payload |
| host-published | host event via `publish_host_event` | provided by host event | event-defined | host 必须提供 serializable `type`、`replayable`、`payload?`；runtime 会补 `metadata.publishedBy = "host"` 与 `requestId` |

命名约束：

- runtime-owned event type 只能使用已定义 domain，新增 domain 必须先进入本文
  taxonomy，再进入 package-level helper / tests。
- host-published event 建议使用 host 自有前缀，例如
  `desktop.focus_changed`、`robot.sensor_frame`，不得伪装成 runtime-owned
  `turn.*` / `permission.*` 事件。
- `headless.sdk_message` 是 compatibility domain；新 host 不应围绕它设计
  primary workflow，应优先消费 `turn.*`、`permission.*` 和 capability events。

### 17.2 Event ordering 与 replay

- `KernelEvent` 是语义事件；`KernelRuntimeEnvelope` 是传输 envelope。两者不能混用。
- 每个 replayable event 必须有 `eventId`。当前 `RuntimeEventBus` 以
  `conversationId ?? runtimeId` 作为 event id scope key，在该 scope 内递增；
  `sequence` 是当前 transport stream 内递增序号，用于乱序检测。
- runtime-level event 与 conversation-level event 使用不同 scope；host 订阅时可以按 scope 过滤。
- replay 必须支持 `sinceEventId`，并明确返回 gap / expired / unavailable 错误。
- partial text、tool progress、permission request、hook result、compaction、
  companion reaction、Kairos tick 都必须标明是否 replayable；当前已落地事件
  的 replay 状态见上表。
- event payload 必须可序列化；host renderer 专用字段只能放在 host mapping 层。
- 当前 internal headless stream-json verbose 已输出 `kernel_runtime_event`，
  覆盖 permission audit、conversation / turn lifecycle 和
  `headless.sdk_message`；direct-connect、remote、SSH、bridge ingress 已接入
  runtime envelope adapter。direct-connect 已在保留 raw NDJSON backlog 的同时
  通过 runtime-owned `KernelRuntimeEventFacade` 提供 runtime envelope sidecar
  backlog / replay facade；REPL transport ingress 也使用同一个 facade 进行
  ingest / dedupe / replay 语义归一。remote / direct-connect / SSH host hooks
  已开始直接消费 `turn.completed` / `turn.failed` 作为 terminal loading
  signal，并把 runtime event 作为 remote timeout heartbeat；`headless.sdk_message`
  也会进入同一个 host-side SDK render handler，按稳定 `uuid` / assistant
  message id 去重，避免 compatibility stream 与 runtime event 双写 UI。
  对不携带 SDK payload 的纯 semantic `turn.output_delta`，REPL transport
  host 也已通过同一 host adapter 做文本预览与 terminal 落盘。bridge core
  现在正式暴露 `onRuntimeEvent` sink，`headless.sdk_message` payload 会回落到
  legacy SDK ingress，避免 envelope 到 bridge 后只 log 或静默吞掉。
  ACP bridge 也已进入同一 event model：ACP prompt producer 会通过会话级
  `RuntimeEventBus` 生成 `turn.started`、`headless.sdk_message` 与 terminal
  turn envelope，ACP forwarding 层消费 runtime envelope 并按稳定 SDK
  `uuid` / assistant message id 去重，保留旧 ACP `session/update` 输出语义。
  direct-connect print host (`runConnectHeadlessRuntime`) 也已接入同一 helper：
  `headless.sdk_message` 可作为 SDK result fallback，纯 `turn.output_delta`
  可在 terminal event 后生成文本输出。RCS bridge normalize 与 WS outbound /
  worker SSE path 已把
  `kernel_runtime_event.envelope` 作为 first-class 字段保真传递。
  `@go-hare/hare-code/kernel` 已开放
  `createKernelRuntimeEventFacade(...)`、`toKernelRuntimeEventMessage(...)`、
  `getKernelRuntimeEnvelopeFromMessage(...)` 与
  `consumeKernelRuntimeEventMessage(...)`，host 可以把这些 compatibility
  event 统一 ingest / subscribe / replay。

### 17.3 Typed helper 边界

当前已落地 helper 包括 taxonomy 级与 envelope 级：

- `KERNEL_RUNTIME_EVENT_TAXONOMY` / `KERNEL_RUNTIME_EVENT_TYPES` /
  `KernelRuntimeEventType`：稳定事件类型清单。
- `getKernelRuntimeEventType(...)` /
  `getKernelRuntimeEventCategory(...)` /
  `getKernelRuntimeEventTaxonomyEntry(...)`：事件分类与 taxonomy lookup。
- `isKnownKernelRuntimeEventType(...)` /
  `isKernelRuntimeEventOfType(...)` / `isKernelTurnTerminalEvent(...)`：
  package-level type guard。
- `KernelRuntimeEventEnvelope` / `KernelRuntimeEventHandler`：供
  `KernelTurn.onEvent(...)` 与 `KernelTurn.replayEvents(...)` 使用的 typed event
  envelope。
- `isKernelRuntimeEnvelope(...)`、`getKernelEventFromEnvelope(...)`：用于从
  unknown compatibility payload 中识别 runtime envelope / event。
- `createKernelRuntimeEventFacade(...)`：提供 emit、ingest、subscribe、replay、
  dedupe 与 replay cursor error。
- `toKernelRuntimeEventMessage(...)` /
  `consumeKernelRuntimeEventMessage(...)`：在旧 transport 中保真承载
  `kernel_runtime_event.envelope`。

Future 但尚未落地为代码：

- payload-specific `KernelEvent` discriminated union，例如 `KernelTurnEvent`、
  `KernelPermissionEvent`、`KernelCapabilityEvent`。
- 更细的 per-domain collector，例如 `collectKernelPermissionEvents(...)`。
- command / tool / hook / skill / plugin / MCP / agent / task / companion /
  Kairos / memory / session 的完整 event payload schema。当前这些 domain 仍在
  完整 contract 目标中，但不能写成已经由代码发出的 stable event。

## 18. 安全模型与权限边界

状态：`Normative`

完整状态的 kernel 不是无条件执行器。host、workspace、tool、MCP、plugin、secret 都必须进入 public contract 的安全模型。

必须定义：

- host identity：`KernelRuntimeOptions.host` 必须包含 host type、host id、transport kind、trust level 和 declared capabilities。
- workspace boundary：所有 conversation、tool、MCP、hook、memory、session 操作都必须绑定 workspace 或明确声明跨 workspace 权限。
- tool policy：allow/deny、read/write/network/shell/MCP 等风险分类必须是 kernel policy，而不是 UI 文案。
- MCP trust：MCP server 来源、scope、auth 状态、tool exposure 必须可查询、可禁用、可审计。
- plugin trust：marketplace、本地、managed、user/project plugin 的来源、版本、权限和加载错误必须可观察。
- secret handling：auth token、API key、env、MCP credential、tool arguments 中的 secret 必须 redaction 后进入 event/log。
- command / hook / skill provenance：public descriptor 必须能说明来源，避免 host 把不同来源能力展示成同等信任。
- audit events：permission decision、tool execution、MCP connect、plugin load、hook run、memory update、session resume 都必须产生可选审计事件。
- fail closed：未知 host、未知 capability、权限超时、policy conflict、schema mismatch 默认拒绝或 degraded，不默认 allow。

## 19. 不开放的内容

状态：`Normative`

明确不开放：

- Ink / React component。
- 终端快捷键与布局。
- CLI 菜单状态机。
- bootstrap singleton 的直接读写。
- runtime internal abort controller。
- `HeadlessManagedSession` 等内部实现对象。
- 旧 SDK session facade 作为新增 public API。现有 SDK message /
  `stream-json` adapter 只作为最终兼容 transport 保留，不是 runtime
  source of truth，也不是新开放面。

## 20. 文件级接口清单

状态：`Implemented`

### claude-code

- `claude-code/src/kernel/runtime.ts`
  - `createKernelRuntime()`、`KernelRuntime`、`KernelConversation`、`KernelTurn`
    与
    `KernelRuntimeRequestError` 已作为第一层 public runtime façade 导出。
  - `KernelRuntimeOptions.transportConfig` 已提供 `in-process` / `stdio`
    public transport 便利配置；原始 `transport` / `wireClient` 注入仍保留给测试、
    内部 adapter 和高级 host。
  - `KernelConversation.waitForTurn(...)` 与
    `KernelConversation.runTurnAndWait(...)` 已作为 terminal turn 便利 API
    导出，内部消费同一条 runtime envelope / replay contract。
  - `KernelTurn.onEvent(...)` 与 `KernelTurn.replayEvents(...)` 已使用
    `KernelRuntimeEventEnvelope` / `KernelRuntimeEventHandler` 作为 turn-scoped
    typed event object model。
- `claude-code/src/kernel/wireProtocol.ts`
  - 新增 `KernelRuntimeWireProtocol` 的命令、响应、错误和 envelope schema。
  - 当前已在 `src/runtime/contracts/wire.ts` 与 `src/runtime/core/wire/*`
    落地 internal command/router/codec skeleton，并在
    `src/kernel/wireProtocol.ts` 提供 package root 可导出的 kernel leaf
    assembly。
- `claude-code/src/kernel/capabilities.ts`
  - 新增 capability resolver / reload。
- `claude-code/src/kernel/headlessController.ts`
  - 新增 headless conversation facade。
- `claude-code/src/kernel/headlessInputQueue.ts`
  - 新增 public input queue。
- `claude-code/src/kernel/headlessProvider.ts`
  - 新增 provider env/run options helper。
- `claude-code/src/kernel/events.ts`
  - 已开放 runtime event facade / compatibility helper：emit、ingest、
    subscribe、replay、`kernel_runtime_event` message encode / decode /
    consume，以及 envelope -> event 提取。
- `claude-code/src/kernel/runtimeEvents.ts`
  - 已定义 runtime façade 使用的 `KernelRuntimeEventEnvelope` /
    `KernelRuntimeEventHandler`、taxonomy 常量、event type union、category /
    taxonomy helper、turn terminal guard 与 envelope-level collector；package
    root 通过 `src/kernel/runtime.ts` 暴露这些 public names。
- `claude-code/src/kernel/runtimeCommands.ts`
  - 开放 CLI command runtime。
- `claude-code/src/kernel/runtimeTools.ts`
  - 开放 tool catalog。
- `claude-code/src/kernel/runtimeMcp.ts`
  - 已开放 MCP manager：`status()` / `listServers()` /
    `listTools(serverName?)` / `listResources(serverName?)` /
    `snapshot()` / `reload()` / `connect()` / `authenticate()` /
    `clearAuth()` / `setEnabled()` / `enable()` / `disable()` 走同一套 wire
    command 与 runtime MCP registry；list 操作不隐式连接 server，connect /
    enable / disable 由 lifecycle command 显式触发。
- `claude-code/src/kernel/permissions.ts`
  - 开放 permission request/decision schema。
- `claude-code/src/kernel/mcp.ts`
  - 目标态为完整 MCP lifecycle manager；当前 public surface 已先由
    `runtimeMcp.ts` 承载 readonly/status/reload 与 connect/auth/set-enabled
    lifecycle。`callbackUrl` completion 与 `clearAuth(...)` 已进入默认 runtime
    MCP registry path；剩余是完整 OAuth 浏览器自动打开、错误展示与跨 host
    UX，而不是 public contract 缺失。
- `claude-code/src/kernel/runtimeHooks.ts`
  - 已开放 hook catalog + run / register façade：`list(filter?)` /
    `reload()` / `run(...)` / `register(...)` 走 `list_hooks` /
    `reload_hooks` / `run_hook` / `register_hook` wire command；默认 hook
    runner 已接入 settings / bootstrap / plugin matcher 执行路径，
    unregister 仍是后续完整 registry。
- `claude-code/src/kernel/runtimeSkills.ts`
  - 已开放 skill readonly catalog：`list(filter?)` / `get(name)` /
    `reload()` / `resolveContext(...)` 走 `list_skills` / `reload_skills` /
    `resolve_skill_context` wire command；默认 resolver 已能通过 prompt
    command 生成 prompt content。
- `claude-code/src/kernel/runtimePlugins.ts`
  - 已开放 plugin status catalog 与 enable / disable / install / uninstall /
    update lifecycle：
    `list(filter?)` / `status()` / `reload()` / `setEnabled(...)` /
    `enable(...)` / `disable(...)` / `install(...)` / `uninstall(...)` 走
    `list_plugins` / `reload_plugins` / `set_plugin_enabled` /
    `install_plugin` / `uninstall_plugin` / `update_plugin` wire command；
    marketplace discovery/options 仍是后续完整 manager。
- `claude-code/src/kernel/runtimeAgents.ts`
  - 已开放 agent registry：`list(filter?)` / `all(filter?)` /
    `get(agentType)` / `snapshot()` / `reload()` 走 `list_agents` /
    `reload_agents` wire command；`spawn(request)` 走 `spawn_agent` wire
    command；`runs(filter?)` / `getRun(runId)` / `status(runId)` /
    `output(runId)` / `result(runId)` / `cancel(runId)` 走 agent run lifecycle
    wire command。当前 spawn + run lifecycle contract 已是 public runtime-owned
    入口，但真实 agent executor / coordinator invocation 仍由 host / runner 注入。
- `claude-code/src/kernel/runtimeTasks.ts`
  - 已开放 task-list manager：`list(filter?, options?)` /
    `get(taskId, options?)` / `snapshot(options?)` 走 `list_tasks` / `get_task`
    wire command；`create(request)` / `update(request)` / `assign(request)` 走
    `create_task` / `update_task` / `assign_task` wire command，默认复用现有
    TaskCreate / TaskUpdate 语义里的存储、hooks、metadata merge、dependencies
    与 owned_files。
- `claude-code/src/kernel/hooks.ts`
  - 目标态为完整 hook registry；当前 public surface 已先由
    `runtimeHooks.ts` 承载 catalog、reload、run 与 register contract。
- `claude-code/src/kernel/skills.ts`
  - 目标态为完整 skill catalog；当前 public surface 已先由
    `runtimeSkills.ts` 承载 catalog、reload 与 prompt context resolve contract。
- `claude-code/src/kernel/plugins.ts`
  - 目标态为完整 plugin manager；当前 public surface 已先由
    `runtimePlugins.ts` 承载 status/reload 与 enable / disable / install /
    uninstall / update lifecycle。
- `claude-code/src/kernel/agents.ts`
  - 目标态为完整 agents/coordinator/subagent registry；当前 public surface 已由
    `runtimeAgents.ts` 承载 registry 查询、reload 与 spawn contract。
- `claude-code/src/kernel/tasks.ts`
  - 目标态为完整 task manager；当前 public surface 已由
    `runtimeTasks.ts` 承载 list/get/snapshot 与 create/update/assign mutation。
- `claude-code/src/kernel/companion.ts`
  - 开放 pet/companion runtime。
- `claude-code/src/kernel/kairos.ts`
  - 开放 Kairos/proactive runtime。
- `claude-code/src/kernel/memory.ts`
  - 开放 memory manager。
- `claude-code/src/kernel/context.ts`
  - 开放 context assembly facade。
- `claude-code/src/kernel/sessions.ts`
  - 开放 session/log/transcript manager。
- `claude-code/src/kernel/index.ts`
  - 统一导出上述 public API。
- `claude-code/src/entrypoints/kernel-runtime.ts`
  - 新增常驻 runtime runner，承载 wire protocol，可供其它语言 SDK 与本地 worker 启动。
  - 当前已有 source-level stdin/stdout NDJSON runner，并由
    `tests/integration/kernel-runtime-wire-smoke.test.ts` 覆盖；`package.json`
    已新增 `hare-kernel-runtime` bin，package smoke 覆盖 npm pack/install 后
    的 bin ping。

### hare-code-desktop

- `hare-code-desktop/electron/kernel-runtime-manager.cjs`
  - conversation -> worker 的注册和调度。
- `hare-code-desktop/electron/kernel-worker-wrapper.cjs`
  - worker 启停、stdout/IPC 处理；worker runner 只 import `@go-hare/hare-code/kernel`。
- `hare-code-desktop/electron/kernel-protocol.cjs`
  - Electron Main 到 worker 的本地传输封装，schema 必须复用 `KernelRuntimeWireProtocol`。
- `hare-code-desktop/electron/kernel-event-mapper.cjs`
  - public `KernelEvent` -> 当前前端 SSE event。
- `hare-code-desktop/electron/main.cjs`
  - 旧桌面 SDK session 管理退出主 owner，接入 worker registry；
    SDK message / `stream-json` 兼容 adapter 保留，避免 CLI 与现有调用方
    行为衰减。

## 21. 验证要求

状态：`Normative` `Implemented`

### claude-code

- source-level：`src/kernel/*` 覆盖 runtime、capabilities、controller、events、commands、tools、hooks、skills、plugins、MCP、agents、tasks、companion、Kairos。
- wire-level：`KernelRuntimeWireProtocol` 的 command/envelope/error/event replay schema 有 contract 测试。
- 当前 checkpoint：internal `KernelRuntimeWireRouter` 已覆盖 `ping`、
  `create_conversation`、`run_turn`、`abort_turn`、`subscribe_events`、
  `reload_capabilities`、`publish_host_event`、`schema_mismatch`、scoped
  `sinceEventId` replay、missing cursor `not_found`、expired cursor
  `unavailable/retryable`，且 replay 失败前不发 subscription ack；
  `run_turn` 已支持 router-level `runTurnExecutor` streaming contract，可输出
  `turn.output_delta`、`turn.completed`、`turn.failed`，并在 `abort_turn` 时触发
  active executor 的 abort signal；默认 runner 已新增 process-isolated
  headless executor，可通过 `HARE_KERNEL_RUNTIME_HEADLESS_EXECUTOR=process`
  复用现有 headless `stream-json` 子进程并把 SDK stdout 归一化为 runtime
  event；host lifecycle 已新增 `connect_host` / `disconnect_host`，支持
  runtime-scoped reconnect cursor replay、`detach` 默认断开策略与
  `abort_active_turns` 主动中止 active turn；event replay recovery 已新增
  opt-in journal，可用 `HARE_KERNEL_RUNTIME_EVENT_JOURNAL` 跨
  `kernel-runtime` 进程重启恢复 replayable events；conversation snapshot
  recovery 已新增 opt-in journal，可用
  `HARE_KERNEL_RUNTIME_CONVERSATION_JOURNAL` 或 `conversationJournalPath` 在
  重启后恢复 latest conversation snapshot、归一化 `detached` 状态并保留
  active turn lock；conversation snapshot journal 也会持久化 active
  `run_turn` command，恢复 running active turn 时自动重启 executor，hard kill
  后 durable model/tool execution resume 已有 integration 覆盖；
  multi transport wrapper 已新增 `createKernelRuntimeWireClient()`、
  `createKernelRuntimeInProcessWireTransport()` 与
  `createKernelRuntimeStdioWireTransport()`，并用同一条 host conversation
  contract 覆盖 `in-process` / `stdio`；transport wrapper 已覆盖
  client-local live subscription scope，`create_conversation` 已覆盖
  `sessionId` / `workspacePath` reuse guard，`resume_session` 已覆盖 transcript
  历史消息与 file history snapshot hydrate 到 replayable
  `conversation.transcript_message` / `conversation.file_history_snapshot`
  event，public `KernelConversation.replayEvents()` 可直接读取 resumed
  history；
  transport integration 已覆盖
  in-process / stdio 下两个 conversation 同时 active、targeted `abort_turn`
  只中断目标 turn、另一个 conversation 仍保持 busy active lock，
  `capabilityIntent` 已覆盖 resolver demand-load；
  public `createKernelRuntime()` façade 已覆盖 `transportConfig.kind =
  'stdio'` 启动 runner，以及 `waitForTurn(...)` / `runTurnAndWait(...)`
  从 replay/live event 中等待 terminal turn；`KernelTurn` object 已覆盖
  turn-scoped event subscription、replay、abort 与 terminal wait；
  source-level `kernel-runtime` runner 已覆盖 stdin/stdout smoke；package
  root 已导出 wire runner / default router / command schema version，package
  bin 已覆盖。
- package-level：构建后 smoke `import('@go-hare/hare-code/kernel')`，确认新增导出真实可用；package-only worker smoke 也已覆盖只 import `@go-hare/hare-code/kernel` 后调用 `runKernelRuntimeWireProtocol(...)` 的最小 runner 场景。
- runner-level：常驻 `kernel-runtime` runner 可启动、响应 `init_runtime` / `ping`，并能通过协议创建 conversation；真实 NDJSON 进程 smoke 已覆盖 `resume_session(resumeSessionAt)` 后继续跑 process-backed headless executor，并保持 `headless.sdk_message` / `turn.output_delta` / `turn.completed`。
- CLI parity：CLI 使用 public kernel capability 后，原有 commands/tools/hooks/skills/plugins/MCP/agents/pet/Kairos 行为不回退。
- host isolation：desktop/worker 测试只能依赖 `@go-hare/hare-code/kernel`，不能 import `claude-code/src/*`。
- surface guard：每新增一个 public export，必须同步更新 `src/kernel/__tests__/surface.test.ts`、`src/kernel/__tests__/packageEntry.test.ts`、`tests/integration/kernel-package-smoke.test.ts` 的导出集合。
- concurrency：多 conversation、并发 `run_turn`、duplicate `abort_turn`、host reconnect / process-level event replay recovery / conversation snapshot recovery / active execution durable resume 必须有 contract 测试；router-level event replay gap、host reconnect/disconnect、长 turn executor abort streaming、process-backed executor runner smoke、event journal after restart smoke、conversation snapshot after hard kill smoke、durable execution resume after hard kill、cross-transport host conversation smoke 与 cross-transport multi-conversation targeted abort smoke 已有 contract 测试。
- security：permission timeout、deny、policy conflict、secret redaction、MCP/plugin trust 降级必须有 contract 测试；REPL / bridge compatibility adapter 必须覆盖 host allow / deny 元数据不丢失。

### hare-code-desktop

- worker wrapper 测试只能依赖 `@go-hare/hare-code/kernel`。
- `kernel-protocol.cjs` 测试只能验证 `KernelRuntimeWireProtocol` 的传输封装，不定义桌面私有 schema。
- `ConversationRuntimeRegistry` 生命周期测试。
- `TurnStreamRegistry` ring buffer / reconnect 测试。
- `KernelEvent` -> desktop SSE mapper 测试。
- stop 只作用于目标 worker 的测试。

## 22. 完整状态执行顺序

状态：`Normative`

以下是完整状态的落地顺序，不是 MVP 范围裁剪。任何阶段都不能把最终 public capability 从 contract 蓝图中移除。

1. 先定义 `KernelRuntime`、`KernelRuntimeCapabilities`、`KernelEvent`、`KernelRuntimeWireProtocol` 四个总 contract。
2. 新增常驻 `kernel-runtime` runner，让非 JS host 有稳定进程边界。
3. 把 headless controller/input queue/provider/events 接到总 contract 和 wire protocol。
4. 依次开放 commands、tools/permissions/MCP、hooks、skills/plugins、agents/tasks。
   当前已进入 `KernelRuntime` 的是 capability manager、commands catalog +
   execute contract、tools catalog + call contract、MCP readonly/status/reload +
   connect/auth/set-enabled lifecycle contract、
   hooks catalog + run/register contract、skills catalog + prompt context resolve、
   plugins status catalog + enable/disable/install/uninstall/update lifecycle 与
   agents registry/spawn/run lifecycle contract、tasks list/create/update/assign manager、
   permission decision bridge、默认 command/tool executor；
   plugin marketplace discovery/options、MCP OAuth 浏览器 UX host policy、
   真实 agent/coordinator executor 与 coordinator invocation 深化仍按完整
   contract 继续补齐。
5. companion、Kairos、memory/context/sessions 已进入 `KernelRuntime` surface，并补齐 runtime/wire 调用路径；剩余工作只应是行为深化或宿主对齐，不再是“是否开放”。
6. 增加 package-level smoke，确保 `@go-hare/hare-code/kernel` 可导入新增接口；当前已补 package-only worker smoke，验证 worker 只依赖包入口即可启动 wire runner。
7. 增加 runner/wire smoke，确保常驻 runtime 可被 Python/Go/机器人 host 通过协议使用；当前已覆盖 `resume_session` + process-backed output 的真实 NDJSON 回归。
8. 桌面端实现 worker wrapper，worker 代码只 import `@go-hare/hare-code/kernel`，对 main 暴露 `KernelRuntimeWireProtocol`。
9. 桌面端替换旧 SDK session 路径，保留 SSE/reconnect 的外层行为。
