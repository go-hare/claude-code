import type { AgentCoreOptions, AgentSessionOptions } from './types.js'
import { AgentSession } from './AgentSession.js'

export class AgentCore {
  private readonly cwd: string
  private readonly executor: AgentCoreOptions['executor']
  private readonly sessions = new Map<string, AgentSession>()

  constructor(options: AgentCoreOptions) {
    this.cwd = options.cwd
    this.executor = options.executor
  }

  createSession(options: Partial<AgentSessionOptions> = {}): AgentSession {
    const session = new AgentSession({
      cwd: options.cwd ?? this.cwd,
      id: options.id,
      executor: options.executor ?? this.executor,
    })
    this.sessions.set(session.id, session)
    return session
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId)
  }

  dispose(): void {
    this.sessions.clear()
  }
}
