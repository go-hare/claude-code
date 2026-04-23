# 内核化完成执行文档

## 目标

本文只回答一个问题：

> 要把当前项目的 kernelization 真正做完，还剩哪些事，按什么顺序做，做到什么程度就收口。

这不是新一轮大重构方案，也不是“继续追求更漂亮架构”的清单。

本文的执行原则：

1. 以完成任务为第一优先级
2. 达到当前阶段验收条件后立即收口
3. 不为目录对称、命名完美或理论最优继续深挖
4. 能并行就并行，但不制造额外冲突
5. 可明确切块的任务，优先交给子 agent；主线程负责边界、集成、验证和收口

## 完成的定义

只有同时满足下面 6 条，才算“内核化完成”：

1. `src/kernel` 成为源码级稳定接入面，host 不再回退到 runtime 深路径
2. runtime 不再通过大面积 `bootstrap/state` 单例回取核心执行状态
3. CLI / headless / direct-connect / server 共享同一套 runtime-owned session core，或至少共享同一套 session ownership 模型
4. REPL 不再承担大块 runtime 语义，UI 与 runtime 边界明确
5. `@go-hare/hare-code/kernel` 的 package-level built entry 与 `src/kernel/index.ts` surface 对齐
6. kernel 相关 smoke / contracts / package entry 测试转绿，且 `bun run test:all` 不再包含 kernel 相关失败簇

## 当前位置

当前已经完成：

- headless / direct-connect / server 的顶层 launcher 第一轮收口
- `src/kernel` 作为统一 façade 的基本形态
- 最小 import discipline / surface / smoke 护栏

当前还没完成的硬缺口，主要是 3 类：

1. runtime state ownership 还混着 bootstrap 单例
2. shared session core 还没统一
3. REPL / headless 仍然留有宿主壳与 host-adjacent 尾巴

对应的直接证据：

- [`src/runtime/core/state/adapters.ts`](../../src/runtime/core/state/adapters.ts) 仍直接大面积 import [`src/bootstrap/state.ts`](../../src/bootstrap/state.ts) 的 getter / setter
- [`src/runtime/capabilities/server/SessionManager.ts`](../../src/runtime/capabilities/server/SessionManager.ts) 仍自己持有 `sessions` map 和 `indexStore`
- [`tests/integration/kernel-package-smoke.test.ts`](../../tests/integration/kernel-package-smoke.test.ts) 仍要求 built package 暴露 `runBridgeHeadless` / `runDaemonWorker`
- [`src/screens/REPL.tsx`](../../src/screens/REPL.tsx) 仍有 6155 行，[`src/main.tsx`](../../src/main.tsx) 仍有 5662 行

## 非目标

下面这些不是“完成内核化”的前置条件：

1. 把所有历史文件都瘦身到理想体积
2. 为了美观统一目录命名再抽一层
3. 先把 `bridgeMain.ts` 做成漂亮的多层架构
4. 顺手重做整个 build / examples / docs 体系

其中 [`main-entry-slimming-plan.md`](./main-entry-slimming-plan.md) 是并行优化轨，不是当前 kernelization 完成定义的主线。
如果它直接阻塞 REPL host/runtime 边界收口，可以并入对应 phase；否则不应反客为主。

## 总体打法

推荐分成 1 条主线 + 2 条并行侧线：

### 主线 A：ownership transfer 真正收口

按顺序推进：

1. runtime-vs-host state split
2. shared session core
3. REPL host/runtime split

### 侧线 B：contracts / smoke / 验证护栏补齐

这条线跟随主线推进，每一阶段补足最小验证，不等到最后一次性补。

## Phase 1：收口 package-level kernel 发布面

优先级：高  
是否可并行：可

### 目标

让 `@go-hare/hare-code/kernel` 的 built entry 真正对齐源码级稳定 surface。

### 当前状态

截至 2026-04-24，这一阶段已经可以视为完成：

1. `bun run build` 已产出可导入的 `dist/kernel.js`
2. [`src/kernel/__tests__/packageEntry.test.ts`](../../src/kernel/__tests__/packageEntry.test.ts) 通过
3. [`tests/integration/kernel-package-smoke.test.ts`](../../tests/integration/kernel-package-smoke.test.ts) 通过
4. `@go-hare/hare-code/kernel` 已能稳定导出 `runKernelHeadless`、`createDefaultKernelHeadlessEnvironment`、`createDirectConnectSession`、`runBridgeHeadless`、`runDaemonWorker`，且 `createKernelSession === createDirectConnectSession`

### 建议涉及文件

