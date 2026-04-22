import { setSdkBetas, setSessionPersistenceDisabled } from '../bootstrap/state.js'
import { filterAllowedSdkBetas } from '../utils/betas.js'

export type PrepareKernelHeadlessStartupOptions = {
  sessionPersistenceDisabled: boolean
  betas: string[]
  bareMode: boolean
  userType?: string
}

export type PrepareKernelHeadlessStartupDeps = {
  startDeferredPrefetches(): void
  logSessionTelemetry(): void
}

/**
 * Final headless startup preparation that should happen after the runtime
 * environment and MCP state are ready, but before the session enters
 * runHeadlessRuntime().
 */
export async function prepareKernelHeadlessStartup(
  options: PrepareKernelHeadlessStartupOptions,
  deps: PrepareKernelHeadlessStartupDeps,
): Promise<void> {
  if (options.sessionPersistenceDisabled) {
    setSessionPersistenceDisabled(true)
  }

  setSdkBetas(filterAllowedSdkBetas(options.betas))

  if (!options.bareMode) {
    deps.startDeferredPrefetches()
    void import('../utils/backgroundHousekeeping.js').then(module =>
      module.startBackgroundHousekeeping(),
    )
    if (options.userType === 'ant') {
      void import('../utils/sdkHeapDumpMonitor.js').then(module =>
        module.startSdkMemoryMonitor(),
      )
    }
  }

  deps.logSessionTelemetry()
}
