# `main.tsx` 瘦身计划

## 目标

当前内核化主线已经基本完成，`main.tsx` 的主要问题不再是“越过 kernel 边界”，而是**宿主启动编排职责过重**。

本阶段的目标不是继续做 kernelization，而是把 [`src/main.tsx`](../../src/main.tsx) 从“大宿主编排器”压成“模式分发入口”。

最终希望 `main.tsx` 只负责：

1. 汇总 CLI 解析结果
2. 决定启动模式
3. 调用对应 launcher

## 当前判断

截至 2026-04-23，`main.tsx` 已经完成了 kernel-first 的关键收口，但仍然偏重。

结合后续收口进展，更准确的现状补充是：

- `headless` / `direct-connect` / `server` 这三条模式分支已经各自有独立 launcher
- `ssh-remote` 也已经开始从 `main.tsx` 抽出到独立 launcher
- `assistant-chat` 也已经开始从 `main.tsx` 抽出到独立 launcher
- `remote create` 也已经开始从 `main.tsx` 抽出到独立 launcher
- `continue` 也已经开始从 `main.tsx` 抽出到独立 launcher
- `resume-like` 也已经开始从 `main.tsx` 抽出到独立 launcher
- 默认 interactive REPL 启动也已经开始从 `main.tsx` 抽出到独立 launcher
- `main.tsx` 当前仍偏重的部分，主要集中在：
  - 启动前共享 assembly
  - 顶层上下文组装

截至 2026-04-24，`main.tsx` / `REPL.tsx` 这轮又往前收了一段：

- `main.tsx` 已新增 shared launch context，重复的 `appProps / replProps` 组装已统一收口
- `main.tsx` 剩余的 shared startup assembly 也已继续收口：
  - session uploader deferred assembly
  - sessionConfig / resumeContext
  - startupModes
  - startup telemetry scheduling
- `REPL.tsx` 的 query turn orchestration 已上提到独立 controller
- `REPL.tsx` 的 bottom / bubble 区域已拆成独立 view 组件
- `bridgeMain.ts` 也已开始第一轮瘦身：
  - `spawner / logger / initial session` 的宿主装配已上提到 `src/kernel/bridge.ts`
  - `bridgeMain.ts` 不再直接拼这三块默认实现

因此当前这阶段的重点已经从“先把 launcher 抽出去”，推进到：

- 继续压 `main.tsx` 剩余的零散宿主装配
- 再看是否需要进一步拆 `REPL.tsx` 的其他重块
- 然后继续推进 `bridgeMain.ts` 的下一轮瘦身

典型例子：

- headless 主链虽然已经改走 kernel surface，但 `src/main.tsx` 里对应 headless 分支这一段仍然自己串了：
  - `createDefaultKernelHeadlessEnvironment(...)`
  - `connectDefaultKernelHeadlessMcp(...)`
  - `prepareKernelHeadlessStartup(...)`
  - `runKernelHeadless(...)`

- direct-connect / server 虽然已经过 `src/kernel/serverHost.ts`，但 `main.tsx` 仍然保留了一部分模式级启动编排。

所以当前问题是：

- **边界已经对了**
- **宿主入口还不够薄**

## 设计原则

本阶段遵循以下规则：

1. 不回退 kernel-first
2. 不把宿主逻辑重新塞回 runtime
3. 不在本阶段顺手重构 `bridgeMain.ts`
4. 不把 `main.tsx` 的复杂度转移到一个新的“大而全 launcher”
5. launcher 只做 mode-specific orchestration，不重复 kernel 内部装配

## 执行约束

这一阶段以**完成任务**为第一优先级，不以“继续追求更漂亮的架构”作为默认目标。

具体约束：

1. 先完成当前 phase，再决定是否进入下一 phase
2. 只解决当前 phase 明确阻塞实现的问题，不顺手扩写相邻层
3. 只要 `main.tsx` 的对应模式启动编排已经明显变薄、行为保持稳定，就视为本轮达标
4. 不为了目录完整、命名完美或理论分层一致性，提前抽取额外抽象
5. 若出现“还可以再抽一层”“还可以再统一一点”这类冲动，默认先停下来，优先交付可验证结果
6. 只要任务天然可拆且边界清楚，就优先并行推进，而不是默认串行慢慢做
7. 能明确切块的子任务，直接交给子 agent 负责；主线程负责集成、验收和收口
8. 每个 phase 一旦达到验收条件，立即收口并切到下一阶段，不因为还能继续优化而停留

## 并行与收口策略

执行时默认采用下面的策略：

1. 先判断当前 phase 是否能拆成 2 到 4 个边界清晰、互不冲突的子任务
2. 能拆开时优先并行，不能拆开时再串行，不为了“形式上并行”制造额外协调成本
3. 子 agent 只负责自己明确拥有的任务块，不跨界顺手改其他块
4. 主线程不和子 agent 抢同一块实现，主线程负责公共边界、最终集成、验证与推进下一阶段
5. 某个 phase 一旦验收通过，就停止该 phase 的继续打磨，直接进入下一阶段或最终收尾

## 分层口径

### `main.tsx`

负责：

- mode dispatch
- launcher 入参组装
- 顶层流程转发

不负责：

- 具体模式的完整启动编排
- 各模式独立的前置准备细节
- 深层 runtime / server / bridge 细节

### `src/hosts/cli/launchers/*`

负责：

- 模式级启动编排
- 调 kernel API 的顺序控制
- 宿主级状态写回
- 启动成功后的最小宿主行为

### `src/kernel/*`

负责：

- 稳定 host-facing API
- 参数归一化
- 默认装配
- 边界收口

## 推荐目录

建议新增：

