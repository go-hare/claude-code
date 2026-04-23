import type { HeadlessBridgeOpts } from '../bridge/HeadlessBridgeRuntime.js'

export type HeadlessBridgeRunner = (
  opts: HeadlessBridgeOpts,
  signal: AbortSignal,
) => Promise<void>

export interface DaemonWorkerRuntimeDeps {
  runBridgeHeadless: HeadlessBridgeRunner
  isPermanentError: (error: unknown) => boolean
}
