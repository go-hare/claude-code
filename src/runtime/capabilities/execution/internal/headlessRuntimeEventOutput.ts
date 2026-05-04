import type { StdoutMessage } from 'src/entrypoints/sdk/controlTypes.js'
import type {
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../../../contracts/events.js'
import type { StructuredIO } from './io/structuredIO.js'
import { projectRuntimeEnvelopeToLegacyRuntimeEventStreamJsonMessage } from '../../../core/events/compatProjection.js'

type RuntimeEventOutputOptions = {
  outputFormat: string | undefined
  verbose: boolean | undefined
  sessionId: string
  runtimeEventSink?: KernelRuntimeEventSink
}

type RuntimeEventWriter = Pick<StructuredIO, 'write'>

export function createHeadlessRuntimeEventSink(
  _structuredIO: RuntimeEventWriter,
  options: RuntimeEventOutputOptions,
): KernelRuntimeEventSink | undefined {
  if (!options.runtimeEventSink) {
    return undefined
  }

  return envelope => {
    try {
      options.runtimeEventSink?.(envelope)
    } catch {
      // Runtime event observation must not mutate execution semantics.
    }
  }
}

export function toHeadlessRuntimeEventMessage(
  envelope: KernelRuntimeEnvelopeBase,
  sessionId: string,
): StdoutMessage {
  return projectRuntimeEnvelopeToLegacyRuntimeEventStreamJsonMessage(envelope, {
    sessionId,
  })
}
