import { randomUUID } from 'crypto'
import { AgentEventBus } from './AgentEventBus.js'
import { AgentTurn } from './AgentTurn.js'
import type {
  AgentEvent,
  AgentEventListener,
  AgentEventPayload,
  AgentEventReplayOptions,
  AgentInput,
  AgentSessionOptions,
  AgentTurnExecutor,
} from './types.js'

export class AgentSession {
  readonly id: string
  readonly cwd: string
  private readonly events: AgentEventBus
  private readonly executor?: AgentTurnExecutor
  private currentTurn: AgentTurn | undefined

  constructor(options: AgentSessionOptions) {
    this.id = options.id ?? randomUUID()
    this.cwd = options.cwd
    this.executor = options.executor
    this.events = new AgentEventBus({ sessionId: this.id })
    this.events.publish({
      type: 'session.started',
      sessionId: this.id,
      cwd: this.cwd,
    })
  }

  publish(event: AgentEventPayload): AgentEvent {
    return this.events.publish(event)
  }

  subscribe(listener: AgentEventListener): () => void {
    return this.events.subscribe(listener)
  }

  replayEvents(options?: AgentEventReplayOptions): AgentEvent[] {
    return this.events.replay(options)
  }

  async *stream(input: AgentInput): AsyncGenerator<AgentEvent, void, unknown> {
    const turn = new AgentTurn({
      sessionId: this.id,
      cwd: this.cwd,
      input,
      executor: this.executor,
      publish: event => this.publish(event),
    })
    this.currentTurn = turn
    try {
      yield* turn.stream()
    } finally {
      if (this.currentTurn === turn) {
        this.currentTurn = undefined
      }
    }
  }

  cancel(reason = 'cancelled'): void {
    this.currentTurn?.cancel(reason)
  }
}
