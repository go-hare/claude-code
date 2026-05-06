import type { ProtocolMessage } from 'src/types/protocol/index.js'
import type { ProtocolStdoutMessage } from 'src/types/protocol/controlTypes.js'
import {
  createHeadlessProtocolMessageRuntimeEvent,
  getProtocolMessageFromRuntimeEnvelope,
  getProtocolResultTurnOutcome,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeProtocolMessageDedupe,
  projectRuntimeEnvelopeToLegacyProtocolMessage,
  projectRuntimeEnvelopeToLegacyStreamJsonMessages,
  projectProtocolMessageToLegacyStreamJsonMessages,
  type LegacyStreamJsonProjectionOptions,
  type ProtocolResultTurnOutcome,
} from '../runtime/core/events/compatProjection.js'
export {
  getCanonicalProjectionFromKernelEvent,
  getCompatibilityProjectionFromKernelEvent,
  getKernelRuntimeCoordinatorLifecycleProjection,
  getKernelRuntimeLifecycleProjection,
  getKernelRuntimeTaskNotificationProjection,
  getKernelRuntimeTerminalProjection,
  getKernelRuntimeTerminalProjectionFromProtocolResultMessage,
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
// re-export ProtocolMessage / legacy stream-json adapters; new hosts should consume
// KernelRuntimeEnvelope / KernelEvent contracts instead.
export type KernelLegacyProtocolMessage = ProtocolMessage
export type KernelLegacyProtocolStdoutMessage = ProtocolStdoutMessage
export type KernelLegacyStreamJsonProjectionOptions =
  LegacyStreamJsonProjectionOptions
export type KernelProtocolResultTurnOutcome = ProtocolResultTurnOutcome

export type KernelHeadlessRuntimeMessageEmissionOptions = {
  message: KernelLegacyProtocolStdoutMessage
  output: {
    enqueue(message: KernelLegacyProtocolStdoutMessage): void
  }
  drainProtocolEvents: () => KernelLegacyProtocolStdoutMessage[]
  hasBackgroundTasks: () => boolean
  heldBackResult: KernelLegacyProtocolStdoutMessage | null
  heldBackAssistantMessages?: KernelLegacyProtocolStdoutMessage[]
  terminalResultEmitted?: boolean
}

export type KernelHeadlessRuntimeMessageEmissionResult = {
  heldBackResult: KernelLegacyProtocolStdoutMessage | null
  heldBackAssistantMessages: KernelLegacyProtocolStdoutMessage[]
  lastResultIsError?: boolean
  terminalResultEmitted?: boolean
}

export {
  createHeadlessProtocolMessageRuntimeEvent,
  getProtocolMessageFromRuntimeEnvelope,
  getProtocolResultTurnOutcome,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeProtocolMessageDedupe,
  projectRuntimeEnvelopeToLegacyProtocolMessage,
  projectRuntimeEnvelopeToLegacyStreamJsonMessages,
  projectProtocolMessageToLegacyStreamJsonMessages,
}

export function emitKernelHeadlessRuntimeMessage(
  options: KernelHeadlessRuntimeMessageEmissionOptions,
): KernelHeadlessRuntimeMessageEmissionResult {
  return emitHeadlessRuntimeMessage(options)
}
