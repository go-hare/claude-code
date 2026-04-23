import { randomUUID } from 'crypto'
import type { StdoutMessage } from 'src/entrypoints/sdk/controlTypes.js'

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
  suggestionState,
  now = Date.now,
}: {
  output: { enqueue(message: StdoutMessage): void }
  heldBackResult: StdoutMessage | null
  suggestionState: PendingSuggestionState
  now?: () => number
}): StdoutMessage | null {
  if (!heldBackResult) {
    return heldBackResult
  }

  output.enqueue(heldBackResult)
  if (suggestionState.pendingSuggestion) {
    output.enqueue(
      suggestionState.pendingSuggestion as unknown as StdoutMessage,
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

  return null
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
}): StdoutMessage {
  return {
    type: 'system',
    subtype: 'files_persisted',
    files: result.persistedFiles,
    failed: result.failedFiles,
    processed_at: processedAt(),
    uuid: randomUUID(),
    session_id: sessionId,
  } as StdoutMessage
}
