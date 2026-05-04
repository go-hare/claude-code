import type {
  KernelConversationId,
  KernelConversationSnapshot,
  KernelConversationState,
  KernelConversationScope,
} from '../../contracts/conversation.js'
import type { KernelRuntimeCapabilityIntent } from '../../contracts/capability.js'
import type { RuntimeProviderSelection } from '../../contracts/provider.js'
import type {
  KernelTurnAbortRequest,
  KernelTurnId,
  KernelTurnInputContract,
  KernelTurnRunRequest,
  KernelTurnSnapshot,
} from '../../contracts/turn.js'
import {
  RuntimeTurnController,
  type RuntimeTurnControllerOptions,
} from '../turn/RuntimeTurnController.js'

type RuntimeConversationClock = () => string

function nowIso(): string {
  return new Date().toISOString()
}

export type RuntimeConversationOptions = KernelConversationScope & {
  initialSnapshot?: KernelConversationSnapshot
  initialActiveTurnSnapshot?: KernelTurnSnapshot
  now?: RuntimeConversationClock
  createTurn?: (options: RuntimeTurnControllerOptions) => RuntimeTurnController
}

export class RuntimeConversationBusyError extends Error {
  constructor(
    readonly conversationId: KernelConversationId,
    readonly activeTurnId: KernelTurnId,
  ) {
    super(
      `Conversation ${conversationId} already has active turn ${activeTurnId}`,
    )
    this.name = 'RuntimeConversationBusyError'
  }
}

export class RuntimeConversationDisposedError extends Error {
  constructor(readonly conversationId: KernelConversationId) {
    super(`Conversation ${conversationId} has been disposed`)
    this.name = 'RuntimeConversationDisposedError'
  }
}

export class RuntimeConversationScopeError extends Error {
  constructor(
    readonly conversationId: KernelConversationId,
    readonly requestedConversationId: KernelConversationId,
  ) {
    super(
      `Turn request for ${requestedConversationId} cannot run in conversation ${conversationId}`,
    )
    this.name = 'RuntimeConversationScopeError'
  }
}

export class RuntimeConversation {
  private readonly now: RuntimeConversationClock
  private readonly createdAt: string
  private readonly capabilityIntent: KernelRuntimeCapabilityIntent | undefined
  private readonly provider: RuntimeProviderSelection | undefined
  private readonly turns = new Map<KernelTurnId, RuntimeTurnController>()
  private currentState: KernelConversationState = 'ready'
  private updatedAt: string
  private activeTurn: RuntimeTurnController | null = null

  constructor(private readonly options: RuntimeConversationOptions) {
    this.now = options.now ?? nowIso
    this.capabilityIntent =
      options.capabilityIntent ?? options.initialSnapshot?.capabilityIntent
    this.provider = options.provider ?? options.initialSnapshot?.provider
    if (options.initialSnapshot) {
      this.assertSnapshotScope(options.initialSnapshot)
      this.createdAt = options.initialSnapshot.createdAt
      this.updatedAt = options.initialSnapshot.updatedAt
      this.currentState = options.initialSnapshot.state
      this.hydrateActiveTurn(
        options.initialSnapshot,
        options.initialActiveTurnSnapshot,
      )
    } else {
      this.createdAt = this.now()
      this.updatedAt = this.createdAt
    }
  }

  get id(): KernelConversationId {
    return this.options.conversationId
  }

  get state(): KernelConversationState {
    return this.currentState
  }

  get activeTurnId(): KernelTurnId | undefined {
    return this.activeTurn?.id
  }

  startTurn(request: KernelTurnRunRequest): RuntimeTurnController {
    this.assertLive()
    this.assertConversationScope(request.conversationId)

    if (this.activeTurn?.isActive) {
      if (this.activeTurn.id === request.turnId) {
        return this.activeTurn
      }
      throw new RuntimeConversationBusyError(this.id, this.activeTurn.id)
    }

    const existing = this.turns.get(request.turnId)
    if (existing) {
      return existing
    }

    const turn = this.createTurn(
      request.turnId,
      undefined,
      createTurnInputContract(request),
    )
    turn.start()
    this.turns.set(turn.id, turn)
    this.activeTurn = turn
    this.currentState = 'running'
    this.touch()
    return turn
  }

