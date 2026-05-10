import { runBridgeHeadless } from '../bridge/bridgeMain.js'
import { BridgeHeadlessPermanentError } from '../runtime/capabilities/bridge/HeadlessBridgeRuntime.js'
import { runDaemonWorkerHost } from '../hosts/daemon/index.js'

export async function runDaemonWorker(kind?: string): Promise<void> {
  return runDaemonWorkerHost(kind, {
    runBridgeHeadless,
    isPermanentError: error => error instanceof BridgeHeadlessPermanentError,
  })
}
