import type {
  KernelTurnInputContract,
  KernelTurnSnapshot,
  KernelTurnState,
  KernelTurnId,
} from '../../contracts/turn.js'
import type { KernelConversationId } from '../../contracts/conversation.js'

type RuntimeTurnClock = () => string

const activeTurnStates = new Set<KernelTurnState>([
  'starting',
  'running',
  'aborting',
])

function nowIso(): string {
  return new Date().toISOString()
}

export type RuntimeTurnControllerOptions = {
  conversationId: KernelConversationId
  turnId: KernelTurnId
  input?: KernelTurnInputContract
  initialSnapshot?: KernelTurnSnapshot
  now?: RuntimeTurnClock
}

export class RuntimeTurnStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuntimeTurnStateError'
  }
}

export class RuntimeTurnController {
  private readonly now: RuntimeTurnClock
  private currentState: KernelTurnState = 'idle'
  private startedAt: string | undefined
  private completedAt: string | undefined
  private stopReason: string | null | undefined
  private error: unknown
  private input: KernelTurnInputContract | undefined

  constructor(private readonly options: RuntimeTurnControllerOptions) {
    this.now = options.now ?? nowIso
    this.input = options.input
    if (options.initialSnapshot) {
      this.hydrate(options.initialSnapshot)
    }
  }

  get conversationId(): KernelConversationId {
    return this.options.conversationId
  }

  get id(): KernelTurnId {
    return this.options.turnId
  }

  get state(): KernelTurnState {
    return this.currentState
  }

  get isActive(): boolean {
    return activeTurnStates.has(this.currentState)
  }

  start(): KernelTurnSnapshot {
    if (this.currentState !== 'idle') {
      throw new RuntimeTurnStateError(
        `Cannot start turn ${this.id} from state ${this.currentState}`,
      )
    }

    this.currentState = 'running'
    this.startedAt = this.now()
    this.completedAt = undefined
    this.stopReason = undefined
    this.error = undefined
    return this.snapshot()
  }

  requestAbort(reason = 'aborted'): KernelTurnSnapshot {
    if (this.currentState === 'idle') {
      this.stopReason = 'not_started'
      return this.snapshot()
    }

    if (this.currentState === 'starting' || this.currentState === 'running') {
      this.currentState = 'aborting'
      this.stopReason = reason
      return this.snapshot()
    }

    if (this.currentState === 'aborting') {
      return this.snapshot()
    }

    return this.snapshot()
  }

  complete(stopReason: string | null = null): KernelTurnSnapshot {
    if (!this.isActive) {
      if (this.currentState === 'completed') {
        return this.snapshot()
      }
      throw new RuntimeTurnStateError(
        `Cannot complete turn ${this.id} from state ${this.currentState}`,
      )
    }

    this.currentState = 'completed'
    this.completedAt = this.completedAt ?? this.now()
    this.stopReason = this.stopReason ?? stopReason
    return this.snapshot()
  }

  fail(error: unknown): KernelTurnSnapshot {
    if (!this.isActive) {
      if (this.currentState === 'failed') {
        return this.snapshot()
      }
      throw new RuntimeTurnStateError(
        `Cannot fail turn ${this.id} from state ${this.currentState}`,
      )
    }

    this.currentState = 'failed'
    this.completedAt = this.completedAt ?? this.now()
    this.error = error
    return this.snapshot()
  }

  dispose(reason = 'disposed'): KernelTurnSnapshot {
    if (this.currentState === 'disposed') {
      return this.snapshot()
    }

    this.currentState = 'disposed'
    this.completedAt = this.completedAt ?? this.now()
    this.stopReason = this.stopReason ?? reason
    return this.snapshot()
  }

  snapshot(): KernelTurnSnapshot {
    return {
      conversationId: this.conversationId,
      turnId: this.id,
      state: this.currentState,
      input: this.input,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      stopReason: this.stopReason,
      error: this.error,
    }
  }

  private hydrate(snapshot: KernelTurnSnapshot): void {
    if (
      snapshot.conversationId !== this.conversationId ||
      snapshot.turnId !== this.id
    ) {
      throw new RuntimeTurnStateError(
        `Cannot hydrate turn ${this.id} from snapshot ${snapshot.conversationId}:${snapshot.turnId}`,
      )
    }

    this.currentState = snapshot.state
    this.startedAt = snapshot.startedAt
    this.completedAt = snapshot.completedAt
    this.stopReason = snapshot.stopReason
    this.error = snapshot.error
    this.input = snapshot.input
  }
}
