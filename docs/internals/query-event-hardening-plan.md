# Query Event Hardening Plan

状态：`P1 hardening`

本文记录 `query()` / `SessionRuntime.runQueryTurn(...)` 去 SDKMessage 化的执行计划。
它不属于当前 kernel complete blocker；当前 public/runtime 对外语义面已经是
`KernelRuntimeEnvelope` / `KernelEvent`。本计划只处理内部执行纯度：把当前
`Message -> SDKMessage -> KernelEvent` 改成 `Message -> KernelEvent -> SDKMessage
projection`。

> 术语说明：本文中的 `SDKMessage` 是代码里的历史类型名，实际指
> headless / `stream-json` / ACP fallback 继续兼容的旧消息格式；它不是当前项目的
> public 接入层，也不代表内核外还有一条 SDK 产品线。

## 0. 当前进展

2026-05-04：Phase 1、Phase 2A-G、Phase 3A-G 已落地。

- 已新增 `QueryTurnEventAdapter`，并从最初的 SDKMessage-to-event adapter
  演进为 query-internal-message projection seam。
- `submitRuntimeTurn(...)` 当前只消费 `runQueryTurn(...)` 的
  `query_sidecar` flush marker 与 adapter 产出的 `KernelEvent`；
  canonical `turn.output_delta` / terminal event 不再从 yielded SDKMessage-shaped compatibility message 反推。
- 已补 `QueryTurnEventAdapter` 单测和 `SessionRuntimeContracts` contract guard。
- Phase 2A 已新增 adapter 的 `projectQueryMessage(...)` 输入 seam，先覆盖
  query 内部 `stream_event` -> canonical `turn.output_delta` +
  compatibility `headless.sdk_message` 的投影。该 seam 尚未接入
  `runQueryTurn(...)` production lifecycle，因此不改变 transport/event 行为。
- Phase 2B 已把 `includePartialMessages` 的 query 内部 `stream_event` 接入
  production：canonical `turn.output_delta` 先由 `projectQueryMessage(...)`
  生成，legacy headless message stream event 仍照常 yield；adapter 对同一 stream event
  跳过 SDK 反推的重复 `turn.output_delta`，只保留 compatibility
  `headless.sdk_message`。
- Phase 2C 已把 result synthesis 接入 production：`runQueryTurn(...)` 在
  yield SDK result 前先通过 `query_result` internal input 投影 canonical
  terminal event；legacy headless result message 后续只继续生成 compatibility
  `headless.sdk_message`，不再重复反推 terminal。
- Phase 2D 已把 `tool_use_summary` 与 `compact_boundary` 接入 production：
  compatibility `headless.sdk_message` 由 query internal message 先投影，后续同
  UUID 的 SDK-shaped message 不再重复生成 compatibility envelope。
- Phase 2E 已把 local command output、initial/replay user ack 与 queued command
  replay 接入 production：这些分支仍只生成 compatibility
  `headless.sdk_message`，不新增 canonical event。
- Phase 2F 已把 API retry 接入 production：`api_error` internal system message
  先投成 compatibility `api_retry` envelope，后续同 UUID 的 SDK-shaped
  `api_retry` 不再重复生成 compatibility envelope。
- Phase 2G audit 已完成：剩余直接 SDK-shaped yield 集中在 `system init`、
  `orphanedPermission`、`normalizeMessage(assistant/user/progress)` 与 legacy
  `submitMessage()` projection 边界。其中 `normalizeMessage(...)` 是最后的大刀，
  需要单独迁移，不能继续混在 compatibility-only 小分支中切。
- Phase 3A 已把 `normalizeMessage(assistant/user)` 前置接入 adapter：
  assistant/user compatibility envelope 由 query internal message 先投影，
  后续 `normalizeMessage(...)` 产出的同 UUID SDKMessage-shaped compatibility message 不再重复生成
  compatibility envelope。
- Phase 3B 已先落一层过渡：`progress` 仍只调用一次
  `normalizeMessage(progress)`，但生成出的 SDKMessage-shaped compatibility message 会先以
  `query_sdk_message` 形式进入 adapter，后续同 UUID compatibility message 不再重复生成
  compatibility envelope。这样先保住 throttle 语义与 transport 顺序。
- Phase 3C 已把 `progress` 从 `query_sdk_message` 过渡入口下沉为
  adapter 的原始 query progress input：`SessionRuntime` 不再直接调用
  `normalizeMessage(progress)` / `projectProgressMessageToSDKMessages(...)`，
  progress SDK 投影拆成无副作用
  `projectProgressMessageToSDKMessageProjection(...)` + 显式
  `applyToolProgressTrackingUpdate(...)`；adapter 返回 compatibility sidecar
  SDKMessage-shaped compatibility message 只用于 legacy flush/yield，canonical event 不再从这条
  SDK sidecar 反推。
