import type { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import type {
  KernelCompanionAction,
  KernelCompanionReactionRequest,
  KernelCompanionRuntime,
} from './companion.js'
import { createKernelCompanionRuntime } from './companion.js'
import type {
  KernelKairosExternalEvent,
  KernelKairosRuntime,
  KernelKairosTickRequest,
} from './kairos.js'
import { createKernelKairosRuntime } from './kairos.js'
import { stripUndefined } from './corePayload.js'

export type AutonomyCoreServiceOptions = {
  workspacePath?: string
  eventBus?: RuntimeEventBus
  companionRuntime?: KernelCompanionRuntime
  kairosRuntime?: KernelKairosRuntime
}

export class AutonomyCoreService {
  private readonly companionRuntime: KernelCompanionRuntime
  private readonly kairosRuntime: KernelKairosRuntime

  constructor(private readonly options: AutonomyCoreServiceOptions = {}) {
    this.companionRuntime =
      options.companionRuntime ?? createKernelCompanionRuntime()
    this.kairosRuntime = options.kairosRuntime ?? createKernelKairosRuntime()

    this.companionRuntime.onEvent(event => {
      this.emit('companion.event', event)
    })
    this.kairosRuntime.onEvent(event => {
      this.emit('kairos.event', event)
    })
  }

  async getCompanionState(): Promise<unknown> {
    return stripUndefined({
      state: await this.companionRuntime.getState(),
    })
  }

  async dispatchCompanionAction(
    action: KernelCompanionAction,
  ): Promise<unknown> {
    return stripUndefined({
      state: await this.companionRuntime.dispatch(action),
    })
  }

  async reactCompanion(
    request: KernelCompanionReactionRequest,
  ): Promise<unknown> {
    await this.companionRuntime.reactToTurn(request)
    return { ok: true }
  }

  async getKairosStatus(): Promise<unknown> {
    return stripUndefined({
      status: await this.kairosRuntime.getStatus(),
    })
  }

  async enqueueKairosEvent(event: KernelKairosExternalEvent): Promise<unknown> {
    await this.kairosRuntime.enqueueEvent(event)
    return this.getKairosStatus()
  }

  async tickKairos(request?: KernelKairosTickRequest): Promise<unknown> {
    await this.kairosRuntime.tick(request)
    return this.getKairosStatus()
  }

  async suspendKairos(reason?: string): Promise<unknown> {
    await this.kairosRuntime.suspend(reason)
    return this.getKairosStatus()
  }

  async resumeKairos(reason?: string): Promise<unknown> {
    await this.kairosRuntime.resume(reason)
    return this.getKairosStatus()
  }

  private emit(type: string, payload: unknown): void {
    this.options.eventBus?.emit({
      type,
      replayable: true,
      payload: stripUndefined(payload),
      metadata: {
        protocol: 'json-rpc-lite',
      },
    })
  }
}
