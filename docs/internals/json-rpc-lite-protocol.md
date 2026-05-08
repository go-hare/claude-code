# JSON-RPC-lite over JSONL 协议草案

> 状态：Draft
>
> 目标：`Claude CLI Capability Protocol`
>
> 兼容策略：**不兼容旧 `kernel.runtime.command.v1`**
>
> 传输：`JSONL / NDJSON`，优先 `stdio`

## 1. 目标

这份协议的目标是把 CLI 的完整能力暴露给外部宿主，但不暴露 Ink UI 状态。

核心原则：

- 对外是标准消息形状，易于跨语言接入
- 对内保留完整能力图，不靠手写少量方法覆盖全部 CLI
- `Command Graph API` 是唯一真相，所有可外部调用能力都必须先成为 graph 节点
- `Typed Core API` 只是从 graph 派生出来的稳定 facade，不拥有第二套业务实现
- JSON-RPC-lite 只负责传输语义，业务语义全部落在 `params` / `result` / `error.data`

硬原则：

1. `turn.run(params)` 必须等价于
   `commands.execute({ commandId: "turn.run", arguments: params })`。其他 typed
   core 方法同理。
2. 协议顶层只允许出现 JSON-RPC-lite envelope 字段：`id`、`method`、`params`、
   `result`、`error`。`sessionId`、`turnId`、权限风险、事件类型等业务字段不得
   升级为协议顶层字段。

## 2. 消息模型

协议保留 JSON-RPC 的三种消息形状，但去掉 `jsonrpc: "2.0"`：

- request：有 `id`、`method`，可有 `params`
- response：有 `id`，有 `result` 或 `error`，二者互斥
- notification：无 `id`，有 `method`，可有 `params`

约束：

- `id` 可为 `string` 或 `number`，推荐 `string`
- `method` 必须是命名空间风格，如 `turn.run`
- `params` 和 `result` 必须是 JSON serializable
- notification 不得带 `id`
- 长任务先回 `started`，后续进度走 `event` notification
- request / response / notification 的区分只表达传输语义，不表达业务状态
- 业务错误的结构化信息必须进入 `error.data`

示例：

```json
{"id":"1","method":"turn.run","params":{"sessionId":"s1","prompt":"hi"}}
{"id":"1","result":{"turnId":"t1","status":"started"}}
{"method":"event","params":{"type":"turn.delta","sessionId":"s1","turnId":"t1","text":"..."}}
```

## 3. 初始化握手

### `runtime.initialize`

客户端启动后第一条请求。

```json
{"id":"1","method":"runtime.initialize","params":{"client":{"name":"my-client","version":"0.1.0"}}}
```

建议返回：

```json
{"id":"1","result":{"protocolVersion":"2026-05-08","runtimeId":"r1","capabilities":{"typedCore":true,"commandGraph":true}}}
```

建议初始化后，客户端再调用：

- `runtime.capabilities`
- `events.subscribe`
- `sessions.create` 或 `sessions.resume`

### `runtime.capabilities`

返回当前 runtime 支持的：

- typed core 方法
- command graph 节点
- 事件类型
- 权限请求类型
- 传输约束

## 4. Typed Core API

这部分是稳定 facade，覆盖最常用能力。

Typed Core API 不直接绑定业务实现。每一个 typed method 都必须能映射到一个
`Command Graph` 节点；如果某个能力还没有 graph 节点，就不能先作为 typed core
方法对外发布。

- Runtime: `runtime.ping`, `runtime.initialize`, `runtime.capabilities`
- Sessions: `sessions.list`, `sessions.create`, `sessions.resume`, `sessions.dispose`, `sessions.transcript`
- Turns: `turn.run`, `turn.abort`
- Events: `events.subscribe`, `events.unsubscribe`
- Tools: `tools.list`, `tools.describe`, `tools.call`
- Permissions: `permissions.decide`；`permissions.request` 是 server-to-client request，不是 client-to-server typed method
- MCP: `mcp.servers.list`, `mcp.tools.list`, `mcp.resources.list`, `mcp.connect`, `mcp.authenticate`, `mcp.setEnabled`
- Agents: `agents.list`, `agents.spawn`, `agents.runs.list`, `agents.runs.get`, `agents.runs.cancel`, `agents.output.get`
- Tasks / Teams / Context / Memory: `tasks.list`, `tasks.create`, `tasks.update`, `tasks.assign`, `teams.list`, `teams.create`, `teams.message`, `teams.destroy`, `context.read`, `context.gitStatus`, `memory.list`, `memory.read`, `memory.update`

Future typed candidates include `turn.input`, `config.get`, `config.set`,
`auth.status` and `auth.login`; they must not be treated as implemented until
they appear in `runtime.capabilities.methods` and have command graph coverage.

## 5. Command Graph API

这是协议里最重要的兜底层。

`Command Graph` 是 capability registry、schema registry、权限策略、流式事件、
别名、弃用信息与执行器绑定的唯一来源。外部客户端可以只依赖
`commands.list` / `commands.describe` / `commands.execute` 完成全量 CLI 能力接入。

### 方法

- `commands.list`
- `commands.describe`
- `commands.execute`

### 语义

- `commands.list`：列出所有可调用命令图节点
- `commands.describe`：返回单个命令的 schema、权限、别名、流式能力、弃用状态和示例
- `commands.execute`：执行指定 `Command Graph` 节点

`commands.execute` 只能执行 graph 节点，不能退化成任意字符串通道。也就是说，
客户端必须传 `commandId`，服务端必须先在 graph 中解析该节点，再按节点 schema
校验 `arguments`。禁止提供类似 `{ "command": "/raw text" }` 或
`{ "command": "shell string" }` 的 escape hatch。