- Phase 3D 已处理 `system init` 与 `orphanedPermission`：startup init 现在以
  `query_system_init` internal input 进入 adapter，再生成
  `headless.sdk_message` compatibility envelope；`handleOrphanedPermission(...)`
  不再直接 yield SDK-shaped assistant/user，而是保持 tool execution /
  transcript side effects 后 yield 内部 `Message`，由 adapter 统一投影。
- Phase 3E 已把 assistant/user 主分支也改为消费 adapter 返回的
  compatibility sidecar，`SessionRuntime` 主链不再直接调用
  `normalizeMessage(...)`。
- Phase 3F 已收窄 `runQueryTurn(...)` 返回类型：内部 query turn 现在产出
  显式 `query_sidecar` flush marker，不再是
  `AsyncGenerator<SDKMessage>`；local command / user replay / compact
  boundary / API retry / tool summary / terminal result / partial stream 的
  compatibility envelope 均由 `QueryTurnEventAdapter` 在 query input 边界生成。
  `submitRuntimeTurn(...)` 不再从 yielded compatibility message 调
  `projectSDKMessage(...)` 反推 runtime event。
- Phase 3F 定向验证已通过：query event / SessionRuntime contract / progress
  helper / managed env tests 40 pass，runtime compatibility tests 14 pass，
  direct-connect/headless/server smoke 3 pass，ACP bridge 78 pass，
  built Bun/Node CLI mock smoke 1 pass，`bun run typecheck` 与
  `git diff --check` 通过。
- Phase 3G 已完成：`QueryTurnEventAdapter` 不再暴露
  `projectSDKMessage(message: SDKMessage)` production-facing surface，也不再导入
  `getSDKResultTurnOutcome(...)` 从 SDK result 反推 terminal；terminal 只由
  `query_result` internal input 生成。adapter 内部保留的 SDKMessage 仅用于生成
  `headless.sdk_message` compatibility envelope。
- Phase 3G 后验证已通过：query event / SessionRuntime contract / progress
  helper / managed env tests 40 pass，runtime compatibility tests 14 pass，
  direct-connect/headless/server smoke 3 pass，ACP bridge 78 pass，
  built Bun/Node CLI mock smoke 1 pass，`bun run typecheck` 与
  `git diff --check` 通过。
- Phase 3H cleanup 已完成：`QueryTurnCompatibilityProjector.ts` 承接
  query internal message -> legacy headless compatibility message 的 builder 与
  progress tracking projection；`QueryTurnProjectionTypes.ts` 承接共享输入类型。
  `QueryTurnEventAdapter.ts` 退回事件编排、compatibility envelope emission、
  dedupe 与 terminal ownership。
- Phase 3H 后验证已通过：query event / SessionRuntime contract / progress
  helper / managed env tests 40 pass，runtime compatibility tests 14 pass，
  direct-connect/headless/server smoke 3 pass，ACP bridge 78 pass，
  built Bun/Node CLI mock smoke 1 pass，`bun run typecheck` 与
  `git diff --check` 通过。随后用本地 OpenAI-compatible endpoint
  `http://127.0.0.1:8317/v1` + `gpt-5.4` 补跑 live deep smoke：source /
  built Bun / built Node 均通过；ACP live smoke 也通过。
- release-gated smoke 已复跑：source / built Bun / built Node deep smoke、ACP
  live、built CLI mock smoke、direct-connect/headless/server smoke 均通过。
  本轮还补了 host-managed provider 过滤列表，确保 `CLAUDE_CODE_USE_OPENAI`
  / Grok 相关 routing env 不会被用户 settings/env 覆盖。

下一步若继续做，是 live smoke 复核或更细的 legacy compatibility helper 命名整理；
query turn ownership 主线已经收口。

## 1. 当前事实

当前链路是：

```text
query()
  -> internal Message / StreamEvent / ToolUseSummaryMessage
  -> SessionRuntime.runQueryTurn()
  -> query_sidecar flush marker
  -> QueryTurnEventAdapter
  -> KernelRuntimeEnvelope / KernelEvent
  -> compatibility projection for submitMessage(), stream-json, ACP fallback
```

关键边界：

- `query.ts` 本身不是 public API，也不直接产出 public `SDKMessage`。
- `submitRuntimeTurn(...)` 已是 runtime owner，对外产出 canonical runtime
  envelope。
- `submitMessage(...)` 已标记为 legacy headless message projection。
- `headless.sdk_message` 已退出 public event taxonomy，只作为内部 compatibility
  envelope。
- `QueryTurnEventAdapter` 当前不再提供 SDKMessage-to-canonical 的 public method；
  SDK-shaped objects 只作为 compatibility envelope payload 被构造。

因此，这一刀的目标不是补 kernel blocker，而是减少内部反向投影。