- [`src/kernel/index.ts`](../../src/kernel/index.ts)
- [`src/entrypoints/kernel.ts`](../../src/entrypoints/kernel.ts)
- [`build.ts`](../../build.ts)
- [`package.json`](../../package.json)
- [`src/kernel/__tests__/packageEntry.test.ts`](../../src/kernel/__tests__/packageEntry.test.ts)
- [`tests/integration/kernel-package-smoke.test.ts`](../../tests/integration/kernel-package-smoke.test.ts)

### 本阶段要做的事

1. 对齐 `src/kernel/index.ts` 与 built entry 的导出名
2. 修正 bridge / daemon 相关导出在 package-level entry 上的命名
3. 保证 `createKernelSession` 与 `createDirectConnectSession` 的 alias 行为保持稳定
4. 跑 package-level smoke，确认 consumer 真实可导入

### 验收标准

1. `@go-hare/hare-code/kernel` 可导入并暴露预期命名的 kernel exports
2. `tests/integration/kernel-package-smoke.test.ts` 转绿
3. `src/kernel/__tests__/packageEntry.test.ts` 继续通过

### 收口结论

这一阶段已经满足收口条件，不再是当前主线阻塞；后续只在 build / exports 再次回退时回来看它。

## Phase 2：做实 runtime-vs-host state ownership split

优先级：最高  
是否可并行：主线，默认串行推进

### 目标

把 runtime 还挂在 `bootstrap/state` 单例上的那部分真正剥离出来，让 runtime 通过明确 provider / context 拿状态，而不是反向回读宿主全局单例。

### 为什么它是主阻塞

当前 [`src/runtime/core/state/adapters.ts`](../../src/runtime/core/state/adapters.ts) 仍直接 import 大量 `get*` / `set*` 到 [`src/bootstrap/state.ts`](../../src/bootstrap/state.ts)。

这说明：

- runtime 还没真正拥有自己的状态边界
- host 与 runtime 之间仍是“单例桥接”，不是明确 contract

### 建议涉及文件

- [`src/runtime/core/state/adapters.ts`](../../src/runtime/core/state/adapters.ts)
- [`src/runtime/core/state/providers.ts`](../../src/runtime/core/state/providers.ts)
- [`src/bootstrap/state.ts`](../../src/bootstrap/state.ts)
- runtime 里直接消费这些 provider 的执行主链文件

### 本阶段要做的事

1. 先列出 runtime 真正需要的最小状态面
2. 把“session identity / usage / prompt / debug / app state”拆成明确 provider contract
3. 让 host 在边界处注入 provider，而不是 runtime 直接回读 bootstrap 单例
4. 收掉 runtime core 对 `bootstrap/state` 的大面积直连

### 验收标准

1. runtime core 不再直接依赖 `bootstrap/state` 的大面积 getter / setter
2. host 与 runtime 的状态交互经过显式 provider contract
3. 相关 state / execution 测试通过，且不回退已有 kernel surface

### 收口条件

只要 ownership 已经清晰、主执行链已切换完成，就停；不要在本阶段顺手重做所有历史状态结构。

## Phase 3：统一 shared session core

优先级：最高  
是否可并行：与 Phase 2 强依赖，不建议先于 Phase 2

### 目标

把 CLI / headless / direct-connect / server 的 session 生命周期收敛到同一套 runtime-owned session core。

### 为什么它还没完成

当前 [`src/runtime/capabilities/server/SessionManager.ts`](../../src/runtime/capabilities/server/SessionManager.ts) 仍然自己持有：

- `sessions` map
- `indexStore`
- create / attach / detach / destroy 的生命周期逻辑

这说明 server/direct-connect 仍是一套独立 session core，不是统一 runtime session core。

### 建议涉及文件

- [`src/runtime/capabilities/server/SessionManager.ts`](../../src/runtime/capabilities/server/SessionManager.ts)
- [`src/runtime/capabilities/server/RuntimeDirectConnectSession.ts`](../../src/runtime/capabilities/server/RuntimeDirectConnectSession.ts)
- [`src/kernel/serverHost.ts`](../../src/kernel/serverHost.ts)
- direct-connect / headless / CLI 会话创建与恢复主链相关文件

### 本阶段要做的事

1. 先抽出 session core 的最小 contract：create / attach / detach / stop / persist / index
2. 把 server/direct-connect 的独立 ownership 下沉为 runtime-owned shared core
3. 让 CLI / headless 与 server/direct-connect 走同一套 session lifecycle 模型
4. 保留 host-specific transport / banner / lockfile / socket 逻辑在宿主层

### 验收标准

1. server/direct-connect 不再拥有一套单独的 session core
2. CLI / headless / server / direct-connect 至少共享一套 runtime-owned session ownership 模型
3. `DirectConnectSessionApi` 和 server contracts 相关测试转绿

### 收口条件

