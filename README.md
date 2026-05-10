# Hare Code

[![GitHub Stars](https://img.shields.io/github/stars/go-hare/claude-code?style=flat-square&logo=github&color=yellow)](https://github.com/go-hare/claude-code/stargazers)
[![GitHub Contributors](https://img.shields.io/github/contributors/go-hare/claude-code?style=flat-square&color=green)](https://github.com/go-hare/claude-code/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/go-hare/claude-code?style=flat-square&color=orange)](https://github.com/go-hare/claude-code/issues)
[![GitHub License](https://img.shields.io/github/license/go-hare/claude-code?style=flat-square)](https://github.com/go-hare/claude-code/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/go-hare/claude-code?style=flat-square&color=blue)](https://github.com/go-hare/claude-code/commits/main)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?style=flat-square&logo=bun)](https://bun.sh/)

Hare Code 是一个面向终端交互、headless 嵌入、direct-connect、server、bridge 和 daemon 场景的 AI coding runtime。

## 最高优先级事实

当前 `core-clean` 分支是从 `main` 的 `3c7b8dc3` 切出后，重新建设
Agent Core 的分支。

- 当前主线是 Agent Core，不是旧 kernel。
- 旧 kernel / kernel façade 路线不再作为当前架构或执行依据。
- 后续同步 `main` 时，优先找 `3c7b8dc3` 之后非 kernel 的代码和功能，
  再判断是否迁回 Agent Core 主线。

当前项目的目标不是继续围绕 CLI 或旧 kernel façade 做大规模重构，而是：

- 保持 CLI 作为官方交互宿主
- 将可复用执行能力下沉到 `src/core` / `AgentSession`
- 让外部宿主通过 Agent Core 事件和 host adapter 接入
- 在不破坏主链的前提下持续收口运行时能力

当前 Agent Core 收口说明见：

- [docs/internals/agent-core-execution-plan.md](docs/internals/agent-core-execution-plan.md)
- [docs/internals/agent-core-event-contract.md](docs/internals/agent-core-event-contract.md)
- [docs/internals/kernelization-status.md](docs/internals/kernelization-status.md)（归档）

## 项目定位

当前代码基线可以分成四层：

1. `src/core`
   - 当前 Agent Core 主链
   - 提供 `AgentSession.stream()` 和 `AgentEvent` 合同
2. `src/runtime`
   - 内部能力层
   - 包含 execution、server、bridge、daemon、tools、mcp 等能力
3. `src/entrypoints`
   - CLI 与包级 core 入口
   - `src/entrypoints/core.ts` 暴露 Agent Core 包入口
4. `CLI / REPL`
   - 官方交互宿主
   - 负责终端交互，而不是承担全部 runtime 抽象

当前包级 core 入口：

```ts
import { createAgent } from 'claude-code/core'
```

仓库内部 bridge / server / daemon / headless 代码直接依赖 `src/runtime/*`
与 `src/server/*`，不再经过旧 kernel façade。

## 当前能力

- 交互式 CLI / REPL
- headless runtime session
- direct-connect / server
- ACP agent 模式
- bridge / daemon host
- MCP、channels、plugins
- OpenAI-compatible provider 接入
- Buddy / KAIROS / Coordinator / task / subagent / team 主链
- computer-use / chrome bridge / remote-control 相关能力

## 安装

### npm 安装

```bash
npm install -g claude-code
claude
```

### 源码仓库安装

```bash
git clone https://github.com/go-hare/claude-code.git
cd claude-code
bun install
bun run build
npm pack
npm install -g ./claude-code-<version>.tgz
claude
```

说明：

- 在 Windows 上，对当前源码目录重复执行 `npm install -g .` 可能触发 npm/Arborist 内部错误；先 `npm pack` 再安装生成的 `.tgz` 更稳。
- 如果只是想直接运行当前工作区代码，优先用 `bun run dev` 或 `node dist/cli-node.js`，不必全局安装。

### 环境要求

- [Bun](https://bun.sh/) >= 1.3.11
- 你自己的 provider 配置

环境变量参考：[docs/reference/environment-variables.md](docs/reference/environment-variables.md)

## 开发

```bash
bun install          # 安装依赖
bun run dev          # 开发模式
bun run build        # 构建（code splitting → dist/）
bun test             # 运行测试
bun run typecheck    # TypeScript strict 类型检查
bun run lint         # Biome lint
bun run format       # Biome format
bun run test:all     # typecheck + lint + test
```

常见构建产物：

- `dist/cli-node.js` - Node.js 兼容产物
- `dist/cli-bun.js` - Bun 优化产物

npm 打包检查：

```bash
npm pack --dry-run
```

## 使用 Agent Core

最小示例见：

- [examples/README.md](examples/README.md)
- [examples/kernel-headless-embed.ts](examples/kernel-headless-embed.ts)
- [examples/kernel-direct-connect.ts](examples/kernel-direct-connect.ts)

说明：仓库内示例为了便于直接在源码树运行，使用本地 `src` 模块导入。
已安装包的 Agent Core 入口是 `claude-code/core`。

适合外部接入的方向：

- headless embedding
- direct-connect client
- server host
- bridge / daemon host

不建议把外部接入直接建立在 `REPL.tsx` 上。

## 项目结构

- [src/entrypoints/cli.tsx](src/entrypoints/cli.tsx)
  - CLI 入口
- [src/main.tsx](src/main.tsx)
  - 启动装配与模式分发
- [src/screens/REPL.tsx](src/screens/REPL.tsx)
  - 官方终端交互宿主
- [src/query.ts](src/query.ts)
  - turn loop 与 query orchestration
- [src/core](src/core)
  - Agent Core session/event 主链
- [src/runtime/capabilities/execution/SessionRuntime.ts](src/runtime/capabilities/execution/SessionRuntime.ts)
  - 现有 query lifecycle 的 engine asset
- [src/runtime](src/runtime)
  - 内部 runtime capability 层
- [src/entrypoints/core.ts](src/entrypoints/core.ts)
  - 包级 Agent Core 入口

## 常用命令

```bash
claude
claude update
claude --acp
claude weixin login
```

## 配置目录

当前支持：

- 用户级配置目录：`CLAUDE_CONFIG_DIR`
- 项目级配置目录名：`CLAUDE_PROJECT_CONFIG_DIR_NAME`

例如：

```powershell
$env:CLAUDE_CONFIG_DIR = "$HOME\\.hare"
$env:CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare"
claude
```

## 开发原则

- CLI 主链优先稳定
- REPL 只做外围收口，不把执行中枢当成重构主战场
- 新宿主优先通过 `src/core` / `AgentSession` 接入
- 共享行为变更优先补测试
- 不为“结构更优雅”发起高风险重排

## 测试

```bash
bun test
bun run typecheck
bun run lint
bun run test:all
```

## 相关文档

- [docs/internals/agent-core-execution-plan.md](docs/internals/agent-core-execution-plan.md) - 收口基线与执行记录
- [docs/internals/agent-core-event-contract.md](docs/internals/agent-core-event-contract.md) - Agent Core 事件合同
- [docs/internals/kernelization-status.md](docs/internals/kernelization-status.md) - 旧 kernelization 归档
- [docs/reference/environment-variables.md](docs/reference/environment-variables.md) - 环境变量参考
- [docs/testing-spec.md](docs/testing-spec.md) - 测试规范

## 许可证

本项目仅供学习、研究与工程实验用途。