## 2. 目标状态

目标链路是：

```text
query()
  -> internal Message / StreamEvent / ToolUseSummaryMessage
  -> QueryTurnEventAdapter / RuntimeTurnEventEmitter
  -> KernelEvent
  -> KernelRuntimeEnvelope
  -> SDKMessage / stream-json / ACP fallback projection only at compatibility boundaries
```

目标约束：

- canonical lifecycle 只由 `turn.started`、`turn.output_delta`、
  `turn.abort_requested`、`turn.completed`、`turn.failed` 等 runtime events 表达。
- `SDKMessage` 这个历史消息格式只能从 envelope 反向生成，不能再作为 canonical event 的输入源。
- legacy `submitMessage()`、headless `stream-json`、ACP complex content fallback
  行为不能衰减。
- 不在这一刀里改变 `query.ts` 的主循环行为。

## 3. 分阶段执行

### Phase 1：抽 adapter，不改行为

状态：`done`

目标：先把当前投影显式收口，建立 golden tests。

改动范围：

- 新增 `src/runtime/capabilities/execution/internal/QueryTurnEventAdapter.ts`。
- 由 adapter 接管当前分散在 `submitRuntimeTurn(...)` 里的：
  `createTurnOutputDeltaRuntimeEventFromSDKMessage(...)`、
  `createHeadlessSDKMessageRuntimeEvent(...)`、
  `getSDKResultTurnOutcome(...)`。
- `SessionRuntime.submitRuntimeTurn(...)` 只调用 adapter，不再直接写
  SDKMessage-to-event 细节。

验收：

- runtime envelope 顺序不变。
- `headless.sdk_message` compatibility envelope 仍可被 internal bridge 消费。
- terminal event stopReason 不变。
- ACP / stream-json / direct-connect 输出不变。

### Phase 2：让 adapter 接 internal Message

状态：`started`

目标：把 adapter 输入从 `SDKMessage` 扩展为 `query()` 内部 message。

改动范围：

- adapter 新增 `projectQueryMessage(...)` 入口，输入类型来自
  `Message | StreamEvent | ToolUseSummaryMessage | TombstoneMessage`。Phase 2A
  只先接 `stream_event`；Phase 2B 已接入 production partial stream 分支；
  Phase 2C 已接入 production result synthesis 分支；其它 query item 暂不投影
  canonical event。Phase 2D 已接入 production `tool_use_summary` 与
  `compact_boundary` compatibility 分支。
- `runQueryTurn(...)` 逐步把 partial stream、result synthesis、tool summary、
  compact boundary、stop hook progress、budget/max-turns/error result 转成
  `KernelEvent`。
- 保留 `SDKMessage` projection sidecar，供 `submitMessage()` 和 compatibility
  transport 继续使用。

验收：

- `runQueryTurn(...)` 不再以 `AsyncGenerator<SDKMessage>` 作为最终内部 owner。
- `submitRuntimeTurn(...)` 不再从 `SDKMessage` 反推 canonical lifecycle。
- 所有 legacy output 仍由 envelope projection 生成。

### Phase 3：清理 SDKMessage 输入源

状态：`started`

目标：`SDKMessage` 只存在于 compatibility boundary。

改动范围：

- `submitMessage()` 保留，但只消费 envelope projection。
- `headlessStreaming` / `stream-json` 只消费 projection helper。
- ACP fallback 只消费 compatibility projection，不参与 terminal / output_delta
  canonical 判断。
- 删除不再需要的 SDKMessage-to-canonical helper，或降级为 test-only /
  compatibility-only。

Phase 3 切点状态：

- `buildSystemInitMessage(...)`：Phase 3D 已完成。startup/system compatibility
  message 由 `query_system_init` internal input 进入 adapter，不再由
  `SessionRuntime` 直接 yield。
- `handleOrphanedPermission(...)`：Phase 3D 已完成。helper 仍负责 permission
  response 的 tool execution / transcript side effects，但返回内部 `Message`，
  SDK-shaped assistant/user sequence 由 adapter 投影。
- `normalizeMessage(progress)`：Phase 3C 已完成。adapter 现在吃原始
  progress message，progress SDK 投影是无副作用 projection result，tracking
  update 由 adapter 显式提交；legacy headless message sidecar 只负责让旧通道保持 flush/yield
  行为。
- `normalizeMessage(assistant/user)`：Phase 3E 已完成。assistant/user 主分支
  现在消费 adapter 返回的 compatibility sidecar，不再由 `SessionRuntime`
  直接调用 `normalizeMessage(...)`。
- `runQueryTurn(...)` SDK generator：Phase 3F 已完成。`runQueryTurn(...)`
  现在返回 `AsyncGenerator<QueryTurnSidecarOutput>`；SDK-shaped compatibility
  message 仅作为 adapter 返回的 sidecar metadata 存在，外层
  `submitRuntimeTurn(...)` 不再从 SDKMessage-shaped compatibility message 做 canonical projection。
