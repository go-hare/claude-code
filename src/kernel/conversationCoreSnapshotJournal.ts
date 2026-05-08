import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { KernelConversationSnapshot } from '../runtime/contracts/conversation.js'
import type { KernelTurnSnapshot } from '../runtime/contracts/turn.js'
import type { ConversationCoreRunTurnRequest } from './conversationCoreService.js'

export type ConversationCoreRecoverySnapshot = {
  conversation: KernelConversationSnapshot
  activeTurn?: KernelTurnSnapshot
  activeExecution?: ConversationCoreRunTurnRequest
}

export type ConversationCoreSnapshotStore = {
  readLatest(
    conversationId: string,
  ): Promise<ConversationCoreRecoverySnapshot | undefined>
  append(snapshot: ConversationCoreRecoverySnapshot): Promise<void>
}

export function readConversationCoreSnapshotJournal(
  journalPath: string,
): ConversationCoreSnapshotStore {
  return {
    async readLatest(conversationId) {
      let contents: string
      try {
        contents = await readFile(journalPath, 'utf8')
      } catch (error) {
        if (isMissingFile(error)) {
          return undefined
        }
        throw error
      }
      const lines = contents.split(/\r?\n/)
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index]?.trim()
        if (!line) {
          continue
        }
        try {
          const parsed = JSON.parse(line) as unknown
          if (
            isRecoverySnapshot(parsed) &&
            parsed.conversation.conversationId === conversationId
          ) {
            return parsed
          }
        } catch {}
      }
      return undefined
    },
    async append(snapshot) {
      await mkdir(dirname(journalPath), { recursive: true })
      await appendFile(
        journalPath,
        `${JSON.stringify(dropUndefined(snapshot))}\n`,
        'utf8',
      )
    },
  }
}

function isRecoverySnapshot(
  value: unknown,
): value is ConversationCoreRecoverySnapshot {
  if (!isRecord(value) || !isRecord(value.conversation)) {
    return false
  }
  const conversation = value.conversation
  return (
    typeof conversation.runtimeId === 'string' &&
    typeof conversation.conversationId === 'string' &&
    typeof conversation.workspacePath === 'string' &&
    typeof conversation.state === 'string' &&
    typeof conversation.createdAt === 'string' &&
    typeof conversation.updatedAt === 'string'
  )
}

function isMissingFile(error: unknown): boolean {
  return (
    isRecord(error) &&
    typeof error.code === 'string' &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function dropUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter(item => item !== undefined)
      .map(item => dropUndefined(item)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, dropUndefined(item)]),
    ) as T
  }
  return value
}
