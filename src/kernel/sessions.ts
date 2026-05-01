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

export type KernelSessionManager = {
  list(
    filter?: KernelSessionListFilter,
  ): Promise<readonly KernelSessionDescriptor[]>
  resume(sessionId: string): Promise<KernelSessionResume>
  getTranscript(sessionId: string): Promise<KernelTranscript>
}

export type KernelSessionManagerOptions = {
  listSessions?: (
    options?: ListSessionsOptions,
  ) => Promise<readonly KernelSessionDescriptor[]>
  loadTranscript?: (sessionId: string) => Promise<KernelTranscript>
}

export function createKernelSessionManager(
  options: KernelSessionManagerOptions = {},
): KernelSessionManager {
  const listSessions = options.listSessions ?? defaultListSessions
  const loadTranscript = options.loadTranscript ?? defaultLoadTranscript

  return {
    list: listSessions,
    resume: loadTranscript,
    getTranscript: loadTranscript,
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
    return {
      sessionId: transcript.sessionId,
      fullPath: sessionId,
      messages: transcript.messages,
      turnInterruptionState: 'none',
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
