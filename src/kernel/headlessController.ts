import { randomUUID } from 'crypto'

import type { KernelEvent, KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'
import {
  getKernelRuntimeFailedError,
  getKernelRuntimeStopReason,
  getProtocolMessageFromKernelRuntimeEnvelope,
  getTextOutputDeltaFromKernelRuntimeEnvelope,
} from '../runtime/core/events/KernelRuntimeHostProjection.js'
import {
  createKernelRuntime,
  type KernelAbortTurnOptions,
  type KernelConversation,
  type KernelConversationOptions,
  type KernelRunTurnOptions,
  type KernelRuntime,
  type KernelRuntimeCapabilityIntent,
  type KernelRuntimeEventEnvelope,
  type KernelRuntimeOptions,
  type RuntimeProviderSelection,
  isKernelRuntimeEventEnvelope,
} from './runtime.js'
import {
  type KernelHeadlessInputQueue,
  type KernelHeadlessQueuedInterrupt,
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
  executionMode?: KernelRunTurnOptions['executionMode']
  contextAssembly?: KernelRunTurnOptions['contextAssembly']
  capabilityPlane?: KernelRunTurnOptions['capabilityPlane']
  metadata?: Record<string, unknown>
}

export type KernelHeadlessTurnStarted = {
  sessionId: string
  conversationId: string
  turnId: string
}

export type KernelHeadlessAbortRequest = KernelAbortTurnOptions & {
  turnId?: string
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
  runtime?: KernelRuntime
  runtimeOptions?: KernelRuntimeOptions
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
  const runtime =
    options.runtime ??
    (await createKernelRuntime({
      workspacePath: options.workspacePath ?? process.cwd(),
      ...withDefaultHeadlessExecutor(options.runtimeOptions),
    }))

  const controller = new RuntimeKernelHeadlessController(runtime, options)

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

class RuntimeKernelHeadlessController implements KernelHeadlessController {
  private readonly listeners = new Set<(event: KernelHeadlessEvent) => void>()
  private readonly ownRuntime: boolean
  private readonly resume: boolean
  private readonly conversationOptions: KernelConversationOptions
  private readonly inputQueue: KernelHeadlessInputQueue | undefined
  private readonly disposeRuntime: boolean
  private readonly queueTurns: KernelHeadlessQueuedUserTurn[] = []

  private conversation: KernelConversation | null = null
  private startPromise: Promise<void> | null = null
  private activeTurn: TrackedTurn | null = null
  private inputQueueUnsubscribe: (() => void) | null = null
  private inputQueueConsumer: Promise<void> | null = null
  private conversationUnsubscribe: (() => void) | null = null
  private currentState: KernelHeadlessControllerState = {
    status: 'idle',
  }
  private currentSessionId: string

  constructor(
    private readonly runtime: KernelRuntime,
    options: KernelHeadlessControllerOptions,
  ) {
    this.ownRuntime = !options.runtime
    this.disposeRuntime =
      options.disposeRuntime ?? this.ownRuntime
    this.resume = options.resume ?? false
    this.inputQueue = options.inputQueue
    this.currentSessionId =
      options.sessionId ?? options.conversationId ?? randomUUID()
    this.conversationOptions = {
      id: options.conversationId,
      workspacePath: options.workspacePath,
      sessionId: this.currentSessionId,
      sessionMeta: options.sessionMeta,
      capabilityIntent: options.capabilityIntent,
      provider: options.provider,
      metadata: options.metadata,
    }
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
    if (this.conversation) {
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
      await this.runtime.start()
      this.conversation = this.resume
        ? await this.runtime.sessions.resume(this.currentSessionId, {
            conversationId: this.conversationOptions.id,
            workspacePath: this.conversationOptions.workspacePath,
            metadata: this.conversationOptions.metadata,
          })
        : await this.runtime.createConversation(this.conversationOptions)
      this.currentSessionId =
        this.conversation.sessionId ?? this.currentSessionId
      this.conversationUnsubscribe = this.conversation.onEvent(envelope => {
        this.handleRuntimeEnvelope(envelope)
      })
      this.setState({
        status: 'ready',
        conversationId: this.conversation.id,
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
    const turn = await conversation.startTurn(
      request.prompt,
      this.toKernelRunTurnOptions(request),
    )

    this.activeTurn = {
      turnId: turn.id,
      terminal: turn
        .wait()
        .then(() => {})
        .finally(() => {
          if (this.activeTurn?.turnId === turn.id) {
            this.activeTurn = null
          }
        }),
    }

    this.setState({
      status: 'running',
      conversationId: conversation.id,
      activeTurnId: turn.id,
    })

    return {
      sessionId: this.currentSessionId,
      conversationId: conversation.id,
      turnId: turn.id,
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

    await conversation.abortTurn(turnId, {
      reason: request.reason,
      metadata: request.metadata,
    })
  }

  async dispose(reason = 'disposed'): Promise<void> {
    if (this.currentState.status === 'disposed') {
      return
    }

    this.inputQueueUnsubscribe?.()
    this.inputQueueUnsubscribe = null
    this.conversationUnsubscribe?.()
    this.conversationUnsubscribe = null

    const conversation = this.conversation
    this.conversation = null

    if (conversation) {
      await conversation.dispose(reason)
    }

    if (this.disposeRuntime) {
      await this.runtime.dispose(reason)
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

  private requireConversation(): KernelConversation {
    if (!this.conversation) {
      throw new Error('Kernel headless controller has not been started')
    }
    return this.conversation
  }

  private toKernelRunTurnOptions(
    request: KernelHeadlessRunTurnRequest,
  ): KernelRunTurnOptions {
    return {
      turnId: request.turnId,
      attachments: request.attachments,
      providerOverride: request.providerOverride,
      executionMode: request.executionMode ?? 'headless',
      contextAssembly: request.contextAssembly,
      capabilityPlane: request.capabilityPlane,
      metadata: request.metadata,
    }
  }
}

function withDefaultHeadlessExecutor(
  options: KernelRuntimeOptions | undefined,
): KernelRuntimeOptions {
  if (!options) {
    return {
      headlessExecutor: {},
    }
  }

  if ('headlessExecutor' in options) {
    return options
  }

  return {
    ...options,
    headlessExecutor: {},
  }
}
