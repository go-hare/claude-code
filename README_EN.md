# Claude Code

[![GitHub Stars](https://img.shields.io/github/stars/go-hare/claude-code?style=flat-square&logo=github&color=yellow)](https://github.com/go-hare/claude-code/stargazers)
[![GitHub Contributors](https://img.shields.io/github/contributors/go-hare/claude-code?style=flat-square&color=green)](https://github.com/go-hare/claude-code/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/go-hare/claude-code?style=flat-square&color=orange)](https://github.com/go-hare/claude-code/issues)
[![GitHub License](https://img.shields.io/github/license/go-hare/claude-code?style=flat-square)](https://github.com/go-hare/claude-code/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/go-hare/claude-code?style=flat-square&color=blue)](https://github.com/go-hare/claude-code/commits/main)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?style=flat-square&logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/lang-TypeScript-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-3281%20pass-brightgreen?style=flat-square)](https://github.com/go-hare/claude-code/actions)

Claude Code is a **kernelized AI coding runtime** for terminal interaction, headless embedding, direct-connect, server, bridge, and daemon scenarios. It is built from a reverse-engineered restoration of Claude Code, re-architected from a monolithic CLI into a **three-layer kernel architecture** — retaining all original functionality while providing standardized, embeddable runtime interfaces.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     HOST LAYER                           │
│  CLI / REPL   │   Server   │   Daemon   │   SDK/Embed   │
├─────────────────────────────────────────────────────────┤
│                   KERNEL LAYER (43 files)                │
│  ┌──────────┬──────────┬──────────┬──────────────────┐  │
│  │  Agent   │   Task   │  Kairos  │    Companion     │  │
│  │  Registry│  Registry│  Runtime │    Runtime       │  │
│  ├──────────┼──────────┼──────────┼──────────────────┤  │
│  │ Wire Protocol (50 commands) │ Event System (44 events)│
│  │ Transport (in-process / stdio / ws / http)          │  │
│  ├──────────┴──────────┴──────────┴──────────────────┤  │
│  │ Permissions  │  Memory  │  Context  │  Sessions   │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                  RUNTIME LAYER (70+ files)               │
│  Capabilities (8 families) │ Contracts │ Core (wire/state)│
└─────────────────────────────────────────────────────────┘
```

Core objectives of the current codebase:

- **Stable CLI mainline** — Keep the CLI as the official interactive host without disrupting the main interaction path
- **Unified kernel surface** — Expose reusable capabilities through `src/kernel` for external host integration
- **Tighten runtime boundaries** — Continuously tighten capability boundaries without destabilizing the mainline

## Core Systems

### Agent System

Complete agent lifecycle management supporting three agent sources: built-in, custom, and plugin.

| Agent Type | Description |
|-----------|-------------|
| `general-purpose` | Default general-purpose agent with full tool set |
| `Explore` | Fast codebase exploration agent |
| `Plan` | Architecture design and implementation planning agent |
| `verification` | Independent verification agent |
| `claude-code-guide` | Claude Code usage guide agent |
| `statusline-setup` | Status line configuration agent |
| `worker` | Worker agent under Coordinator mode |

**Spawn parameters**: `agentType`, `prompt`, `description`, `model`, `runInBackground`, `taskId`, `name`, `teamName`, `mode`, `isolation` (worktree/remote), `cwd`, `ownedFiles`

**Run management**: `listAgents`, `spawnAgent`, `listAgentRuns`, `getAgentRun`, `getAgentOutput`, `cancelAgentRun`, `reloadAgents`

### Task Coordinator

Structured task dependency system with background agent execution tracking.

```
Task state flow:  pending  ──→  in_progress  ──→  completed
                      ╲                        ╱
                       └──→  blocked (dependencies unmet)
```

**Core capabilities**:
- **Dependency management**: `blocks` / `blockedBy` — task dependency DAG
- **Owner assignment**: Assign tasks to specific Agents/Workers
- **Execution tracking**: `linkedBackgroundTaskId`, `linkedAgentId` — connect background tasks and agents
- **File ownership**: `ownedFiles` — mark task-exclusive files to prevent conflicts
- **Multi-dimensional filters**: By `status`, `owner`, `blocked`, `linkedAgentId`, `linkedBackgroundTaskId`

### Kairos Autonomy System

Tick-driven event loop for external event processing in autonomous mode.

```
External event → enqueueEvent() → Event queue → tick() → drain → Autonomy commands
                                                      ↕
                                              suspend / resume
```

**State machine**:
- `enabled` — Compile-time feature flag (`KAIROS`) + GrowthBook remote kill switch
- `runtimeEnabled` — Environment variable `CLAUDE_CODE_ENABLE_KAIROS` override
- `proactive` — Proactive mode state (active / paused / contextBlocked / shouldTick)
- `suspended` — Manual pause (auto-suspends on API errors to prevent retry storms)

**Event types**: `event_enqueued`, `tick`, `suspended`, `resumed`

### Companion (Pet) System

A warm terminal companion — by default, a small cactus named Picowhisk.

```
Lifecycle:  hatch  →  (mute/unmute)  →  (pet)  →  (reactToTurn)  →  clear/rehatch
```

**Action types**: `hatch`, `rehatch`, `mute`, `unmute`, `pet`, `clear`

**Runtime interface**:
- `getState()` — Get current state (seed, muted, companion attributes)
- `dispatch(action)` — Execute action and emit events
- `reactToTurn(messages)` — Generate companion reactions from conversation content
- `onEvent(handler)` — Subscribe to companion event stream

**Feature flag**: `BUDDY` compile-time switch + `CLAUDE_CODE_ENABLE_BUDDY` environment variable

### Team / Swarm System

Multi-agent collaborative workgroups (Swarm) with full Team lifecycle management, inter-teammate messaging, and dual backend support (in-process + independent process).

```
Team lifecycle:  spawnTeam  →  (teammates join/work)  →  cleanup
                      │                        │
                      └── TeamCreate tool      └── TeamDelete tool
                               │                        │
                      write team config       graceful shutdown → clean dirs
                      assign colors/tasks     terminate inactive → kill fallback
```

**Core components**:

| Component | File | Description |
|-----------|------|-------------|
| Team Create | `TeamCreateTool.ts` (240 lines) | Generate team config, register colors, create task list |
| Team Delete | `TeamDeleteTool.ts` (306 lines) | Graceful shutdown → terminate stale processes → clean directories |
| Dependency Injection | `teamDeleteDeps.ts` (14 lines) | **New** — barrel module for external dependencies, improves testability |
| Teammate Lifecycle | `teammateLifecycle.ts` (61 lines) | **New** — `requestShutdown` / `terminateTeammate` / `killInProcessTeammate` |
| Teammate Layout | `teammateLayoutManager.ts` | Color assignment, pane layout management |
| Inter-Teammate Messaging | `SendMessageTool` | Direct messages between teammates (supports UDS / Bridge / TCP) |
| Team Discovery | `teamDiscovery.ts` | Auto-discover active teams and members |
| In-Process Execution | `InProcessTeammateTask.tsx` | In-process teammate as a background task |
| Swarm Gate | `agentSwarmsEnabled.ts` | `AGENT_SWARMS` compile-time feature gate |

**Execution backends**: `in-process` (Ink rendering) | `tmux-pane` (independent tmux pane)

**Feature flag**: `AGENT_SWARMS` compile-time switch + GrowthBook remote control

### Wire Protocol

Kernel communication protocol — 50 command types + 44 event types.

**Transport layer**: `in-process` | `stdio` | `ipc` | `websocket` | `http` | `unix-socket`

```
┌──────────┐    command     ┌──────────────┐    envelope     ┌──────────┐
│  Client  │ ─────────────→ │    Router     │ ─────────────→ │  Catalog │
│          │ ←───────────── │               │ ←───────────── │          │
└──────────┘    response    └──────────────┘    event        └──────────┘
```

**Key commands**:

| Category | Commands |
|----------|----------|
| Session | `init_runtime`, `connect_host`, `create_conversation`, `dispose_conversation` |
| Execution | `run_turn`, `abort_turn`, `execute_command` |
| Agent | `list_agents`, `spawn_agent`, `list_agent_runs`, `get_agent_run`, `get_agent_output`, `cancel_agent_run` |
| Task | `list_tasks`, `get_task`, `create_task`, `update_task`, `assign_task` |
| Tools | `list_tools`, `call_tool` |
| MCP | `list_mcp_servers`, `connect_mcp`, `authenticate_mcp`, `reload_mcp` |
| Extensions | `list_skills`, `list_hooks`, `list_plugins`, `install_plugin` |

### Capability Families

8 families classify runtime capabilities:

| Family | Description |
|--------|-------------|
| `core` | Core runtime capabilities |
| `execution` | Command/tool execution |
| `model` | Model inference & API |
| `extension` | MCP/Skills/Hooks/Plugins |
| `security` | Authentication & permissions |
| `host` | Host integration (CLI/Server/Daemon) |
| `autonomy` | Autonomous mode (Kairos/Proactive) |
| `observability` | Telemetry & monitoring |

## Comparison with Original Claude Code

The kernelized version is built from decompiled original Claude Code, under the principle of **equal or stronger functionality**:

### Quantitative Comparison

| Metric | Original Claude Code | Kernelized Claude Code | Change |
|--------|---------------------|----------------------|--------|
| Source files | 2,741 | 3,137 | **+396 (+14.4%)** |
| Lines of code | 509,139 | 575,383 | **+66,244 (+13.0%)** |
| Tool count | 60 | 61 | Same |
| Test count | 3,175 | 3,281+ | **+106** |
| Test pass rate | — | 100% (0 fail) | — |
| Kernel layer | None | 43 files | New |
| Runtime layer | None | 70+ files | New |
| Host abstraction | Implicit | 5 hosts | New |

### System-by-System Comparison

| System | Original | Kernelized | Verdict |
|--------|----------|-----------|---------|
| **Agent** | `AgentTool` 1,836 lines, 6 built-in agents | `AgentTool` 1,970 lines (+134), added resume/fork, full `KernelAgentRegistry` facade | ✅ **Enhanced** |
| **Sub-Agent** | `LocalAgentTask`, `RemoteAgentTask`, `InProcessTeammateTask` | All retained + `KernelAgentRunDescriptor` runtime management + filtering by agentType/source/background/model/tool/skill/mcpServer | ✅ **Enhanced** |
| **Background Tasks** | 7 task types (agent/shell/remote/workflow/dream/monitor/teammate) | All retained + `KernelTaskExecutionMetadata` (linked agent/bg task/completion tracking) | ✅ **Enhanced** |
| **Task Coordinator** | 6 task tools, `coordinatorMode.ts` 391 lines | All retained + `KernelRuntimeTasks` facade + 6-dimension filter + execution metadata | ✅ **Enhanced** |
| **Planning** | EnterPlan/ExitPlan/VerifyPlan | All retained, types fully defined through kernel layer | ✅ **Same** |
| **Companion** | `companion.ts` 136 lines, 8 files | `companion.ts` 282 lines (+146), 12 files (+4: enabled/soul/structuredResponse/tests) | ✅ **Significantly Enhanced** |
| **Kairos** | `proactive/index.ts` 91 lines, gate 24 lines | `kairos.ts` 217 lines (+126), gate 57 lines (+33, 3-tier gating) | ✅ **Significantly Enhanced** |
| **Team/Swarm** | 46 files, `TeamDeleteTool` 223 lines, inline termination | 54 files (+8), `TeamDeleteTool` 306 lines (+83), added `teammateLifecycle.ts` + `teamDeleteDeps.ts`, +5 test files | ✅ **Enhanced** |
| **Kernel Layer** | **None** | Wire Protocol (50 commands), Event (44 events), 8 capability families | ✅ **New** |
| **Runtime Layer** | **None** | Contracts / Core (wire/state/events/conversation/turn) / Capabilities | ✅ **New** |
| **Host Layer** | Implicitly embedded in `main.tsx` | CLI / Daemon / Remote-Control / Server / Terminal (5 hosts) | ✅ **New** |

**Conclusion: No functionality was removed. All core systems were retained and enhanced.**

## Project Architecture

The current codebase can be understood as three layers:

```
Layer 1: src/kernel     ← Recommended source-level public integration surface
Layer 2: src/runtime    ← Internal capability layer (execution/server/bridge/daemon/tools/mcp)
Layer 3: CLI / REPL     ← Official interactive host
```

Current kernel entry points:

- [src/kernel/index.ts](src/kernel/index.ts) — 397-line public export, 250+ types, 50+ factory functions
- [src/kernel/headless.ts](src/kernel/headless.ts) — Headless/SDK mode
- [src/kernel/headlessMcp.ts](src/kernel/headlessMcp.ts) — Headless MCP connection
- [src/kernel/headlessStartup.ts](src/kernel/headlessStartup.ts) — Headless startup preparation
- [src/kernel/bridge.ts](src/kernel/bridge.ts) — Bridge mode
- [src/kernel/daemon.ts](src/kernel/daemon.ts) — Daemon worker

Package-level kernel subpath export:

```ts
import {
  createKernelRuntime,           // Full runtime factory
  createKernelCompanionRuntime,  // Companion/Pet runtime
  createKernelKairosRuntime,     // Kairos autonomy runtime
  createKernelPermissionBroker,  // Permission broker
  createKernelRuntimeWireClient, // Wire protocol client
  startKernelServer,             // Server startup
  runKernelHeadless,             // Headless execution
  // ... 250+ types + 50+ functions
} from 'claude-code/kernel'
```

## Current Capabilities

- Interactive CLI / REPL
- Headless kernel sessions
- Direct-connect / Server
- ACP agent mode
- Bridge / Daemon facades
- MCP, Channels, and Plugins
- OpenAI-compatible provider integration
- Buddy / KAIROS / Coordinator / Task / Subagent / Team mainline flows
- Computer-use / Chrome bridge / Remote-control related capabilities

## Installation

### npm

```bash
npm install -g claude-code
claude
```

### Install from Source

```bash
git clone https://github.com/go-hare/claude-code.git
cd claude-code
bun install
bun run build
npm pack
npm install -g .\claude-code-<version>.tgz
claude
```

Notes:

- On Windows, repeating `npm install -g .` against the current source directory can hit an internal npm/Arborist error. Installing the generated `.tgz` from `npm pack` is more reliable.
- If you only want to run the current checkout during development, prefer `bun run dev` or `node dist/cli-node.js` instead of a global install.

### Requirements

- [Bun](https://bun.sh/) >= 1.3.11
- Your own provider configuration

Environment variable reference: [docs/reference/environment-variables.md](docs/reference/environment-variables.md)

## Development

```bash
bun install          # Install dependencies
bun run dev          # Dev mode (all features enabled)
bun run build        # Build (code splitting → dist/)
bun test             # Run tests (3,281+ tests, 0 fail)
bun run typecheck    # TypeScript strict type check
bun run lint         # Biome lint
bun run format       # Biome format
bun run test:all     # typecheck + lint + test
```

Common build outputs:

- `dist/cli-node.js` — Node.js compatible
- `dist/cli-bun.js` — Bun optimized

## Using the Kernel

Minimal examples:

- [examples/README.md](examples/README.md)
- [examples/kernel-headless-embed.ts](examples/kernel-headless-embed.ts)
- [examples/kernel-direct-connect.ts](examples/kernel-direct-connect.ts)

### Headless Embedding

```ts
import {
  createDefaultKernelHeadlessEnvironment,
  createKernelHeadlessSession,
} from 'claude-code/kernel'

const env = createDefaultKernelHeadlessEnvironment({ ... })
const session = createKernelHeadlessSession(env)

await session.run('Review the security of src/auth module', {
  maxTurns: 10,
  allowedTools: ['Read', 'Grep', 'Bash'],
})
```

### Wire Protocol Client

```ts
import {
  createKernelRuntimeWireClient,
  createKernelRuntimeInProcessWireTransport,
  createDefaultKernelRuntimeWireRouter,
} from 'claude-code/kernel'

const router = createDefaultKernelRuntimeWireRouter({ ... })
const transport = createKernelRuntimeInProcessWireTransport({ router })
const client = createKernelRuntimeWireClient(transport)

// Create a conversation
await client.createConversation({ conversationId: 'c1', workspacePath: '/project' })

// Execute a turn
const result = await client.runTurn({ conversationId: 'c1', turnId: 't1', prompt: 'hello' })

// Manage agents
const spawn = await client.spawnAgent({ agentType: 'explore', prompt: 'Find all API endpoints' })
const output = await client.getAgentOutput({ runId: spawn.payload.runId })
```

Recommended external integration directions:

- Headless embedding (SDK integration)
- Direct-connect client (remote connection)
- Server host (server-side hosting)
- Bridge / Daemon host (bridge/daemon hosting)

Do not build external integrations directly on top of `REPL.tsx`.

## Project Structure

```
src/
├── entrypoints/          # Entry points
│   ├── cli.tsx           # CLI entry
│   └── kernel-runtime.ts # Kernel Runtime entry
├── kernel/               # ★ Kernel unified integration surface (43 files)
│   ├── index.ts          # Public exports (397 lines, 250+ types)
│   ├── wireProtocol.ts   # Wire Protocol implementation (50 commands)
│   ├── runtime.ts        # Runtime facade
│   ├── runtimeAgents.ts  # Agent facade
│   ├── runtimeTasks.ts   # Task facade
│   ├── kairos.ts         # Kairos autonomy runtime
│   ├── companion.ts      # Companion/Pet runtime
│   ├── events.ts         # Event facade
│   ├── permissions.ts    # Permission broker
│   ├── memory.ts         # Memory manager
│   ├── context.ts        # Context manager
│   ├── sessions.ts       # Session manager
│   ├── headless.ts       # Headless mode
│   └── serverHost.ts     # Server host
├── runtime/              # ★ Runtime capability layer (70+ files)
│   ├── contracts/        # Runtime contracts (agent, task, turn, events, permissions...)
│   ├── core/             # Core implementation
│   │   ├── wire/         # Wire transport (Codec, Router, Transport)
│   │   ├── state/        # State management
│   │   ├── events/       # Event system
│   │   ├── conversation/ # Conversation lifecycle
│   │   └── turn/         # Turn management
│   └── capabilities/     # 8 capability families
├── hosts/                # Host abstraction (5 hosts)
│   ├── cli/              # CLI host
│   ├── daemon/           # Daemon host
│   ├── remote-control/   # Remote Control host
│   ├── server/           # Server host
│   └── terminal/         # Terminal host
├── main.tsx              # Startup assembly and mode dispatch
├── screens/REPL.tsx      # Official terminal interaction host
├── query.ts              # Turn loop and query orchestration
├── buddy/                # Companion core implementation (12 files)
├── proactive/            # Proactive mode state machine
├── coordinator/          # Coordinator mode
└── commands/             # Command implementations (/agents, /tasks, /kairos...)
```

## Development Principles

- Keep the CLI mainline stable — avoid high-risk restructuring
- Limit REPL changes to peripheral tightening, not execution-core rewrites
- Integrate new hosts through `src/kernel` first
- Add tests for shared behavior changes
- TypeScript strict mode — `tsc --noEmit` must pass with zero errors
- Follow Conventional Commits specification

## Testing

```bash
bun test                     # Full test suite (3,281+ tests, 0 fail)
bun test src/kernel/__tests__/ # Kernel tests (85 tests)
bun test --coverage          # Coverage report
```

Test coverage by core module:

| Module | Test Files | Status |
|--------|-----------|--------|
| Kernel Agent Registry | `runtime.test.ts` (12 tests) | ✅ |
| Kernel Task Registry | `runtime.test.ts` | ✅ |
| Companion Runtime | `publicCapabilities.test.ts` | ✅ |
| Kairos Runtime | `publicCapabilities.test.ts` | ✅ |
| Event Facade | `publicCapabilities.test.ts` | ✅ |
| Wire Protocol | `runtime.test.ts` | ✅ |
| Headless Startup | `headlessStartup.test.ts` | ✅ |
| Import Discipline | `importDiscipline.test.ts` | ✅ |
| E2E Integration | `tests/kernel-e2e-test.ts` (21 tests) | ✅ |

## Documentation

- [docs/internals/kernelization-status.md](docs/internals/kernelization-status.md) — Kernelization status & roadmap
- [docs/internals/current-architecture.md](docs/internals/current-architecture.md) — Current architecture deep dive
- [docs/headless-embed-kernel-interfaces.md](docs/headless-embed-kernel-interfaces.md) — Headless embedding interfaces
- [docs/reference/environment-variables.md](docs/reference/environment-variables.md) — Environment variable reference
- [docs/testing-spec.md](docs/testing-spec.md) — Testing specification

## License

This project is intended for learning, research, and engineering experiments.
