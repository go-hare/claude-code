# Hare Code

[![GitHub Stars](https://img.shields.io/github/stars/go-hare/hare-code?style=flat-square&logo=github&color=yellow)](https://github.com/go-hare/hare-code/stargazers)
[![GitHub Contributors](https://img.shields.io/github/contributors/go-hare/hare-code?style=flat-square&color=green)](https://github.com/go-hare/hare-code/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/go-hare/hare-code?style=flat-square&color=orange)](https://github.com/go-hare/hare-code/issues)
[![GitHub License](https://img.shields.io/github/license/go-hare/hare-code?style=flat-square)](https://github.com/go-hare/hare-code/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/go-hare/hare-code?style=flat-square&color=blue)](https://github.com/go-hare/hare-code/commits/main)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?style=flat-square&logo=bun)](https://bun.sh/)

Hare Code is an AI coding runtime for terminal interaction, headless embedding, direct-connect, server, bridge, and daemon scenarios.

The goal of the current codebase is not to keep restructuring around the CLI. The goal is to:

- keep the CLI as the official interactive host
- expose reusable capabilities through `src/kernel`
- let external hosts integrate through kernel facades first
- continue tightening runtime boundaries without breaking the main interaction path

## Project Position

The current codebase can be understood as three layers:

1. `src/kernel`
   - stable public surface
   - intended for external embedding, host, and service integration
2. `src/runtime`
   - internal capability layer
   - contains execution, server, bridge, daemon, tools, mcp, and related capabilities
3. `CLI / REPL`
   - official interactive host
   - responsible for terminal interaction, not for owning every runtime abstraction

The stable kernel entry points exposed today are:

- [src/kernel/index.ts](/D:/work/py/reachy_code/claude-code/src/kernel/index.ts)
- [src/kernel/headless.ts](/D:/work/py/reachy_code/claude-code/src/kernel/headless.ts)
- [src/kernel/headlessMcp.ts](/D:/work/py/reachy_code/claude-code/src/kernel/headlessMcp.ts)
- [src/kernel/headlessStartup.ts](/D:/work/py/reachy_code/claude-code/src/kernel/headlessStartup.ts)
- [src/kernel/bridge.ts](/D:/work/py/reachy_code/claude-code/src/kernel/bridge.ts)
- [src/kernel/daemon.ts](/D:/work/py/reachy_code/claude-code/src/kernel/daemon.ts)

## Current Capabilities

- interactive CLI / REPL
- headless kernel sessions
- direct-connect / server
- ACP agent mode
- bridge / daemon facades
- MCP, channels, and plugins
- OpenAI-compatible provider integration
- Buddy / KAIROS / Coordinator / task / subagent / team mainline flows
- computer-use / chrome bridge / remote-control related capabilities

## Installation

### npm

```bash
npm install -g @go-hare/hare-code
hare
```

### GitHub tag install

When the matching version has published GitHub Release binary assets, you can install directly from a git tag:

```bash
npm install -g git+https://github.com/go-hare/hare-code.git#v1.7.1
hare
```

During installation, the package downloads the platform-specific `hare` binary from the release assets.

## Running from Source

### Requirements

- [Bun](https://bun.sh/) >= 1.3.11
- your own provider configuration

### Install dependencies

```bash
bun install
```

### Development mode

```bash
bun run dev
```

### Build

```bash
bun run build
```

Common build outputs:

- `dist/cli-node.js`
- `dist/cli-bun.js`

Binary release build:

```bash
bun run build:release
```

## Using the Kernel

Minimal examples:

- [examples/README.md](/D:/work/py/reachy_code/claude-code/examples/README.md)
- [examples/kernel-headless-embed.ts](/D:/work/py/reachy_code/claude-code/examples/kernel-headless-embed.ts)
- [examples/kernel-direct-connect.ts](/D:/work/py/reachy_code/claude-code/examples/kernel-direct-connect.ts)

Recommended external integration directions:

- headless embedding
- direct-connect clients
- server hosts
- bridge / daemon hosts

Do not build external integrations directly on top of `REPL.tsx`.

## Common Commands

```bash
hare
hare update
hare --acp
hare weixin login
```

## Configuration Directories

The project currently supports:

- user-level config directory: `CLAUDE_CONFIG_DIR`
- project-level config directory name: `CLAUDE_PROJECT_CONFIG_DIR_NAME`

For example:

```powershell
$env:CLAUDE_CONFIG_DIR = "$HOME\\.hare"
$env:CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare"
hare
```

## Project Structure

- [src/entrypoints/cli.tsx](/D:/work/py/reachy_code/claude-code/src/entrypoints/cli.tsx)
  - CLI entry
- [src/main.tsx](/D:/work/py/reachy_code/claude-code/src/main.tsx)
  - startup assembly and mode dispatch
- [src/screens/REPL.tsx](/D:/work/py/reachy_code/claude-code/src/screens/REPL.tsx)
  - official terminal interaction host
- [src/query.ts](/D:/work/py/reachy_code/claude-code/src/query.ts)
  - turn loop and query orchestration
- [src/QueryEngine.ts](/D:/work/py/reachy_code/claude-code/src/QueryEngine.ts)
  - execution engine compatibility shell
- [src/runtime](/D:/work/py/reachy_code/claude-code/src/runtime)
  - internal runtime capability layer
- [src/kernel](/D:/work/py/reachy_code/claude-code/src/kernel)
  - stable kernel facades

## Development Principles

- keep the CLI mainline stable
- limit REPL refactors to peripheral tightening, not execution-core restructuring
- integrate new hosts through `src/kernel` first
- add tests first for shared behavior changes
- do not start high-risk reordering work just to make the structure look cleaner

## License

This project is intended for learning, research, and engineering experiments.
