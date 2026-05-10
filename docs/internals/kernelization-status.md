# Kernelization Status Archive

本文是旧 kernelization 轨道的归档说明，不再作为当前执行依据。

最高优先级事实：

- `core-clean` 是从 `main` 的 `3c7b8dc3` 切出后，重新建设 Agent Core 的分支。
- 当前主线是 Agent Core，不是旧 kernel / kernel façade 的延续。
- 后续同步 `main` 时，应找 `3c7b8dc3` 之后非 kernel 的代码和功能，
  再判断是否迁回 `core-clean`。

当前主线已经转为 Agent Core：

- `src/core` 是 session / turn / event 的 ownership 中心。
- `src/entrypoints/core.ts` 是包级 Agent Core 入口。
- 旧 `src/kernel` façade 已移除。
- bridge / server / daemon / headless 直接依赖 runtime 或 server 模块。

继续执行请看：

- `docs/internals/agent-core-event-contract.md`
- `docs/internals/agent-core-execution-plan.md`
