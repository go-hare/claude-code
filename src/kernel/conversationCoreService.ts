import { createHeadlessConversation } from '../runtime/capabilities/execution/internal/headlessConversationAdapter.js'
import type { RuntimePermissionBroker } from '../runtime/capabilities/permissions/RuntimePermissionBroker.js'
import type { KernelRuntimeCapabilityIntent } from '../runtime/contracts/capability.js'
import type {
  KernelConversationId,
  KernelConversationSnapshot,
} from '../runtime/contracts/conversation.js'
import type { KernelEvent } from '../runtime/contracts/events.js'
import type { RuntimeProviderSelection } from '../runtime/contracts/provider.js'
import type { KernelRuntimeId } from '../runtime/contracts/runtime.js'
import type {
  KernelTurnId,
  KernelTurnRunRequest,
  KernelTurnSnapshot,
} from '../runtime/contracts/turn.js'
import { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import { applyResumeSessionAtToTranscript } from '../runtime/core/session/sessionContinuation.js'
import {
  createKernelSessionManager,
  type KernelSessionListFilter,
  type KernelSessionManager,
  type KernelSessionResumeContext,
  type KernelTranscript,
} from './sessions.js'
import { readConversationCoreSnapshotJournal } from './conversationCoreSnapshotJournal.js'
import type {
  ConversationCoreRecoverySnapshot,
  ConversationCoreSnapshotStore,
} from './conversationCoreSnapshotJournal.js'

export type ConversationCoreTurnExecutionEvent =
  | {
      type: 'output'
      payload: unknown
      replayable?: boolean
      metadata?: Record<string, unknown>
    }
  | {
      type: 'event'
      event: Omit<KernelEvent, 'runtimeId' | 'conversationId' | 'turnId'> &
        Partial<Pick<KernelEvent, 'runtimeId' | 'conversationId' | 'turnId'>>
    }
  | {
      type: 'completed'
      stopReason?: string | null
      metadata?: Record<string, unknown>
    }
  | {
      type: 'failed'
      error: unknown
      metadata?: Record<string, unknown>
    }

export type ConversationCoreTurnExecutionResult =
  | void
  | Promise<void>
  | AsyncIterable<ConversationCoreTurnExecutionEvent>

export type ConversationCoreRunTurnRequest = {
  requestId: string
  conversationId: KernelConversationId
  turnId: KernelTurnId
  prompt: KernelTurnRunRequest['prompt']
  attachments?: KernelTurnRunRequest['attachments']
  providerOverride?: RuntimeProviderSelection
  executionMode?: KernelTurnRunRequest['executionMode']
  contextAssembly?: KernelTurnRunRequest['contextAssembly']
  capabilityPlane?: KernelTurnRunRequest['capabilityPlane']
  metadata?: Record<string, unknown>
}

export type ConversationCoreConversation = ReturnType<
  typeof createHeadlessConversation
>

export type ConversationCoreTurnExecutionContext = {
  request: ConversationCoreRunTurnRequest
  conversation: ConversationCoreConversation
  eventBus: RuntimeEventBus
  permissionBroker?: RuntimePermissionBroker
  providerSelection?: RuntimeProviderSelection
  signal: AbortSignal
}

export type ConversationCoreTurnExecutor = (
  context: ConversationCoreTurnExecutionContext,
) => ConversationCoreTurnExecutionResult

export type ConversationCoreServiceOptions = {
  runtimeId: KernelRuntimeId
  workspacePath: string
  eventBus: RuntimeEventBus
  permissionBroker?: RuntimePermissionBroker
  conversationJournalPath?: string | false
  sessionManager?: KernelSessionManager
  runTurnExecutor?: ConversationCoreTurnExecutor
}

type KernelSessionManagerWithResumeContext = Omit<
  KernelSessionManager,
  'resume'
> & {
  resume(
    sessionId: string,
    context?: KernelSessionResumeContext,
  ): ReturnType<KernelSessionManager['resume']>
}

type ActiveExecution = {
  controller: AbortController
  request: ConversationCoreRunTurnRequest
}

export class ConversationCoreService {
  private readonly conversations = new Map<
    KernelConversationId,
    ConversationCoreConversation
  >()
  private readonly activeExecutions = new Map<string, ActiveExecution>()
  private readonly sessionManager: KernelSessionManager
  private readonly snapshotStore: ConversationCoreSnapshotStore | undefined
  private defaultProviderSelection: RuntimeProviderSelection | undefined

  constructor(private readonly options: ConversationCoreServiceOptions) {
    this.sessionManager =
      options.sessionManager ?? createKernelSessionManager()
    const journalPath =
      options.conversationJournalPath === false
        ? undefined
        : (options.conversationJournalPath ??
          process.env.HARE_KERNEL_RUNTIME_CONVERSATION_JOURNAL)
    this.snapshotStore = journalPath
      ? readConversationCoreSnapshotJournal(journalPath)
      : undefined
  }

  setDefaultProviderSelection(
    provider: RuntimeProviderSelection | undefined,
  ): void {
    this.defaultProviderSelection = provider
  }

  listSessions(
    filter: KernelSessionListFilter = {},
  ): Promise<readonly unknown[]> {
    return this.sessionManager.list(filter)
  }

  async createSession(request: {
    sessionId: string
    conversationId?: string
    workspacePath?: string
    sessionMeta?: Record<string, unknown>
    capabilityIntent?: KernelRuntimeCapabilityIntent
    provider?: RuntimeProviderSelection
    metadata?: Record<string, unknown>
  }): Promise<{ sessionId: string; conversation: KernelConversationSnapshot }> {
    const workspacePath = request.workspacePath ?? this.options.workspacePath
    const conversationId = request.conversationId ?? request.sessionId
    const existing = this.conversations.get(conversationId)
    if (existing) {
      return {
        sessionId: request.sessionId,
        conversation: existing.snapshot(),
      }
    }

    const recovered = await this.readRecoveredConversation({
      conversationId,
      sessionId: request.sessionId,
      workspacePath,
    })
    const provider =
      request.provider ??
      request.capabilityIntent?.provider ??
      recovered?.conversation.provider ??
      this.defaultProviderSelection
    const conversation = createHeadlessConversation({
      runtimeId: this.options.runtimeId,
      conversationId,
      workspacePath,
      sessionId: request.sessionId,
      capabilityIntent:
        request.capabilityIntent ?? recovered?.conversation.capabilityIntent,
      provider,
      metadata:
        request.metadata ??
        request.sessionMeta ??
        recovered?.conversation.metadata,
      initialSnapshot: recovered?.conversation,
      initialActiveTurnSnapshot: recovered?.activeTurn,
      eventBus: this.options.eventBus,
    })
    this.conversations.set(conversation.id, conversation)
    await this.recordConversationSnapshot(
      conversation,
      recovered?.activeTurn,
      recovered?.activeExecution,
    )
    if (recovered?.activeExecution && recovered.activeTurn) {
      queueMicrotask(() => {
        this.startTurnExecution(
          recovered.activeExecution!,
          conversation,
          recovered.activeTurn!,
        )
      })
    }
    return {
      sessionId: request.sessionId,
      conversation: conversation.snapshot(),
    }
  }

  async resumeSession(request: {
    transcriptSessionId: string
    targetSessionId: string
    workspacePath?: string
    resumeSessionAt?: string
    resumeInterruptedTurn?: boolean
    metadata?: Record<string, unknown>
  }): Promise<Record<string, unknown>> {
    const transcriptResult = await (
      this.sessionManager as KernelSessionManagerWithResumeContext
    ).resume(
      request.transcriptSessionId,
      {
        resumeInterruptedTurn: request.resumeInterruptedTurn,
        resumeSessionAt: request.resumeSessionAt,
        metadata: request.metadata,
      },
    )
    const resumeAt = applyResumeSessionAtToTranscript(
      transcriptResult,
      request.resumeSessionAt,
    )
    const transcript = resumeAt.transcript
    const created = await this.createSession({
      sessionId: request.targetSessionId,
      workspacePath: request.workspacePath,
      metadata: {
        ...request.metadata,
        resumedFromSessionId: request.transcriptSessionId,
        resumeSessionAt: request.resumeSessionAt,
        resumeSliced: resumeAt.sliced,
      },
    })
    this.hydrateTranscript(
      request.targetSessionId,
      request.transcriptSessionId,
      transcript,
    )
    return {
      sessionId: request.targetSessionId,
      conversation: created.conversation,
      resumedFromSessionId: request.transcriptSessionId,
      transcript,
      resumeSliced: resumeAt.sliced,
      resumeError: resumeAt.error,
      resumeInterruptedTurn: request.resumeInterruptedTurn ?? false,
    }
  }

  async abortActiveTurns(reason = 'host_disconnected'): Promise<readonly string[]> {
    const abortedTurnIds: string[] = []
    for (const [conversationId, conversation] of this.conversations) {
      const activeTurnId = conversation.activeTurnId
      if (!activeTurnId) {
        continue
      }
      const snapshot = conversation.abortTurn(activeTurnId, reason)
      const activeExecution = this.activeExecutions.get(
        this.turnExecutionKey(conversationId, activeTurnId),
      )
      await this.recordConversationSnapshot(
        conversation,
        snapshot,
        activeExecution?.request,
      )
      activeExecution?.controller.abort(reason)
      abortedTurnIds.push(activeTurnId)
    }
    return abortedTurnIds
  }

  async disposeSession(request: {
    sessionId: string
    reason?: string
  }): Promise<Record<string, unknown>> {
    const conversation = this.requireConversation(request.sessionId)
    const activeTurnId = conversation.activeTurnId
    await conversation.dispose(request.reason)
    await this.recordConversationSnapshot(conversation)
    this.conversations.delete(request.sessionId)
    if (activeTurnId) {
      const key = this.turnExecutionKey(request.sessionId, activeTurnId)
      const activeExecution = this.activeExecutions.get(key)
      activeExecution?.controller.abort(
        request.reason ?? 'conversation_disposed',
      )
      this.activeExecutions.delete(key)
    }
    return {
      sessionId: request.sessionId,
      disposed: true,
    }
  }

  async getTranscript(sessionId: string): Promise<KernelTranscript> {
    return this.sessionManager.getTranscript(sessionId)
  }

  async runTurn(
    request: ConversationCoreRunTurnRequest,
  ): Promise<Record<string, unknown>> {
    const conversation = this.requireConversation(request.conversationId)
    const snapshot = conversation.runTurn({
      turnId: request.turnId,
      prompt: request.prompt,
      attachments: request.attachments,
      executionMode: request.executionMode,
      contextAssembly: request.contextAssembly,
      capabilityPlane: request.capabilityPlane,
      metadata: request.metadata,
    })
    await this.recordConversationSnapshot(conversation, snapshot, request)
    queueMicrotask(() => {
      this.startTurnExecution(request, conversation, snapshot)
    })
    return {
      sessionId: request.conversationId,
      turnId: request.turnId,
      turn: snapshot,
    }
  }

  async abortTurn(request: {
    sessionId: string
    turnId: string
    reason?: string
  }): Promise<Record<string, unknown>> {
    const conversation = this.requireConversation(request.sessionId)
    const snapshot = conversation.abortTurn(request.turnId, request.reason)
    const activeExecution = this.activeExecutions.get(
      this.turnExecutionKey(request.sessionId, request.turnId),
    )
    await this.recordConversationSnapshot(
      conversation,
      snapshot,
      activeExecution?.request,
    )
    activeExecution?.controller.abort(request.reason ?? 'aborted')
    return {
      sessionId: request.sessionId,
      turnId: request.turnId,
      turn: snapshot,
    }
  }

  private startTurnExecution(
    request: ConversationCoreRunTurnRequest,
    conversation: ConversationCoreConversation,
    snapshot: KernelTurnSnapshot,
  ): void {
    if (
      !this.options.runTurnExecutor ||
      (snapshot.state !== 'running' && snapshot.state !== 'aborting')
    ) {
      return
    }

    const executionKey = this.turnExecutionKey(
      request.conversationId,
      request.turnId,
    )
    if (this.activeExecutions.has(executionKey)) {
      return
    }
    const controller = new AbortController()
    this.activeExecutions.set(executionKey, {
      controller,
      request,
    })
    if (snapshot.state === 'aborting') {
      controller.abort(snapshot.stopReason ?? 'aborted')
    }
    void this.runTurnExecution({
      request,
      conversation,
      eventBus: this.options.eventBus,
      permissionBroker: this.options.permissionBroker,
      providerSelection: this.resolveTurnProvider(request, conversation),
      signal: controller.signal,
    }).finally(() => {
      this.activeExecutions.delete(executionKey)
    })
  }

  private async runTurnExecution(
    context: ConversationCoreTurnExecutionContext,
  ): Promise<void> {
    let terminalEmitted = false
    try {
      const result = this.options.runTurnExecutor?.(context)
      if (isAsyncIterable<ConversationCoreTurnExecutionEvent>(result)) {
        for await (const event of result) {
          terminalEmitted =
            (await this.handleTurnExecutionEvent(context, event)) ||
            terminalEmitted
        }
      } else {
        await result
      }
      if (!terminalEmitted && context.signal.aborted) {
        await this.completeTurnExecution(context, 'aborted')
        return
      }
      if (!terminalEmitted) {
        await this.completeTurnExecution(context, 'end_turn')
      }
    } catch (error) {
      if (terminalEmitted) {
        return
      }
      if (context.signal.aborted) {
        await this.completeTurnExecution(context, 'aborted')
        return
      }
      await this.failTurnExecution(context, error)
    }
  }

  private async handleTurnExecutionEvent(
    context: ConversationCoreTurnExecutionContext,
    event: ConversationCoreTurnExecutionEvent,
  ): Promise<boolean> {
    if (context.conversation.activeTurnId !== context.request.turnId) {
      return false
    }
    if (context.signal.aborted) {
      return false
    }
    switch (event.type) {
      case 'output':
        this.options.eventBus.emit({
          conversationId: context.request.conversationId,
          turnId: context.request.turnId,
          type: 'turn.output_delta',
          replayable: event.replayable ?? true,
          payload: sanitizeCorePayload(event.payload),
          metadata: event.metadata,
        })
        return false
      case 'event':
        this.options.eventBus.emit({
          ...event.event,
          conversationId:
            event.event.conversationId ?? context.request.conversationId,
          turnId: event.event.turnId ?? context.request.turnId,
          replayable: event.event.replayable,
          payload: sanitizeCorePayload(event.event.payload),
        })
        return false
      case 'completed':
        await this.completeTurnExecution(
          context,
          event.stopReason ?? 'end_turn',
        )
        return true
      case 'failed':
        await this.failTurnExecution(context, event.error, event.metadata)
        return true
    }
  }

  private async completeTurnExecution(
    context: ConversationCoreTurnExecutionContext,
    stopReason: string | null,
  ): Promise<void> {
    if (context.conversation.activeTurnId !== context.request.turnId) {
      return
    }
    const snapshot = context.conversation.completeTurn(
      context.request.turnId,
      stopReason,
    )
    await this.recordConversationSnapshot(context.conversation, snapshot)
  }

  private async failTurnExecution(
    context: ConversationCoreTurnExecutionContext,
    error: unknown,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (context.conversation.activeTurnId !== context.request.turnId) {
      return
    }
    try {
      const snapshot = context.conversation.failTurn(
        context.request.turnId,
        error,
      )
      await this.recordConversationSnapshot(context.conversation, snapshot)
    } catch (failError) {
      this.options.eventBus.error({
        requestId: context.request.requestId,
        conversationId: context.request.conversationId,
        turnId: context.request.turnId,
        code: 'internal_error',
        message:
          failError instanceof Error ? failError.message : String(failError),
        retryable: false,
        details: {
          executorError: sanitizeCorePayload(error) as Record<string, unknown>,
        },
        metadata,
      })
    }
  }

  private async readRecoveredConversation(input: {
    conversationId: string
    workspacePath: string
    sessionId?: string
  }): Promise<ConversationCoreRecoverySnapshot | undefined> {
    if (!this.snapshotStore) {
      return undefined
    }
    try {
      const recovered = await this.snapshotStore.readLatest(
        input.conversationId,
      )
      if (!recovered || recovered.conversation.state === 'disposed') {
        return undefined
      }
      if (
        input.sessionId !== undefined &&
        recovered.conversation.sessionId !== undefined &&
        input.sessionId !== recovered.conversation.sessionId
      ) {
        return undefined
      }
      return normalizeRecoveredConversation(recovered, {
        runtimeId: this.options.runtimeId,
        conversationId: input.conversationId,
        workspacePath: input.workspacePath,
        sessionId: input.sessionId,
      })
    } catch (error) {
      this.options.eventBus.emit({
        conversationId: input.conversationId,
        type: 'conversation.snapshot_failed',
        replayable: false,
        payload: sanitizeCorePayload({
          message: error instanceof Error ? error.message : String(error),
        }),
        metadata: { operation: 'readLatest' },
      })
      return undefined
    }
  }

  private async recordConversationSnapshot(
    conversation: ConversationCoreConversation,
    activeTurnSnapshot?: KernelTurnSnapshot,
    activeExecution?: ConversationCoreRunTurnRequest,
  ): Promise<void> {
    if (!this.snapshotStore) {
      return
    }
    const conversationSnapshot = conversation.snapshot()
    try {
      await this.snapshotStore.append({
        conversation: conversationSnapshot,
        activeTurn:
          activeTurnSnapshot &&
          conversationSnapshot.activeTurnId === activeTurnSnapshot.turnId
            ? activeTurnSnapshot
            : undefined,
        activeExecution:
          activeExecution &&
          (activeTurnSnapshot?.state === 'running' ||
            activeTurnSnapshot?.state === 'aborting') &&
          conversationSnapshot.activeTurnId === activeExecution.turnId &&
          activeTurnSnapshot.turnId === activeExecution.turnId
            ? activeExecution
            : undefined,
      })
    } catch (error) {
      this.options.eventBus.emit({
        conversationId: conversation.id,
        type: 'conversation.snapshot_failed',
        replayable: false,
        payload: sanitizeCorePayload({
          message: error instanceof Error ? error.message : String(error),
        }),
        metadata: { operation: 'append' },
      })
    }
  }

  private hydrateTranscript(
    conversationId: string,
    resumeSessionId: string,
    transcript: KernelTranscript,
  ): void {
    const transcriptSessionId = transcript.sessionId ?? resumeSessionId
    transcript.messages.forEach((message, index) => {
      if (!isTranscriptHistoryMessage(message)) {
        return
      }
      this.options.eventBus.emit({
        conversationId,
        type: 'conversation.transcript_message',
        replayable: true,
        payload: sanitizeCorePayload({
          sessionId: transcriptSessionId,
          fullPath: transcript.fullPath,
          index,
          message,
        }),
      })
    })
    this.emitResumeSnapshot(conversationId, 'todo', {
      sessionId: transcriptSessionId,
      fullPath: transcript.fullPath,
      snapshot: transcript.todoSnapshot,
    })
    this.emitResumeSnapshot(conversationId, 'nested_memory', {
      sessionId: transcriptSessionId,
      fullPath: transcript.fullPath,
      snapshot: transcript.nestedMemorySnapshot,
    })
    this.emitResumeSnapshot(conversationId, 'task', {
      sessionId: transcriptSessionId,
      fullPath: transcript.fullPath,
      snapshot: transcript.taskSnapshot,
    })
    this.emitIndexedResumeEvents(conversationId, 'file_history_snapshot', {
      sessionId: transcriptSessionId,
      fullPath: transcript.fullPath,
      items: transcript.fileHistorySnapshots,
      itemKey: 'snapshot',
    })
    this.emitIndexedResumeEvents(conversationId, 'attribution_snapshot', {
      sessionId: transcriptSessionId,
      fullPath: transcript.fullPath,
      items: transcript.attributionSnapshots,
      itemKey: 'snapshot',
    })
    this.emitIndexedResumeEvents(conversationId, 'content_replacement', {
      sessionId: transcriptSessionId,
      fullPath: transcript.fullPath,
      items: transcript.contentReplacements,
      itemKey: 'replacement',
    })
    this.emitIndexedResumeEvents(
      conversationId,
      'context_collapse_commit',
      {
        sessionId: transcriptSessionId,
        fullPath: transcript.fullPath,
        items: transcript.contextCollapseCommits,
        itemKey: 'commit',
      },
    )
    this.emitResumeSnapshot(conversationId, 'context_collapse', {
      sessionId: transcriptSessionId,
      fullPath: transcript.fullPath,
      snapshot: transcript.contextCollapseSnapshot,
    })
  }

  private emitResumeSnapshot(
    conversationId: string,
    name: string,
    input: {
      sessionId: string
      fullPath?: string
      snapshot?: unknown
    },
  ): void {
    if (input.snapshot === undefined) {
      return
    }
    this.options.eventBus.emit({
      conversationId,
      type: `conversation.${name}_snapshot`,
      replayable: true,
      payload: sanitizeCorePayload(input),
    })
  }

  private emitIndexedResumeEvents(
    conversationId: string,
    name: string,
    input: {
      sessionId: string
      fullPath?: string
      items?: readonly unknown[]
      itemKey: string
    },
  ): void {
    input.items?.forEach((item, index) => {
      this.options.eventBus.emit({
        conversationId,
        type: `conversation.${name}`,
        replayable: true,
        payload: sanitizeCorePayload({
          sessionId: input.sessionId,
          fullPath: input.fullPath,
          index,
          [input.itemKey]: item,
        }),
      })
    })
  }

  private resolveTurnProvider(
    request: ConversationCoreRunTurnRequest,
    conversation: ConversationCoreConversation,
  ): RuntimeProviderSelection | undefined {
    return (
      request.providerOverride ??
      conversation.snapshot().provider ??
      this.defaultProviderSelection
    )
  }

  private requireConversation(
    conversationId: KernelConversationId,
  ): ConversationCoreConversation {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      throw new ConversationCoreError(
        'not_found',
        `Conversation ${conversationId} was not found`,
      )
    }
    return conversation
  }

  private turnExecutionKey(
    conversationId: KernelConversationId,
    turnId: KernelTurnId,
  ): string {
    return `${conversationId}:${turnId}`
  }
}

