import type {
  RuntimeAgentDefinitionError,
  RuntimeAgentDescriptor,
  RuntimeAgentMcpServerRef,
  RuntimeAgentRegistrySnapshot,
  RuntimeAgentRunCancelResult,
  RuntimeAgentRunDescriptor,
  RuntimeAgentRunOutput,
  RuntimeAgentRunStatus,
  RuntimeAgentSource,
  RuntimeAgentSpawnRequest,
  RuntimeAgentSpawnResult,
} from '../runtime/contracts/agent.js'
import type { KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'
import type { KernelRuntimeEventReplayOptions } from './runtime.js'
import type { KernelRuntimeAgentEvent } from './runtimeEvents.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import {
  collectReplayEvents,
  expectPayload,
  waitForRuntimeEventDelivery,
} from './runtimeEnvelope.js'
import {
  isKernelAgentsRunCancelledEvent,
  isKernelAgentsSpawnedEvent,
} from './runtimeEvents.js'

export type KernelAgentSource = RuntimeAgentSource
export type KernelAgentMcpServerRef = RuntimeAgentMcpServerRef
export type KernelAgentDefinitionError = RuntimeAgentDefinitionError
export type KernelAgentDescriptor = RuntimeAgentDescriptor
export type KernelAgentSnapshot = RuntimeAgentRegistrySnapshot
export type KernelAgentSpawnRequest = RuntimeAgentSpawnRequest
export type KernelAgentSpawnResult = RuntimeAgentSpawnResult
export type KernelAgentRunStatus = RuntimeAgentRunStatus
export type KernelAgentRunDescriptor = RuntimeAgentRunDescriptor
export type KernelAgentOutput = RuntimeAgentRunOutput
export type KernelAgentCancelResult = RuntimeAgentRunCancelResult

export type KernelAgentFilter = {
  agentTypes?: readonly string[]
  source?: RuntimeAgentSource | readonly RuntimeAgentSource[]
  active?: boolean
  background?: boolean
  model?: string | readonly string[]
  tool?: string
  skill?: string
  mcpServer?: string
}

export type KernelAgentRunFilter = {
  runIds?: readonly string[]
  agentTypes?: readonly string[]
  statuses?: readonly RuntimeAgentRunStatus[]
  taskId?: string
  taskListId?: string
  background?: boolean
}

export type KernelAgentOutputOptions = {
  tailBytes?: number
}

export type KernelAgentCancelOptions = {
  reason?: string
}

export type KernelRuntimeAgents = {
  list(filter?: KernelAgentFilter): Promise<readonly KernelAgentDescriptor[]>
  all(filter?: KernelAgentFilter): Promise<readonly KernelAgentDescriptor[]>
  get(
    agentType: string,
    options?: { includeInactive?: boolean },
  ): Promise<KernelAgentDescriptor | undefined>
  snapshot(): Promise<KernelAgentSnapshot>
  reload(): Promise<KernelAgentSnapshot>
  spawn(request: KernelAgentSpawnRequest): Promise<KernelAgentSpawnResult>
  runs(
    filter?: KernelAgentRunFilter,
  ): Promise<readonly KernelAgentRunDescriptor[]>
  getRun(runId: string): Promise<KernelAgentRunDescriptor | undefined>
  status(runId: string): Promise<KernelAgentRunDescriptor | undefined>
  output(
    runId: string,
    options?: KernelAgentOutputOptions,
  ): Promise<KernelAgentOutput>
  result(runId: string): Promise<unknown>
  cancel(
    runId: string,
    options?: KernelAgentCancelOptions,
  ): Promise<KernelAgentCancelResult>
  onEvent(handler: (event: KernelRuntimeAgentEvent) => void): () => void
  replay(
    options?: KernelRuntimeEventReplayOptions,
  ): Promise<readonly KernelRuntimeAgentEvent[]>
}

