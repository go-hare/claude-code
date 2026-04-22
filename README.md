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

## 项目定位

当前代码基线可以分成三层：

1. `src/kernel`
   - 稳定公开面
   - 面向外部 embedding / host / service 接入
2. `src/runtime`
   - 内部能力层
   - 包含 execution、server、bridge、daemon、tools、mcp 等能力
3. `CLI / REPL`
   - 官方交互宿主
   - 负责终端交互，而不是承担全部 runtime 抽象

当前已经稳定公开的 kernel 入口包括：

- [src/kernel/index.ts](/D:/work/py/reachy_code/claude-code/src/kernel/index.ts)
- [src/kernel/headless.ts](/D:/work/py/reachy_code/claude-code/src/kernel/headless.ts)
- [src/kernel/headlessMcp.ts](/D:/work/py/reachy_code/claude-code/src/kernel/headlessMcp.ts)
- [src/kernel/headlessStartup.ts](/D:/work/py/reachy_code/claude-code/src/kernel/headlessStartup.ts)
- [src/kernel/bridge.ts](/D:/work/py/reachy_code/claude-code/src/kernel/bridge.ts)
- [src/kernel/daemon.ts](/D:/work/py/reachy_code/claude-code/src/kernel/daemon.ts)

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

### GitHub tag 安装

当对应版本已经发布 GitHub Release 二进制资产时，可以直接通过 git tag 安装：

```bash
npm install -g git+https://github.com/go-hare/hare-code.git#v1.7.1
hare
```

安装阶段会通过 release 资产下载当前平台对应的 `hare` 二进制。

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

二进制分发构建：

```bash
bun run build:release
```

## Kernel 使用

最小示例见：

- [examples/README.md](/D:/work/py/reachy_code/claude-code/examples/README.md)
- [examples/kernel-headless-embed.ts](/D:/work/py/reachy_code/claude-code/examples/kernel-headless-embed.ts)
- [examples/kernel-direct-connect.ts](/D:/work/py/reachy_code/claude-code/examples/kernel-direct-connect.ts)

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

- [src/entrypoints/cli.tsx](/D:/work/py/reachy_code/claude-code/src/entrypoints/cli.tsx)
  - CLI 入口
- [src/main.tsx](/D:/work/py/reachy_code/claude-code/src/main.tsx)
  - 启动装配与模式分发
- [src/screens/REPL.tsx](/D:/work/py/reachy_code/claude-code/src/screens/REPL.tsx)
  - 官方终端交互宿主
- [src/query.ts](/D:/work/py/reachy_code/claude-code/src/query.ts)
  - turn loop 与 query orchestration
- [src/QueryEngine.ts](/D:/work/py/reachy_code/claude-code/src/QueryEngine.ts)
  - 执行引擎兼容壳
- [src/runtime](/D:/work/py/reachy_code/claude-code/src/runtime)
  - 内部 runtime capability 层
- [src/kernel](/D:/work/py/reachy_code/claude-code/src/kernel)
  - 稳定 kernel façade

## 开发原则

- CLI 主链优先稳定
- REPL 只做外围收口，不把执行中枢当成重构主战场
- 新宿主优先通过 `src/kernel` 接入
- 共享行为变更优先补测试
- 不为“结构更优雅”发起高风险重排

## 许可证

本项目仅供学习、研究与工程实验用途。
