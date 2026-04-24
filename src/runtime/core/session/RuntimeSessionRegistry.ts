import {
  createServerSessionIndexStore,
} from '../../capabilities/persistence/ServerSessionIndexStore.js'
import type {
  IndexedRuntimeSession,
  RuntimeSessionIndexStore,
} from '../../contracts/session.js'

export class RuntimeSessionRegistry<TSession extends IndexedRuntimeSession> {
  private readonly sessions = new Map<string, TSession>()

  constructor(
    private readonly indexStore: RuntimeSessionIndexStore =
      createServerSessionIndexStore(),
  ) {}

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  get(sessionId: string): TSession | null {
    return this.sessions.get(sessionId) ?? null
  }

  values(): IterableIterator<TSession> {
    return this.sessions.values()
  }

  liveCount(): number {
    return [...this.sessions.values()].filter(session => session.isLive).length
  }

  async add(session: TSession): Promise<void> {
    this.sessions.set(session.id, session)
    await this.indexStore.upsert(session.id, session.toIndexEntry())
  }

  sync(session: TSession): void {
    void this.indexStore.upsert(session.id, session.toIndexEntry())
  }

  async remove(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
    await this.indexStore.remove(sessionId)
  }

  clear(): void {
    this.sessions.clear()
  }
}
