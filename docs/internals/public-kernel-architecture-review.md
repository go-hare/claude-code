# Public Kernel 架构审查文档

日期：2026-04-28

2026-05-08 复核：本文现在作为早期 public kernel / wire 方案的 review 记录保留。
当前外部 runtime protocol 已切到 JSON-RPC-lite + core services；package
`./kernel` 不再导出 `createKernelRuntime()`、wire router/client/transport 或
旧 `KernelRuntimeWire*` surface。新的当前态以
`docs/internals/json-rpc-lite-protocol.md`、`src/kernel/index.ts` 和对应
surface/package-entry 测试为准。

2026-04-28 复核：本文保留 public runtime API 的审查历史与分层分析，但封板结论已经更新。本轮“内核 + 开发接口”收口已完成：root surface、runtime/wire contract、capability lifecycle 与 developer-facing manager 均已打通，`companion` / `Kairos` / `memory` / `context` / `sessions` 已进入 package root 且连通 in-process / stdio runtime。剩余工作不再属于 blocker，而是 deeper parity，例如继续追平 tool context 等 richer runtime-owned resume state、以及未来非 NDJSON transport 扩展。

2026-04-27 复核：本文保留 public runtime API 的审查结论，但内部 kernel
主链已经继续前进一轮。`SessionRuntime.submitRuntimeTurn(...)` 已成为
runtime-first turn stream，`RuntimeExecutionSession` 不再声明
`submitMessage(...)`，ACP prompt / bridge 直接消费 runtime envelope。
`createKernelRuntime()` 的第一层 public façade 已落地，并已补上 stdio
transport convenience、terminal turn wait API 与 `KernelTurn` object；它不改变内部 kernel 完整性
判断，后续 public kernel API 工作集中在非 NDJSON transport 扩展、event object model
代码化和发布级兼容矩阵。event taxonomy 已进入当前 root surface：
`KERNEL_RUNTIME_EVENT_TAXONOMY`、`KernelRuntimeEventType`、category lookup、
known-type guard、event-of-type guard 与 turn terminal guard 已落地；剩余是
payload-specific event union、更多 per-domain collector 和 payload contract tests。
capability descriptor 也已前进到 host-facing API 这一刀：descriptor/status/
reload scope 在 runtime contract 中稳定，默认 capability graph 已列出，
`KernelRuntime.capabilities` 的 list/get/view/filter/group/reload 语义已定义；
`KernelRuntime.commands`、`KernelRuntime.tools`、`KernelRuntime.mcp`、
`KernelRuntime.hooks`、`KernelRuntime.skills`、`KernelRuntime.plugins`、
`KernelRuntime.agents` 与 `KernelRuntime.tasks` 的 catalog / status /
registry / mutation manager 也已进入 public kernel API：对应 `list_*` / `reload_*` /
`get_task` / `spawn_agent` / `list_agent_runs` / `get_agent_run` /
`get_agent_output` / `cancel_agent_run` / `create_task` / `update_task` /
`assign_task` wire command、in-process / stdio client method、typed client façade 和
package declaration 均已对齐。agent executor lifecycle 的第一层
spawn/status/output/result/cancel contract 已进入 public kernel API；command execute
与 tool call 的第一层 wire / typed client contract 也已落地，router 通过 optional
executor hook 执行并发出 `commands.executed` / `tools.called` event。MCP
connect/auth/set-enabled lifecycle 的 wire / typed client contract 也已落地，router
通过 MCP registry hook 执行并发出 `mcp.connected` / `mcp.authenticated` /
`mcp.enabled_changed` event；默认 registry 已能按配置尝试 reconnect 与持久化
enable/disable。hooks run/register、skills prompt context resolve、plugins
set-enabled/install/uninstall lifecycle 的 wire / typed client contract 也已落地，并发出
`hooks.ran` / `hooks.registered` / `skills.context_resolved` /
`plugins.enabled_changed` / `plugins.installed` / `plugins.uninstalled` /
`plugins.updated` event。默认 command executor 已能执行 non-interactive local
command 和 prompt command projection；默认 tool executor 已能通过
`ToolUseContext` 跑 builtin tool validation / permission-mode / progress / result
路径；默认 skill resolver 已能通过 prompt command 生成 prompt content。剩余不能误写成完成的是完整 MCP auth
interactive executor、默认 hook runner、plugin marketplace discovery/options、
真实 agent/coordinator executor 写入 run registry 和 coordinator invocation schema。

