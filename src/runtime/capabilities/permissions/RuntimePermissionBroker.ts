import type {
  KernelPermissionDecision,
  KernelPermissionDecisionValue,
  KernelPermissionRequest,
  KernelPermissionRequestId,
} from '../../contracts/permissions.js'
import type { RuntimeEventBus } from '../../core/events/RuntimeEventBus.js'

type RuntimePermissionTimer = ReturnType<typeof setTimeout>

export type RuntimePermissionDecisionHandler = (
  request: KernelPermissionRequest,
  signal: AbortSignal,
) => Promise<KernelPermissionDecision> | KernelPermissionDecision

export type RuntimePermissionSessionGrant = {
  permissionRequestId: KernelPermissionRequestId
  decision: KernelPermissionDecisionValue
  expiresAt?: string
  reason?: string
}

export type RuntimePermissionBrokerOptions = {
  eventBus?: Pick<RuntimeEventBus, 'emit'>
  decide?: RuntimePermissionDecisionHandler
  defaultTimeoutMs?: number
  timeoutDecision?: Extract<KernelPermissionDecisionValue, 'deny' | 'abort'>
  now?: () => string
  createSessionGrantKey?: (request: KernelPermissionRequest) => string
}

type PendingPermissionRequest = {
  request: KernelPermissionRequest
  promise: Promise<KernelPermissionDecision>
  resolve: (decision: KernelPermissionDecision) => void
  abortController: AbortController
  timeout: RuntimePermissionTimer | undefined
}

export class RuntimePermissionBrokerDisposedError extends Error {
  constructor() {
    super('Runtime permission broker has been disposed')
    this.name = 'RuntimePermissionBrokerDisposedError'
  }
}

