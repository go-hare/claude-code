import type { ProtocolStdoutMessage } from 'src/types/protocol/controlTypes.js'

export function emitHeadlessRuntimeMessage({
  message,
  output,
  drainProtocolEvents,
  hasBackgroundTasks,
  heldBackResult,
  heldBackAssistantMessages = [],
  terminalResultEmitted = false,
}: {
  message: ProtocolStdoutMessage
  output: {
    enqueue(message: ProtocolStdoutMessage): void
  }
  drainProtocolEvents: () => ProtocolStdoutMessage[]
  hasBackgroundTasks: () => boolean
  heldBackResult: ProtocolStdoutMessage | null
  heldBackAssistantMessages?: ProtocolStdoutMessage[]
  terminalResultEmitted?: boolean
}): {
  heldBackResult: ProtocolStdoutMessage | null
  heldBackAssistantMessages: ProtocolStdoutMessage[]
  lastResultIsError?: boolean
  terminalResultEmitted?: boolean
} {
  const protocolEvents = drainProtocolEvents()
  for (const event of protocolEvents) {
    output.enqueue(event)
  }
  const backgroundTasksPending = hasBackgroundTasks()

  if (
    terminalResultEmitted &&
    shouldSuppressAfterTerminalResult(message)
  ) {
    return {
      heldBackResult,
      heldBackAssistantMessages,
    }
  }

  if (message.type === 'result') {
    const lastResultIsError = !!(message as Record<string, unknown>).is_error
    if (backgroundTasksPending) {
      return {
        heldBackResult: message,
        heldBackAssistantMessages,
        lastResultIsError,
      }
    }

    output.enqueue(message)
    return {
      heldBackResult: null,
      heldBackAssistantMessages,
      lastResultIsError,
      terminalResultEmitted: true,
    }
  }

  if (
    backgroundTasksPending &&
    shouldHoldUntilBackgroundWorkCompletes(message)
  ) {
    return {
      heldBackResult,
      heldBackAssistantMessages: [...heldBackAssistantMessages, message],
    }
  }

  output.enqueue(message)
  return {
    heldBackResult,
    heldBackAssistantMessages,
  }
}

function shouldHoldUntilBackgroundWorkCompletes(
  message: ProtocolStdoutMessage,
): boolean {
  return (
    message.type === 'assistant' ||
    message.type === 'stream_event' ||
    message.type === 'streamlined_text'
  )
}

function shouldSuppressAfterTerminalResult(message: ProtocolStdoutMessage): boolean {
  return (
    message.type === 'result' ||
    message.type === 'user' ||
    shouldHoldUntilBackgroundWorkCompletes(message)
  )
}
