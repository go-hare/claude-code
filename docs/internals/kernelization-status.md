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

截至 2026-04-23，当前内核化已经进入 **源码级最后收口阶段**，不是“还没开始”，也不是“需要推翻重来”。

一句话概括：

> 当前项目已经完成统一入口、宿主改道、package-level kernel 发布面和最小测试护栏；剩余工作主要集中在 runtime state ownership、shared session core，以及 REPL / headless 的最后收口。

结合 2026-04-23 本轮收口进展，更准确的补充口径是：

> headless 的依赖方向已经完成第一轮纠偏：`HeadlessRuntime` 不再直接回落到 `src/cli/print.ts`，CLI 仍然是第一宿主，但 headless 可复用执行实现已经开始向 `src/runtime/capabilities/execution/internal/*` 下沉。

> 同时，runtime-vs-host state split 已开始进入“真实注入”阶段：`bootstrapProvider` 已从 `adapters.ts` 抽离，`SessionRuntime` / `TurnEngine` / `headlessBootstrap` / `RemoteIO` 已开始经由 provider 或显式入参读取 session state；shared session core 这边也已经起了第一轮 runtime-owned `SessionRegistry`，但离真正统一 session core 仍有距离。

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

#### 2. headless 顶层入口已收口到 runtime

`runKernelHeadless()` 已经转为走 `runHeadlessRuntime()`，`KernelHeadlessEnvironment` / `KernelHeadlessSession` 对外契约也已经存在。

这意味着 headless 的接入归属已经清晰，外部可以通过 kernel headless 入口稳定接入。

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
- `main.tsx` 的 headless 主链进入 `runKernelHeadless(...)`
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

### 半完成

#### 1. runtime contracts 仍未完全覆盖全部能力域

`server` 这块已经完成第一轮 contracts 下沉，但 `bridge / daemon / 其他 capability` 还没有全部完成同等级的 contracts 收敛。

这意味着：

- `server/direct-connect` 这块已经开始从 façade 升级为轻编排层
- `bridge/daemon` 这块也已经开始从 façade 升级为轻编排层
- 更深一层的 runtime contract 化还没有完全覆盖所有域

#### 2. 测试护栏已建立，但还不是完整 contract / integration 体系

当前已经有最小 contract / surface 护栏，但还不等于已经具备完整的长期稳定矩阵。

尤其还缺更强的：

- 更大范围的 consumer/import 组合回归
- 更接近真实运行参数的 kernel headless / server e2e 覆盖

#### 3. kernel 已有发布入口与 smoke 护栏，但全量稳定性仍要靠后续验证维持

从当前工程现实看，package-level 发布面已经打通；后续问题更多会出现在 kernel contracts / runtime ownership / shared session core，而不是 `./kernel` export 本身。

### 已完成补充

#### 8. headless 实现收口：主链已切到 runtime，session / streaming / post-turn seam 已完成

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

也就是说，当前已经完成“先改依赖方向”“把 CLI 共享实现迁出 CLI 私有路径”，并把 headless 主链继续压平到 session / streaming / post-turn 的 runtime-owned seams；剩余已不再是内核化主线阻塞项，而更多是局部实现粒度和长期测试矩阵问题。

### 未完成

#### 1. kernel 内部链路进一步压平

当前仍可描述为：
- `kernel -> server`
- `kernel -> bridge/runtime`
- `kernel -> daemon/runtime`

而不是更纯粹的：

- `kernel` 直接成为稳定主编排层

这一点仍然未完成。

#### 3. 更完整的 kernel contract / integration 测试矩阵

最小测试已经足够证明“结构收口正在发生”，但还不足以证明“对外长期稳定”。

更完整的 contract / integration 体系仍然未完成。

## 工程验证状态

截至 2026-04-23，当前工程验证结果如下：

- 已通过：`bun run typecheck`
- 已通过：kernel 相关定向 smoke / seam 测试，包括：
  - `tests/integration/kernel-headless-smoke.test.ts`
  - `tests/integration/kernel-server-smoke.test.ts`
  - `src/kernel/__tests__/importDiscipline.test.ts`
  - launcher 级编排测试（headless / direct-connect / server）
- 已通过：server/runtime 定向 contract 与 lifecycle 测试，包括：
  - `src/runtime/capabilities/server/__tests__/RuntimeDirectConnectSession.test.ts`
  - `src/runtime/capabilities/server/__tests__/SessionRegistry.test.ts`
  - `src/runtime/capabilities/server/__tests__/DirectConnectSessionApi.test.ts`
  - `src/runtime/capabilities/server/__tests__/contracts.test.ts`
  - `src/kernel/__tests__/serverHost.test.ts`
- 已通过：`bun run build`
- 已通过：`node -e "import('./dist/kernel.js')"` 可导入 built entry
- 未通过：`tests/integration/kernel-package-smoke.test.ts`
  - 当前 `dist/kernel.js` 里 bridge / daemon 相关导出名仍未和稳定 kernel surface 完全对齐