export class RuntimePermissionDecisionError extends Error {
  constructor(readonly permissionRequestId: KernelPermissionRequestId) {
    super(`Permission request ${permissionRequestId} is not pending`)
    this.name = 'RuntimePermissionDecisionError'
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function defaultSessionGrantKey(request: KernelPermissionRequest): string {
  return [
    request.conversationId,
    request.toolName,
    request.action,
    request.risk,
  ].join(':')
}

export class RuntimePermissionBroker {
  private readonly pending = new Map<
    KernelPermissionRequestId,
    PendingPermissionRequest
  >()
  private readonly finalized = new Map<
    KernelPermissionRequestId,
    KernelPermissionDecision
  >()
  private readonly sessionGrants = new Map<
    string,
    RuntimePermissionSessionGrant
  >()
  private readonly now: () => string
  private readonly createSessionGrantKey: (
    request: KernelPermissionRequest,
  ) => string
  private disposed = false

  constructor(private readonly options: RuntimePermissionBrokerOptions = {}) {
    this.now = options.now ?? nowIso
    this.createSessionGrantKey =
      options.createSessionGrantKey ?? defaultSessionGrantKey
  }

  requestPermission(
    request: KernelPermissionRequest,
  ): Promise<KernelPermissionDecision> {
    this.assertLive()

    const finalized = this.finalized.get(request.permissionRequestId)
    if (finalized) {
      return Promise.resolve(finalized)
    }

    const pending = this.pending.get(request.permissionRequestId)
    if (pending) {
      return pending.promise
    }

    this.emitAuditEvent('permission.requested', request)

    const reusableGrant = this.findReusableSessionGrant(request)
    if (reusableGrant) {
      const decision: KernelPermissionDecision = {
        permissionRequestId: request.permissionRequestId,
        decision: 'allow_session',
        decidedBy: 'policy',
        reason: reusableGrant.reason ?? 'Reused session permission grant',
        metadata: {
          grantedBy: reusableGrant.permissionRequestId,
        },
      }
      if (reusableGrant.expiresAt !== undefined) {
        decision.expiresAt = reusableGrant.expiresAt
      }
      this.recordFinalDecision(request, decision)
      return Promise.resolve(decision)
    }

    const pendingRequest = this.createPendingRequest(request)
    this.pending.set(request.permissionRequestId, pendingRequest)

    if (this.options.decide) {
      void Promise.resolve(
        this.options.decide(request, pendingRequest.abortController.signal),
      )
        .then(decision => {
          this.resolvePendingRequest(request.permissionRequestId, decision)
        })
        .catch(error => {
          this.resolvePendingRequest(
            request.permissionRequestId,
            this.createRuntimeDecision(
              request.permissionRequestId,
              'deny',
              `Permission handler failed: ${formatError(error)}`,
            ),
          )
        })
    }

    return pendingRequest.promise
  }

  decide(decision: KernelPermissionDecision): KernelPermissionDecision {
    return this.resolvePendingRequest(decision.permissionRequestId, decision)
  }

  dispose(reason = 'Permission host disconnected'): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    for (const pending of [...this.pending.values()]) {
      this.resolvePending(
        pending,
        this.createRuntimeDecision(
          pending.request.permissionRequestId,
          'deny',
          reason,
        ),
      )
    }
  }

  snapshot(): {
    pendingRequestIds: KernelPermissionRequestId[]
    finalizedRequestIds: KernelPermissionRequestId[]
    sessionGrantCount: number
    disposed: boolean
  } {
    return {
      pendingRequestIds: [...this.pending.keys()],
      finalizedRequestIds: [...this.finalized.keys()],
      sessionGrantCount: this.sessionGrants.size,
      disposed: this.disposed,
    }
  }

  private createPendingRequest(
    request: KernelPermissionRequest,
  ): PendingPermissionRequest {
    let resolve!: (decision: KernelPermissionDecision) => void
    const promise = new Promise<KernelPermissionDecision>(innerResolve => {
      resolve = innerResolve
    })

    const abortController = new AbortController()
    const timeoutMs = request.timeoutMs ?? this.options.defaultTimeoutMs
    const timeout =
      timeoutMs === undefined
        ? undefined
        : setTimeout(
            () => {
              this.resolvePendingRequest(
                request.permissionRequestId,
                this.createTimeoutDecision(request.permissionRequestId),
              )
            },
            Math.max(0, timeoutMs),
          )

    return {
      request,
      promise,
      resolve,
      abortController,
      timeout,
    }
  }

  private resolvePendingRequest(
    permissionRequestId: KernelPermissionRequestId,
    decision: KernelPermissionDecision,
  ): KernelPermissionDecision {
    const finalized = this.finalized.get(permissionRequestId)
    if (finalized) {
      return finalized
    }

    const pending = this.pending.get(permissionRequestId)
    if (!pending) {
      throw new RuntimePermissionDecisionError(permissionRequestId)
    }

    return this.resolvePending(pending, decision)
  }

  private resolvePending(
    pending: PendingPermissionRequest,
    decision: KernelPermissionDecision,
  ): KernelPermissionDecision {
    if (pending.timeout) {
      clearTimeout(pending.timeout)
    }
    pending.abortController.abort()
    this.pending.delete(pending.request.permissionRequestId)

    const normalizedDecision = this.withRequestId(
      pending.request.permissionRequestId,
      decision,
    )
    this.recordFinalDecision(pending.request, normalizedDecision)
    pending.resolve(normalizedDecision)
    return normalizedDecision
  }

  private recordFinalDecision(
    request: KernelPermissionRequest,
    decision: KernelPermissionDecision,
  ): void {
    this.finalized.set(request.permissionRequestId, decision)

    if (decision.decision === 'allow_session') {
      const grant: RuntimePermissionSessionGrant = {
        permissionRequestId: request.permissionRequestId,
        decision: decision.decision,
      }
      if (decision.expiresAt !== undefined) {
        grant.expiresAt = decision.expiresAt
      }
      if (decision.reason !== undefined) {
        grant.reason = decision.reason
      }
      this.sessionGrants.set(this.createSessionGrantKey(request), grant)
    }

    this.emitAuditEvent('permission.resolved', request, decision)
  }

  private findReusableSessionGrant(
    request: KernelPermissionRequest,
  ): RuntimePermissionSessionGrant | undefined {
    const key = this.createSessionGrantKey(request)
    const grant = this.sessionGrants.get(key)
    if (!grant) {
      return undefined
    }

    if (
      grant.expiresAt &&
      Date.parse(grant.expiresAt) <= Date.parse(this.now())
    ) {
      this.sessionGrants.delete(key)
      return undefined
    }

    return grant
  }

  private createTimeoutDecision(
    permissionRequestId: KernelPermissionRequestId,
  ): KernelPermissionDecision {
    return {
      permissionRequestId,
      decision: this.options.timeoutDecision ?? 'deny',
      decidedBy: 'timeout',
      reason: 'Permission request timed out',
    }
  }

  private createRuntimeDecision(
    permissionRequestId: KernelPermissionRequestId,
    decision: Extract<KernelPermissionDecisionValue, 'deny' | 'abort'>,
    reason: string,
  ): KernelPermissionDecision {
    return {
      permissionRequestId,
      decision,
      decidedBy: 'runtime',
      reason,
    }
  }

  private withRequestId(
    permissionRequestId: KernelPermissionRequestId,
    decision: KernelPermissionDecision,
  ): KernelPermissionDecision {
    if (decision.permissionRequestId === permissionRequestId) {
      return decision
    }
    return {
      ...decision,
      permissionRequestId,
    }
  }

  private emitAuditEvent(
    type: 'permission.requested' | 'permission.resolved',
    request: KernelPermissionRequest,
    decision?: KernelPermissionDecision,
  ): void {
    const payload: Record<string, unknown> = {
      ...request,
    }
    if (decision?.decidedBy !== undefined) {
      payload.decidedBy = decision.decidedBy
    }
    if (decision?.decision !== undefined) {
      payload.decision = decision.decision
    }
    if (decision?.reason !== undefined) {
      payload.reason = decision.reason
    }
    if (decision?.expiresAt !== undefined) {
      payload.expiresAt = decision.expiresAt
    }
    if (decision?.metadata !== undefined) {
      payload.decisionMetadata = decision.metadata
    }

    this.options.eventBus?.emit({
      conversationId: request.conversationId,
      turnId: request.turnId,
      type,
      replayable: true,
      payload,
    })
  }

  private assertLive(): void {
    if (this.disposed) {
      throw new RuntimePermissionBrokerDisposedError()
    }
  }
}
