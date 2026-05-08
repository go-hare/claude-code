import { randomUUID } from 'crypto'

import type { KernelEvent, KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'
import type {
  KernelCapabilityPlane,
  KernelRuntimeCapabilityIntent,
} from '../runtime/contracts/capability.js'
import type { RuntimeProviderSelection } from '../runtime/contracts/provider.js'
import type {
  KernelExecutionMode,
  KernelTurnSnapshot,
} from '../runtime/contracts/turn.js'
import type { KernelContextAssembly } from '../runtime/contracts/context.js'
import {
  getKernelRuntimeFailedError,
  getKernelRuntimeStopReason,
  getProtocolMessageFromKernelRuntimeEnvelope,
  getTextOutputDeltaFromKernelRuntimeEnvelope,
} from '../runtime/core/events/KernelRuntimeHostProjection.js'
import { RuntimeCoreService } from './runtimeCoreService.js'
import {
  ConversationCoreService,
  type ConversationCoreTurnExecutor,
  type ConversationCoreRunTurnRequest,
  type ConversationCoreServiceOptions,
} from './conversationCoreService.js'
import {
  type KernelRuntimeEventEnvelope,
  isKernelRuntimeEventEnvelope,
} from './runtimeEvents.js'
import {
  type KernelHeadlessInputQueue,
  type KernelHeadlessQueuedUserTurn,
  isKernelHeadlessInputQueue,
  subscribeKernelHeadlessInputQueue,
} from './headlessInputQueue.js'

export type KernelHeadlessControllerStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'running'
  | 'aborting'
  | 'disposed'

export type KernelHeadlessControllerState = {
  status: KernelHeadlessControllerStatus
  conversationId?: string
  activeTurnId?: string
}

export type KernelHeadlessRunTurnRequest = {
  prompt: string | readonly unknown[]
  turnId?: string
  attachments?: readonly unknown[]
  providerOverride?: RuntimeProviderSelection
  executionMode?: KernelExecutionMode
  contextAssembly?: KernelContextAssembly
  capabilityPlane?: KernelCapabilityPlane
  metadata?: Record<string, unknown>
}

export type KernelHeadlessTurnStarted = {
  sessionId: string
  conversationId: string
  turnId: string
}

export type KernelHeadlessAbortRequest = {
  turnId?: string
  reason?: string
  metadata?: Record<string, unknown>
}

export type KernelHeadlessEvent =
  | {
      type: 'controller.state_changed'
      state: KernelHeadlessControllerState
    }
  | {
      type: 'runtime.event'
      envelope: KernelRuntimeEventEnvelope
    }
  | {
      type: 'turn.output'
      envelope: KernelRuntimeEventEnvelope
      text?: string
      payload?: unknown
    }
  | {
      type: 'turn.completed'
      envelope: KernelRuntimeEventEnvelope
      stopReason?: string | null
    }
  | {
      type: 'turn.failed'
      envelope: KernelRuntimeEventEnvelope
      error?: unknown
    }
  | {
      type: 'compat.protocol_message'
      envelope: KernelRuntimeEventEnvelope
      message: unknown
      compatibilitySource: 'legacy_headless_protocol'
    }

export type KernelHeadlessControllerOptions = {
  runtimeCore?: RuntimeCoreService
  conversationCore?: ConversationCoreService
  runtimeOptions?: {
    runtimeId?: string
    eventJournalPath?: string | false
    maxReplayEvents?: number
  }
  conversationOptions?: Partial<
    Pick<
      ConversationCoreServiceOptions,
      'conversationJournalPath' | 'sessionManager'
    >
  >
  runTurnExecutor?: ConversationCoreTurnExecutor
  workspacePath?: string
  conversationId?: string
  sessionId?: string
  sessionMeta?: Record<string, unknown>
  capabilityIntent?: KernelRuntimeCapabilityIntent
  provider?: RuntimeProviderSelection
  metadata?: Record<string, unknown>
  inputQueue?: KernelHeadlessInputQueue
  resume?: boolean
  autoStart?: boolean
  disposeRuntime?: boolean
}

export type KernelHeadlessController = {
  readonly sessionId: string
  readonly state: KernelHeadlessControllerState
  start(): Promise<void>
  runTurn(request: KernelHeadlessRunTurnRequest): Promise<KernelHeadlessTurnStarted>
  abortTurn(request?: KernelHeadlessAbortRequest): Promise<void>
  dispose(reason?: string): Promise<void>
  onEvent(handler: (event: KernelHeadlessEvent) => void): () => void
}

type TrackedTurn = {
  readonly turnId: string
  readonly terminal: Promise<void>
}

export async function createKernelHeadlessController(
  options: KernelHeadlessControllerOptions = {},
): Promise<KernelHeadlessController> {
  const runtimeCore =
    options.runtimeCore ??
    new RuntimeCoreService({
      runtimeId: options.runtimeOptions?.runtimeId,
      workspacePath: options.workspacePath ?? process.cwd(),
      eventJournalPath: options.runtimeOptions?.eventJournalPath,
      maxReplayEvents: options.runtimeOptions?.maxReplayEvents,
    })
  const conversationCore =
    options.conversationCore ??
    new ConversationCoreService({
      runtimeId: runtimeCore.runtimeId,
      workspacePath: options.workspacePath ?? runtimeCore.workspacePath,
      eventBus: runtimeCore.eventBus,
      permissionBroker: runtimeCore.permissionBroker,
      conversationJournalPath:
        options.conversationOptions?.conversationJournalPath,
      sessionManager: options.conversationOptions?.sessionManager,
      runTurnExecutor:
        options.runTurnExecutor ?? defaultHeadlessControllerTurnExecutor,
    })

  const controller = new CoreKernelHeadlessController(
    runtimeCore,
    conversationCore,
    options,
  )

  if (options.autoStart) {
    await controller.start()
  }

  return controller
}

export function normalizeKernelHeadlessEvent(
  input: KernelRuntimeEnvelopeBase<KernelEvent> | KernelRuntimeEnvelopeBase,
): KernelHeadlessEvent | null {
  if (!isKernelRuntimeEventEnvelope(input)) {
    return null
  }

  switch (input.payload.type) {
    case 'turn.output_delta':
      {
        const outputDelta = getTextOutputDeltaFromKernelRuntimeEnvelope(input)
        return {
          type: 'turn.output',
          envelope: input,
          text: outputDelta?.text,
          payload: input.payload.payload,
        }
      }
    case 'turn.completed':
      return {
        type: 'turn.completed',
        envelope: input,
        stopReason: getKernelRuntimeStopReason(input.payload),
      }
    case 'turn.failed':
      return {
        type: 'turn.failed',
        envelope: input,
        error: getKernelRuntimeFailedError(input.payload),
      }
    case 'headless.protocol_message':
      return {
        type: 'compat.protocol_message',
        envelope: input,
        message: getProtocolMessageFromKernelRuntimeEnvelope(input),
        compatibilitySource: 'legacy_headless_protocol',
      }
    default:
      return {
        type: 'runtime.event',
        envelope: input,
      }
  }
}

class CoreKernelHeadlessController implements KernelHeadlessController {
  private readonly listeners = new Set<(event: KernelHeadlessEvent) => void>()
  private readonly ownRuntimeCore: boolean
  private readonly resume: boolean
  private readonly inputQueue: KernelHeadlessInputQueue | undefined
  private readonly disposeRuntime: boolean
  private readonly queueTurns: KernelHeadlessQueuedUserTurn[] = []
  private readonly conversationId: string

  private conversationSnapshot: { id: string; sessionId?: string } | null = null
  private startPromise: Promise<void> | null = null
  private activeTurn: TrackedTurn | null = null
  private inputQueueUnsubscribe: (() => void) | null = null
  private inputQueueConsumer: Promise<void> | null = null
  private eventBusUnsubscribe: (() => void) | null = null
  private currentState: KernelHeadlessControllerState = {
    status: 'idle',
  }
  private currentSessionId: string

  constructor(
    private readonly runtimeCore: RuntimeCoreService,
    private readonly conversationCore: ConversationCoreService,
    options: KernelHeadlessControllerOptions,
  ) {
    this.ownRuntimeCore = !options.runtimeCore
    this.disposeRuntime = options.disposeRuntime ?? this.ownRuntimeCore
    this.resume = options.resume ?? false
    this.inputQueue = options.inputQueue
    this.currentSessionId =
      options.sessionId ?? options.conversationId ?? randomUUID()
    this.conversationId = options.conversationId ?? this.currentSessionId
    this.pendingCreateSession = {
      workspacePath: options.workspacePath,
      sessionMeta: options.sessionMeta,
      capabilityIntent: options.capabilityIntent,
      provider: options.provider,
      metadata: options.metadata,
    }
  }

  private readonly pendingCreateSession: {
    workspacePath?: string
    sessionMeta?: Record<string, unknown>
    capabilityIntent?: KernelRuntimeCapabilityIntent
    provider?: RuntimeProviderSelection
    metadata?: Record<string, unknown>
  }

  get sessionId(): string {
    return this.currentSessionId
  }

  get state(): KernelHeadlessControllerState {
    return { ...this.currentState }
  }

  async start(): Promise<void> {
    if (this.currentState.status === 'disposed') {
      throw new Error('Kernel headless controller is already disposed')
    }
    if (this.conversationSnapshot) {
      return
    }
    if (this.startPromise) {
      return this.startPromise
    }

    this.setState({
      status: 'starting',
      conversationId: this.currentState.conversationId,
      activeTurnId: this.currentState.activeTurnId,
    })

    this.startPromise = (async () => {
      this.runtimeCore.initialize({
        workspacePath:
          this.pendingCreateSession.workspacePath ??
          this.runtimeCore.workspacePath,
      })
      this.eventBusUnsubscribe = this.runtimeCore.eventBus.subscribe(
        envelope => {
          this.handleRuntimeEnvelope(envelope)
        },
      )
      const session = this.resume
        ? await this.conversationCore.resumeSession({
            transcriptSessionId: this.currentSessionId,
            targetSessionId: this.conversationId,
            workspacePath: this.pendingCreateSession.workspacePath,
            metadata: this.pendingCreateSession.metadata,
          })
        : await this.conversationCore.createSession({
            sessionId: this.currentSessionId,
            conversationId: this.conversationId,
            workspacePath: this.pendingCreateSession.workspacePath,
            sessionMeta: this.pendingCreateSession.sessionMeta,
            capabilityIntent: this.pendingCreateSession.capabilityIntent,
            provider: this.pendingCreateSession.provider,
            metadata: this.pendingCreateSession.metadata,
          })
      const conversation = getConversationSnapshot(session)
      this.conversationSnapshot = {
        id: conversation.conversationId,
        sessionId: conversation.sessionId,
      }
      this.currentSessionId =
        conversation.sessionId ?? this.currentSessionId
      this.setState({
        status: 'ready',
        conversationId: this.conversationSnapshot.id,
      })
      this.attachInputQueue()
    })()

    try {
      await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  async runTurn(
    request: KernelHeadlessRunTurnRequest,
  ): Promise<KernelHeadlessTurnStarted> {
    await this.start()
    if (this.activeTurn) {
      throw new Error(
        `Kernel headless controller already has active turn ${this.activeTurn.turnId}`,
      )
    }

    const conversation = this.requireConversation()
    const turnId = request.turnId ?? randomUUID()
    const terminal = waitForTurnTerminal(this.runtimeCore, {
      conversationId: conversation.id,
      turnId,
    })

    this.activeTurn = {
      turnId,
      terminal: terminal
        .then(() => {})
        .finally(() => {
          if (this.activeTurn?.turnId === turnId) {
            this.activeTurn = null
          }
        }),
    }

    try {
      await this.conversationCore.runTurn(
        this.toCoreRunTurnRequest(request, conversation.id, turnId),
      )
    } catch (error) {
      if (this.activeTurn?.turnId === turnId) {
        this.activeTurn = null
      }
      throw error
    }

    this.setState({
      status: 'running',
      conversationId: conversation.id,
      activeTurnId: turnId,
    })

    return {
      sessionId: this.currentSessionId,
      conversationId: conversation.id,
      turnId,
    }
  }

  async abortTurn(request: KernelHeadlessAbortRequest = {}): Promise<void> {
    await this.start()
    const conversation = this.requireConversation()
    const turnId = request.turnId ?? this.activeTurn?.turnId
    if (!turnId) {
      return
    }

    this.setState({
      status: 'aborting',
      conversationId: conversation.id,
      activeTurnId: turnId,
    })

    await this.conversationCore.abortTurn({
      sessionId: conversation.id,
      turnId,
      reason: request.reason,
    })
  }

  async dispose(reason = 'disposed'): Promise<void> {
    if (this.currentState.status === 'disposed') {
      return
    }

    this.inputQueueUnsubscribe?.()
    this.inputQueueUnsubscribe = null
    this.eventBusUnsubscribe?.()
    this.eventBusUnsubscribe = null

    const conversation = this.conversationSnapshot
    this.conversationSnapshot = null

    if (conversation) {
      await this.conversationCore.disposeSession({
        sessionId: conversation.id,
        reason,
      })
    }

    if (this.disposeRuntime) {
      this.runtimeCore.permissionBroker.dispose?.(reason)
    }

    this.activeTurn = null
    this.setState({
      status: 'disposed',
      conversationId: conversation?.id ?? this.currentState.conversationId,
    })
  }

  onEvent(handler: (event: KernelHeadlessEvent) => void): () => void {
    this.listeners.add(handler)
    return () => {
      this.listeners.delete(handler)
    }
  }

  private attachInputQueue(): void {
    if (!this.inputQueue || this.inputQueueUnsubscribe || this.inputQueueConsumer) {
      return
    }

    if (isKernelHeadlessInputQueue(this.inputQueue)) {
      this.inputQueueUnsubscribe = subscribeKernelHeadlessInputQueue(
        this.inputQueue,
        item => {
          if (item.kind === 'interrupt') {
            void this.abortTurn(item.request)
            return
          }
          this.queueTurns.push(item.turn)
          void this.drainQueuedTurns()
        },
      )
      return
    }

    this.inputQueueConsumer = this.consumeStringInputQueue(this.inputQueue)
  }

  private async consumeStringInputQueue(
    inputQueue: KernelHeadlessInputQueue,
  ): Promise<void> {
    for await (const prompt of inputQueue) {
      if (this.currentState.status === 'disposed') {
        return
      }
      const started = await this.runTurn({ prompt })
      await this.waitForActiveTurn(started.turnId)
    }
  }

  private async drainQueuedTurns(): Promise<void> {
    if (this.inputQueueConsumer) {
      return this.inputQueueConsumer
    }

    this.inputQueueConsumer = (async () => {
      while (this.queueTurns.length > 0) {
        const nextTurn = this.queueTurns.shift()
        if (!nextTurn || this.currentState.status === 'disposed') {
          continue
        }
        if (this.activeTurn) {
          await this.activeTurn.terminal
        }
        const started = await this.runTurn(nextTurn)
        await this.waitForActiveTurn(started.turnId)
      }
    })()

    try {
      await this.inputQueueConsumer
    } finally {
      this.inputQueueConsumer = null
    }
  }

  private async waitForActiveTurn(turnId: string): Promise<void> {
    if (this.activeTurn?.turnId !== turnId) {
      return
    }
    await this.activeTurn.terminal
  }

  private handleRuntimeEnvelope(envelope: KernelRuntimeEnvelopeBase): void {
    const normalized = normalizeKernelHeadlessEvent(envelope)
    if (normalized) {
      this.emit(normalized)
    }

    if (!isKernelRuntimeEventEnvelope(envelope)) {
      return
    }

    switch (envelope.payload.type) {
      case 'turn.started':
        this.setState({
          status: 'running',
          conversationId: envelope.conversationId,
          activeTurnId: envelope.turnId,
        })
        return
      case 'turn.abort_requested':
        this.setState({
          status: 'aborting',
          conversationId: envelope.conversationId,
          activeTurnId: envelope.turnId,
        })
        return
      case 'turn.completed':
      case 'turn.failed':
        this.setState({
          status: 'ready',
          conversationId: envelope.conversationId,
        })
        return
      case 'conversation.disposed':
        this.setState({
          status: 'disposed',
          conversationId: envelope.conversationId,
        })
    }
  }

  private setState(next: KernelHeadlessControllerState): void {
    if (
      this.currentState.status === next.status &&
      this.currentState.conversationId === next.conversationId &&
      this.currentState.activeTurnId === next.activeTurnId
    ) {
      return
    }

    this.currentState = next
    this.emit({
      type: 'controller.state_changed',
      state: { ...this.currentState },
    })
  }

  private emit(event: KernelHeadlessEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  private requireConversation(): { id: string; sessionId?: string } {
    if (!this.conversationSnapshot) {
      throw new Error('Kernel headless controller has not been started')
    }
    return this.conversationSnapshot
  }

  private toCoreRunTurnRequest(
    request: KernelHeadlessRunTurnRequest,
    conversationId: string,
    turnId: string,
  ): ConversationCoreRunTurnRequest {
    return {
      requestId: `headless-turn-${turnId}`,
      conversationId,
      turnId,
      prompt: request.prompt,
      attachments: request.attachments,
      providerOverride: request.providerOverride,
      executionMode: request.executionMode ?? 'headless',
      contextAssembly: request.contextAssembly,
      capabilityPlane: request.capabilityPlane,
      metadata: request.metadata,
    }
  }
}

async function* defaultHeadlessControllerTurnExecutor(): AsyncIterable<{
  type: 'completed'
  stopReason: string
}> {
  yield {
    type: 'completed',
    stopReason: 'end_turn',
  }
}

function getConversationSnapshot(
  session: Awaited<ReturnType<ConversationCoreService['createSession']>> | Record<string, unknown>,
): {
  conversationId: string
  sessionId?: string
} {
  const record = session as Record<string, unknown>
  const conversation = record.conversation
  if (conversation && typeof conversation === 'object') {
    const snapshot = conversation as Record<string, unknown>
    if (typeof snapshot.conversationId === 'string') {
      return {
        conversationId: snapshot.conversationId,
        sessionId:
          typeof snapshot.sessionId === 'string'
            ? snapshot.sessionId
            : undefined,
      }
    }
  }
  const sessionId =
    typeof record.sessionId === 'string' ? record.sessionId : randomUUID()
  return {
    conversationId: sessionId,
    sessionId,
  }
}

function waitForTurnTerminal(
  runtimeCore: RuntimeCoreService,
  scope: { conversationId: string; turnId: string },
): Promise<KernelTurnSnapshot> {
  return new Promise(resolve => {
    const unsubscribe = runtimeCore.eventBus.subscribe(envelope => {
      const event = getKernelEventFromEnvelope(envelope)
      if (
        envelope.kind !== 'event' ||
        envelope.conversationId !== scope.conversationId ||
        envelope.turnId !== scope.turnId ||
        !event
      ) {
        return
      }
      if (event.type !== 'turn.completed' && event.type !== 'turn.failed') {
        return
      }
      unsubscribe()
      resolve(
        getTurnSnapshotFromEnvelope(envelope) ?? {
          conversationId: scope.conversationId,
          turnId: scope.turnId,
          state: event.type === 'turn.failed' ? 'failed' : 'completed',
        },
      )
    })
  })
}

function getKernelEventFromEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): KernelEvent | undefined {
  if (envelope.kind !== 'event') {
    return undefined
  }
  const payload = envelope.payload
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const event = payload as Partial<KernelEvent>
  return typeof event.type === 'string' ? (event as KernelEvent) : undefined
}

function getTurnSnapshotFromEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): KernelTurnSnapshot | undefined {
  const payload = getKernelEventFromEnvelope(envelope)?.payload
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const record = payload as Record<string, unknown>
  if (
    typeof record.conversationId !== 'string' ||
    typeof record.turnId !== 'string' ||
    typeof record.state !== 'string'
  ) {
    return undefined
  }
  return record as KernelTurnSnapshot
}
