import { appendFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  RuntimeConversationSnapshotJournal,
  type RuntimeConversationSnapshotJournalEntry,
} from '../RuntimeConversationSnapshotJournal.js'

function createConversationSnapshot(
  overrides: Partial<
    RuntimeConversationSnapshotJournalEntry['conversation']
  > = {},
): RuntimeConversationSnapshotJournalEntry['conversation'] {
  return {
    runtimeId: 'runtime-1',
    conversationId: 'conversation-1',
    workspacePath: '/tmp/workspace',
    state: 'ready',
    createdAt: '2026-04-26T00:00:00.000Z',
    updatedAt: '2026-04-26T00:00:00.000Z',
    ...overrides,
  }
}

function createTurnSnapshot(
  overrides: Partial<
    NonNullable<RuntimeConversationSnapshotJournalEntry['activeTurn']>
  > = {},
): NonNullable<RuntimeConversationSnapshotJournalEntry['activeTurn']> {
  return {
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    state: 'running',
    startedAt: '2026-04-26T00:00:01.000Z',
    ...overrides,
  }
}

function createActiveExecutionRequest(
  overrides: Partial<
    NonNullable<RuntimeConversationSnapshotJournalEntry['activeExecution']>
  > = {},
): NonNullable<RuntimeConversationSnapshotJournalEntry['activeExecution']> {
  return {
    requestId: 'run-1',
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    prompt: 'hello',
    ...overrides,
  }
}

async function createJournalPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'runtime-conversation-journal-'))
  return join(dir, 'conversation.ndjson')
}

async function removeJournalDir(path: string): Promise<void> {
  await rm(join(path, '..'), { force: true, recursive: true })
}

describe('RuntimeConversationSnapshotJournal', () => {
  test('appends entries and reads the latest snapshot', async () => {
    const journalPath = await createJournalPath()
    const journal = new RuntimeConversationSnapshotJournal(journalPath)
    const runningEntry: RuntimeConversationSnapshotJournalEntry = {
      conversation: createConversationSnapshot({
        state: 'running',
        activeTurnId: 'turn-1',
        updatedAt: '2026-04-26T00:00:01.000Z',
      }),
      activeTurn: createTurnSnapshot(),
    }
    const readyEntry: RuntimeConversationSnapshotJournalEntry = {
      conversation: createConversationSnapshot({
        state: 'ready',
        activeTurnId: undefined,
        updatedAt: '2026-04-26T00:00:02.000Z',
      }),
    }

    try {
      await journal.append(runningEntry)
      await journal.append(readyEntry)

      expect(await journal.readLatest()).toEqual(readyEntry)
    } finally {
      await removeJournalDir(journalPath)
    }
  })

  test('ignores malformed trailing lines and keeps the latest valid snapshot', async () => {
    const journalPath = await createJournalPath()
    const journal = new RuntimeConversationSnapshotJournal(journalPath)
    const entry: RuntimeConversationSnapshotJournalEntry = {
      conversation: createConversationSnapshot({
        state: 'running',
        activeTurnId: 'turn-1',
        updatedAt: '2026-04-26T00:00:03.000Z',
      }),
      activeTurn: createTurnSnapshot({
        state: 'aborting',
      }),
    }

    try {
      await journal.append(entry)
      await appendFile(journalPath, '{"broken":\n', 'utf8')

      expect(await journal.readLatest()).toEqual(entry)
    } finally {
      await removeJournalDir(journalPath)
    }
  })

  test('reads the latest snapshot for a specific conversation', async () => {
    const journalPath = await createJournalPath()
    const journal = new RuntimeConversationSnapshotJournal(journalPath)
    const firstEntry: RuntimeConversationSnapshotJournalEntry = {
      conversation: createConversationSnapshot({
        state: 'running',
        activeTurnId: 'turn-1',
      }),
      activeTurn: createTurnSnapshot(),
    }
    const secondEntry: RuntimeConversationSnapshotJournalEntry = {
      conversation: createConversationSnapshot({
        conversationId: 'conversation-2',
        state: 'ready',
        updatedAt: '2026-04-26T00:00:02.000Z',
      }),
    }

    try {
      await journal.append(firstEntry)
      await journal.append(secondEntry)

      expect(await journal.readLatest('conversation-1')).toEqual(firstEntry)
      expect(await journal.readLatest('conversation-2')).toEqual(secondEntry)
      expect(await journal.readLatest('missing-conversation')).toBeUndefined()
    } finally {
      await removeJournalDir(journalPath)
    }
  })

  test('persists active execution requests for durable turn resume', async () => {
    const journalPath = await createJournalPath()
    const journal = new RuntimeConversationSnapshotJournal(journalPath)
    const entry: RuntimeConversationSnapshotJournalEntry = {
      conversation: createConversationSnapshot({
        state: 'running',
        activeTurnId: 'turn-1',
      }),
      activeTurn: createTurnSnapshot(),
      activeExecution: createActiveExecutionRequest({
        prompt: [{ type: 'text', text: 'hello' }],
        attachments: [{ type: 'file', path: '/tmp/a.txt' }],
        metadata: { reason: 'test' },
      }),
    }

    try {
      await journal.append(entry)

      expect(await journal.readLatest('conversation-1')).toEqual(entry)
    } finally {
      await removeJournalDir(journalPath)
    }
  })

  test('returns undefined when the journal file is missing', async () => {
    const journalPath = await createJournalPath()
    const journal = new RuntimeConversationSnapshotJournal(journalPath)

    try {
      await removeJournalDir(journalPath)

      expect(await journal.readLatest()).toBeUndefined()
    } finally {
      await removeJournalDir(journalPath)
    }
  })

  test('rejects non-serializable snapshot entries', async () => {
    const journalPath = await createJournalPath()
    const journal = new RuntimeConversationSnapshotJournal(journalPath)

    try {
      await expect(
        journal.append({
          conversation: createConversationSnapshot({
            metadata: {
              callback: () => 'nope',
            },
          }),
        }),
      ).rejects.toThrow(TypeError)

      expect(await journal.readLatest()).toBeUndefined()
    } finally {
      await removeJournalDir(journalPath)
    }
  })
})