- 未通过：`src/runtime/capabilities/bridge/__tests__/contracts.test.ts`
- 未通过：`src/runtime/capabilities/daemon/__tests__/contracts.test.ts`
- 未全绿：`bun run test:all` 仍存在仓库存量失败；除了若干无关模块解析与 WebSearch adapter 测试外，也仍包含 kernel package / runtime contracts / direct-connect runtime 相关失败
- 未全绿：`bun run lint` 仍存在仓库存量问题，主要是一批 `unused suppression` 与少量风格项

## 收口原则

后续收口应遵循以下原则：

1. 先收调用入口，再决定是否搬实现
2. 先统一顶层宿主引用，再清理内部深路径
3. 不把“入口收口”和“发布导出”混成一个提交
4. headless 优先先改依赖方向，再按 `session / control / bootstrap` seam 继续拆内部实现
5. CLI 始终保留第一宿主地位，剥离的是可复用核心实现，不是 CLI 宿主身份
6. 等接口边界稳定后再补更强的 contract / smoke tests

## 当前推荐执行阶段

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

#### 9. runtime state seam 与 shared session core 准备已进入可执行状态

当前已经完成：

- `bootstrapProvider.ts` 已从 `runtime/core/state/adapters.ts` 中独立出来，`adapters.ts` 只保留 provider 装配职责
- `SessionRuntime.ts` / `TurnEngine.ts` 已不再直接依赖 `src/bootstrap/state.js`
- headless 主链现在会显式把 bootstrap-backed provider 沿 `HeadlessRuntime -> headlessSession -> headlessRuntimeLoop -> ask()` 传下去
- `headlessBootstrap.ts` / `RemoteIO.ts` 已摘掉对 `src/bootstrap/state.js` 的直接依赖
- `runtime/capabilities/server/SessionRegistry.ts` 已把 `SessionManager` 里的 `sessions map + indexStore` 所有权抽成 runtime-owned registry
- `RuntimeDirectConnectSession` 的 backlog replay / detach / idle-timeout / stop 行为已补上最小生命周期测试
- `RuntimeDirectConnectSession` 已把 websocket-style socket contract 收成通用 `SessionRuntimeSink`
- `HostRuntime.ts` 现在只负责 `WebSocket -> SessionRuntimeSink` 适配；对外 `ws_url` / `/sessions/:id/ws` 协议保持不变
- `SessionManager.ts` 已开始依赖 `RuntimeManagedSession` + `SessionLifecycleFactory` contract，不再直接 `new RuntimeDirectConnectSession(...)`
- `SessionManager` 的 `registry` 现在也可显式注入，manager/session lifecycle/persistence 边界比之前清楚一层
- execution 侧的 `ask()` 现在也开始依赖 `ExecutionSessionFactory`，不再直接 `new SessionRuntime(...)`
- `SessionRuntime.ts` 已暴露最小 `RuntimeExecutionSession` contract，headless/CLI 共用的 execution session owner 开始有稳定 seam
- `headlessManagedSession.ts` 已开始接管 `headlessRuntimeLoop.ts` 里的 `mutableMessages` / `readFileState` / `abortController` 这类 session-local 状态，loop 正在退回编排层
- interrupted-turn replay 也开始走 `headlessManagedSession.ts`，不再由 `headlessRuntimeLoop.ts` 直接操作消息缓冲
- `headlessSessionBootstrap.ts` 已开始接管 `continue/resume/fork` 路径里的 session identity / metadata / file-pointer side effects，`headlessBootstrap.ts` 不再直接摸这些 session storage 细节
- `loadInitialMessages()` 现在开始退回 source selection / validation / load-result shaping；loaded conversation 的 AppState/session 采纳重新回到 session bootstrap seam
- resumed conversation 的 coordinator-mode warning / agentDefinitions refresh / `saveMode()` 也开始走 session bootstrap seam，`headlessBootstrap.ts` 进一步退回 load/shaping 层
- startup hooks 产出的 `initialUserMessage` 也开始作为 load-result 返回，`headlessRuntimeLoop.ts` 不再直接读取 `sessionStart.ts` 的 side channel

这一步的意义不是“shared session core 已完成”，而是：

