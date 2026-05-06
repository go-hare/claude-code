import {
  createRuntimeHeadlessStartupStateWriter,
  type RuntimeHeadlessStartupStateWriter,
} from '../runtime/core/state/bootstrapProvider.js'
import { filterAllowedProtocolBetas } from '../utils/betas.js'

export type KernelHeadlessStartupStateWriter =
  RuntimeHeadlessStartupStateWriter

export type PrepareKernelHeadlessStartupOptions = {
  sessionPersistenceDisabled: boolean
  betas: string[]
  bareMode: boolean
  userType?: string
}

export type PrepareKernelHeadlessStartupDeps = {
  stateWriter?: KernelHeadlessStartupStateWriter
  startDeferredPrefetches(): void
  logSessionTelemetry(): void
  startBackgroundHousekeeping?(): void
  startProtocolMemoryMonitor?(): void
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
  const stateWriter =
    deps.stateWriter ?? createRuntimeHeadlessStartupStateWriter()

  if (options.sessionPersistenceDisabled) {
    stateWriter.setSessionPersistenceDisabled(true)
  }

  stateWriter.setProtocolBetas(filterAllowedProtocolBetas(options.betas))

  if (!options.bareMode) {
    deps.startDeferredPrefetches()
    if (deps.startBackgroundHousekeeping) {
      deps.startBackgroundHousekeeping()
    } else {
      void import('../utils/backgroundHousekeeping.js').then(module =>
        module.startBackgroundHousekeeping(),
      )
    }
    if (options.userType === 'ant') {
      if (deps.startProtocolMemoryMonitor) {
        deps.startProtocolMemoryMonitor()
      } else {
        void import('../utils/protocolHeapDumpMonitor.js').then(module =>
          module.startProtocolMemoryMonitor(),
        )
      }
    }
  }

  deps.logSessionTelemetry()
}