export function createKernelRuntimeAgentsFacade(
  client: KernelRuntimeWireClient,
): KernelRuntimeAgents {
  async function snapshot(): Promise<KernelAgentSnapshot> {
    const payload = expectPayload<Partial<RuntimeAgentRegistrySnapshot>>(
      await client.listAgents(),
    )
    return toAgentSnapshot(payload)
  }

  return {
    list: async filter =>
      (await snapshot()).activeAgents.filter(agent =>
        matchesAgentFilter(agent, filter ?? {}),
      ),
    all: async filter =>
      (await snapshot()).allAgents.filter(agent =>
        matchesAgentFilter(agent, filter ?? {}),
      ),
    get: async (agentType, options = {}) => {
      const current = await snapshot()
      const agents = options.includeInactive
        ? current.allAgents
        : current.activeAgents
      return agents.find(agent => agent.agentType === agentType)
    },
    snapshot,
    reload: async () => {
      const payload = expectPayload<Partial<RuntimeAgentRegistrySnapshot>>(
        await client.reloadAgents(),
      )
      return toAgentSnapshot(payload)
    },
    spawn: async request => {
      const payload = expectPayload<RuntimeAgentSpawnResult>(
        await client.spawnAgent(request),
      )
      await waitForRuntimeEventDelivery()
      return toAgentSpawnResult(payload)
    },
    runs: async filter => {
      const payload = expectPayload<{ runs?: unknown }>(
        await client.listAgentRuns(),
      )
      return toAgentRuns(payload.runs).filter(run =>
        matchesAgentRunFilter(run, filter ?? {}),
      )
    },
    getRun: async runId => {
      const payload = expectPayload<{ run?: unknown }>(
        await client.getAgentRun({ runId }),
      )
      return isAgentRunDescriptor(payload.run) ? payload.run : undefined
    },
    status: async runId => {
      const payload = expectPayload<{ run?: unknown }>(
        await client.getAgentRun({ runId }),
      )
      return isAgentRunDescriptor(payload.run) ? payload.run : undefined
    },
    output: async (runId, options = {}) => {
      const payload = expectPayload<RuntimeAgentRunOutput>(
        await client.getAgentOutput({ runId, tailBytes: options.tailBytes }),
      )
      return toAgentOutput(payload)
    },
    result: async runId => {
      const payload = expectPayload<{ run?: unknown }>(
        await client.getAgentRun({ runId }),
      )
      return isAgentRunDescriptor(payload.run) ? payload.run.result : undefined
    },
    cancel: async (runId, options = {}) => {
      const payload = expectPayload<RuntimeAgentRunCancelResult>(
        await client.cancelAgentRun({ runId, reason: options.reason }),
      )
      await waitForRuntimeEventDelivery()
      return toAgentCancelResult(payload)
    },
    onEvent: handler =>
      client.onEvent(envelope => {
        if (isKernelAgentEvent(envelope)) {
          handler(envelope)
        }
      }),
    replay: async (options = {}) => {
      const replayed = await collectReplayEvents(client, options)
      return replayed.filter(isKernelAgentEvent)
    },
  }
}

function isKernelAgentEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelRuntimeAgentEvent {
  return (
    isKernelAgentsSpawnedEvent(envelope) ||
    isKernelAgentsRunCancelledEvent(envelope)
  )
}

function toAgentSnapshot(
  value: Partial<RuntimeAgentRegistrySnapshot>,
): KernelAgentSnapshot {
  return {
    activeAgents: toAgentDescriptors(value.activeAgents),
    allAgents: toAgentDescriptors(value.allAgents),
    failedFiles: toAgentDefinitionErrors(value.failedFiles),
    allowedAgentTypes: toStrings(value.allowedAgentTypes),
  }
}

function toAgentDescriptors(value: unknown): readonly KernelAgentDescriptor[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isAgentDescriptor)
}

function toAgentDefinitionErrors(
  value: unknown,
): readonly KernelAgentDefinitionError[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const errors = value.filter(isAgentDefinitionError)
  return errors.length > 0 ? errors : undefined
}

