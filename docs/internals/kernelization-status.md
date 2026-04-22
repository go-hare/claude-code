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

截至 2026-04-23，当前内核化已经进入 **最后收口阶段**，不是“还没开始”，也不是“需要推翻重来”。

一句话概括：

> 当前项目已经完成统一入口、宿主改道、第一轮包级导出和最小测试护栏；剩余工作主要是实现压平和稳定性强化，而不是架构方向性重做。

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

#### 3. server / direct-connect 顶层宿主已基本 kernel-first

`src/kernel/serverHost.ts` 已统一暴露：

- `createDirectConnectSession`
- `runConnectHeadless`
- `startServer`

同时 `main.tsx` 与 CLI host command 已优先经过 kernel façade，而不是直接拼接 `server/*` 细节。

#### 4. bridge / daemon 顶层入口第一轮收口已完成

`bridgeMain.ts`、`createSession.ts`、`workerRegistry.ts` 现在都已经优先依赖 `src/kernel/bridge.ts` / `src/kernel/daemon.ts`，顶层宿主不再明显依赖 runtime 深路径。

也就是说，bridge / daemon 第一轮“宿主只认 kernel”收口已经成立。

#### 5. 最小 kernel contract / surface 护栏已落地

当前已经有以下最小护栏：

- `src/kernel/__tests__/headless.test.ts`
- `src/kernel/__tests__/serverHost.test.ts`
- `src/kernel/__tests__/surface.test.ts`
- `src/runtime/capabilities/server/__tests__/DirectConnectSessionApi.test.ts`
- `src/daemon/__tests__/workerRegistry.test.ts`
- `src/main/__tests__/modeDispatch.test.ts`

它们已经覆盖了最小的 surface / delegation / façade / direct-connect contract 断言，说明 kernel 已不再是“无护栏状态”。

#### 6. package-level kernel 发布入口第一轮已建立

当前已经具备：

- `src/entrypoints/kernel.ts`
- `dist/kernel.js`
- `package.json` 的 `./kernel` export
- 包级导入 smoke 已验证可用

也就是说，kernel 已不只是源码级入口，而是已经有了第一轮正式发布面。

### 半完成

#### 1. headless 实现收口：入口已完成，底层仍复用历史 CLI loop

`main.tsx` 和 `src/kernel/headless.ts` 已统一经过 runtime 级 `HeadlessRuntime` 入口。

但 `HeadlessRuntime` 底层仍复用 `cli/print.ts` 中的 `runHeadless()`，说明 headless 的最终实现还没有完全从历史 CLI 模块物理下沉。

这是当前最典型的“外壳已 kernel 化、实现层仍未完全物理下沉”的点。

#### 2. serverHost / bridge / daemon 的 kernel 层仍偏薄 façade

`kernel/serverHost`、`kernel/bridge`、`kernel/daemon` 已经把宿主边界收住，但内部更多还是稳定转发层，而不是已经彻底压平后的主编排层。

这意味着：

- “顶层只认 kernel” 已基本成立
- “kernel 已完全成为内部链路真正汇聚点” 还没有成立

#### 3. 测试护栏已起步，但还不是完整 contract / integration 体系

当前已经有最小 contract / surface 护栏，但还不等于已经具备完整的长期稳定矩阵。

尤其还缺更强的：

- package-level consumer 真实导入链路回归
- end-to-end kernel headless smoke tests
- direct-connect / server 的 kernel-only 使用链路回归
- 防止宿主回退到深路径引用的结构性测试

#### 4. kernel 已有发布入口，但“长期发布级稳定面”仍在沉淀

从工程动作上说，package-level kernel 入口已经有了。

但从长期 API 承诺角度说，它目前更准确的口径仍然是“第一轮包级发布面已建立”，还不是已经被充分回归和长期 consumer 证明过的成熟稳定 API。

### 未完成

#### 1. headless 底层完全脱离历史 CLI 实现

目标已经不是再改入口，而是继续把仍在 `cli/print.ts` 里的 headless 底层实现下沉到 runtime / kernel 内部边界。

这一点仍然未完成。

#### 2. kernel 内部链路进一步压平

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
- 已通过：`bun run build`
- 已通过：包级导入 smoke（`@go-hare/hare-code/kernel`）
- 已通过：kernel 相关定向测试（headless / serverHost / surface / DirectConnectSessionApi / workerRegistry / modeDispatch）
- 未全绿：`bun test` 仍存在仓库存量失败，主要集中在若干无关模块的模块解析与 WebSearch adapter 测试
- 未全绿：`bun run lint` 仍存在仓库存量问题，主要是一批 `unused suppression` 与少量风格项

## 收口原则

后续收口应遵循以下原则：

1. 先收调用入口，再决定是否搬实现
2. 先统一顶层宿主引用，再清理内部深路径
3. 不把“入口收口”和“发布导出”混成一个提交
4. 不在第一刀中物理大搬 `cli/print.ts`
5. 等接口边界稳定后再补 contract tests

## 建议的 5 个 commit

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

状态：已完成第一轮 package-level 收口，已提供 `dist/kernel.js` 的独立 build entry、`package.json` 的 `./kernel` export，并验证包级导入可用；长期稳定性仍需更多回归支撑

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
