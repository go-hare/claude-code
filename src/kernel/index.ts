/**
 * Stable public kernel API for external hosts.
 *
 * This surface is intentionally narrower than `src/runtime`: callers should
 * use it when they need to start a server, create/connect direct sessions,
 * or consume stable kernel-facing types without depending on internal layout.
 */
export {
  createDefaultKernelHeadlessEnvironment,
  createKernelHeadlessSession,
  createKernelHeadlessStore,
  runKernelHeadless,
} from './headless.js'
export { connectDefaultKernelHeadlessMcp } from './headlessMcp.js'
export { prepareKernelHeadlessStartup } from './headlessStartup.js'
export type { KernelHeadlessMcpConnectOptions } from './headlessMcp.js'
export type {
  PrepareKernelHeadlessStartupDeps,
  PrepareKernelHeadlessStartupOptions,
} from './headlessStartup.js'
export type {
  DefaultKernelHeadlessEnvironmentOptions,
  KernelHeadlessEnvironment,
  KernelHeadlessInput,
  KernelHeadlessRunOptions,
  KernelHeadlessSession,
  KernelHeadlessStore,
} from './headless.js'
export {
  createDirectConnectSession as createKernelSession,
  connectDirectHostSession,
  applyDirectConnectSessionState,
  assembleServerHost,
  getDirectConnectErrorMessage,
  createDirectConnectSession,
  DirectConnectError,
  runConnectHeadless as runKernelHeadlessClient,
  runConnectHeadless,
  startServer as startKernelServer,
  startServer,
} from './serverHost.js'
export {
  connectResponseSchema,
  type DirectConnectConfig,
  type ServerConfig,
  type SessionIndex,
  type SessionIndexEntry,
  type SessionInfo,
  type SessionState,
} from '../server/types.js'
export { runBridgeHeadless } from './bridge.js'
export { runDaemonWorker } from './daemon.js'
