import type { KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'
import type {
  KernelPermissionDecision,
} from '../runtime/contracts/permissions.js'
import type { KernelRuntimeId } from '../runtime/contracts/runtime.js'
import { RuntimePermissionBroker } from '../runtime/capabilities/permissions/RuntimePermissionBroker.js'
import { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import { RuntimeEventFileJournal } from '../runtime/core/events/RuntimeEventJournal.js'

export type RuntimeCoreServiceOptions = {
  runtimeId?: KernelRuntimeId
  workspacePath?: string
  eventBus?: RuntimeEventBus
  eventJournalPath?: string | false
  maxReplayEvents?: number
  permissionBroker?: RuntimePermissionBroker
}

export class RuntimeCoreService {
  readonly runtimeId: KernelRuntimeId
  readonly eventBus: RuntimeEventBus
  readonly permissionBroker: RuntimePermissionBroker
  private runtimeWorkspacePath: string

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
    this.runtimeWorkspacePath = params.workspacePath ?? this.runtimeWorkspacePath
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
