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
import { emitHeadlessRuntimeMessage } from '../runtime/capabilities/execution/internal/headlessStreamEmission.js'

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
