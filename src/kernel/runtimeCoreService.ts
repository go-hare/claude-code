import type { KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'
import type { KernelEvent } from '../runtime/contracts/events.js'
import type { KernelPermissionDecision } from '../runtime/contracts/permissions.js'
import type {
  KernelRuntimeHostIdentity,
  KernelRuntimeId,
} from '../runtime/contracts/runtime.js'
import type {
  KernelCapabilityDescriptor,
  KernelCapabilityReloadScope,
} from '../runtime/contracts/capability.js'
import { RuntimePermissionBroker } from '../runtime/capabilities/permissions/RuntimePermissionBroker.js'
import { createDefaultRuntimeCapabilityResolver } from '../runtime/capabilities/defaultRuntimeCapabilities.js'
import type { RuntimeCapabilityResolver } from '../runtime/capabilities/RuntimeCapabilityResolver.js'
import { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import { RuntimeEventFileJournal } from '../runtime/core/events/RuntimeEventJournal.js'

export type RuntimeCoreServiceOptions = {
  runtimeId?: KernelRuntimeId
  workspacePath?: string
  eventBus?: RuntimeEventBus
  eventJournalPath?: string | false
  maxReplayEvents?: number
  permissionBroker?: RuntimePermissionBroker
  capabilityResolver?: RuntimeCapabilityResolver
}

type RuntimeHostRecord = {
  identity: KernelRuntimeHostIdentity
  state: 'connected' | 'disconnected'
  connectCount: number
  disconnectReason?: string
  disconnectPolicy?: string
}

export class RuntimeCoreService {
  readonly runtimeId: KernelRuntimeId
  readonly eventBus: RuntimeEventBus
  readonly permissionBroker: RuntimePermissionBroker
  readonly capabilityResolver: RuntimeCapabilityResolver
  private runtimeWorkspacePath: string
  private readonly hosts = new Map<string, RuntimeHostRecord>()

  constructor(options: RuntimeCoreServiceOptions = {}) {
    this.runtimeId = options.runtimeId ?? 'kernel-runtime'
    this.runtimeWorkspacePath = options.workspacePath ?? process.cwd()
    const eventJournalPath =
      options.eventJournalPath === false
        ? undefined
        : (options.eventJournalPath ??
          process.env.HARE_KERNEL_RUNTIME_EVENT_JOURNAL)
    const eventJournal = eventJournalPath
      ? new RuntimeEventFileJournal(eventJournalPath, options.maxReplayEvents)
      : undefined
    this.eventBus =
      options.eventBus ??
      new RuntimeEventBus({
        runtimeId: this.runtimeId,
        maxReplayEvents: options.maxReplayEvents,
        initialReplayEnvelopes: eventJournal?.readReplayableEnvelopes(),
      })
    if (eventJournal) {
      this.eventBus.subscribe(envelope => {
        eventJournal.append(envelope)
      })
    }
    this.permissionBroker =
      options.permissionBroker ??
      new RuntimePermissionBroker({
        eventBus: this.eventBus,
      })
    this.capabilityResolver =
      options.capabilityResolver ??
      createDefaultRuntimeCapabilityResolver({
        cwd: this.runtimeWorkspacePath,
        metadata: { protocol: 'json-rpc-lite' },
      })
  }

  get workspacePath(): string {
    return this.runtimeWorkspacePath
  }

  ping(): Record<string, unknown> {
    return {
      runtimeId: this.runtimeId,
      pong: true,
    }
  }

  initialize(params: {
    workspacePath?: string
    client?: Record<string, unknown>
    provider?: unknown
    defaultProvider?: unknown
    auth?: Record<string, unknown>
    model?: string
    capabilities?: Record<string, unknown>
  }): Record<string, unknown> {
    this.runtimeWorkspacePath =
      params.workspacePath ?? this.runtimeWorkspacePath
    this.eventBus.emit({
      type: 'runtime.ready',
      replayable: true,
      payload: stripUndefined({
        runtimeId: this.runtimeId,
        workspacePath: this.runtimeWorkspacePath,
        client: params.client,
        provider: params.provider,
        defaultProvider: params.defaultProvider,
        auth: params.auth,
        model: params.model,
        capabilities: params.capabilities,
      }),
    })
    return {
      runtimeId: this.runtimeId,
      state: 'ready',
      workspacePath: this.runtimeWorkspacePath,
    }
  }

  decidePermission(
    decision: KernelPermissionDecision,
  ): KernelPermissionDecision {
    return this.permissionBroker.decide(decision)
  }

  connectHost(params: {
    host: KernelRuntimeHostIdentity
    sinceEventId?: string
    metadata?: Record<string, unknown>
  }): Record<string, unknown> {
    const replay = this.replayRuntimeScopedEvents(params.sinceEventId)
    const previous = this.hosts.get(params.host.id)
    const record: RuntimeHostRecord = {
      identity: params.host,
      state: 'connected',
      connectCount: (previous?.connectCount ?? 0) + 1,
    }
    this.hosts.set(params.host.id, record)
    this.eventBus.emit({
      type: previous ? 'host.reconnected' : 'host.connected',
      replayable: true,
      payload: stripUndefined({
        host: params.host,
        previousState: previous?.state,
        replayedEvents: replay.length,
        sinceEventId: params.sinceEventId,
      }),
      metadata: params.metadata,
    })
    return stripUndefined({
      connected: true,
      hostId: params.host.id,
      state: record.state,
      previousState: previous?.state,
      replayedEvents: replay.length,
    })
  }

  disconnectHost(params: {
    hostId: string
    reason?: string
    policy?: 'detach' | 'continue' | 'abort_active_turns'
    abortedTurnIds?: readonly string[]
    metadata?: Record<string, unknown>
  }): Record<string, unknown> {
    const host = this.hosts.get(params.hostId)
    if (!host) {
      throw new RuntimeCoreError('not_found', `Unknown host: ${params.hostId}`)
    }
    const policy = params.policy ?? 'detach'
    this.hosts.set(params.hostId, {
      ...host,
      state: 'disconnected',
      disconnectReason: params.reason,
      disconnectPolicy: policy,
    })
    const payload = stripUndefined({
      hostId: params.hostId,
      policy,
      reason: params.reason,
      abortedTurnIds: params.abortedTurnIds ?? [],
    })
    this.eventBus.emit({
      type: 'host.disconnected',
      replayable: true,
      payload,
      metadata: params.metadata,
    })
    return stripUndefined({
      disconnected: true,
      ...payload,
    })
  }

  replayRuntimeScopedEvents(
    sinceEventId: string | undefined,
  ): KernelRuntimeEnvelopeBase[] {
    if (!sinceEventId) {
      return []
    }
    return this.eventBus
      .replay({ sinceEventId })
      .filter(envelope => !envelope.conversationId && !envelope.turnId)
  }

  async reloadCapabilities(params: {
    scope?: KernelCapabilityReloadScope
    capabilities?: readonly string[]
    metadata?: Record<string, unknown>
  }): Promise<{ descriptors: readonly KernelCapabilityDescriptor[] }> {
    const descriptors = await this.capabilityResolver.reloadCapabilities(
      params.scope ?? { type: 'runtime' },
      {
        cwd: this.runtimeWorkspacePath,
        metadata: params.metadata,
      },
    )
    this.eventBus.emit({
      type: 'capabilities.reloaded',
      replayable: true,
      payload: stripUndefined({
        scope: params.scope,
        capabilities: params.capabilities,
        descriptors,
      }),
      metadata: params.metadata,
    })
    return { descriptors: stripUndefined(descriptors) ?? [] }
  }

  publishHostEvent(params: {
    event: KernelEvent
    requestId?: string
  }): Record<string, unknown> {
    const event = this.eventBus.emit({
      ...params.event,
      metadata: {
        ...params.event.metadata,
        publishedBy: 'host',
        requestId: params.requestId,
      },
    })
    return {
      published: true,
      eventId: event.eventId,
    }
  }

  error(input: {
    code:
      | 'invalid_request'
      | 'schema_mismatch'
      | 'not_found'
      | 'busy'
      | 'permission_denied'
      | 'aborted'
      | 'unavailable'
      | 'internal_error'
    message: string
    conversationId?: string
    turnId?: string
    retryable?: boolean
    details?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }): KernelRuntimeEnvelopeBase {
    return this.eventBus.error(input)
  }
}

export class RuntimeCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'RuntimeCoreError'
  }
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter(item => item !== undefined)
      .map(item => stripUndefined(item)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefined(item)]),
    ) as T
  }
  return value
}