## 1. 审查结论

当前代码已经形成 `Host -> Kernel -> Runtime` 的主方向，且 `claude-code/kernel` 具备可发布、可导入、受测试锁定的 root surface。

截至 2026-04-28，若判断口径是“本轮内核与开发接口是否已经收口并可对外封板”，答案已经是肯定的。下文仍保留更早一轮的审查轨迹，用于解释为什么当时不能提前宣称完成。

一句话判断：

> 当前代码已经达到本轮 public kernel / runtime contract 的封板状态；后续剩余的是更深的多宿主 parity 与体验增强，而不是 runtime/developer interface 缺口。

架构上最强的部分：

- package-level kernel 入口已经明确。
- CLI headless/server/bridge/daemon 正在改道到 kernel。
- execution/server/bridge/daemon 的实现开始下沉到 `src/runtime`。
- session lifecycle、registry、state provider 已经出现第一轮 runtime seam。
- root surface 和 package smoke 已经有测试护栏。

下列条目保留为历史 review 轨迹；截至 2026-04-28，除 transcript hydrate 与非 NDJSON transport 之外，其余已不再构成 blocker：

- `createKernelRuntime()` 第一层 public façade 已落地：默认使用
  in-process wire transport，也支持 `transportConfig.kind = 'stdio'` 启动
  runtime runner；提供 `KernelRuntime` / `KernelConversation` object model、
  `KernelTurn` object model、event replay、permission decision、capability
  reload、terminal turn wait 和 `runTurnAndWait(...)` 便捷入口。剩余是把它扩展到 IPC / WebSocket / Unix
  socket 等非 NDJSON transport 与更完整的发布级 SDK 体验。
- `KernelRuntimeWireProtocol` 已有 internal command/router/NDJSON runner
  skeleton，并已进入 package public export/bin；router-level 长 turn
  executor streaming contract 与 process-isolated headless executor wiring 已
  落地；host reconnect/disconnect policy 与 opt-in process-level event
  replay journal 已落地；opt-in conversation snapshot journal 已能在 process
  hard kill 后恢复 latest snapshot、`detached` 状态和 active turn lock；
  public `KernelRuntimeWireClient` 与 `in-process` / `stdio` transport wrapper
  已落地，并已补齐 runtime-scoped `connect_host` replay、client-local live
  subscription scope、`sessionId`/`workspacePath` conversation reuse guard 与
  hard-kill 后 active model/tool execution durable resume。剩余缺口是 IPC /
  WebSocket / Unix socket 等非 NDJSON transport 实现。
- 统一 `KernelEvent` / envelope / replay 已有 internal event bus、
  router-level replay gap contract、compat projection 与 host event facade；
  headless、direct-connect、remote / SSH、bridge / RCS 与 ACP 已接入同源
  envelope。public taxonomy 已按 `runtime.*`、`host.*`、
  `conversation.*`、`turn.*`、`permission.*`、`capabilities.*` 暴露到
  package root；`headless.sdk_message` 只保留为内部 compatibility envelope，
  不再进入 public event type union。剩余缺口是 payload-specific
  discriminated union、更多 per-domain helper 与 payload contract tests。
