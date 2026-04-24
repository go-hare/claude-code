import type { ChildProcess } from 'child_process'
import type {
  AttachableRuntimeSession,
  IndexedRuntimeSession,
  RuntimeSessionLifecycle,
  RuntimeSessionSink,
} from '../../contracts/session.js'

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

export interface SessionRuntimeSink extends RuntimeSessionSink<string> {
  close(code?: number, reason?: string): unknown
}

export interface RuntimeManagedSession
  extends IndexedRuntimeSession,
    RuntimeSessionLifecycle,
    AttachableRuntimeSession<SessionRuntimeSink> {
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
