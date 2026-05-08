import type {
  RuntimeAgentRunCancelRequest,
  RuntimeAgentRunOutputRequest,
  RuntimeAgentSpawnRequest,
} from '../runtime/contracts/agent.js'
import type { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import { stripUndefined } from './corePayload.js'
import {
  createDefaultKernelRuntimeAgentRegistry,
  type KernelRuntimeAgentRegistry,
} from './runtimeAgentTaskRegistries.js'

export type AgentCoreServiceOptions = {
  workspacePath?: string
  eventBus?: RuntimeEventBus
  agentRegistry?: KernelRuntimeAgentRegistry
}

export class AgentCoreService {
  private readonly agentRegistry: KernelRuntimeAgentRegistry

  constructor(private readonly options: AgentCoreServiceOptions = {}) {
    this.agentRegistry =
      options.agentRegistry ??
      createDefaultKernelRuntimeAgentRegistry(options.workspacePath)
  }

  async listAgents(): Promise<unknown> {
    const snapshot = await this.agentRegistry.listAgents(this.context())
    return stripUndefined(snapshot)
  }

  async spawnAgent(request: RuntimeAgentSpawnRequest): Promise<unknown> {
    const spawnAgent = this.agentRegistry.spawnAgent
    if (!spawnAgent) {
      throw new AgentCoreError('unavailable', 'Agent spawner is not available')
    }
    const result = await spawnAgent(request, this.context(request.metadata))
    this.emit('agents.spawned', result, request.metadata)
    return stripUndefined(result)
  }

  async listRuns(): Promise<unknown> {
    const listAgentRuns = this.agentRegistry.listAgentRuns
    if (!listAgentRuns) {
      throw new AgentCoreError(
        'unavailable',
        'Agent run registry is not available',
      )
    }
    return stripUndefined(await listAgentRuns(this.context()))
  }

  async getRun(runId: string): Promise<unknown> {
    const getAgentRun = this.agentRegistry.getAgentRun
    if (!getAgentRun) {
      throw new AgentCoreError(
        'unavailable',
        'Agent run registry is not available',
      )
    }
    return {
      run: stripUndefined(await getAgentRun(runId, this.context())),
    }
  }

  async getOutput(request: RuntimeAgentRunOutputRequest): Promise<unknown> {
    const getAgentOutput = this.agentRegistry.getAgentOutput
    if (!getAgentOutput) {
      throw new AgentCoreError('unavailable', 'Agent run output is not available')
    }
    return stripUndefined(await getAgentOutput(request, this.context()))
  }

  async cancelRun(request: RuntimeAgentRunCancelRequest): Promise<unknown> {
    const cancelAgentRun = this.agentRegistry.cancelAgentRun
    if (!cancelAgentRun) {
      throw new AgentCoreError(
        'unavailable',
        'Agent run cancellation is not available',
      )
    }
    const result = await cancelAgentRun(request, this.context())
    if (result.cancelled) {
      this.emit('agents.run.cancelled', result)
    }
    return stripUndefined(result)
  }

  private context(metadata?: Record<string, unknown>): {
    cwd: string
    metadata: Record<string, unknown>
  } {
    return {
      cwd: this.options.workspacePath ?? process.cwd(),
      metadata: {
        protocol: 'json-rpc-lite',
        ...metadata,
      },
    }
  }

  private emit(
    type: string,
    payload: unknown,
    metadata?: Record<string, unknown>,
  ): void {
    this.options.eventBus?.emit({
      type,
      replayable: true,
      payload: stripUndefined(payload),
      metadata: {
        protocol: 'json-rpc-lite',
        ...metadata,
      },
    })
  }
}

export class AgentCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AgentCoreError'
  }
}