- capability resolver 已有 descriptor / lazy-loading skeleton，
  `create_conversation` 已开始消费 `capabilityIntent` 并通过
  `requireCapability(...)` demand-load；package declaration 已暴露 resolver
  injection type。当前 public kernel API 这一刀已把 capability families、status、
  host view、filter、group 和 scoped reload 语义定义清楚，并补上
  commands/tools/MCP/hooks/skills/plugins catalog / status / registry manager，
  以及 agents/tasks 的 spawn / run lifecycle / create / update / assign 第一组 mutate
  contract；commands/tools 已补上 `execute_command` / `call_tool` contract 和
  typed client façade，MCP 已补上 `connect_mcp` / `authenticate_mcp` /
  `set_mcp_enabled` contract 和 typed client façade；hooks 已补上 `run_hook` /
  `register_hook`，skills 已补上 `resolve_skill_context`，plugins 已补上
  `set_plugin_enabled` / `install_plugin` / `uninstall_plugin` /
  `update_plugin`。默认 command/tool executor 已进入 default router：
  `execute_command` 复用 command registry 执行 non-interactive local command /
  prompt projection，`call_tool` 复用 builtin tool registry 与非交互
  `ToolUseContext` 执行 validation、permission mode 和 tool result。剩余缺口不再是“有没有 descriptor、catalog 或默认 command/tool
  executor”，而是更深 lifecycle 仍未完整 runtime-owned，不能把完整
  MCP auth interactive executor、默认 hook runner、
  plugin marketplace discovery/options、真实 agent/coordinator executor 与
  coordinator invocation 写成已完成。
- permission 已有 runtime broker、headless wrapper、wire-level
  `decide_permission` command，以及 executor context 级共享
  `permissionBroker`；SDK stdio / structured IO 已经收敛到 broker-first
  compatibility adapter，外部 broker decision 可以直接 resolve pending
  request 并取消旧 stdio prompt；MCP `--permission-prompt-tool`、sandbox ask
  也已接入 broker-first glue；remote / direct-connect / SSH response 已补齐
  host 决策元数据，direct-connect 已能消费 `control_cancel_request` 清理
  stale prompt；ACP / bridge 旧 response 也已保留 host 决策分类，不再把
  bridge reject 记录成 abort；REPL local prompt queue 与 bridge remote
  permission source 已接入会话级 `RuntimePermissionBroker` compatibility
  adapter；`ToolUseContext.runtimePermission` 已把同一个 broker 下沉到
  `hasPermissionsToUseTool(...)`，ask pending request 与 allow / deny audit
  finalization 都在 permission evaluation 层发生；package-level
  `createKernelPermissionBroker(...)` 已把 public host decision surface
  正式化为可导入 facade。剩余是替换更多 legacy UI callback，而不是继续扩
  legacy callback。
- runtime state provider 仍大量代理 `bootstrap/state` singleton。
- `sessions.resume()` 当前已返回 live `KernelConversation`，并已把 transcript 历史消息、todo snapshot、nested memory snapshot、task snapshot、attribution snapshot、file history snapshot、content replacement 记录，以及 context collapse commit / snapshot hydrate 进 replayable live conversation state；headless/runtime turn 也会在每轮执行前恢复 nested memory dedupe state，并从 task storage 恢复唯一 open owned task context 重新挂回 `activeTaskExecutionContext`。剩余是更深的 richer tool context / execution context 级别 resume state。

## 2. 现有分层

当前代码的实际分层是：

```mermaid
flowchart LR
  Host["Host / Entry\nCLI, REPL, bridge, daemon"] --> Kernel["Kernel façade\nsrc/kernel + package ./kernel"]
  Kernel --> Runtime["Runtime capabilities\nexecution, server, bridge, daemon"]
  Runtime --> Shared["State / services / storage\nbootstrap, MCP, tools, session storage"]
```

### Host 层

Host 层负责启动模式、TTY/UI、signal、profile checkpoint、宿主状态写入。

已观察到的改道：

