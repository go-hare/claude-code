import type { StdoutMessage } from 'src/entrypoints/sdk/controlTypes.js'

export function emitHeadlessRuntimeMessage({
  message,
  output,
  drainSdkEvents,
  hasBackgroundTasks,
  heldBackResult,
}: {
  message: StdoutMessage
  output: {
    enqueue(message: StdoutMessage): void
  }
  drainSdkEvents: () => StdoutMessage[]
  hasBackgroundTasks: boolean
  heldBackResult: StdoutMessage | null
}): {
  heldBackResult: StdoutMessage | null
  lastResultIsError?: boolean
} {
  const sdkEvents = drainSdkEvents()
  for (const event of sdkEvents) {
    output.enqueue(event)
  }

  if (message.type === 'result') {
    const lastResultIsError = !!(message as Record<string, unknown>).is_error
    if (hasBackgroundTasks) {
      return {
        heldBackResult: message,
        lastResultIsError,
      }
    }

    output.enqueue(message)
    return {
      heldBackResult: null,
      lastResultIsError,
    }
  }

  output.enqueue(message)
  return {
    heldBackResult,
  }
}