只要 shared session core 已成立，就停；不要把 transport、存储、UI 提示也一起做成“大统一平台”。

## Phase 4：拆 REPL host/runtime 边界

优先级：高  
是否可并行：可在 Phase 3 后作为主线继续推进；局部测试可并行

### 目标

把 REPL 从“兼管 UI + runtime 语义 + 交互流程”的巨石，收成“宿主 UI 壳 + runtime controller”边界。

### 为什么它是完成内核化的硬条件

只要 REPL 还保留大量 runtime 语义，CLI 就仍然在持有核心执行脑子，kernelization 就只能算“半完成”。

当前直接信号：

- [`src/screens/REPL.tsx`](../../src/screens/REPL.tsx) 6155 行
- [`src/main.tsx`](../../src/main.tsx) 5662 行

### 建议涉及文件

- [`src/screens/REPL.tsx`](../../src/screens/REPL.tsx)
- [`src/main.tsx`](../../src/main.tsx)
- REPL 依赖的 query / session / state orchestration 文件
- 需要时可结合 [`main-entry-slimming-plan.md`](./main-entry-slimming-plan.md) 一起推进

### 本阶段要做的事

1. 先识别 REPL 里哪些属于 runtime controller，哪些属于纯 UI
2. 把 turn loop、session orchestration、runtime event wiring 往 runtime / controller 下沉
3. 让 REPL 主要保留：
   - 展示
   - 输入
   - 权限交互
   - 少量 host-local UX 状态
4. 让 `main.tsx` 更像模式分发和 launcher 组装入口，而不是继续持有运行语义

### 验收标准

1. REPL 不再直接承担大块 runtime 语义
2. `main.tsx` 和 REPL 的宿主职责明显变薄
3. 不回退 kernel-first，不把逻辑重新塞回 host 深层

### 收口条件

只要 host/runtime 边界已经清晰，就停；不要顺手做全量 UI 组件化美化。

## Phase 5：收口 runtime contracts 与 kernel 验证面

优先级：高  
是否可并行：可，跟随前面各 phase 同步推进

### 目标

把当前还没绿的 kernel 相关失败簇清掉，并补足前几阶段新增边界的最小护栏。

### 当前明确要清掉的失败簇

- [`tests/integration/kernel-package-smoke.test.ts`](../../tests/integration/kernel-package-smoke.test.ts)
- `src/runtime/capabilities/server/__tests__/DirectConnectSessionApi.test.ts`
- `src/runtime/capabilities/bridge/__tests__/contracts.test.ts`
- `src/runtime/capabilities/server/__tests__/contracts.test.ts`
- `src/runtime/capabilities/daemon/__tests__/contracts.test.ts`

### 本阶段要做的事

1. 前面每个 phase 落地时，同步补对应 seam / contract tests
2. 不让 kernel 相关失败留到最后一次性排
3. 必要时扩展 `importDiscipline.test.ts`，继续防止宿主回退深路径

### 验收标准

1. 上述 kernel 相关失败簇全部转绿
2. `bun run test:all` 中不再出现 kernel package / runtime contracts / direct-connect runtime 相关失败
3. `bun run typecheck` 持续通过

### 收口条件

只要 kernel 相关失败簇清零，就结束；无关历史失败另列仓库存量问题，不在此阶段无限扩张。

## 推荐执行顺序

推荐按下面顺序推进：

1. Phase 1：package-level 发布面修复
2. Phase 2：runtime-vs-host state split
3. Phase 3：shared session core
4. Phase 4：REPL host/runtime split
5. Phase 5：contracts / smoke / 最终收口

其中建议的并行方式是：

- 主线程：Phase 2 / 3 / 4 主线
- 子 agent A：Phase 1 package-level entry 修复
- 子 agent B：Phase 5 的测试补强和护栏补齐

前提是写入范围不冲突；一旦出现 shared contract / shared types / 根入口冲突，就回到主线程串行收口。

## 最终验收

当下面这些条件同时满足时，可以宣布“内核化完成”：

1. `src/kernel` 成为宿主和 consumer 的稳定入口
2. runtime core 已不再广泛直连 `bootstrap/state`
3. shared session core 已成立
4. REPL 与宿主入口只保留 host 侧职责
5. package-level kernel built entry 与源码级 surface 对齐
6. kernel 相关 smoke / contracts / package entry 测试全部通过
7. `bun run typecheck` 通过
8. `bun run test:all` 不再包含 kernel 相关失败簇

## 一句话结论

如果压成一句话，当前要把内核化做完，真正还剩的是：

> 修 package-level 发布面，做实 state ownership，统一 session core，拆开 REPL 的 host/runtime 边界，然后把 kernel 相关 contracts 和 smoke 全部打绿。