- `src/hosts/cli/launchers/headlessKernelDeps.ts` 只从 `../../../kernel/index.js` 取 headless kernel API。
- `src/hosts/cli/launchers/headlessLauncher.ts` 负责顺序编排 environment、MCP、startup、run，不再直接拼 runtime 深路径。

这说明 CLI host 已经开始按 kernel-first 接线。

### Kernel 层

`src/kernel/index.ts` 明确声明自己是唯一源码级 public kernel surface，package-level `./kernel` re-export 共享 semver 语义。

当前 root surface 包含：

- headless：`createDefaultKernelHeadlessEnvironment`、`runKernelHeadless`、`createKernelHeadlessSession`
- server/direct-connect：`createDirectConnectSession`、`connectDirectHostSession`、`assembleServerHost`
- bridge：`runBridgeHeadless`
- daemon：`runDaemonWorker`

这层现在更像 host-facing façade，而不是完整 runtime object model。

### Runtime 层

`src/runtime` 已经承载真实能力实现：

- `capabilities/execution`
- `capabilities/server`
- `capabilities/bridge`
- `capabilities/daemon`
- `core/state`
- `core/session`
- `contracts`

execution 的 `SessionRuntime` 已经显式表达“一 conversation 一个 runtime session，每次 `submitRuntimeTurn()` 是一个 turn”。server/direct-connect 已经有 `SessionManager`、`RuntimeDirectConnectSession`、`RuntimeSessionRegistry`。

这说明 runtime ownership 正在形成，但还没有统一成 public `KernelRuntime`。

## 3. 当前代码事实

### 3.1 Public package surface 已成立

证据：

- `src/kernel/index.ts` 只导出 root surface，并声明 leaf modules 不在 public semver 承诺内。
- `src/entrypoints/kernel.ts` 只 re-export `../kernel/index.js`。
- `package.json` 的 `./kernel` 指向 `./dist/kernel.js`。
- `src/kernel/__tests__/surface.test.ts` 锁定 exact export set。
- `tests/integration/kernel-package-smoke.test.ts` 用真实 npm pack + consumer import 验证 built package。

架构判断：

> root surface 可以作为 public kernel API 的冻结点；leaf module 不能冻结。

这点很关键。后续任何新能力都应该先进入 `src/kernel/index.ts` 的 contract 再进入 package surface，不能让外部 host 依赖 `src/kernel/*` leaf path。

### 3.2 Headless 入口是 façade，不是完整 controller

`src/kernel/headless.ts` 做了三件事：

- 构造 `AppState` store。
- 注入 MCP、commands、tools、agents、permission context。
- 调用 `runHeadlessRuntime(...)`。

它已经正确把 `agentDefinitions` 写入 AppState，避免下游 agent path 读不到 active agents。

但它还没有这些完整 contract：

- `KernelHeadlessController`
- `runTurn()`
- `abortTurn()`
- `onEvent()`
- 单 active turn lock
- event replay buffer
- public `KernelHeadlessEvent`

架构判断：

> 当前 headless surface 是“可运行 façade”，不是“完整 conversation controller”。

### 3.3 Execution runtime 已经有 conversation object 雏形

`SessionRuntime` 的注释和结构已经接近 conversation runtime：

- 一份 `mutableMessages`
- 一个 `abortController`
- 一份 read file cache
- `submitRuntimeTurn()` 表示 turn
- `stopAndWait()` 表示 lifecycle 终止

当前 source-level execution session 通过 `RuntimeConversation` /
`RuntimeTurnController` 与 wire active execution journal 承接 active turn /
abort 状态机；`interrupt()` / `resetAbortController()` 仍保留为本地
execution object 方法。public API 尚未把这套状态机整理成稳定的
`KernelConversation` / `KernelTurn` object model。

架构判断：

> execution runtime 已经能承载 conversation 语义，并已形成内部 runtime turn state machine；下一步缺的是 public object model，而不是内部主链能力。

完整状态还需要定义：

