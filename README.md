# Hare Code

[![GitHub Stars](https://img.shields.io/github/stars/go-hare/hare-code?style=flat-square&logo=github&color=yellow)](https://github.com/go-hare/hare-code/stargazers)
[![GitHub Contributors](https://img.shields.io/github/contributors/go-hare/hare-code?style=flat-square&color=green)](https://github.com/go-hare/hare-code/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/go-hare/hare-code?style=flat-square&color=orange)](https://github.com/go-hare/hare-code/issues)
[![GitHub License](https://img.shields.io/github/license/go-hare/hare-code?style=flat-square)](https://github.com/go-hare/hare-code/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/go-hare/hare-code?style=flat-square&color=blue)](https://github.com/go-hare/hare-code/commits/main)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?style=flat-square&logo=bun)](https://bun.sh/)

Hare Code 是一个面向终端交互、headless 嵌入、direct-connect、server、bridge 和 daemon 场景的 AI coding runtime。

当前项目的目标不是继续围绕 CLI 做大规模重构，而是：

- 保持 CLI 作为官方交互宿主
- 将可复用能力稳定暴露到 `src/kernel`
- 让外部宿主优先通过 kernel façade 接入
- 在不破坏主链的前提下持续收口运行时能力

当前内核化现状与后续收口计划见：

- [docs/internals/kernelization-status.md](docs/internals/kernelization-status.md)

## 项目定位

当前代码基线可以分成三层：

1. `src/kernel`
   - 当前推荐的源码级公共接入面
   - 面向外部 embedding / host / service 接入
2. `src/runtime`
   - 内部能力层
   - 包含 execution、server、bridge、daemon、tools、mcp 等能力
3. `CLI / REPL`
   - 官方交互宿主
   - 负责终端交互，而不是承担全部 runtime 抽象

当前以源码级入口形式暴露的 kernel 接入点包括：

- [src/kernel/index.ts](src/kernel/index.ts)
- [src/kernel/headless.ts](src/kernel/headless.ts)
- [src/kernel/headlessMcp.ts](src/kernel/headlessMcp.ts)
- [src/kernel/headlessStartup.ts](src/kernel/headlessStartup.ts)
- [src/kernel/bridge.ts](src/kernel/bridge.ts)
- [src/kernel/daemon.ts](src/kernel/daemon.ts)

这些入口已经足够作为宿主侧统一接入面使用，但当前仍主要是源码级边界，还不
是包级稳定导出。

当前已提供包级 kernel 子路径导出：

```ts
import {
  createDirectConnectSession,
  createDefaultKernelHeadlessEnvironment,
  runKernelHeadless,
} from '@go-hare/hare-code/kernel'
```

## 当前能力

- 交互式 CLI / REPL
- headless kernel session
- direct-connect / server
- ACP agent 模式
- bridge / daemon façade
- MCP、channels、plugins
- OpenAI-compatible provider 接入
- Buddy / KAIROS / Coordinator / task / subagent / team 主链
- computer-use / chrome bridge / remote-control 相关能力

## 安装

### npm 安装

```bash
npm install -g @go-hare/hare-code
hare
```

### 源码仓库安装

```bash
git clone https://github.com/go-hare/hare-code.git
cd hare-code
bun install
bun run build
npm install -g .
hare
```

当前发布按 npm 包分发，CLI 入口直接使用 `dist/cli-node.js`，不走额外的 release 二进制下载链。

## 源码启动

### 环境要求

- [Bun](https://bun.sh/) >= 1.3.11
- 你自己的 provider 配置

### 安装依赖

```bash
bun install
```

### 开发模式

```bash
bun run dev
```

### 构建

```bash
bun run build
```

常见构建产物：

- `dist/cli-node.js`
- `dist/cli-bun.js`

npm 打包检查：

```bash
npm pack --dry-run
```

## Kernel 使用

最小示例见：

- [examples/README.md](examples/README.md)
- [examples/kernel-headless-embed.ts](examples/kernel-headless-embed.ts)
- [examples/kernel-direct-connect.ts](examples/kernel-direct-connect.ts)

说明：仓库内示例为了便于直接在源码树运行，仍然使用本地 `src` 导入；已安装包的
外部 consumer 应优先使用 `@go-hare/hare-code/kernel`。

适合外部接入的方向：

- headless embedding
- direct-connect client
- server host
- bridge / daemon host

不建议把外部接入直接建立在 `REPL.tsx` 上。

## 常用命令

```bash
hare
hare update
hare --acp
hare weixin login
```

## 配置目录

当前支持：

- 用户级配置目录：`CLAUDE_CONFIG_DIR`
- 项目级配置目录名：`CLAUDE_PROJECT_CONFIG_DIR_NAME`

例如：

```powershell
$env:CLAUDE_CONFIG_DIR = "$HOME\\.hare"
$env:CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare"
hare
```

## 项目结构

- [src/entrypoints/cli.tsx](src/entrypoints/cli.tsx)
  - CLI 入口
- [src/main.tsx](src/main.tsx)
  - 启动装配与模式分发
- [src/screens/REPL.tsx](src/screens/REPL.tsx)
  - 官方终端交互宿主
- [src/query.ts](src/query.ts)
  - turn loop 与 query orchestration
- [src/QueryEngine.ts](src/QueryEngine.ts)
  - 执行引擎兼容壳
- [src/runtime](src/runtime)
  - 内部 runtime capability 层
- [src/kernel](src/kernel)
  - 当前推荐的 kernel 统一接入面

## 开发原则

- CLI 主链优先稳定
- REPL 只做外围收口，不把执行中枢当成重构主战场
- 新宿主优先通过 `src/kernel` 接入
- 共享行为变更优先补测试
- 不为“结构更优雅”发起高风险重排

## 许可证

本项目仅供学习、研究与工程实验用途。
