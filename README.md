# Hare Code

[![GitHub Stars](https://img.shields.io/github/stars/go-hare/hare-code?style=flat-square&logo=github&color=yellow)](https://github.com/go-hare/hare-code/stargazers)
[![GitHub Contributors](https://img.shields.io/github/contributors/go-hare/hare-code?style=flat-square&color=green)](https://github.com/go-hare/hare-code/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/go-hare/hare-code?style=flat-square&color=orange)](https://github.com/go-hare/hare-code/issues)
[![GitHub License](https://img.shields.io/github/license/go-hare/hare-code?style=flat-square)](https://github.com/go-hare/hare-code/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/go-hare/hare-code?style=flat-square&color=blue)](https://github.com/go-hare/hare-code/commits/main)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?style=flat-square&logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/lang-TypeScript-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-3281%20pass-brightgreen?style=flat-square)](https://github.com/go-hare/hare-code/actions)

Hare Code 是一个面向终端交互、headless 嵌入、direct-connect、server、bridge 和 daemon 场景的 **内核化 AI coding runtime**。它是 Claude Code 的反编译还原版本，已从单体 CLI 架构重构为**三层分层内核架构**，在保留所有原始功能的基础上提供了标准化、可嵌入的运行时接口。

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                     HOST 层                              │
│  CLI / REPL   │   Server   │   Daemon   │   SDK/Embed   │
├─────────────────────────────────────────────────────────┤
│                   KERNEL 层 (43 文件)                     │
│  ┌──────────┬──────────┬──────────┬──────────────────┐  │
│  │  Agent   │   Task   │  Kairos  │    Companion     │  │
│  │  Registry│  Registry│  Runtime │    Runtime       │  │
│  ├──────────┼──────────┼──────────┼──────────────────┤  │
│  │  Wire Protocol (50 命令)  │  Event System (44 事件) │  │
│  │  Transport (in-process / stdio / ws / http)       │  │
│  ├──────────┴──────────┴──────────┴──────────────────┤  │
│  │  Permissions  │  Memory  │  Context  │  Sessions  │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                  RUNTIME 层 (70+ 文件)                    │
│  Capabilities (8 族) │ Contracts │ Core (wire/state)    │
└─────────────────────────────────────────────────────────┘
```

当前项目的核心目标：

- **CLI 主链稳定** — 保持 CLI 作为官方交互宿主，不破坏主交互路径
- **内核统一接入** — 将可复用能力稳定暴露到 `src/kernel`，让外部宿主通过 kernel façade 接入
- **运行时边界收口** — 在不破坏主链的前提下持续收紧运行时能力

## 核心系统

### Agent 系统

完整的 Agent 生命周期管理，支持内置/自定义/插件三种 Agent 来源。

| Agent 类型 | 说明 |
|-----------|------|
| `general-purpose` | 默认通用 Agent，拥有完整工具集 |
| `Explore` | 快速代码库探索 Agent |
| `Plan` | 架构设计与实现计划 Agent |
| `verification` | 独立验证 Agent |
| `claude-code-guide` | Claude Code 使用指南 Agent |
| `statusline-setup` | 状态栏配置 Agent |
| `worker` | Coordinator 模式下的 Worker Agent |

**Spawn 参数**: `agentType`, `prompt`, `description`, `model`, `runInBackground`, `taskId`, `name`, `teamName`, `mode`, `isolation` (worktree/remote), `cwd`, `ownedFiles`

**运行管理**: `listAgents`, `spawnAgent`, `listAgentRuns`, `getAgentRun`, `getAgentOutput`, `cancelAgentRun`, `reloadAgents`

### Task 协调器

结构化的任务依赖系统，支持后台 Agent 执行追踪。

```
Task 状态流转:  pending  ──→  in_progress  ──→  completed
                    ╲                        ╱
                     └──→  blocked (依赖未满足)
```

**核心能力**:
- **依赖管理**: `blocks` / `blockedBy` — 任务间依赖 DAG
- **Owner 分配**: 将任务分配给特定 Agent/Worker
- **执行追踪**: `linkedBackgroundTaskId`, `linkedAgentId` — 关联后台任务和 Agent
- **文件归属**: `ownedFiles` — 标记任务专属文件，防止冲突
- **过滤器**: 按 `status`, `owner`, `blocked`, `linkedAgentId`, `linkedBackgroundTaskId` 多维过滤

### Kairos 自主系统

Tick 驱动的事件循环，支持自主模式下的外部事件处理。

```
外部事件 → enqueueEvent() → 事件队列 → tick() → drain → 自主命令生成
                                                      ↕
                                              suspend / resume
```

**状态机**:
- `enabled` — 编译期 feature flag (`KAIROS`) + GrowthBook 远程开关
- `runtimeEnabled` — 环境变量 `CLAUDE_CODE_ENABLE_KAIROS` 覆盖
- `proactive` — 主动模式状态（active / paused / contextBlocked / shouldTick）
- `suspended` — 手动暂停（API 错误时自动暂停防止重试风暴）

**事件类型**: `event_enqueued`, `tick`, `suspended`, `resumed`

### Companion（Pet）系统

一个温暖的终端陪伴角色 — 默认是一只名为 Picowhisk 的小仙人掌。

```
生命周期:  hatch  →  (mute/unmute)  →  (pet)  →  (reactToTurn)  →  clear/rehatch
```

**Action 类型**: `hatch`, `rehatch`, `mute`, `unmute`, `pet`, `clear`

**Runtime 接口**:
- `getState()` — 获取当前状态（seed, muted, companion 属性）
- `dispatch(action)` — 执行动作并触发事件
- `reactToTurn(messages)` — 根据对话内容产生陪伴反应
- `onEvent(handler)` — 订阅 companion 事件流

**Feature Flag**: `BUDDY` 编译期开关 + `CLAUDE_CODE_ENABLE_BUDDY` 环境变量

### Team / Swarm 系统

多 Agent 协同工作组（Swarm），支持 Team 生命周期管理、队友间消息传递和进程内/独立进程两种队友执行后端。

```
Team 生命周期:  spawnTeam  →  (队友加入/工作)  →  cleanup
                    │                        │
                    └── TeamCreate 工具      └── TeamDelete 工具
                             │                        │
                    写入 team 配置文件          优雅关闭 → 清理目录
                    分配颜色/任务列表          终止非活跃队友 → kill 回退
```

**核心组件**:

| 组件 | 文件 | 说明 |
|------|------|------|
| Team 创建 | `TeamCreateTool.ts` (240 行) | 生成 team 配置、注册颜色、创建任务列表 |
| Team 删除 | `TeamDeleteTool.ts` (306 行) | 优雅关闭队友 → 终止残留进程 → 清理目录 |
| 依赖注入 | `teamDeleteDeps.ts` (14 行) | **新增** — 提取外部依赖 barrel 模块，提升可测试性 |
| 队友生命周期 | `teammateLifecycle.ts` (61 行) | **新增** — `requestShutdown` / `terminateTeammate` / `killInProcessTeammate` |
| 队友布局 | `teammateLayoutManager.ts` | 颜色分配、Pane 布局管理 |
| 队内消息 | `SendMessageTool` | 队友间直接消息传递（支持 UDS / Bridge / TCP） |
| 队友发现 | `teamDiscovery.ts` | 自动发现活跃 Team 及成员 |
| 进程内执行 | `InProcessTeammateTask.tsx` | 进程内队友作为后台 Task 运行 |
| Swarm 门控 | `agentSwarmsEnabled.ts` | `AGENT_SWARMS` compile-time feature gate |

**执行后端**: `in-process`（进程内 Ink 渲染）| `tmux-pane`（独立 tmux 窗格）

**Feature flag**: `AGENT_SWARMS` 编译期开关 + GrowthBook 远程控制

### Wire Protocol

内核通信协议 — 50 种命令类型 + 44 种事件类型。

**传输层**: `in-process` | `stdio` | `ipc` | `websocket` | `http` | `unix-socket`

```
┌──────────┐    command     ┌──────────────┐    envelope     ┌──────────┐
│  Client  │ ─────────────→ │    Router     │ ─────────────→ │  Catalog │
│          │ ←───────────── │               │ ←───────────── │          │
└──────────┘    response    └──────────────┘    event        └──────────┘
```

**关键命令**:

| 类别 | 命令 |
|------|------|
| 会话 | `init_runtime`, `connect_host`, `create_conversation`, `dispose_conversation` |
| 执行 | `run_turn`, `abort_turn`, `execute_command` |
| Agent | `list_agents`, `spawn_agent`, `list_agent_runs`, `get_agent_run`, `get_agent_output`, `cancel_agent_run` |
| Task | `list_tasks`, `get_task`, `create_task`, `update_task`, `assign_task` |
| Tools | `list_tools`, `call_tool` |
| MCP | `list_mcp_servers`, `connect_mcp`, `authenticate_mcp`, `reload_mcp` |
| 扩展 | `list_skills`, `list_hooks`, `list_plugins`, `install_plugin` |

### 能力族（Capability Families）

8 个能力族对运行时能力进行分类管理：

| 能力族 | 说明 |
|--------|------|
| `core` | 核心运行时能力 |
| `execution` | 命令/工具执行 |
| `model` | 模型推理与 API |
| `extension` | MCP/Skills/Hooks/Plugins |
| `security` | 认证与权限 |
| `host` | 宿主集成（CLI/Server/Daemon） |
| `autonomy` | 自主模式（Kairos/Proactive） |
| `observability` | 遥测与监控 |

## 与原始 Claude Code 的对比

内核化版本基于原始 Claude Code 反编译代码，在**功能只强不弱**的原则下完成架构升级：

### 量化对比

| 指标 | 原始 Claude Code | 内核化 Hare Code | 变化 |
|------|-----------------|------------------|------|
| 源文件数 | 2,741 | 3,137 | **+396 (+14.4%)** |
| 代码行数 | 509,139 | 575,383 | **+66,244 (+13.0%)** |
| Tools 数量 | 60 | 61 | 持平 |
| 测试数量 | 3,175 | 3,281+ | **+106** |
| 测试通过率 | — | 100% (0 fail) | — |
| Kernel 层 | 不存在 | 43 文件 | 全新 |
| Runtime 层 | 不存在 | 70+ 文件 | 全新 |
| Host 抽象 | 隐式 | 5 宿主 | 全新 |

### 逐系统对比

| 系统 | 原始版 | 内核化版 | 判定 |
|------|--------|---------|------|
| **Agent** | `AgentTool` 1,836 行，6 内置 Agent | `AgentTool` 1,970 行 (+134)，新增 resume/fork，完整 `KernelAgentRegistry` 门面 | ✅ **增强** |
| **Sub-Agent** | `LocalAgentTask`, `RemoteAgentTask`, `InProcessTeammateTask` | 全部保留 + `KernelAgentRunDescriptor` 运行期管理 + 按 agentType/source/background/model/tool/skill/mcpServer 过滤 | ✅ **增强** |
| **后台任务** | 7 种 Task (agent/shell/remote/workflow/dream/monitor/teammate) | 全部保留 + `KernelTaskExecutionMetadata` (linked agent/bg task/completion tracking) | ✅ **增强** |
| **Task 协调** | 6 个 Task 工具，`coordinatorMode.ts` 391 行 | 全部保留 + `KernelRuntimeTasks` 门面 + 6 维 filter + task execution metadata | ✅ **增强** |
| **任务规划** | EnterPlan/ExitPlan/VerifyPlan | 全部保留，类型经 kernel 层完整定义 | ✅ 持平 |
| **Companion** | `companion.ts` 136 行，8 文件 | `companion.ts` 282 行 (+146)，12 文件 (+4: enabled/soul/structuredResponse/tests) | ✅ **大幅增强** |
| **Kairos** | `proactive/index.ts` 91 行, gate 24 行 | `kairos.ts` 217 行 (+126), gate 57 行 (+33, 3 层门控) | ✅ **大幅增强** |
| **Team/Swarm** | 46 文件, `TeamDeleteTool` 223 行, 内联终止逻辑 | 54 文件 (+8), `TeamDeleteTool` 306 行 (+83), 新增 `teammateLifecycle.ts` + `teamDeleteDeps.ts`, +5 测试文件 | ✅ **增强** |
| **Kernel 层** | **不存在** | Wire Protocol (50 命令)，Event (44 事件)，8 能力族 | ✅ **全新** |
| **Runtime 层** | **不存在** | Contracts / Core (wire/state/events/conversation/turn) / Capabilities | ✅ **全新** |
| **Host 层** | 隐式嵌入 `main.tsx` | CLI / Daemon / Remote-Control / Server / Terminal 5 宿主 | ✅ **全新** |

**结论: 无任何功能被删减。所有核心系统均得到保留和增强。**

## 项目定位

当前代码基线分为三层：

```
Layer 1: src/kernel     ← 推荐源码级公共接入面，面向外部 embedding/host/service
Layer 2: src/runtime    ← 内部能力层，含 execution/server/bridge/daemon/tools/mcp
Layer 3: CLI / REPL     ← 官方交互宿主，负责终端交互
```

当前 kernel 接入点：

- [src/kernel/index.ts](src/kernel/index.ts) — 397 行公共导出，250+ 类型，50+ 工厂函数
- [src/kernel/headless.ts](src/kernel/headless.ts) — Headless/SDK 模式
- [src/kernel/headlessMcp.ts](src/kernel/headlessMcp.ts) — Headless MCP 连接
- [src/kernel/headlessStartup.ts](src/kernel/headlessStartup.ts) — Headless 启动准备
- [src/kernel/bridge.ts](src/kernel/bridge.ts) — Bridge 模式
- [src/kernel/daemon.ts](src/kernel/daemon.ts) — Daemon Worker

包级 kernel 子路径导出：

```ts
import {
  createKernelRuntime,           // 完整运行时工厂
  createKernelCompanionRuntime,  // Companion/Pet 运行时
  createKernelKairosRuntime,     // Kairos 自主运行时
  createKernelPermissionBroker,  // 权限代理
  createKernelRuntimeWireClient, // Wire 协议客户端
  startKernelServer,             // 服务器启动
  runKernelHeadless,             // Headless 执行
  // ... 250+ 类型 + 50+ 函数
} from '@go-hare/hare-code/kernel'
```

## 当前能力

- 交互式 CLI / REPL
- Headless kernel session
- Direct-connect / Server
- ACP agent 模式
- Bridge / Daemon façade
- MCP、Channels、Plugins
- OpenAI-compatible provider 接入
- Buddy / KAIROS / Coordinator / Task / Subagent / Team 主链
- Computer-use / Chrome bridge / Remote-control 相关能力

## 安装

### npm 安装

```bash
npm install -g @go-hare/hare-code
hare
```

### 源码安装

```bash
git clone https://github.com/go-hare/hare-code.git
cd hare-code
bun install
bun run build
npm install -g .
hare
```

### 环境要求

- [Bun](https://bun.sh/) >= 1.3.11
- 你自己的 provider 配置

环境变量参考：[docs/reference/environment-variables.md](docs/reference/environment-variables.md)

## 开发

```bash
bun install          # 安装依赖
bun run dev          # 开发模式（全 feature 启用）
bun run build        # 构建（code splitting → dist/）
bun test             # 运行测试（3,281+ tests, 0 fail）
bun run typecheck    # TypeScript strict 类型检查
bun run lint         # Biome lint
bun run format       # Biome format
bun run test:all     # typecheck + lint + test
```

常用构建产物：

- `dist/cli-node.js` — Node.js 兼容产物
- `dist/cli-bun.js` — Bun 优化产物

## Kernel 使用

最小示例见：

- [examples/README.md](examples/README.md)
- [examples/kernel-headless-embed.ts](examples/kernel-headless-embed.ts)
- [examples/kernel-direct-connect.ts](examples/kernel-direct-connect.ts)

### Headless 嵌入

```ts
import {
  createDefaultKernelHeadlessEnvironment,
  createKernelHeadlessSession,
  runKernelHeadless,
} from '@go-hare/hare-code/kernel'

const env = createDefaultKernelHeadlessEnvironment({ ... })
const session = createKernelHeadlessSession(env)

await session.run('帮我审查 src/auth 模块的安全性', {
  maxTurns: 10,
  allowedTools: ['Read', 'Grep', 'Bash'],
})
```

### Wire Protocol 客户端

```ts
import {
  createKernelRuntimeWireClient,
  createKernelRuntimeInProcessWireTransport,
  createDefaultKernelRuntimeWireRouter,
} from '@go-hare/hare-code/kernel'

const router = createDefaultKernelRuntimeWireRouter({ ... })
const transport = createKernelRuntimeInProcessWireTransport({ router })
const client = createKernelRuntimeWireClient(transport)

// 创建会话
await client.createConversation({ conversationId: 'c1', workspacePath: '/project' })

// 执行 Turn
const result = await client.runTurn({ conversationId: 'c1', turnId: 't1', prompt: 'hello' })

// 管理 Agent
const spawn = await client.spawnAgent({ agentType: 'explore', prompt: '查找所有 API 端点' })
const output = await client.getAgentOutput({ runId: spawn.payload.runId })
```

适合外部接入的方向：

- Headless embedding（SDK 嵌入）
- Direct-connect client（远程连接）
- Server host（服务器宿主）
- Bridge / Daemon host（桥接/守护宿主）

不建议把外部接入直接建立在 `REPL.tsx` 上。

## 项目结构

```
src/
├── entrypoints/          # 入口点
│   ├── cli.tsx           # CLI 入口
│   └── kernel-runtime.ts # Kernel Runtime 入口
├── kernel/               # ★ Kernel 统一接入面 (43 文件)
│   ├── index.ts          # 公共导出 (397 行, 250+ 类型)
│   ├── wireProtocol.ts   # Wire Protocol 实现 (50 命令)
│   ├── runtime.ts        # Runtime 门面
│   ├── runtimeAgents.ts  # Agent 门面
│   ├── runtimeTasks.ts   # Task 门面
│   ├── kairos.ts         # Kairos 自主运行时
│   ├── companion.ts      # Companion/Pet 运行时
│   ├── events.ts         # 事件门面
│   ├── permissions.ts    # 权限代理
│   ├── memory.ts         # 记忆管理
│   ├── context.ts        # 上下文管理
│   ├── sessions.ts       # 会话管理
│   ├── headless.ts       # Headless 模式
│   └── serverHost.ts     # 服务器宿主
├── runtime/              # ★ Runtime 能力层 (70+ 文件)
│   ├── contracts/        # 运行时契约 (agent, task, turn, events, permissions...)
│   ├── core/             # 核心实现
│   │   ├── wire/         # Wire 传输 (Codec, Router, Transport)
│   │   ├── state/        # 状态管理
│   │   ├── events/       # 事件系统
│   │   ├── conversation/ # 会话生命周期
│   │   └── turn/         # Turn 管理
│   └── capabilities/     # 8 大能力族
├── hosts/                # 宿主抽象 (5 宿主)
│   ├── cli/              # CLI 宿主
│   ├── daemon/           # Daemon 宿主
│   ├── remote-control/   # Remote Control 宿主
│   ├── server/           # Server 宿主
│   └── terminal/         # Terminal 宿主
├── main.tsx              # 启动装配与模式分发
├── screens/REPL.tsx      # 官方终端交互宿主
├── query.ts              # Turn loop 与 query orchestration
├── buddy/                # Companion 核心实现 (12 文件)
├── proactive/            # Proactive 模式状态机
├── coordinator/          # Coordinator 模式
└── commands/             # 命令实现 (/agents, /tasks, /kairos...)
```

## 开发原则

- CLI 主链优先稳定，不进行高风险重构
- REPL 只做外围收口，执行中枢保持稳定
- 新宿主优先通过 `src/kernel` 接入
- 共享行为变更优先补测试
- TypeScript strict 模式，`tsc --noEmit` 零错误
- 遵循 Conventional Commits 规范

## 测试

```bash
bun test                     # 全量测试 (3,281+ tests, 0 fail)
bun test src/kernel/__tests__/ # 内核测试 (85 tests)
bun test --coverage          # 覆盖率报告
```

测试覆盖的核心模块：

| 模块 | 测试文件 | 状态 |
|------|---------|------|
| Kernel Agent Registry | `runtime.test.ts` (12 tests) | ✅ |
| Kernel Task Registry | `runtime.test.ts` | ✅ |
| Companion Runtime | `publicCapabilities.test.ts` | ✅ |
| Kairos Runtime | `publicCapabilities.test.ts` | ✅ |
| Event Facade | `publicCapabilities.test.ts` | ✅ |
| Wire Protocol | `runtime.test.ts` | ✅ |
| Headless Startup | `headlessStartup.test.ts` | ✅ |
| Import Discipline | `importDiscipline.test.ts` | ✅ |
| E2E 集成测试 | `tests/kernel-e2e-test.ts` (21 tests) | ✅ |

## 相关文档

- [docs/internals/kernelization-status.md](docs/internals/kernelization-status.md) — 内核化现状与收口计划
- [docs/internals/current-architecture.md](docs/internals/current-architecture.md) — 当前架构详解
- [docs/headless-embed-kernel-interfaces.md](docs/headless-embed-kernel-interfaces.md) — Headless 嵌入接口
- [docs/reference/environment-variables.md](docs/reference/environment-variables.md) — 环境变量参考
- [docs/testing-spec.md](docs/testing-spec.md) — 测试规范

## 许可证

本项目仅供学习、研究与工程实验用途。