- `idle | running | aborting | completed | failed | disposed`
- duplicate `run_turn`
- duplicate `abort_turn`
- abort during tool
- abort after complete
- host disconnect：wire contract 已提供 `detach` / `continue` /
  `abort_active_turns`，仍需接入最终 conversation policy source。
- replay after reconnect：wire contract 已支持 `sinceEventId` 与 journal
  hydrate，`in-process` / `stdio` wrapper 已覆盖同一 host conversation
  contract；conversation snapshot journal 已覆盖 process restart 后的 active
  turn lock recovery；非 NDJSON transport 后续应只实现承载层，不新增私有
  schema。

### 3.4 Session core 已经出现，但语义还偏 lifecycle

`src/runtime/contracts/session.ts` 抽出了：

- `RuntimeSessionLifecycle`
- `RuntimeSessionSink`
- `AttachableRuntimeSession`
- `RuntimeSessionIndexStore`
- `IndexedRuntimeSession`

`RuntimeSessionRegistry` 提供：

- `add`
- `sync`
- `remove`
- `liveCount`

server/direct-connect 使用 `RuntimeManagedSession`，headless 也有 `HeadlessManagedSession`。

架构判断：

> shared session core 已经是 lifecycle seam，但还不是完整 conversation/session semantic core。

下一层应该补的是：

- conversation identity
- turn identity
- event identity
- permission request identity
- replay cursor
- capability scope
- workspace boundary

不要急着强行统一所有 transport；先统一 semantic identity。

### 3.5 Server/direct-connect 的 runtime 下沉质量较好

`kernel/serverHost.ts` 做默认装配：

- backend
- logger
- `SessionManager`
- config parse
- `startServerHost`

`SessionManager` 只依赖 server contracts 和 `RuntimeSessionRegistry`，不直接 new 具体 server 实现。`RuntimeDirectConnectSession` 实现 attach/detach/backlog/idle timeout/stop。

架构判断：

> server/direct-connect 是目前 runtime contract 化最扎实的一条线。

但它仍然不是完整 wire protocol：

- WebSocket message 仍是 direct-connect 私有输入输出。
- stdout line backlog 仍是 raw NDJSON compatibility backlog，不是
  最终 unified event store；但它已经能原样携带 `kernel_runtime_event`，且
  `RuntimeDirectConnectSession` 已提供 envelope sidecar backlog / replay
  facade，host 可以不再直接解析 raw stdout line。
- permission request 已通过 broker-first compatibility adapter 接入统一
  permission contract；direct-connect / remote / SSH 的外层 message schema
  仍是旧 transport 语义。当前 direct-connect / remote / SSH / bridge ingress
  已能识别 `kernel_runtime_event` 并进入 host-side runtime event sink；RCS
  bridge normalize / WS outbound / worker SSE path 也已把 `envelope` 作为
  first-class 字段保真传递。`claude-code/kernel` 已提供
  `createKernelRuntimeEventFacade(...)` 和 `kernel_runtime_event` wrapper
  encode / decode / consume helpers，host 可以统一 ingest / subscribe / replay。

### 3.6 State ownership 已开始拆，但 bootstrap singleton 仍是主风险

`createExecutionStateProviders()` 已经把 AppState provider 和 bootstrap provider 包起来。`bootstrapProvider.ts` 进一步把大量 `src/bootstrap/state.js` getter/setter 包成 `RuntimeBootstrapStateProvider`。

这是正确方向，但也暴露当前风险：

> runtime 仍然通过 provider 代理 process-global bootstrap state，多会话隔离不能只靠这个模型完成。

架构上必须继续把状态拆成：

- runtime-core state
- conversation state
- turn state
- host UI state
- process-global compatibility state

其中 process-global compatibility state 只能作为迁移适配层，不能成为最终 public runtime 的事实来源。

## 4. 完整 public kernel 目标状态

完整状态不是“headless 能跑”，而是：

