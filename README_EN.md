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
   - the recommended source-level public integration surface today
   - intended for external embedding, host, and service integration
2. `src/runtime`
   - internal capability layer
   - contains execution, server, bridge, daemon, tools, mcp, and related capabilities
3. `CLI / REPL`
   - official interactive host
   - responsible for terminal interaction, not for owning every runtime abstraction

The kernel entry points exposed today at source level are:

- [src/kernel/index.ts](src/kernel/index.ts)
- [src/kernel/headless.ts](src/kernel/headless.ts)
- [src/kernel/headlessMcp.ts](src/kernel/headlessMcp.ts)
- [src/kernel/headlessStartup.ts](src/kernel/headlessStartup.ts)
- [src/kernel/bridge.ts](src/kernel/bridge.ts)
- [src/kernel/daemon.ts](src/kernel/daemon.ts)

These entry points are sufficient as the unified host-side integration surface
today, but they are still primarily source-level boundaries rather than formal
package-level stable exports.

The package now exposes a kernel subpath export:

```ts
import {
  createDirectConnectSession,
  createDefaultKernelHeadlessEnvironment,
  runKernelHeadless,
} from '@go-hare/hare-code/kernel'
```

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

### Install from source

```bash
git clone https://github.com/go-hare/hare-code.git
cd hare-code
bun install
bun run build
npm install -g .
hare
```

Releases are packaged as standard npm tarballs. The CLI entry points to `dist/cli-node.js`, without an extra release-binary download layer.

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

npm package check:

```bash
npm pack --dry-run
```

## Using the Kernel

Minimal examples:

- [examples/README.md](examples/README.md)
- [examples/kernel-headless-embed.ts](examples/kernel-headless-embed.ts)
- [examples/kernel-direct-connect.ts](examples/kernel-direct-connect.ts)

Note: the in-repo examples keep using local `src` imports so they can run
directly from the source tree. External installed consumers should prefer
`@go-hare/hare-code/kernel`.

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

- [src/entrypoints/cli.tsx](src/entrypoints/cli.tsx)
  - CLI entry
- [src/main.tsx](src/main.tsx)
  - startup assembly and mode dispatch
- [src/screens/REPL.tsx](src/screens/REPL.tsx)
  - official terminal interaction host
- [src/query.ts](src/query.ts)
  - turn loop and query orchestration
- [src/QueryEngine.ts](src/QueryEngine.ts)
  - execution engine compatibility shell
- [src/runtime](src/runtime)
  - internal runtime capability layer
- [src/kernel](src/kernel)
  - the current unified kernel-facing integration surface

## Development Principles

- keep the CLI mainline stable
- limit REPL refactors to peripheral tightening, not execution-core restructuring
- integrate new hosts through `src/kernel` first
- add tests first for shared behavior changes
- do not start high-risk reordering work just to make the structure look cleaner

## License

This project is intended for learning, research, and engineering experiments.