- `QueryTurnEventAdapter.projectSDKMessage(...)`：Phase 3G 已完成。该方法已从
  adapter surface 移除，SDK result 不再能经 adapter 反推 terminal event；
  terminal owner 是 `query_result` internal input。
- `QueryTurnCompatibilityProjector.ts`：Phase 3H 已完成。compatibility headless message
  builders 从 adapter 文件内拆出，保留为内部 projection helper，不进入 public
  kernel surface。

验收：

- `rg` 中 `SDKMessage` 不再出现在 runtime turn owner 主链。
- public `./kernel` surface 不变。
- `query.ts` 行为不变，只有 adapter 边界变化。

## 4. 风险矩阵

| 风险点 | 现有语义 | 迁移风险 | 必须锁住的测试 |
| --- | --- | --- | --- |
| result synthesis | `runQueryTurn(...)` 最后合成 success/error result SDKMessage | result 文本、usage、cost、structured_output 丢失 | headless deep smoke、runtime result golden |
| partial stream | `includePartialMessages` 输出 `stream_event` | partial event 顺序变化或重复 | compatProjection + headless stream-json tests |
| tool summary | `tool_use_summary` 作为 SDKMessage 输出 | summary 丢失或 preceding ids 改变 | SessionRuntime / headless streaming tests |
| compact boundary | `compact_boundary` 投到 system SDKMessage | resume/compact 边界丢失 | runtime resume / compact boundary tests |
| stop hooks | stop hook progress/attachment 在 assistant 后输出 | terminal 前后顺序错乱 | query stop hook / headless live smoke |
| budget / max turns | attachment 触发 error result | error subtype 或 stopReason 漂移 | max-turns / budget targeted tests |
| API retry/error | `api_retry` / `error_during_execution` SDKMessage | retry 可见性和 error list 漂移 | query error-path tests |
| ACP projection | ACP 复杂 content fallback 仍依赖 SDKMessage | content/tool/usage 丢失或重复 update | ACP bridge + ACP live smoke |
| direct-connect | runtime event 与 compatibility message 双路进入 host | 重复事件、丢 event、顺序错乱 | direct-connect smoke |
| built CLI | built Bun / Node artifact 路径和 provider routing | source 过、built 失败 | built CLI smoke + deep built smoke |

## 5. 第一刀测试清单

第一刀只抽 adapter，不改行为。至少跑：

```bash
bun test src/runtime/capabilities/execution/__tests__/SessionRuntimeContracts.test.ts
bun test src/runtime/core/events/__tests__/compatProjection.test.ts
bun test src/runtime/capabilities/execution/internal/__tests__/headlessStreaming.test.ts
bun test src/runtime/capabilities/execution/internal/__tests__/headlessRuntimeEventOutput.test.ts
bun test src/services/acp/__tests__/bridge.test.ts tests/integration/kernel-acp-live-smoke.test.ts
bun test tests/integration/kernel-direct-connect-smoke.test.ts tests/integration/kernel-headless-smoke.test.ts tests/integration/kernel-server-smoke.test.ts
bun run typecheck
git diff --check
```

release-gated / live：

```bash
RUN_BUILT_CLI_SMOKE=1 bun test tests/integration/kernel-built-cli-smoke.test.ts
RUN_ACP_LIVE_SMOKE=1 KERNEL_DEEP_TEST_API_KEY=... KERNEL_DEEP_TEST_BASE_URL=... KERNEL_DEEP_TEST_MODEL=... bun test tests/integration/kernel-acp-live-smoke.test.ts
KERNEL_DEEP_TEST_API_KEY=... KERNEL_DEEP_TEST_BASE_URL=... KERNEL_DEEP_TEST_MODEL=... bun run scripts/kernel-deep-smoke.ts --built --timeout-ms 90000
```

## 6. 不做事项

- 不把 `query.ts` 重写成 runtime module。
- 不删除 `submitMessage()`。
- 不删除 `headless.sdk_message` compatibility envelope。
- 不改变 headless `stream-json` 外部格式。
- 不把 ACP 的 complex content fallback 提前改成全新 schema。
- 不把这项 hardening 重新定义为 kernel complete blocker。

## 7. 完成定义

这项 P1 hardening 完成时，应满足：

- 内部 turn owner 不再依赖 `SDKMessage` 推导 canonical runtime event。
- `SDKMessage` 只存在于 compatibility projection。
- `KernelRuntimeEnvelope` / `KernelEvent` 仍是唯一 public semantic plane。
- source、built Bun、built Node、ACP live、direct-connect smoke 全绿。
- 文档状态仍保持：kernel complete；query event hardening 是后续质量提升。
