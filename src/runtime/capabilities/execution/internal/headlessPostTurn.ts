import { randomUUID } from 'crypto'
import type { ProtocolStdoutMessage } from 'src/types/protocol/controlTypes.js'

type PendingSuggestionState = {
  lastEmitted: {
    text: string
    emittedAt: number
    promptId: string
    generationRequestId: string | null
  } | null
  pendingSuggestion: {
    type: 'prompt_suggestion'
    suggestion: string
    uuid: string
    session_id: string
  } | null
  pendingLastEmittedEntry: {
    text: string
    promptId: string
    generationRequestId: string | null
  } | null
}

export function flushHeldBackResultAndSuggestion({
  output,
  heldBackResult,
  heldBackAssistantMessages = [],
  suggestionState,
  now = Date.now,
}: {
  output: { enqueue(message: ProtocolStdoutMessage): void }
  heldBackResult: ProtocolStdoutMessage | null
  heldBackAssistantMessages?: ProtocolStdoutMessage[]
  suggestionState: PendingSuggestionState
  now?: () => number
}): {
  heldBackResult: ProtocolStdoutMessage | null
  heldBackAssistantMessages: ProtocolStdoutMessage[]
} {
  if (!heldBackResult && heldBackAssistantMessages.length === 0) {
    return {
      heldBackResult,
      heldBackAssistantMessages,
    }
  }

  for (const message of heldBackAssistantMessages) {
    output.enqueue(message)
  }

  if (heldBackResult) {
    output.enqueue(heldBackResult)
  }

  if (suggestionState.pendingSuggestion) {
    output.enqueue(
      suggestionState.pendingSuggestion as unknown as ProtocolStdoutMessage,
    )
    if (suggestionState.pendingLastEmittedEntry) {
      suggestionState.lastEmitted = {
        ...suggestionState.pendingLastEmittedEntry,
        emittedAt: now(),
      }
      suggestionState.pendingLastEmittedEntry = null
    }
    suggestionState.pendingSuggestion = null
  }

  return {
    heldBackResult: null,
    heldBackAssistantMessages: [],
  }
}

export function createFilesPersistedMessage({
  result,
  sessionId,
  processedAt = () => new Date().toISOString(),
}: {
  result: {
    persistedFiles: { filename: string; file_id: string }[]
    failedFiles: { filename: string; error: string }[]
  }
  sessionId: string
  processedAt?: () => string
}): ProtocolStdoutMessage {
  return {
    type: 'system',
    subtype: 'files_persisted',
    files: result.persistedFiles,
    failed: result.failedFiles,
    processed_at: processedAt(),
    uuid: randomUUID(),
    session_id: sessionId,
  } as ProtocolStdoutMessage
}
