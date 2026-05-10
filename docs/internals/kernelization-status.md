# Kernelization Status Archive

本文是旧 kernelization 轨道的归档说明，不再作为当前执行依据。

当前主线已经转为 Agent Core：

- `src/core` 是 session / turn / event 的 ownership 中心。
- `src/entrypoints/core.ts` 是包级 Agent Core 入口。
- 旧 `src/kernel` façade 已移除。
- bridge / server / daemon / headless 直接依赖 runtime 或 server 模块。

继续执行请看：

- `docs/internals/agent-core-event-contract.md`
- `docs/internals/agent-core-execution-plan.md`
