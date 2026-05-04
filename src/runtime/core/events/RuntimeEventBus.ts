import type {
  KernelEvent,
  KernelEventId,
  KernelEventScope,
  KernelRuntimeEnvelopeBase,
  KernelRuntimeErrorCode,
  KernelRuntimeErrorPayload,
} from '../../contracts/events.js'
import type { KernelRuntimeId } from '../../contracts/runtime.js'

const DEFAULT_MAX_REPLAY_EVENTS = 512

type RuntimeEventClock = () => string
type RuntimeEventMessageIdFactory = () => string
export type RuntimeEventListener = (envelope: KernelRuntimeEnvelopeBase) => void

export type RuntimeEventBusOptions = {
  runtimeId: KernelRuntimeId
  maxReplayEvents?: number
  initialReplayEnvelopes?: readonly KernelRuntimeEnvelopeBase<KernelEvent>[]
  now?: RuntimeEventClock
  createMessageId?: RuntimeEventMessageIdFactory
}

export type RuntimeEventInput = Omit<KernelEvent, 'runtimeId' | 'eventId'> &
  Partial<Pick<KernelEvent, 'runtimeId' | 'eventId'>>

export type RuntimeEventReplayRequest = {
  sinceEventId?: KernelEventId
  conversationId?: KernelEventScope['conversationId']
  turnId?: KernelEventScope['turnId']
}

export type RuntimeEnvelopeInput<TPayload> = KernelEventScope & {
  requestId?: string
  eventId?: KernelEventId
  payload?: TPayload
  error?: KernelRuntimeErrorPayload
  metadata?: Record<string, unknown>
}

export type RuntimeEventReplayErrorCode = 'expired' | 'not_found'

export class RuntimeEventReplayError extends Error {
  constructor(
    readonly code: RuntimeEventReplayErrorCode,
    readonly eventId: KernelEventId,
  ) {
    super(`Replay cursor ${eventId} is ${code}`)
    this.name = 'RuntimeEventReplayError'
  }
}

export class RuntimeEventSerializationError extends Error {
  constructor(
    readonly path: string,
    readonly valueType: string,
  ) {
    super(`Runtime event value at ${path} is not JSON serializable`)
    this.name = 'RuntimeEventSerializationError'
  }
}

export class RuntimeEventDuplicateIdError extends Error {
  constructor(readonly eventId: KernelEventId) {
    super(`Runtime event id ${eventId} has already been emitted`)
    this.name = 'RuntimeEventDuplicateIdError'
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function assertSerializable(
  value: unknown,
  path: string,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (value === undefined) {
    throw new RuntimeEventSerializationError(path, 'undefined')
  }

  const currentType = typeof value
  if (
    currentType === 'function' ||
    currentType === 'symbol' ||
    currentType === 'bigint'
  ) {
    throw new RuntimeEventSerializationError(path, currentType)
  }

  if (value === null || currentType !== 'object') {
    return
  }

  if (seen.has(value)) {
    throw new RuntimeEventSerializationError(path, 'circular')
  }
  seen.add(value)

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSerializable(item, `${path}[${index}]`, seen)
    })
    seen.delete(value)
    return
  }

  for (const [key, item] of Object.entries(value)) {
    assertSerializable(item, `${path}.${key}`, seen)
  }
  seen.delete(value)
}

export class RuntimeEventBus {
  private readonly now: RuntimeEventClock
  private readonly createMessageId: RuntimeEventMessageIdFactory
  private readonly maxReplayEvents: number
  private nextSequence = 1
  private nextMessageNumber = 1
  private readonly eventCountersByScope = new Map<string, number>()
  private readonly replayBuffer: Array<KernelRuntimeEnvelopeBase<KernelEvent>> =
    []
  private readonly replayableScopesByEventId = new Map<
    KernelEventId,
    KernelEventScope
  >()
  private readonly listeners = new Set<RuntimeEventListener>()

