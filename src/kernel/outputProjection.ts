import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type { StdoutMessage } from '../entrypoints/sdk/controlTypes.js'
import {
  createHeadlessSDKMessageRuntimeEvent,
  getSDKMessageFromRuntimeEnvelope,
  getSDKResultTurnOutcome,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeSDKMessageDedupe,
  projectRuntimeEnvelopeToLegacySDKMessage,
  projectRuntimeEnvelopeToLegacyStreamJsonMessages,
  projectSDKMessageToLegacyStreamJsonMessages,
  type LegacyStreamJsonProjectionOptions,
  type SDKResultTurnOutcome,
} from '../runtime/core/events/compatProjection.js'
export {
  getCanonicalProjectionFromKernelEvent,
  getCompatibilityProjectionFromKernelEvent,
  getKernelRuntimeCoordinatorLifecycleProjection,
  getKernelRuntimeLifecycleProjection,
  getKernelRuntimeTaskNotificationProjection,
  getKernelRuntimeTerminalProjection,
  getKernelRuntimeTerminalProjectionFromSDKResultMessage,
  getTextOutputDeltaFromKernelRuntimeEnvelope,
  handleKernelRuntimeHostEvent,
  hasCanonicalProjection,
  hasCompatibilityProjection,
  isKernelTurnTerminalEvent as isKernelRuntimeHostTurnTerminalEvent,
  type KernelRuntimeCoordinatorLifecycleEventType,
  type KernelRuntimeCoordinatorLifecycleProjection,
  type KernelRuntimeHostEventCallbacks,
  type KernelRuntimeHostStopReason,
  type KernelRuntimeLifecycleProjection,
  type KernelRuntimeTaskNotificationProjection,
  type KernelRuntimeTerminalProjection,
  type KernelRuntimeTextOutputDelta,
} from '../runtime/core/events/KernelRuntimeHostProjection.js'
import { emitHeadlessRuntimeMessage } from '../runtime/capabilities/execution/internal/headlessStreamEmission.js'

// Host-internal transitional bridge. Root `./kernel` intentionally does not
// re-export SDKMessage / legacy stream-json adapters; new hosts should consume
// KernelRuntimeEnvelope / KernelEvent contracts instead.
export type KernelLegacySDKMessage = SDKMessage
export type KernelLegacyStdoutMessage = StdoutMessage
export type KernelLegacyStreamJsonProjectionOptions =
  LegacyStreamJsonProjectionOptions
export type KernelSDKResultTurnOutcome = SDKResultTurnOutcome

export type KernelHeadlessRuntimeMessageEmissionOptions = {
  message: KernelLegacyStdoutMessage
  output: {
    enqueue(message: KernelLegacyStdoutMessage): void
  }
  drainSdkEvents: () => KernelLegacyStdoutMessage[]
  hasBackgroundTasks: () => boolean
  heldBackResult: KernelLegacyStdoutMessage | null
  heldBackAssistantMessages?: KernelLegacyStdoutMessage[]
  terminalResultEmitted?: boolean
}

export type KernelHeadlessRuntimeMessageEmissionResult = {
  heldBackResult: KernelLegacyStdoutMessage | null
  heldBackAssistantMessages: KernelLegacyStdoutMessage[]
  lastResultIsError?: boolean
  terminalResultEmitted?: boolean
}

export {
  createHeadlessSDKMessageRuntimeEvent,
  getSDKMessageFromRuntimeEnvelope,
  getSDKResultTurnOutcome,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeSDKMessageDedupe,
  projectRuntimeEnvelopeToLegacySDKMessage,
  projectRuntimeEnvelopeToLegacyStreamJsonMessages,
  projectSDKMessageToLegacyStreamJsonMessages,
}

export function emitKernelHeadlessRuntimeMessage(
  options: KernelHeadlessRuntimeMessageEmissionOptions,
): KernelHeadlessRuntimeMessageEmissionResult {
  return emitHeadlessRuntimeMessage(options)
}
