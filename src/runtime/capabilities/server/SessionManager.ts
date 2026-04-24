import { randomUUID } from 'crypto'
import { resolve } from 'path'
import { createRuntimeDirectConnectSession } from './RuntimeDirectConnectSession.js'
import {
  noopSessionLogger,
  type RuntimeManagedSession,
  type SessionLifecycleFactory,
  type SessionLogger,
  type SessionRuntimeBackend,
  type SessionRuntimeSink,
} from './contracts.js'
import { RuntimeSessionRegistry } from '../../core/session/RuntimeSessionRegistry.js'

type SessionManagerOptions = {
  idleTimeoutMs?: number
  maxSessions?: number
  logger?: SessionLogger
  createManagedSession?: SessionLifecycleFactory
  registry?: RuntimeSessionRegistry<RuntimeManagedSession>
}

type CreateSessionOptions = {
  cwd: string
  dangerouslySkipPermissions?: boolean
}

export class SessionManager {
  private readonly registry: RuntimeSessionRegistry<RuntimeManagedSession>
  private readonly idleTimeoutMs: number
  private readonly maxSessions: number
  private readonly logger?: SessionLogger
  private readonly createManagedSession: SessionLifecycleFactory

  constructor(
    private readonly backend: SessionRuntimeBackend,
    options: SessionManagerOptions = {},
  ) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? 0
    this.maxSessions = options.maxSessions ?? 0
    this.logger = options.logger
    this.registry =
      options.registry ?? new RuntimeSessionRegistry<RuntimeManagedSession>()
    this.createManagedSession =
      options.createManagedSession ?? createRuntimeDirectConnectSession
  }

  hasSession(sessionId: string): boolean {
    return this.registry.has(sessionId)
  }

  getSession(sessionId: string): RuntimeManagedSession | null {
    return this.registry.get(sessionId)
  }

  async createSession({
    cwd,
    dangerouslySkipPermissions,
  }: CreateSessionOptions): Promise<{ sessionId: string; workDir: string }> {
    if (this.maxSessions > 0 && this.registry.liveCount() >= this.maxSessions) {
      throw new Error(
        `Maximum concurrent sessions reached (${this.maxSessions})`,
      )
    }

    const workDir = resolve(cwd)
    const sessionId = randomUUID()
    const runtime = this.backend.createSessionRuntime({
      cwd: workDir,
      sessionId,
      dangerouslySkipPermissions,
    })
    const session = this.createManagedSession({
      runtime,
      logger: this.logger ?? noopSessionLogger,
      idleTimeoutMs: this.idleTimeoutMs,
      onStopped: endedSession => {
        void this.registry.remove(endedSession.id)
      },
    })
    await this.registry.add(session)

    return { sessionId, workDir }
  }

  attachClient(
    sessionId: string,
    socket: SessionRuntimeSink,
  ): RuntimeManagedSession | null {
    return this.attachSink(sessionId, socket)
  }

  attachSink(
    sessionId: string,
    sink: SessionRuntimeSink,
  ): RuntimeManagedSession | null {
    const session = this.registry.get(sessionId)
    session?.attachSink(sink)
    if (session) {
      this.registry.sync(session)
    }
    return session
  }

  detachClient(sessionId: string, socket: SessionRuntimeSink): void {
    this.detachSink(sessionId, socket)
  }

  detachSink(sessionId: string, sink: SessionRuntimeSink): void {
    const session = this.registry.get(sessionId)
    if (!session) {
      return
    }

    session.detachSink(sink)
    this.registry.sync(session)
  }

  handleClientMessage(sessionId: string, rawMessage: string): boolean {
    return this.handleSessionInput(sessionId, rawMessage)
  }

  handleSessionInput(sessionId: string, rawMessage: string): boolean {
    const session = this.registry.get(sessionId)
    if (!session) {
      return false
    }

    const handled = session.handleInput(rawMessage)
    if (handled) {
      this.registry.sync(session)
    }
    return handled
  }

  async destroyAll(): Promise<void> {
    await Promise.allSettled(
      [...this.registry.values()].map(session => session.stopAndWait(true)),
    )
    this.registry.clear()
  }
}