- runtime-vs-host state split 已不再只停留在 contract 定义，而是开始走真实注入路径
- server/direct-connect 这边也已经开始把 session ownership 从单一 `SessionManager` 类往可复用 runtime core 结构迁移
- session core 和 transport adapter 的分界已经开始形成，但 outward protocol transport-neutralization 还没开始做
- manager 这一层已经开始从“知道具体 session 类怎么构造”转成“只编排 lifecycle contract”，但 shared session core 仍未覆盖 CLI/headless 一侧
- CLI/headless 一侧虽然还没和 server 合成同一套 session core，但 execution session owner 也开始从具体类实例化转成 contract + factory 模式
- shared session core 这一段已经收到了可提交 stop point；REPL split 也已经开始第一刀，`replQueryRuntime` helper 进入 `runtime/capabilities/execution/internal/*`
- `REPL.tsx` 不再自己保留全部 query-param 装配逻辑；本地 turn 主链、background query 和 partial compact 已开始共用同一条 runtime-side query-preparation seam
- REPL split 第二刀也已开始：`replTurnShell` 已接管 session title、allowed-tools sync、non-query short-circuit、companion refresh 与 API metrics 这类 host-shell 副作用，`onQueryImpl` 继续向“宿主编排壳”收缩
- REPL split 第三刀也已开始：`replTurnShell` 继续吃进了 pre-query IDE/onboarding 预处理，以及 `queryGuard.end()` 内的 pipe done / bridge result / tungsten auto-hide / abort-controller clear 这类完成态宿主收尾
- REPL split 第四刀也已开始：turn budget capture 与 turn-duration/deferred-swarm 这类 completion tail 已从 `onQuery` finally 主链抽到独立 helper，剩下更集中的主要尾巴已经接近 user-cancel auto-restore
- REPL split 第五刀也已开始：`user-cancel auto-restore` 的 guard / history rewind / prompt restore 已从 `onQuery` finally 主链抽到独立 helper，`REPL.tsx` 在这一段里更接近纯宿主参数组装
- REPL split 第六刀也已开始：`onCancel` 的 proactive pause / partial-stream preserve / token-budget clear / prompt or remote cancel routing / turn-cancel notify 已收成独立 cancel shell，`REPL.tsx` 不再直接持有整块取消收尾
- REPL split 第七刀也已开始：`initialMessage` 的 clear-context / permission 注入 / first-turn hook 预热 / submit-vs-query 分流 已收成独立 bootstrap shell，`REPL.tsx` 在启动期只保留 effect 触发与 ref 管理
- headless bootstrap ownership 虽然开始走 session seam，但 hydration / resume 数据装载本身仍在 `loadInitialMessages()`，还没和 REPL 侧统一
- headless state ownership 也继续往前推了一刀：`mainThreadAgentType` / `initJsonSchema` / `allowedChannels` / `registeredHooks` 已进入 `RuntimeBootstrapStateProvider` 的显式 seam，`headlessControl.ts`、`headlessSessionControl.ts`、`headlessRuntimeLoop.ts` 不再直接从 `bootstrap/state` 读取或写入这些状态
- headless 的 loaded-conversation adoption 现在已经从 `loadInitialMessages()` 挪回 loop + session bootstrap seam，但 teleport / coordinator-mode refresh / startup hooks 这些 host-adjacent 行为还没继续下沉
- headless 的 interrupted-turn replay 已经不是 loop 私有逻辑，但 command queue / startup hooks / coordinator refresh 仍在 loop 或 bootstrap 路径外层
- coordinator-mode refresh 已不再留在 `loadInitialMessages()`，但 startup hooks 与 teleport 仍然是当前这条线剩下的主要 host-adjacent 尾巴
- startup hooks 里的 `initialUserMessage` 已不再由 loop 直接读取侧信道，但 hook promise 的调度与 startup hook 执行本身仍在 bootstrap/load 路径外层
- headless managed session 也开始带上 runtime-owned 的 session identity / lifecycle contract；server 的 `RuntimeManagedSession` 与 headless 的 `HeadlessManagedSession` 现在至少共享同一条 `RuntimeSessionLifecycle` seam，headless cleanup 也开始经由 `stopAndWait()` 收口
- execution 侧的 `RuntimeExecutionSession` 也已经接上同一条 lifecycle seam，`ask()` 在 one-shot 路径里会显式 `stopAndWait()` 收尾；这意味着 shared session lifecycle 已不只停留在 headless helper，而是进入 execution factory 的真实接入面

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
- 新增 bridge / daemon seam tests：
  - `src/kernel/__tests__/bridge.test.ts`
  - `src/kernel/__tests__/daemon.test.ts`
- 已完成 package-level built entry smoke：
  - `bun run build`
  - `node -e "import('./dist/kernel.js')"`

### Runtime Contracts

状态：server 已完成第一轮 contracts 结构下沉，但 runtime contracts 相关验证尚未全绿；bridge / daemon 也还不能视为稳定完成

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

状态：已完成最小 contract / surface 护栏；更完整的 integration 矩阵仍未完成

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

状态：已建立 package-level entry 骨架，但尚未完成发布级收口；当前 built export 仍存在命名与稳定 surface 未完全对齐的问题

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

当前距离验收仍差：

- `@go-hare/hare-code/kernel` 需要稳定暴露预期命名的 kernel 导出
- `tests/integration/kernel-package-smoke.test.ts` 需要转绿
- built entry 与源码级 `src/kernel/index.ts` surface 需要重新对齐

验收标准：

- package 具备明确的 kernel export
- build 产物包含 kernel 入口
- 至少有一个最小 consumer 能从包级入口导入 kernel

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
