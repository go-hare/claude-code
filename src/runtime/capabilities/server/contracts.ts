import type { ChildProcess } from 'child_process'
import type { RuntimeSessionIndexEntry } from '../persistence/ServerSessionIndexStore.js'
import type { RuntimeSessionLifecycle } from '../../contracts/session.js'

export interface SessionRuntimeHandle {
  sessionId: string
  workDir: string
  process: ChildProcess
  stdout: NonNullable<ChildProcess['stdout']>
  stderr: NonNullable<ChildProcess['stderr']>
  writeLine(data: string): boolean
  terminate(): void
  forceKill(): void
}

export interface SessionRuntimeSink {
  send(data: string): unknown
  close(code?: number, reason?: string): unknown
}

export interface IndexedRuntimeSession {
  id: string
  isLive: boolean
  toIndexEntry(): RuntimeSessionIndexEntry
}

export interface RuntimeManagedSession
  extends IndexedRuntimeSession,
    RuntimeSessionLifecycle {
  attachSink(sink: SessionRuntimeSink): void
  detachSink(sink: SessionRuntimeSink): void
  handleInput(rawMessage: string): boolean
}

export type SessionLifecycleFactory = (options: {
  runtime: SessionRuntimeHandle
  logger: SessionLogger
  idleTimeoutMs: number
  onStopped: (session: RuntimeManagedSession) => void
}) => RuntimeManagedSession

export interface SessionRuntimeBackend {
  createSessionRuntime(options: {
    cwd: string
    sessionId: string
    dangerouslySkipPermissions?: boolean
  }): SessionRuntimeHandle
}

export interface SessionLogger {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  error(message: string, meta?: unknown): void
}

export const noopSessionLogger: SessionLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}