### 推荐返回字段

`commands.describe` 必须至少返回：

- `commandId`
- `aliases`
- `summary`
- `inputSchema`
- `resultSchema`
- `permissionRisk`
- `streaming`
- `deprecated`
- `examples`
- `source`

推荐结构：

```json
{"id":"describe-1","result":{"commandId":"turn.run","aliases":["conversation.run"],"summary":"Run a conversation turn","inputSchema":{"type":"object"},"resultSchema":{"type":"object"},"permissionRisk":{"level":"medium","requiresApproval":false,"scopes":["session","workspace"]},"streaming":{"supported":true,"events":["turn.started","turn.delta","turn.completed","turn.failed"]},"deprecated":false,"examples":[{"params":{"sessionId":"s1","prompt":"hello"}}],"source":"typed-core"}}
```

### 例子

```json
{"id":"2","method":"commands.execute","params":{"commandId":"poor.toggle","arguments":{"enabled":true}}}
```

这类调用允许外部客户端先接入完整能力，再慢慢升级到 typed core 方法。

## 6. 事件模型

事件统一走 notification：

```json
{"method":"event","params":{"eventId":"evt_101","sequence":101,"sessionId":"s1","turnId":"t1","type":"turn.delta","payload":{"text":"..."}}}
```

事件 notification 必须带：

- `eventId`
- `sequence`
- `sessionId`
- `turnId`
- `type`
- `payload`

推荐同时带：`runtimeId`、`timestamp`、`metadata`。

### 事件订阅

`events.subscribe` 必须支持 `cursor` 和 `filter`：

```json
{"id":"events-1","method":"events.subscribe","params":{"cursor":"evt_100","filter":{"sessionId":"s1","turnId":"t1","types":["turn.delta","tool.result"]}}}
```

语义：

- `cursor` 表示从哪个 event 之后继续投递；缺省时只投递新事件
- `filter.sessionId` 限定会话
- `filter.turnId` 限定 turn
- `filter.types` 限定事件类型
- 服务端返回订阅 id，并从该订阅开始按 `sequence` 单调递增投递事件

`events.unsubscribe` 关闭订阅。

## 7. 权限与交互

权限、确认、选择、输入都可以用 server-to-client request。

### `permissions.request`

服务端向客户端发起请求：

```json
{"id":"perm-1","method":"permissions.request","params":{"commandId":"tools.call","tool":"Bash","input":{"command":"bun test"},"timeoutMs":60000,"defaultDecision":"deny","rememberScopes":["once","session","workspace"],"risk":{"level":"high","reason":"Runs a shell command"}}}
```

客户端响应：

```json
{"id":"perm-1","result":{"decision":"allow","rememberScope":"session"}}
```

建议支持：`allow`、`deny`、`ask`、`abort`

权限请求必须明确：

- `timeoutMs`：客户端没有响应时多久超时
- `defaultDecision`：超时后的默认决策，默认必须是 `deny`
- `rememberScopes`：服务端允许的记忆范围
- `risk`：权限风险说明
- `commandId`：触发权限请求的 graph 节点

客户端只能在 `rememberScopes` 允许范围内选择 `rememberScope`。服务端不得因为客户端传入
更大 scope 就扩大权限记忆范围。

### `permissions.decide`

如果需要把“决策持久化 / 回填策略 / 远程 UI 选择”显式化，可保留为 typed core 方法。

## 8. 错误模型

错误统一为字符串错误码：

```json
{"id":"1","error":{"code":"invalid_params","message":"Missing sessionId","data":{}}}
```

建议错误码：`invalid_request`、`invalid_params`、`method_not_found`、`not_ready`、`busy`、`permission_denied`、`canceled`、`not_found`、`conflict`、`unsupported_version`、`unavailable`、`internal_error`

规则：

- response 必须是 `result` 或 `error`
- `error.data` 用于携带结构化诊断
- 错误码必须稳定，便于客户端做重试和 UI 映射

## 9. 传输约束

### 强约束

- framing：`JSONL / NDJSON`
- 一行一个 JSON message
- 不兼容旧 `kernel.runtime.command.v1`
- 协议本身 transport-agnostic
- `stdio` 为第一优先传输

### 允许的 transport

只要满足双向、顺序、逐行消息，就可以承载同一协议：`stdio`、`ipc`、`unix socket`、`websocket`，以及其他具备流式双向能力的 transport。

## 10. 硬边界

- 协议暴露 CLI 能力，不暴露 Ink UI state
- 协议只描述 capability、command、event、permission、transcript、task state
- 协议不承诺内部 React / 层级组件 / terminal layout 语义
- 外部不应依赖任何 legacy envelope 或旧 kernel command schema

## 11. 实现映射

后续实现建议分三层：

1. JSON-RPC-lite protocol server：负责 JSONL framing、envelope 校验、请求调度和错误编码
2. Runtime / Conversation / Command Graph core services：负责实际能力执行和事件生产
3. CLI services：作为 command graph 节点的能力来源，不作为协议翻译层

协议 server 必须直接调用 core services。旧 `kernel.runtime.command.v1` 不是 fallback
路径，也不是内部执行入口；Typed Core API 与 `commands.execute` 都必须落到同一套
Command Graph / core service 语义上。

## 12. 最小验收

这份协议草案成立的最低标准：

- 可以启动 runtime
- 可以完成 initialize handshake
- 可以列出 capabilities
- 可以用 `commands.execute` 兜底 CLI 命令
- 可以收发事件通知
- 可以进行权限反问
- 可以运行 `turn.run`、`tools.call`、`sessions.resume`