  abortTurn(request: KernelTurnAbortRequest): KernelTurnSnapshot {
    this.assertLive()
    this.assertConversationScope(request.conversationId)

    if (!this.activeTurn || this.activeTurn.id !== request.turnId) {
      const knownTurn = this.turns.get(request.turnId)
      if (knownTurn) {
        return knownTurn.snapshot()
      }
      return {
        conversationId: request.conversationId,
        turnId: request.turnId,
        state: 'idle',
        stopReason: 'not_started',
      }
    }

    this.currentState = 'aborting'
    this.touch()
    return this.activeTurn.requestAbort(request.reason)
  }

  completeActiveTurn(
    turnId: KernelTurnId,
    stopReason: string | null = null,
  ): KernelTurnSnapshot {
    const turn = this.requireActiveTurn(turnId)
    const snapshot = turn.complete(stopReason)
    this.releaseActiveTurn(turnId)
    return snapshot
  }

  failActiveTurn(turnId: KernelTurnId, error: unknown): KernelTurnSnapshot {
    const turn = this.requireActiveTurn(turnId)
    const snapshot = turn.fail(error)
    this.releaseActiveTurn(turnId)
    return snapshot
  }

  async dispose(reason = 'disposed'): Promise<void> {
    if (this.currentState === 'disposed') {
      return
    }

    this.activeTurn?.dispose(reason)
    this.activeTurn = null
    this.currentState = 'disposed'
    this.touch()
  }

  snapshot(): KernelConversationSnapshot {
    return {
      runtimeId: this.options.runtimeId,
      conversationId: this.options.conversationId,
      workspacePath: this.options.workspacePath,
      sessionId: this.options.sessionId,
      capabilityIntent: this.capabilityIntent,
      provider: this.provider,
      metadata: this.options.metadata,
      state: this.currentState,
      activeTurnId: this.activeTurnId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }

  private createTurn(
    turnId: KernelTurnId,
    initialSnapshot?: KernelTurnSnapshot,
    input?: KernelTurnInputContract,
  ): RuntimeTurnController {
    const createTurn =
      this.options.createTurn ?? (options => new RuntimeTurnController(options))
    return createTurn({
      conversationId: this.id,
      turnId,
      input,
      initialSnapshot,
      now: this.now,
    })
  }

  private hydrateActiveTurn(
    conversationSnapshot: KernelConversationSnapshot,
    turnSnapshot: KernelTurnSnapshot | undefined,
  ): void {
    if (!conversationSnapshot.activeTurnId) {
      return
    }
    if (!turnSnapshot) {
      return
    }
    if (
      turnSnapshot.conversationId !== conversationSnapshot.conversationId ||
      turnSnapshot.turnId !== conversationSnapshot.activeTurnId
    ) {
      throw new RuntimeConversationScopeError(
        conversationSnapshot.conversationId,
        turnSnapshot.conversationId,
      )
    }

    const turn = this.createTurn(
      conversationSnapshot.activeTurnId,
      turnSnapshot,
    )
    this.turns.set(turn.id, turn)
    if (turn.isActive) {
      this.activeTurn = turn
    }
  }

  private releaseActiveTurn(turnId: KernelTurnId): void {
    if (this.activeTurn?.id === turnId) {
      this.activeTurn = null
      this.currentState = 'ready'
      this.touch()
    }
  }

  private requireActiveTurn(turnId: KernelTurnId): RuntimeTurnController {
    this.assertLive()
    if (!this.activeTurn || this.activeTurn.id !== turnId) {
      throw new RuntimeConversationBusyError(
        this.id,
        this.activeTurn?.id ?? 'none',
      )
    }
    return this.activeTurn
  }

  private assertLive(): void {
    if (this.currentState === 'disposed') {
      throw new RuntimeConversationDisposedError(this.id)
    }
  }

  private assertConversationScope(conversationId: KernelConversationId): void {
    if (conversationId !== this.id) {
      throw new RuntimeConversationScopeError(this.id, conversationId)
    }
  }

  private assertSnapshotScope(snapshot: KernelConversationSnapshot): void {
    if (snapshot.conversationId !== this.id) {
      throw new RuntimeConversationScopeError(this.id, snapshot.conversationId)
    }
  }

  private touch(): void {
    this.updatedAt = this.now()
  }
}

function createTurnInputContract(
  request: KernelTurnRunRequest,
): KernelTurnInputContract | undefined {
  if (
    !request.executionMode ||
    !request.contextAssembly ||
    !request.capabilityPlane
  ) {
    return undefined
  }
  return {
    executionMode: request.executionMode,
    contextAssembly: request.contextAssembly,
    capabilityPlane: request.capabilityPlane,
    metadata: request.metadata,
  }
}