```mermaid
flowchart TB
  Host["Any Host\nCLI / Desktop / Daemon / Python / Robot"] --> API["Kernel API\nclaude-code/kernel"]
  Host --> Wire["KernelRuntimeWireProtocol\nJSON envelope"]
  API --> Runtime["KernelRuntime"]
  Wire --> Runtime
  Runtime --> Conv["KernelConversation"]
  Conv --> Turn["KernelTurn"]
  Runtime --> Caps["Capability Resolver"]
  Caps --> Tools["Tools / MCP / Commands / Hooks / Skills / Agents"]
  Runtime --> Events["KernelEvent Bus + Replay"]
```

必须具备：

- `createKernelRuntime(options)`
- `KernelRuntimeWireProtocol`
- `KernelRuntimeEnvelope`
- `KernelEvent`
- `KernelRuntimeCapabilities`
- `KernelConversation`
- `KernelTurn`
- `KernelPermissionBridge`
- `KernelToolCatalog`
- `KernelMcpManager`
- `KernelCommandRegistry`
- `KernelHookRegistry`
- `KernelSkillCatalog`
- `KernelPluginManager`
- `KernelAgentRegistry`
- `KernelSessionManager`

## 5. 架构缺口矩阵

| 领域 | 当前代码状态 | 完整状态要求 | 风险 |
| --- | --- | --- | --- |
| Root surface | 已有 `claude-code/kernel` | 承载完整 contract exports | 中 |
| Runtime 总入口 | 已有 public `createKernelRuntime()` façade，覆盖 in-process / stdio convenience、event replay、permission、capability reload、terminal turn wait、`KernelTurn` object | runtime object 覆盖 IPC / WebSocket / Unix socket 与长期 semver 文档 | 中 |
| Wire protocol | 已有 internal/router/client/export/bin 与 NDJSON/in-process/stdio transport | 扩展 IPC / WebSocket / Unix socket 等承载层 | 中 |
| Event surface | 已有 runtime envelope、event facade、compat projection 与多 host 接入；public taxonomy constants / type union / helper 已进 root surface，`KernelEvent` 仍是 generic payload | payload-specific discriminated union、更多 per-domain helper 与 payload contract tests | 中 |
| Headless | runtime-first 可运行 façade | public controller object + turn state machine | 中 |
| Server/direct-connect | contract 化较好 | 映射到统一 wire/event/permission | 中 |
| Session core | runtime conversation / turn controller 与 active execution journal 已有 | public conversation/turn object model | 中 |
| Permission | runtime broker 与 package-level broker facade 已有 | 替换更多 legacy UI callback | 中 |
| Capability | descriptor/status/reload scope、默认 capability graph、resolver lazy loading、`capabilityIntent` demand-load、host-facing view/filter/group/reload 语义已进入当前 SDK surface；commands catalog + 默认 `execute_command` executor、tools catalog + 默认 `call_tool` executor、MCP readonly/status/reload + `connect_mcp` / `authenticate_mcp` / `set_mcp_enabled`、hooks catalog + `run_hook` / `register_hook`、skills catalog + `resolve_skill_context`、plugins status catalog + `set_plugin_enabled` / `install_plugin` / `uninstall_plugin` / `update_plugin`、agents registry + `spawn_agent` + process-backed run lifecycle、tasks list/get + `create_task` / `update_task` / `assign_task` 已进入 `KernelRuntime`；companion / Kairos / memory / context / sessions 现已具备 runtime façade + wire transport 路径 | plugin marketplace 深化、coordinator 专用 invocation contract 与多宿主一致性继续补强 | 中 |
| State ownership | provider seam 已有 | process-global singleton 退场 | 高 |
| Tests | surface/package/contract 已有 | wire/concurrency/security contract | 中 |

## 6. 架构原则

### 6.1 保留完整蓝图，不做 MVP 降级

实现可以分批，但 contract 不能按 MVP 裁掉能力域。

commands、tools、hooks、skills、plugins、MCP、agents、companion、Kairos、memory、sessions 都应进入完整 public kernel contract。