export class ConversationCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ConversationCoreError'
  }
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value
  )
}

function isTranscriptHistoryMessage(
  value: unknown,
): value is Record<string, unknown> & { type: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

function normalizeRecoveredConversation(
  recovered: ConversationCoreRecoverySnapshot,
  scope: {
    runtimeId: KernelRuntimeId
    conversationId: KernelConversationId
    workspacePath: string
    sessionId?: string
  },
): ConversationCoreRecoverySnapshot {
  const conversation: KernelConversationSnapshot = {
    ...recovered.conversation,
    runtimeId: scope.runtimeId,
    conversationId: scope.conversationId,
    workspacePath: scope.workspacePath,
    sessionId: scope.sessionId ?? recovered.conversation.sessionId,
  }
  const activeTurn =
    conversation.activeTurnId &&
    recovered.activeTurn?.conversationId === conversation.conversationId &&
    recovered.activeTurn.turnId === conversation.activeTurnId
      ? recovered.activeTurn
      : undefined
  const activeExecution =
    activeTurn &&
    recovered.activeExecution?.conversationId === conversation.conversationId &&
    recovered.activeExecution.turnId === activeTurn.turnId
      ? recovered.activeExecution
      : undefined
  return {
    conversation,
    activeTurn,
    activeExecution,
  }
}

function sanitizeCorePayload<T>(value: T): T {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    } as T
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeCorePayload(item)) as T
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, sanitizeCorePayload(item)]),
  ) as T
}
