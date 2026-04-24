import { createInterface } from 'readline'
import {
  createSessionPersistenceOwner,
  type RuntimeSessionPersistenceOwner,
} from '../persistence/SessionPersistenceOwner.js'
import type {
  RuntimeManagedSession,
  SessionLogger,
  SessionLifecycleFactory,
  SessionRuntimeHandle,
  SessionRuntimeSink,
} from './contracts.js'
import type { SessionInfo, SessionState } from '../../../server/types.js'
import type { RuntimeSessionIndexEntry } from '../../contracts/session.js'

const MAX_BACKLOG_LINES = 500

export class RuntimeDirectConnectSession implements RuntimeManagedSession {
  readonly persistenceOwner: RuntimeSessionPersistenceOwner
  readonly info: SessionInfo
  readonly closed: Promise<void>

  private readonly backlog: string[] = []
  private readonly sinks = new Set<SessionRuntimeSink>()
  private readonly createdAt = Date.now()

  private lastActiveAt = Date.now()
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private closeResolver!: () => void

  constructor(
    private readonly runtime: SessionRuntimeHandle,
    private readonly logger: SessionLogger,
    private readonly idleTimeoutMs: number,
    private readonly onStopped: (session: RuntimeManagedSession) => void,
  ) {
    this.persistenceOwner = createSessionPersistenceOwner(runtime.sessionId)
    this.info = {
      id: runtime.sessionId,
      status: 'starting',
      createdAt: this.createdAt,
      workDir: runtime.workDir,
      process: runtime.process,
    }
    this.closed = new Promise<void>(resolve => {
      this.closeResolver = resolve
    })

    this.installProcessListeners()
    this.setStatus('running')
  }

  get id(): string {
    return this.info.id
  }

  get status(): SessionState {
    return this.info.status
  }

  get workDir(): string {
    return this.info.workDir
  }

  get isLive(): boolean {
    return this.info.status !== 'stopped' && this.info.status !== 'stopping'
  }

  attachSink(sink: SessionRuntimeSink): void {
    this.clearIdleTimer()
    this.touch()
    this.sinks.add(sink)
    if (this.info.status === 'detached') {
      this.setStatus('running')
    }

    for (const line of this.backlog) {
      sink.send(line)
    }
  }

  detachSink(sink: SessionRuntimeSink): void {
    this.sinks.delete(sink)
    this.touch()

    if (this.sinks.size === 0 && this.isLive) {
      this.setStatus('detached')
      this.startIdleTimer()
    }
  }

  handleInput(rawMessage: string): boolean {
    if (!this.isLive) {
      return false
    }

    this.touch()
    if (this.info.status === 'detached') {
      this.clearIdleTimer()
      this.setStatus('running')
    }

    return this.runtime.writeLine(rawMessage)
  }

  attachClient(socket: SessionRuntimeSink): void {
    this.attachSink(socket)
  }

  detachClient(socket: SessionRuntimeSink): void {
    this.detachSink(socket)
  }

  handleClientMessage(rawMessage: string): boolean {
    return this.handleInput(rawMessage)
  }

  async stopAndWait(force = false): Promise<void> {
    if (!this.isLive) {
      await this.closed
      return
    }

    this.clearIdleTimer()
    this.setStatus('stopping')
    if (force) {
      this.runtime.forceKill()
    } else {
      this.runtime.terminate()
    }
    await this.closed
  }

  toIndexEntry(): RuntimeSessionIndexEntry {
    return {
      sessionId: this.id,
      transcriptSessionId: this.id,
      cwd: this.workDir,
      createdAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
    }
  }

  private installProcessListeners(): void {
    const stdout = createInterface({ input: this.runtime.stdout })
    stdout.on('line', line => {
      this.touch()
      this.pushBacklog(line)

      for (const sink of this.sinks) {
        sink.send(line)
      }
    })

    const stderr = createInterface({ input: this.runtime.stderr })
    stderr.on('line', line => {
      this.logger.debug('Direct-connect child stderr', {
        sessionId: this.id,
        line,
      })
    })

    this.runtime.process.on('close', (code, signal) => {
      stdout.close()
      stderr.close()
      this.clearIdleTimer()
      this.info.process = null
      this.setStatus('stopped')
      for (const sink of this.sinks) {
        sink.close(1000, 'Session ended')
      }
      this.sinks.clear()
      this.logger.info('Direct-connect session stopped', {
        sessionId: this.id,
        code,
        signal,
      })
      this.closeResolver()
      this.onStopped(this)
    })
  }

  private setStatus(status: SessionState): void {
    this.info.status = status
  }

  private touch(): void {
    this.lastActiveAt = Date.now()
  }

  private pushBacklog(line: string): void {
    if (this.backlog.length >= MAX_BACKLOG_LINES) {
      this.backlog.shift()
    }
    this.backlog.push(line)
  }

  private startIdleTimer(): void {
    if (this.idleTimeoutMs <= 0 || this.idleTimer !== null) {
      return
    }

    this.idleTimer = setTimeout(() => {
      this.logger.info('Direct-connect session idle timeout reached', {
        sessionId: this.id,
        idleTimeoutMs: this.idleTimeoutMs,
      })
      void this.stopAndWait()
    }, this.idleTimeoutMs)
    this.idleTimer.unref?.()
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }
}

export const createRuntimeDirectConnectSession: SessionLifecycleFactory = ({
  runtime,
  logger,
  idleTimeoutMs,
  onStopped,
}) => new RuntimeDirectConnectSession(runtime, logger, idleTimeoutMs, onStopped)