### 6.2 Public contract 只能从 root surface 出口进入

外部 consumer 只能依赖：

- `claude-code/kernel`

不能依赖：

- `src/runtime/*`
- `src/bootstrap/*`
- `src/screens/*`
- `src/commands/*`
- `src/utils/plugins/*`
- `src/skills/*`
- `src/kernel/*` leaf modules

### 6.3 先统一语义，再统一 transport

不要先把 server WebSocket、desktop worker IPC、stdio NDJSON、Python SDK callback 机械统一。

先统一这些语义：

- runtime id
- conversation id
- turn id
- event id
- permission request id
- capability descriptor
- workspace boundary
- host identity

transport 只是这些语义的承载方式。

### 6.4 Kernel 暴露行为协议，不暴露 UI

Public kernel 应暴露：

- 状态
- 能力
- 事件
- 决策请求
- 执行结果
- 错误
- replay cursor

不暴露：

- Ink component
- React object
- terminal layout
- shortcut state
- terminal menu state

### 6.5 Runtime state 不能长期依赖 bootstrap singleton

`bootstrapProvider` 是迁移期必要 seam，但不是最终状态。

最终应做到：

- runtime owns runtime state
- conversation owns conversation state
- host owns UI state
- bootstrap singleton 只保留 compatibility shell

## 7. 建议的架构收口顺序

这是完整状态的收口顺序，不是 MVP 范围裁剪。

1. `KernelRuntime` / `KernelConversation` / `KernelTurn` / `KernelEvent` /
   `KernelRuntimeEnvelope` 的第一层 public 类型已进入 root surface；event taxonomy
   常量、type union 与 helper 已进 root surface，下一步是 payload-specific
   union / helper 与长期 semver 文档。
2. `createKernelRuntime()` 已建立，并复用现有 wire router / in-process
   transport；stdio façade 已通过 `transportConfig` 落地，下一步扩展 IPC /
   WebSocket / Unix socket 等 transport façade。
3. wire protocol runner 已支持 `init_runtime`、`create_conversation`、`run_turn`、`abort_turn`、`subscribe_events`、`ping` 等主命令；下一步补发布级 transport matrix。
4. `SessionRuntime` / wire conversation 已被 public `KernelConversation` façade
   包住；turn wait / terminal state convenience API 与 `KernelTurn` object 已
   落地，event taxonomy 的 package-level typed helper 已落地；下一步补
   payload-specific contract tests 与 host capability descriptor 文档。
5. 把 direct-connect / server 输出映射到 `KernelRuntimeEnvelope`，保留旧协议做 compatibility layer；当前旧 transport 已能承载并识别 `kernel_runtime_event`，direct-connect backlog 已有 envelope sidecar facade，RCS bridge schema / worker SSE 已保留 first-class envelope 字段，package-level event facade 已开放给 host 使用。
6. 抽 `KernelPermissionBridge`，统一 permission request/decision/timeout/audit；
   source-level broker 已经下沉到 `hasPermissionsToUseTool(...)`，package-level
   permission broker facade 已开放给 host。
7. `KernelRuntimeCapabilities` descriptor API 已进入当前 public kernel API 形态：
   `list` / `get` / `view` / `filter` / `group` / scoped `reload` 面向 host
   展示与选择；commands/tools 已有 public catalog + invoke contract，MCP 已有
   readonly/status/reload + lifecycle contract，hooks 已有 run/register
   contract，skills 已有 prompt context resolve contract，plugins 已有
   enable/disable/install/uninstall/update lifecycle contract，agents/tasks 已有 public
   spawn/process-backed run lifecycle/create/update/assign 第一组 mutate
   contract；默认 command/tool executor 已补齐。下一步是补更深 lifecycle，
   不能把完整 MCP auth interactive executor、默认 hook runner、
   plugin marketplace discovery/options、coordinator 专用 invocation 提前标成完成。
