import { readFile } from 'fs/promises'

import { loadMessagesFromJsonlPath } from '../utils/conversationRecovery.js'
import {
  getSessionIdFromLog,
  getLastSessionLog,
} from '../utils/sessionStorage.js'
import {
  listSessionsImpl,
  type ListSessionsOptions,
  type SessionInfo,
} from '../utils/listSessionsImpl.js'

export type KernelSessionDescriptor = SessionInfo

export type KernelSessionListFilter = {
  cwd?: string
  limit?: number
  offset?: number
  includeWorktrees?: boolean
}

export type KernelTranscript = {
  sessionId?: string
  fullPath?: string
  messages: readonly unknown[]
  customTitle?: string
  summary?: string
  tag?: string
  mode?: 'coordinator' | 'normal'
  turnInterruptionState: 'none' | 'interrupted_prompt'
  taskSnapshot?: unknown
  todoSnapshot?: unknown
  nestedMemorySnapshot?: unknown
  attributionSnapshots?: readonly unknown[]
  fileHistorySnapshots?: readonly unknown[]
  contentReplacements?: readonly unknown[]
  contextCollapseCommits?: readonly unknown[]
  contextCollapseSnapshot?: unknown
}

export type KernelSessionResume = KernelTranscript

export type KernelSessionResumeContext = {
  resumeInterruptedTurn?: boolean
  resumeSessionAt?: string
  metadata?: Record<string, unknown>
}

export type KernelSessionManager = {
  list(
    filter?: KernelSessionListFilter,
  ): Promise<readonly KernelSessionDescriptor[]>
  resume(
    sessionId: string,
    context?: KernelSessionResumeContext,
  ): Promise<KernelSessionResume>
  getTranscript(sessionId: string): Promise<KernelTranscript>
}

export type KernelSessionManagerOptions = {
  listSessions?: (
    options?: ListSessionsOptions,
  ) => Promise<readonly KernelSessionDescriptor[]>
  loadTranscript?: (
    sessionId: string,
    context?: KernelSessionResumeContext,
  ) => Promise<KernelTranscript>
}

export function createKernelSessionManager(
  options: KernelSessionManagerOptions = {},
): KernelSessionManager {
  const listSessions = options.listSessions ?? defaultListSessions
  const loadTranscript = options.loadTranscript ?? defaultLoadTranscript

  return {
    list: listSessions,
    resume: (sessionId, context) => loadTranscript(sessionId, context),
    getTranscript: sessionId => loadTranscript(sessionId),
  }
}

async function defaultListSessions(
  filter: KernelSessionListFilter = {},
): Promise<readonly KernelSessionDescriptor[]> {
  return listSessionsImpl({
    dir: filter.cwd,
    limit: filter.limit,
    offset: filter.offset,
    includeWorktrees: filter.includeWorktrees,
  })
}

async function defaultLoadTranscript(
  sessionId: string,
): Promise<KernelTranscript> {
  if (sessionId.endsWith('.jsonl')) {
    const transcript = await loadMessagesFromJsonlPath(sessionId)
    const supplemental = await readJsonlSupplementalResumeState(sessionId)
    return {
      sessionId: transcript.sessionId,
      fullPath: sessionId,
      messages: transcript.messages,
      turnInterruptionState: 'none',
      ...supplemental,
    }
  }

  const log = await getLastSessionLog(sessionId as never)
  if (!log) {
    throw new Error(`Unknown session: ${sessionId}`)
  }

  return {
    sessionId: getSessionIdFromLog(log) ?? sessionId,
    fullPath: log.fullPath,
    messages: log.messages,
    customTitle: log.customTitle,
    summary: log.summary,
    tag: log.tag,
    mode: log.mode,
    turnInterruptionState: 'none',
  }
}

async function readJsonlSupplementalResumeState(
  path: string,
): Promise<Partial<KernelTranscript>> {
  const text = await readFile(path, 'utf8')
  const fileHistorySnapshots: unknown[] = []
  const attributionSnapshots: unknown[] = []
  const contentReplacements: unknown[] = []
  const contextCollapseCommits: unknown[] = []
  let contextCollapseSnapshot: unknown
  let todoSnapshot: unknown
  const nestedMemoryPaths: string[] = []

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    let entry: unknown
    try {
      entry = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (!isRecord(entry)) {
      continue
    }
    switch (entry.type) {
      case 'file-history-snapshot':
        if (entry.snapshot !== undefined) {
          fileHistorySnapshots.push(entry.snapshot)
        }
        break
      case 'attribution-snapshot':
        attributionSnapshots.push(entry)
        break
      case 'content-replacement':
        if (Array.isArray(entry.replacements)) {
          contentReplacements.push(...entry.replacements)
        }
        break
      case 'marble-origami-commit':
        contextCollapseCommits.push(entry)
        break
      case 'marble-origami-snapshot':
        contextCollapseSnapshot = entry
        break
      case 'attachment':
        {
          const attachment = isRecord(entry.attachment)
            ? entry.attachment
            : undefined
          if (
            attachment?.type === 'nested_memory' &&
            typeof attachment.path === 'string'
          ) {
            nestedMemoryPaths.push(attachment.path)
          }
        }
        break
      case 'assistant':
        todoSnapshot = extractTodoSnapshot(entry) ?? todoSnapshot
        break
    }
  }

  return dropUndefined({
    fileHistorySnapshots:
      fileHistorySnapshots.length > 0 ? fileHistorySnapshots : undefined,
    attributionSnapshots:
      attributionSnapshots.length > 0 ? attributionSnapshots : undefined,
    contentReplacements:
      contentReplacements.length > 0 ? contentReplacements : undefined,
    contextCollapseCommits:
      contextCollapseCommits.length > 0 ? contextCollapseCommits : undefined,
    contextCollapseSnapshot,
    todoSnapshot,
    nestedMemorySnapshot:
      nestedMemoryPaths.length > 0 ? { paths: nestedMemoryPaths } : undefined,
  })
}

function extractTodoSnapshot(entry: Record<string, unknown>): unknown {
  const message = isRecord(entry.message) ? entry.message : undefined
  const content = message?.content
  if (!Array.isArray(content)) {
    return undefined
  }
  for (const block of content) {
    if (!isRecord(block) || block.type !== 'tool_use' || block.name !== 'TodoWrite') {
      continue
    }
    const input = isRecord(block.input) ? block.input : undefined
    if (Array.isArray(input?.todos)) {
      return {
        sourceMessageUuid:
          typeof entry.uuid === 'string' ? entry.uuid : undefined,
        todos: input.todos,
      }
    }
  }
  return undefined
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
