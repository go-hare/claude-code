import { describe, expect, test } from 'bun:test'
import {
  createFilesPersistedMessage,
  flushHeldBackResultAndSuggestion,
} from '../headlessPostTurn.js'

describe('flushHeldBackResultAndSuggestion', () => {
  test('flushes held-back result before pending suggestion and records emission time', () => {
    const emitted: unknown[] = []
    const suggestionState: {
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
    } = {
      lastEmitted: null,
      pendingSuggestion: {
        type: 'prompt_suggestion' as const,
        suggestion: 'next prompt',
        uuid: 'suggestion-uuid',
        session_id: 'session-1',
      },
      pendingLastEmittedEntry: {
        text: 'next prompt',
        promptId: 'followup',
        generationRequestId: 'req-1',
      },
    }

    const result = flushHeldBackResultAndSuggestion({
      output: {
        enqueue(message) {
          emitted.push(message)
        },
      },
      heldBackResult: {
        type: 'result',
        subtype: 'success',
      } as never,
      suggestionState,
      now: () => 123,
    })

    expect(emitted).toEqual([
      {
        type: 'result',
        subtype: 'success',
      },
      {
        type: 'prompt_suggestion',
        suggestion: 'next prompt',
        uuid: 'suggestion-uuid',
        session_id: 'session-1',
      },
    ])
    expect(result).toBeNull()
    expect(suggestionState.lastEmitted).toEqual({
      text: 'next prompt',
      promptId: 'followup',
      generationRequestId: 'req-1',
      emittedAt: 123,
    })
    expect(suggestionState.pendingSuggestion).toBeNull()
    expect(suggestionState.pendingLastEmittedEntry).toBeNull()
  })
})

describe('createFilesPersistedMessage', () => {
  test('builds the files_persisted system message', () => {
    const message = createFilesPersistedMessage({
      result: {
        persistedFiles: [{ filename: 'a.ts', file_id: 'file-1' }],
        failedFiles: [{ filename: 'b.ts', error: 'denied' }],
      },
      sessionId: 'session-1',
      processedAt: () => '2026-04-23T00:00:00.000Z',
    })

    expect(message).toMatchObject({
      type: 'system',
      subtype: 'files_persisted',
      files: [{ filename: 'a.ts', file_id: 'file-1' }],
      failed: [{ filename: 'b.ts', error: 'denied' }],
      processed_at: '2026-04-23T00:00:00.000Z',
      session_id: 'session-1',
    })
  })
})
