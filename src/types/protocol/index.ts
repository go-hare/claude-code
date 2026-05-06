/**
 * Internal CLI/headless protocol types.
 *
 * This module intentionally replaces the old Agent SDK entrypoint as an
 * internal-only barrel. Do not export query/session SDK functions from here.
 */

export type {
  ProtocolControlRequest,
  ProtocolControlResponse,
} from './controlTypes.js'

export * from './coreTypes.js'
export * from './runtimeTypes.js'
export type { Settings } from './settingsTypes.generated.js'
export * from './toolTypes.js'