8. 继续拆 `bootstrapProvider`，把 runtime-core / conversation / host state 分开。
9. 扩展测试：wire contract、event replay、abort race、multi conversation、permission timeout、package smoke。

当前 checkpoint：1、3、4、6、7 已有 internal skeleton / public descriptor
surface 和定向测试，其中
wire runner 已覆盖 event replay、conversation snapshot recovery、多
conversation subscription isolation 与 session reuse guard；6 的 source-level
permission source of truth、package-level permission facade 以及
commands/tools/MCP/hooks/skills/plugins manager、agents/tasks
spawn/process-backed run lifecycle/create/update/assign manager 已收口。
后续主要 integration 工作集中在 5、8、更深 lifecycle、
capability materialization 尾部收口和 durable execution resume。

## 8. 需要架构决策的点

### ADR-1：`KernelRuntime` 是 in-process object 还是必须 runner-first？

建议：两者都要，但 in-process API 是 source of semantics，runner 是 wire transport 实现。

### ADR-2：event ordering scope 是 runtime-wide 还是 conversation-local？

建议：conversation-local event id + runtime-wide sequence。这样 replay 和多会话隔离更清晰。

### ADR-3：permission 默认策略是什么？

建议：fail closed。timeout、host disconnect、unknown policy、schema mismatch 默认 deny 或 abort。

### ADR-4：capability disabled 时是空列表还是 unavailable error？

建议：descriptor 保留，调用返回 stable unavailable error。否则 host 无法区分“没有能力”和“能力加载失败”。

### ADR-5：desktop worker 是不是可以有私有协议？

建议：不可以。desktop worker 可以选择本地 IPC transport，但 schema 必须是 `KernelRuntimeWireProtocol`。

## 9. 验收标准

完整 public kernel 的架构验收不应只看 headless smoke，而要看以下门禁：

- package：`import('claude-code/kernel')` 后新增 contract exports 真实可用。
- wire：runner 能响应 `init_runtime` / `ping` / `create_conversation` / `run_turn` / `abort_turn` / `decide_permission`。
- event：所有 runtime event 都经 envelope 输出，并能 replay。
- concurrency：同一 conversation 单 active turn；不同 conversation 隔离。
- recovery：process restart 后 event replay、conversation snapshot、active turn
  lock 可恢复；active model/tool execution resume 需要单独 durable contract。
- abort：duplicate abort、abort during tool、abort after complete 都有稳定结果。
- permission：request/decision/timeout/deny/audit 都可观察，host decision 必须
  通过 `permissionRequestId` 进入 wire command。
- permission integration：in-process executor 必须通过
  `KernelRuntimeWireTurnExecutionContext.permissionBroker` 申请权限；SDK
  stdio / structured IO、MCP permission prompt、sandbox ask 已作为
  broker-first compatibility adapter；REPL local queue 与 bridge remote
  response 也已作为 adapter 进入 runtime broker；`hasPermissionsToUseTool`
  是 source-level 统一注册点，后续不允许再新增不可观察的 pending source of
  truth。
- security：host identity、workspace boundary、secret redaction、MCP/plugin trust 都有 contract。
- state：新增 runtime path 不直接读取 bootstrap singleton，必须走 provider 或 runtime-owned state。
- host isolation：desktop worker 只 import `claude-code/kernel`。

## 10. 最终判断

当前代码不是失败的架构，方向是正确的。

它已经完成了最难的第一步：从“宿主各自直连内部实现”转向“host 通过 kernel façade，runtime 承载能力实现”。

但架构师视角必须明确：

> 现在只能冻结 root surface，不能冻结完整 runtime contract。

下一阶段的核心不是继续加 façade，而是把 façade 背后的语义对象补齐：

- runtime
- conversation
- turn
- event
- permission
- capability
- security boundary

这些对象补齐后，`claude-code/kernel` 才能从“稳定入口”升级为“完整公共内核”。
