/**
 * Stable server/direct-connect host-facing kernel exports.
 *
 * Top-level hosts should depend on this surface instead of importing
 * `server/*` modules directly.
 */
export {
  createDirectConnectSession as createKernelDirectConnectSession,
  createDirectConnectSession,
  DirectConnectError,
} from '../server/createDirectConnectSession.js'
export {
  runConnectHeadless as runKernelHeadlessClient,
  runConnectHeadless,
} from '../server/connectHeadless.js'
export {
  startServer as startKernelServer,
  startServer,
} from '../server/server.js'
