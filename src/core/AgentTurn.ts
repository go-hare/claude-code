import { randomUUID } from 'crypto'
import type {
  AgentEvent,
  AgentEventPayload,
  AgentInput,
  AgentTurnExecutor,
} from './types.js'

export type AgentTurnOptions = {
  sessionId: string
  cwd: string
  input: AgentInput
  executor?: AgentTurnExecutor
  publish: (event: AgentEventPayload) => AgentEvent
  turnId?: string
}

export class AgentTurn {
  readonly id: string
  readonly sessionId: string
  readonly cwd: string
  readonly input: AgentInput

  private readonly executor?: AgentTurnExecutor
  private readonly publish: (event: AgentEventPayload) => AgentEvent
  private abortController: AbortController | undefined

  constructor(options: AgentTurnOptions) {
    this.id = options.turnId ?? randomUUID()
    this.sessionId = options.sessionId
    this.cwd = options.cwd
    this.input = options.input
    this.executor = options.executor
    this.publish = options.publish
  }

  cancel(reason = 'cancelled'): void {
    this.abortController?.abort(reason)
  }

  async *stream(): AsyncGenerator<AgentEvent, void, unknown> {
    this.abortController = new AbortController()
    yield this.publish({
      type: 'turn.started',
      sessionId: this.sessionId,
      turnId: this.id,
      input: this.input,
    })

    if (!this.executor) {
      yield this.publish({
        type: 'turn.failed',
        sessionId: this.sessionId,
        turnId: this.id,
        error: {
          message: 'AgentTurn executor is not configured',
          code: 'AGENT_CORE_EXECUTOR_MISSING',
        },
      })
      return
    }

    try {
      for await (const event of this.executor(this.input, {
        sessionId: this.sessionId,
        turnId: this.id,
        cwd: this.cwd,
      })) {
        if (this.abortController.signal.aborted) {
          yield this.publish({
            type: 'turn.cancelled',
            sessionId: this.sessionId,
            turnId: this.id,
            reason: String(this.abortController.signal.reason ?? 'cancelled'),
          })
          return
        }
        yield this.publish(event)
      }
    } catch (error) {
      yield this.publish({
        type: 'turn.failed',
        sessionId: this.sessionId,
        turnId: this.id,
        error: {
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        },
      })
    } finally {
      this.abortController = undefined
    }
  }
}
