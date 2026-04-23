/**
 * Stable daemon-facing kernel exports.
 *
 * These are thin façades over the runtime daemon capability so callers do not
 * need to import from runtime internals directly.
 */
import {
  EXIT_CODE_PERMANENT,
  EXIT_CODE_TRANSIENT,
  buildRemoteControlWorkerConfigFromEnv,
  runDaemonWorkerRuntime,
  runRemoteControlWorkerRuntime,
  type RemoteControlWorkerRuntimeConfig,
} from '../runtime/capabilities/daemon/DaemonWorkerRuntime.js'
import type {
  DaemonWorkerRuntimeDeps,
  HeadlessBridgeRunner,
} from '../runtime/capabilities/daemon/contracts.js'
import {
  BridgeHeadlessPermanentError,
  runBridgeHeadless,
} from './bridge.js'

export function createDaemonWorkerDeps(): DaemonWorkerRuntimeDeps {
  return {
    runBridgeHeadless,
    isPermanentError: error => error instanceof BridgeHeadlessPermanentError,
  }
}

export async function runDaemonWorker(kind?: string): Promise<void> {
  return runDaemonWorkerRuntime(kind, createDaemonWorkerDeps())
}

export {
  EXIT_CODE_PERMANENT,
  EXIT_CODE_TRANSIENT,
  buildRemoteControlWorkerConfigFromEnv,
  runDaemonWorkerRuntime,
  runRemoteControlWorkerRuntime,
  type HeadlessBridgeRunner,
  type DaemonWorkerRuntimeDeps,
  type RemoteControlWorkerRuntimeConfig,
}