function isAgentDescriptor(value: unknown): value is KernelAgentDescriptor {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { agentType?: unknown }).agentType === 'string' &&
    typeof (value as { whenToUse?: unknown }).whenToUse === 'string' &&
    typeof (value as { source?: unknown }).source === 'string'
  )
}

function isAgentDefinitionError(
  value: unknown,
): value is KernelAgentDefinitionError {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { path?: unknown }).path === 'string' &&
    typeof (value as { error?: unknown }).error === 'string'
  )
}

function toAgentSpawnResult(value: unknown): KernelAgentSpawnResult {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { status?: unknown }).status !== 'string' ||
    typeof (value as { prompt?: unknown }).prompt !== 'string'
  ) {
    throw new Error('Invalid kernel agent spawn result')
  }
  return value as KernelAgentSpawnResult
}

function toAgentRuns(value: unknown): readonly KernelAgentRunDescriptor[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isAgentRunDescriptor)
}

function isAgentRunDescriptor(
  value: unknown,
): value is KernelAgentRunDescriptor {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { runId?: unknown }).runId === 'string' &&
    typeof (value as { status?: unknown }).status === 'string' &&
    typeof (value as { prompt?: unknown }).prompt === 'string' &&
    typeof (value as { createdAt?: unknown }).createdAt === 'string' &&
    typeof (value as { updatedAt?: unknown }).updatedAt === 'string'
  )
}

function toAgentOutput(value: unknown): KernelAgentOutput {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { runId?: unknown }).runId !== 'string' ||
    typeof (value as { available?: unknown }).available !== 'boolean'
  ) {
    throw new Error('Invalid kernel agent output result')
  }
  return value as KernelAgentOutput
}

function toAgentCancelResult(value: unknown): KernelAgentCancelResult {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { runId?: unknown }).runId !== 'string' ||
    typeof (value as { cancelled?: unknown }).cancelled !== 'boolean'
  ) {
    throw new Error('Invalid kernel agent cancel result')
  }
  return value as KernelAgentCancelResult
}

function matchesAgentFilter(
  agent: KernelAgentDescriptor,
  filter: KernelAgentFilter,
): boolean {
  if (filter.agentTypes && !filter.agentTypes.includes(agent.agentType)) {
    return false
  }
  if (filter.source && !asArray(filter.source).includes(agent.source)) {
    return false
  }
  if (filter.active !== undefined && agent.active !== filter.active) {
    return false
  }
  if (
    filter.background !== undefined &&
    agent.background !== filter.background
  ) {
    return false
  }
  if (filter.model && !matchesOptional(agent.model, filter.model)) {
    return false
  }
  if (filter.tool && !(agent.tools?.includes(filter.tool) ?? false)) {
    return false
  }
  if (filter.skill && !(agent.skills?.includes(filter.skill) ?? false)) {
    return false
  }
  if (
    filter.mcpServer &&
    !(
      agent.mcpServers?.some(server => server.name === filter.mcpServer) ??
      false
    )
  ) {
    return false
  }
  return true
}

function matchesAgentRunFilter(
  run: KernelAgentRunDescriptor,
  filter: KernelAgentRunFilter,
): boolean {
  if (filter.runIds && !filter.runIds.includes(run.runId)) {
    return false
  }
  if (
    filter.agentTypes &&
    (!run.agentType || !filter.agentTypes.includes(run.agentType))
  ) {
    return false
  }
  if (filter.statuses && !filter.statuses.includes(run.status)) {
    return false
  }
  if (filter.taskId !== undefined && run.taskId !== filter.taskId) {
    return false
  }
  if (filter.taskListId !== undefined && run.taskListId !== filter.taskListId) {
    return false
  }
  if (
    filter.background !== undefined &&
    run.runInBackground !== filter.background
  ) {
    return false
  }
  return true
}

function toStrings(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const strings = value.filter(
    (candidate): candidate is string => typeof candidate === 'string',
  )
  return strings.length > 0 ? strings : undefined
}

function matchesOptional(
  value: string | undefined,
  filter: string | readonly string[],
): boolean {
  return value !== undefined && asArray(filter).includes(value)
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [value as T]
}