  constructor(private readonly options: RuntimeEventBusOptions) {
    this.now = options.now ?? nowIso
    this.createMessageId =
      options.createMessageId ?? (() => this.createDefaultMessageId())
    this.maxReplayEvents = Math.max(
      0,
      Math.floor(options.maxReplayEvents ?? DEFAULT_MAX_REPLAY_EVENTS),
    )
    this.hydrateReplayBuffer(options.initialReplayEnvelopes ?? [])
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(event: RuntimeEventInput): KernelRuntimeEnvelopeBase<KernelEvent> {
    const runtimeId = event.runtimeId ?? this.options.runtimeId
    const eventId =
      event.eventId ??
      (event.replayable ? this.createEventId(event) : undefined)

    if (
      event.replayable &&
      eventId !== undefined &&
      this.replayableScopesByEventId.has(eventId)
    ) {
      throw new RuntimeEventDuplicateIdError(eventId)
    }

    const payload = this.createEventPayload({
      ...event,
      runtimeId,
      eventId,
    })

    const envelope = this.createEnvelope('event', {
      runtimeId,
      conversationId: payload.conversationId,
      turnId: payload.turnId,
      eventId,
      payload,
      metadata: event.metadata,
    })

    if (event.replayable) {
      this.storeReplayableEnvelope(envelope)
    }

    return envelope
  }

  ack<TPayload = unknown>(
    input: RuntimeEnvelopeInput<TPayload>,
  ): KernelRuntimeEnvelopeBase<TPayload> {
    return this.createEnvelope('ack', input)
  }

  pong(
    input: KernelEventScope & { requestId?: string } = {},
  ): KernelRuntimeEnvelopeBase {
    return this.createEnvelope('pong', input)
  }

  error(
    input: KernelEventScope & {
      code: KernelRuntimeErrorCode
      message: string
      requestId?: string
      retryable?: boolean
      details?: Record<string, unknown>
      metadata?: Record<string, unknown>
    },
  ): KernelRuntimeEnvelopeBase {
    const error: KernelRuntimeErrorPayload = {
      code: input.code,
      message: input.message,
      retryable: input.retryable ?? false,
    }
    if (input.details !== undefined) {
      error.details = input.details
    }

    return this.createEnvelope('error', {
      ...input,
      error,
    })
  }

  replay(
    request: RuntimeEventReplayRequest = {},
  ): Array<KernelRuntimeEnvelopeBase<KernelEvent>> {
    const scopedEnvelopes = this.replayBuffer.filter(envelope =>
      this.matchesReplayRequest(envelope, request),
    )

    if (!request.sinceEventId) {
      return [...scopedEnvelopes]
    }

    const cursorIndex = scopedEnvelopes.findIndex(
      envelope => envelope.eventId === request.sinceEventId,
    )
    if (cursorIndex !== -1) {
      return scopedEnvelopes.slice(cursorIndex + 1)
    }

    const cursorScope = this.replayableScopesByEventId.get(request.sinceEventId)
    if (!cursorScope || !this.matchesReplayRequest(cursorScope, request)) {
      throw new RuntimeEventReplayError('not_found', request.sinceEventId)
    }

    throw new RuntimeEventReplayError('expired', request.sinceEventId)
  }

  private createEnvelope<TPayload>(
    kind: KernelRuntimeEnvelopeBase<TPayload>['kind'],
    input: RuntimeEnvelopeInput<TPayload>,
  ): KernelRuntimeEnvelopeBase<TPayload> {
    const scope = this.withRuntimeScope(input)

    this.validateEnvelopeInput(input)

    const envelope: KernelRuntimeEnvelopeBase<TPayload> = {
      schemaVersion: 'kernel.runtime.v1',
      messageId: this.createMessageId(),
      sequence: this.nextSequence++,
      timestamp: this.now(),
      source: 'kernel_runtime',
      kind,
      runtimeId: scope.runtimeId,
    }

    if (input.requestId !== undefined) {
      envelope.requestId = input.requestId
    }
    if (input.eventId !== undefined) {
      envelope.eventId = input.eventId
    }
    if (scope.conversationId !== undefined) {
      envelope.conversationId = scope.conversationId
    }
    if (scope.turnId !== undefined) {
      envelope.turnId = scope.turnId
    }
    if (input.payload !== undefined) {
      envelope.payload = input.payload
    }
    if (input.error !== undefined) {
      envelope.error = input.error
    }
    if (input.metadata !== undefined) {
      envelope.metadata = input.metadata
    }

    this.notifyListeners(envelope)
    return envelope
  }

  private createEventPayload(
    event: RuntimeEventInput & {
      runtimeId: KernelRuntimeId
      eventId?: KernelEventId
    },
  ): KernelEvent {
    const payload: KernelEvent = {
      runtimeId: event.runtimeId,
      type: event.type,
      replayable: event.replayable,
    }

    if (event.eventId !== undefined) {
      payload.eventId = event.eventId
    }
    if (event.conversationId !== undefined) {
      payload.conversationId = event.conversationId
    }
    if (event.turnId !== undefined) {
      payload.turnId = event.turnId
    }
    if (event.payload !== undefined) {
      payload.payload = event.payload
    }
    if (event.metadata !== undefined) {
      payload.metadata = event.metadata
    }

    assertSerializable(payload, 'event')
    return payload
  }

  private validateEnvelopeInput(input: RuntimeEnvelopeInput<unknown>): void {
    if (input.payload !== undefined) {
      assertSerializable(input.payload, 'envelope.payload')
    }
    if (input.error !== undefined) {
      assertSerializable(input.error, 'envelope.error')
    }
    if (input.metadata !== undefined) {
      assertSerializable(input.metadata, 'envelope.metadata')
    }
  }

  private createEventId(event: RuntimeEventInput): KernelEventId {
    const scopeKey = this.eventIdScopeKey(event)
    const nextCounter = (this.eventCountersByScope.get(scopeKey) ?? 0) + 1
    this.eventCountersByScope.set(scopeKey, nextCounter)
    return `${scopeKey}:${nextCounter}`
  }

  private eventIdScopeKey(event: KernelEventScope): string {
    return event.conversationId ?? event.runtimeId ?? this.options.runtimeId
  }

  private createDefaultMessageId(): string {
    return `kernel-message-${this.nextMessageNumber++}`
  }

  private hydrateReplayBuffer(
    envelopes: readonly KernelRuntimeEnvelopeBase<KernelEvent>[],
  ): void {
    for (const envelope of envelopes) {
      if (!this.isReplayableEventEnvelope(envelope)) {
        continue
      }

      this.storeReplayableEnvelope(envelope)
      this.nextSequence = Math.max(this.nextSequence, envelope.sequence + 1)
      this.advanceMessageCounter(envelope.messageId)
      if (envelope.eventId !== undefined) {
        this.advanceEventCounter(envelope.eventId)
      }
    }
  }

  private isReplayableEventEnvelope(
    envelope: KernelRuntimeEnvelopeBase<KernelEvent>,
  ): boolean {
    return (
      envelope.kind === 'event' &&
      envelope.eventId !== undefined &&
      envelope.payload?.replayable === true
    )
  }

  private advanceMessageCounter(messageId: string): void {
    const match = /^kernel-message-(\d+)$/.exec(messageId)
    if (!match) {
      return
    }
    const number = Number(match[1])
    if (Number.isSafeInteger(number)) {
      this.nextMessageNumber = Math.max(this.nextMessageNumber, number + 1)
    }
  }

  private advanceEventCounter(eventId: KernelEventId): void {
    const separator = eventId.lastIndexOf(':')
    if (separator === -1) {
      return
    }
    const scopeKey = eventId.slice(0, separator)
    const counter = Number(eventId.slice(separator + 1))
    if (!scopeKey || !Number.isSafeInteger(counter)) {
      return
    }
    this.eventCountersByScope.set(
      scopeKey,
      Math.max(this.eventCountersByScope.get(scopeKey) ?? 0, counter),
    )
  }

  private withRuntimeScope(
    scope: KernelEventScope,
  ): Required<Pick<KernelEventScope, 'runtimeId'>> &
    Omit<KernelEventScope, 'runtimeId'> {
    return {
      ...scope,
      runtimeId: scope.runtimeId ?? this.options.runtimeId,
    }
  }

  private storeReplayableEnvelope(
    envelope: KernelRuntimeEnvelopeBase<KernelEvent>,
  ): void {
    if (!envelope.eventId) {
      return
    }

    this.replayableScopesByEventId.set(envelope.eventId, {
      runtimeId: envelope.runtimeId,
      conversationId: envelope.conversationId,
      turnId: envelope.turnId,
    })

    this.replayBuffer.push(envelope)
    const overflow = this.replayBuffer.length - this.maxReplayEvents
    if (overflow > 0) {
      const evicted = this.replayBuffer.splice(0, overflow)
      for (const entry of evicted) {
        if (entry.eventId) {
          this.replayableScopesByEventId.delete(entry.eventId)
        }
      }
    }
  }

  private matchesReplayRequest(
    scope: KernelEventScope,
    request: RuntimeEventReplayRequest,
  ): boolean {
    if (
      request.conversationId &&
      scope.conversationId !== request.conversationId
    ) {
      return false
    }
    if (request.turnId && scope.turnId !== request.turnId) {
      return false
    }
    return true
  }

  private notifyListeners(envelope: KernelRuntimeEnvelopeBase): void {
    for (const listener of this.listeners) {
      try {
        listener(envelope)
      } catch {
        // Runtime event observation must not mutate execution semantics.
      }
    }
  }
}
