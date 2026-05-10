import { randomUUID } from 'crypto'
import type {
  AgentEvent,
  AgentEventListener,
  AgentEventPayload,
  AgentEventReplayOptions,
} from './types.js'

export type AgentEventBusOptions = {
  sessionId?: string
  now?: () => Date
  createId?: () => string
  maxBacklog?: number
}

const DEFAULT_MAX_BACKLOG = 1000

function getPayloadSessionId(payload: AgentEventPayload): string | undefined {
  return 'sessionId' in payload ? payload.sessionId : undefined
}

export class AgentEventBus {
  private sequence = 0
  private readonly events: AgentEvent[] = []
  private readonly listeners = new Set<AgentEventListener>()
  private readonly now: () => Date
  private readonly createId: () => string
  private readonly maxBacklog: number
  private readonly defaultSessionId?: string

  constructor(options: AgentEventBusOptions = {}) {
    this.defaultSessionId = options.sessionId
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? randomUUID
    this.maxBacklog = options.maxBacklog ?? DEFAULT_MAX_BACKLOG
  }

  publish(payload: AgentEventPayload): AgentEvent {
    const event = {
      ...payload,
      id: this.createId(),
      sequence: ++this.sequence,
      timestamp: this.now().toISOString(),
      sessionId: getPayloadSessionId(payload) ?? this.defaultSessionId,
    } as AgentEvent

    this.events.push(event)
    if (this.events.length > this.maxBacklog) {
      this.events.splice(0, this.events.length - this.maxBacklog)
    }

    for (const listener of this.listeners) {
      listener(event)
    }

    return event
  }

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  replay(options: AgentEventReplayOptions = {}): AgentEvent[] {
    const sinceSequence = options.sinceSequence ?? 0
    const events = this.events.filter(event => event.sequence > sinceSequence)
    if (options.limit === undefined) {
      return [...events]
    }
    return events.slice(Math.max(0, events.length - options.limit))
  }

  getLastSequence(): number {
    return this.sequence
  }
}
