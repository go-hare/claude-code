import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { KernelConversationSnapshot } from '../../contracts/conversation.js'
import type { KernelConversationId } from '../../contracts/conversation.js'
import type { KernelTurnSnapshot } from '../../contracts/turn.js'
import type { KernelRuntimeRunTurnCommand } from '../../contracts/wire.js'

type JsonPrimitive = boolean | null | number | string
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type RuntimeConversationSnapshotJournalEntry = {
  conversation: KernelConversationSnapshot
  activeTurn?: KernelTurnSnapshot
  activeExecution?: KernelRuntimeRunTurnCommand
}

export type RuntimeConversationSnapshotJournalOptions = {
  maxEntries?: number
}

const CONVERSATION_STATES = new Set([
  'created',
  'ready',
  'running',
  'aborting',
  'detached',
  'disposed',
  'failed',
])

const TURN_STATES = new Set([
  'idle',
  'starting',
  'running',
  'aborting',
  'completed',
  'failed',
  'disposed',
])

function isFsMissing(error: unknown): boolean {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : ''
  return code === 'ENOENT' || code === 'ENOTDIR'
}

function normalizeMaxEntries(maxEntries?: number): number | undefined {
  if (maxEntries === undefined) {
    return undefined
  }
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new TypeError('maxEntries must be a positive integer')
  }
  return maxEntries
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isJsonValue(
  value: unknown,
  seen: Set<object> = new Set(),
): value is JsonValue {
  if (value === null) {
    return true
  }

  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true
  }

  if (typeof value !== 'object') {
    return false
  }

  if (seen.has(value)) {
    return false
  }

  seen.add(value)

  if (Array.isArray(value)) {
    const valid = value.every(item => isJsonValue(item, seen))
    seen.delete(value)
    return valid
  }

  if (!isPlainRecord(value)) {
    seen.delete(value)
    return false
  }

  const valid = Object.values(value).every(item => isJsonValue(item, seen))
  seen.delete(value)
  return valid
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isConversationSnapshot(
  value: unknown,
): value is KernelConversationSnapshot {
  if (!isPlainRecord(value)) {
    return false
  }

  return (
    typeof value.runtimeId === 'string' &&
    typeof value.conversationId === 'string' &&
    typeof value.workspacePath === 'string' &&
    isOptionalString(value.sessionId) &&
    (value.metadata === undefined ||
      (isPlainRecord(value.metadata) && isJsonValue(value.metadata))) &&
    typeof value.state === 'string' &&
    CONVERSATION_STATES.has(value.state) &&
    isOptionalString(value.activeTurnId) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

function isTurnSnapshot(value: unknown): value is KernelTurnSnapshot {
  if (!isPlainRecord(value)) {
    return false
  }

  return (
    typeof value.conversationId === 'string' &&
    typeof value.turnId === 'string' &&
    typeof value.state === 'string' &&
    TURN_STATES.has(value.state) &&
    isOptionalString(value.startedAt) &&
    isOptionalString(value.completedAt) &&
    (value.input === undefined || isJsonValue(value.input)) &&
    (value.stopReason === undefined ||
      value.stopReason === null ||
      typeof value.stopReason === 'string') &&
    (value.error === undefined || isJsonValue(value.error))
  )
}

function isRunTurnCommand(value: unknown): value is KernelRuntimeRunTurnCommand {
  if (!isPlainRecord(value)) {
    return false
  }

  return (
    typeof value.schemaVersion === 'string' &&
    value.type === 'run_turn' &&
    typeof value.requestId === 'string' &&
    typeof value.conversationId === 'string' &&
    typeof value.turnId === 'string' &&
    (typeof value.prompt === 'string' ||
      (Array.isArray(value.prompt) && isJsonValue(value.prompt))) &&
    (value.attachments === undefined ||
      (Array.isArray(value.attachments) && isJsonValue(value.attachments))) &&
    isOptionalString(value.executionMode) &&
    (value.contextAssembly === undefined ||
      (isPlainRecord(value.contextAssembly) &&
        isJsonValue(value.contextAssembly))) &&
    (value.capabilityPlane === undefined ||
      (isPlainRecord(value.capabilityPlane) &&
        isJsonValue(value.capabilityPlane))) &&
    (value.metadata === undefined ||
      (isPlainRecord(value.metadata) && isJsonValue(value.metadata)))
  )
}

function isJournalEntry(
  value: unknown,
): value is RuntimeConversationSnapshotJournalEntry {
  if (!isPlainRecord(value) || !isConversationSnapshot(value.conversation)) {
    return false
  }

  if (value.activeTurn !== undefined && !isTurnSnapshot(value.activeTurn)) {
    return false
  }

  if (
    value.activeTurn !== undefined &&
    value.activeTurn.conversationId !== value.conversation.conversationId
  ) {
    return false
  }

  if (
    value.activeTurn !== undefined &&
    value.conversation.activeTurnId !== undefined &&
    value.conversation.activeTurnId !== value.activeTurn.turnId
  ) {
    return false
  }

  if (value.activeExecution === undefined) {
    return true
  }

  return (
    isRunTurnCommand(value.activeExecution) &&
    value.activeTurn !== undefined &&
    value.activeExecution.conversationId ===
      value.conversation.conversationId &&
    value.activeExecution.turnId === value.activeTurn.turnId &&
    value.conversation.activeTurnId === value.activeExecution.turnId
  )
}

function parseLatestJournalEntry(
  contents: string,
  conversationId?: KernelConversationId,
): RuntimeConversationSnapshotJournalEntry | undefined {
  const lines = contents.split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim()
    if (!line) {
      continue
    }
    try {
      const parsed: unknown = JSON.parse(line)
      if (
        isJournalEntry(parsed) &&
        (conversationId === undefined ||
          parsed.conversation.conversationId === conversationId)
      ) {
        return parsed
      }
    } catch {}
  }
  return undefined
}

export class RuntimeConversationSnapshotJournal {
  private readonly maxEntries?: number

  constructor(
    private readonly journalPath: string,
    options: RuntimeConversationSnapshotJournalOptions = {},
  ) {
    this.maxEntries = normalizeMaxEntries(options.maxEntries)
  }

  async append(entry: RuntimeConversationSnapshotJournalEntry): Promise<void> {
    if (!isJournalEntry(entry)) {
      throw new TypeError(
        'Conversation snapshot journal only accepts JSON-serializable snapshot entries',
      )
    }

    await mkdir(dirname(this.journalPath), { recursive: true })
    await appendFile(this.journalPath, `${JSON.stringify(entry)}\n`, 'utf8')
    await this.trimToMaxEntries()
  }

  async readLatest(
    conversationId?: KernelConversationId,
  ): Promise<RuntimeConversationSnapshotJournalEntry | undefined> {
    try {
      const contents = await readFile(this.journalPath, 'utf8')
      return parseLatestJournalEntry(contents, conversationId)
    } catch (error) {
      if (isFsMissing(error)) {
        return undefined
      }
      throw error
    }
  }

  private async trimToMaxEntries(): Promise<void> {
    if (this.maxEntries === undefined) {
      return
    }

    const contents = await readFile(this.journalPath, 'utf8')
    const lines = contents.split(/\r?\n/).filter(line => line.trim().length > 0)

    if (lines.length <= this.maxEntries) {
      return
    }

    const trimmed = `${lines.slice(-this.maxEntries).join('\n')}\n`
    await writeFile(this.journalPath, trimmed, 'utf8')
  }
}