- [`src/hosts/cli/launchers/`](../../src/hosts/cli/launchers)
  - `headlessLauncher.ts`
  - `directConnectLauncher.ts`
  - `serverLauncher.ts`
  - `sharedStartup.ts`

原因：

- 这些逻辑本质上是 CLI 宿主逻辑
- 不应该继续堆在 `main.tsx`
- 也不应全部塞进 kernel

## 分阶段方案

### Phase A：抽 headless launcher

优先级：最高

目标：

把当前 `main.tsx` 中 headless 模式的启动编排抽成独立 launcher。

建议新增：

- [`src/hosts/cli/launchers/headlessLauncher.ts`](../../src/hosts/cli/launchers/headlessLauncher.ts)

建议收进去的内容：

- `createDefaultKernelHeadlessEnvironment(...)`
- `connectDefaultKernelHeadlessMcp(...)`
- `prepareKernelHeadlessStartup(...)`
- `runKernelHeadless(...)`

完成后 `main.tsx` 只保留：

```ts
await runHeadlessLaunch(...)
return
```

验收标准：

- `main.tsx` 不再自己串 headless 四段式启动
- headless 行为不变
- `modeDispatch.test.ts` 和 headless 相关 smoke 保持通过
- 达到以上三条后，本 phase 直接收口，不继续追求额外抽象
- 若该 phase 存在可独立拆分的测试补强、适配清理、调用点接线，可并行处理；主线以最终集成为准

### Phase B：抽 direct-connect launcher

优先级：高

建议新增：

- [`src/hosts/cli/launchers/directConnectLauncher.ts`](../../src/hosts/cli/launchers/directConnectLauncher.ts)

建议收进去的内容：

- `connectDirectHostSession(...)`
- direct-connect 相关 state 写回
- 模式级错误映射与退出策略

验收标准：

- `main.tsx` 不再保留 direct-connect 的完整启动细节
- direct-connect 继续只认 kernel helper
- 达标后直接收口，不继续顺手统一其他未阻塞路径

### Phase C：抽 server launcher

优先级：中高

建议新增：

- [`src/hosts/cli/launchers/serverLauncher.ts`](../../src/hosts/cli/launchers/serverLauncher.ts)

建议收进去的内容：

- `assembleServerHost(...)`
- 启动成功后的宿主输出/生命周期衔接

验收标准：

- `main.tsx` 不再保留 server 启动编排
- server 模式仍以 kernel 作为稳定宿主入口
- 达标后直接收口，不为追求目录对称性追加多余抽象

### Phase D：抽 shared startup

优先级：最后

建议新增：

- [`src/hosts/cli/launchers/sharedStartup.ts`](../../src/hosts/cli/launchers/sharedStartup.ts)

建议收进去的内容：

- 共用 startup/preAction side effects
- telemetry / profiler checkpoint
- 可复用的模式前置准备

注意：

这一阶段只在确实出现 launcher 之间重复时才做，不要为了“目录完整”提前抽象。
如果 Phase A/B/C 已经满足交付目标，而重复还不足以形成真实负担，则可以不做这一阶段。

## 不做的事

本阶段明确不包括：

1. `bridgeMain.ts` 瘦身
2. `server/*` 历史兼容层全面清理
3. 第二轮 runtime contracts 深化
4. 新一轮 kernel public surface 收窄
5. 大规模目录搬迁

## 验收标准

当以下条件同时满足时，可认为 `main.tsx` 瘦身阶段完成：

1. `main.tsx` 主要只剩 mode dispatch
2. headless / direct-connect / server 各自有独立 launcher
3. launcher 不绕过 kernel
4. 现有 mode / kernel 相关测试保持通过
5. 没有为了“更漂亮”继续引入与交付无关的抽象层
6. 能并行的部分已经并行处理，未并行的部分有明确理由而不是惯性串行

## 当前阶段进展

本阶段当前已完成：

1. `headless / direct-connect / server / continue / ssh / assistant / remote / resume-like / interactive` 的模式级 launcher 外抽
2. `main.tsx` 的 shared launch context 收口
3. `REPL.tsx` 的 query turn orchestration 外抽
4. `REPL.tsx` 的 bottom / bubble view 拆分

当前未完成但仍有价值的尾项：

1. `main.tsx` 剩余零散宿主装配的进一步收口
2. `bridgeMain.ts` 的继续瘦身
3. `REPL.tsx` 其他重块的继续拆分

## 当前推荐起点

如果只做第一刀，推荐直接开始：

**Phase A：抽 `headlessLauncher.ts`**

原因：

- 收益最大
- 改动边界最清楚
- 已有 kernel headless surface 足够稳定
- 最能直接降低 `main.tsx` 体积和宿主编排复杂度

## 下一阶段优先级

### 1. `src/main.tsx`

继续把以下模式的启动编排往外抽：

- headless
- repl
- remote
- direct-connect
- continue
- resume-like
- 默认 interactive

目标：

- 让 `main.tsx` 更像总入口
- 不再承担具体实现层启动细节

### 2. `src/kernel/serverHost.ts`

继续清理以下层之间的重复转发：

- `server/*`
- `hosts/*`
- `runtime/*`

目标：

- 把 direct-connect / server 的稳定入口彻底定死
- 明确谁是宿主正式入口，谁只是兼容出口

### 3. `src/bridge/bridgeMain.ts`

继续瘦身，尽量只保留：

- 参数分发
- UI / log

把以下逻辑继续往 capability / kernel 靠：

- session
- spawn
- retry

目标：

- 让 `bridgeMain.ts` 退回成桥接宿主入口
- 不再继续充当 bridge 全功能中心

备注：

- 这不是当前 `main.tsx` 瘦身任务的完成前置条件
- 只有在前面阶段已经完成、且它明确阻塞后续交付时，才进入这里
