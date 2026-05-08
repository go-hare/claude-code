import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'

import type {
  AgentDefinition,
  AgentDefinitionsResult,
  AgentMcpServerSpec,
} from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'

import type {
  RuntimeAgentDescriptor,
  RuntimeAgentMcpServerRef,
  RuntimeAgentRegistrySnapshot,
  RuntimeAgentRunCancelRequest,
  RuntimeAgentRunCancelResult,
  RuntimeAgentRunDescriptor,
  RuntimeAgentRunListSnapshot,
  RuntimeAgentRunOutput,
  RuntimeAgentRunOutputRequest,
  RuntimeAgentSpawnRequest,
  RuntimeAgentSpawnResult,
  RuntimeAgentSource,
} from '../runtime/contracts/agent.js'
import type {
  RuntimeTaskAssignRequest,
  RuntimeTaskCreateRequest,
  RuntimeTaskDescriptor,
  RuntimeTaskExecutionMetadata,
  RuntimeTaskListSnapshot,
  RuntimeTaskMutationResult,
  RuntimeTaskUpdateRequest,
} from '../runtime/contracts/task.js'
import type { Task } from '../utils/tasks.js'
import {
  createKernelRuntimeAgentProcessExecutor,
  type KernelRuntimeAgentExecutor,
  type KernelRuntimeAgentExecutorOutput,
  type KernelRuntimeAgentExecutorResult,
} from './runtimeAgentProcessExecutor.js'
import { formatAgentId } from '../utils/agentId.js'

type Awaitable<T> = T | Promise<T>

export type KernelRuntimeCoreRequestContext = {
  cwd?: string
  metadata?: Record<string, unknown>
}

export type KernelRuntimeAgentRegistry = {
  listAgents(
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<RuntimeAgentRegistrySnapshot>
  reload?(
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<void | Partial<RuntimeAgentRegistrySnapshot>>
  spawnAgent?(
    request: RuntimeAgentSpawnRequest,
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<RuntimeAgentSpawnResult>
  listAgentRuns?(
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<RuntimeAgentRunListSnapshot>
  getAgentRun?(
    runId: string,
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<RuntimeAgentRunDescriptor | null>
  getAgentOutput?(
    request: RuntimeAgentRunOutputRequest,
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<RuntimeAgentRunOutput>
  cancelAgentRun?(
    request: RuntimeAgentRunCancelRequest,
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<RuntimeAgentRunCancelResult>
}

export type KernelRuntimeTaskRegistry = {
  listTasks(
    taskListId?: string,
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<RuntimeTaskListSnapshot>
  getTask(
    taskId: string,
    taskListId?: string,
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<RuntimeTaskDescriptor | null>
  createTask?(
    request: RuntimeTaskCreateRequest,
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<RuntimeTaskMutationResult>
  updateTask?(
    request: RuntimeTaskUpdateRequest,
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<RuntimeTaskMutationResult>
  assignTask?(
    request: RuntimeTaskAssignRequest,
    context?: KernelRuntimeCoreRequestContext,
  ): Awaitable<RuntimeTaskMutationResult>
}

export type KernelRuntimeAgentRegistryOptions = {
  executor?: false | KernelRuntimeAgentExecutor
  listAgents?: KernelRuntimeAgentRegistry['listAgents']
}

export function createDefaultKernelRuntimeAgentRegistry(
  workspacePath: string | undefined,
  options: KernelRuntimeAgentRegistryOptions = {},
): KernelRuntimeAgentRegistry {
  let cached: RuntimeAgentRegistrySnapshot | undefined
  const runs = new Map<string, RuntimeAgentRunDescriptor>()
  const controllers = new Map<string, AbortController>()
  const executor =
    options.executor === false
      ? undefined
      : (options.executor ?? createKernelRuntimeAgentProcessExecutor())

  async function listAgents(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Promise<RuntimeAgentRegistrySnapshot> {
    if (options.listAgents) {
      return options.listAgents(context)
    }
    if (!cached) {
      const { getAgentDefinitionsWithOverrides } = await import(
        '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
      )
      cached = toRuntimeAgentRegistrySnapshot(
        await getAgentDefinitionsWithOverrides(
          context?.cwd ?? workspacePath ?? process.cwd(),
        ),
      )
    }
    return cached
  }

  return {
    listAgents,
    async reload(context) {
      if (options.listAgents) {
        return
      }
      const { clearAgentDefinitionsCache } = await import(
        '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
      )
      clearAgentDefinitionsCache()
      cached = undefined
      await listAgents(context)
    },
    async spawnAgent(request, context) {
      const result = await spawnAgentWithDescriptorCheck(request, context, {
        listAgents,
        runs,
        controllers,
        executor,
      })
      await persistAgentTaskExecutionLink(request, result)
      return result
    },
    listAgentRuns(): RuntimeAgentRunListSnapshot {
      return {
        runs: Array.from(runs.values()),
      }
    },
    getAgentRun(runId) {
      return runs.get(runId) ?? null
    },
    getAgentOutput(request) {
      return readAgentRunOutput(request, runs)
    },
    cancelAgentRun(request) {
      return cancelAgentRun(request, runs, controllers)
    },
  }
}

export function createDefaultKernelRuntimeTaskRegistry(
  _workspacePath: string | undefined,
): KernelRuntimeTaskRegistry {
  async function resolveTaskListId(taskListId?: string): Promise<string> {
    if (taskListId) {
      return taskListId
    }
    const { getTaskListId } = await import('../utils/tasks.js')
    return getTaskListId()
  }

  return {
    async listTasks(taskListId) {
      const tasksModule = await import('../utils/tasks.js')
      const resolvedTaskListId = await resolveTaskListId(taskListId)
      const tasks = (await tasksModule.listTasks(resolvedTaskListId))
        .filter(task => task.metadata?._internal !== true)
        .map(task => toRuntimeTaskDescriptor(resolvedTaskListId, task))
      return {
        taskListId: resolvedTaskListId,
        tasks,
      }
    },
    async getTask(taskId, taskListId) {
      const tasksModule = await import('../utils/tasks.js')
      const resolvedTaskListId = await resolveTaskListId(taskListId)
      const task = await tasksModule.getTask(resolvedTaskListId, taskId)
      if (!task || task.metadata?._internal === true) {
        return null
      }
      return toRuntimeTaskDescriptor(resolvedTaskListId, task)
    },
    async createTask(request) {
      const tasksModule = await import('../utils/tasks.js')
      const hooksModule = await import('../utils/hooks.js')
      const teammateModule = await import('../utils/teammate.js')
      const resolvedTaskListId = await resolveTaskListId(request.taskListId)
      const metadata = mergeTaskMetadata(undefined, request.metadata, {
        ownedFiles: request.ownedFiles,
      })
      const taskId = await tasksModule.createTask(resolvedTaskListId, {
        subject: request.subject,
        description: request.description,
        activeForm: request.activeForm,
        owner: request.owner,
        status: request.status ?? 'pending',
        blocks: [],
        blockedBy: [],
        metadata,
      })

      const blockingErrors: string[] = []
      for await (const result of hooksModule.executeTaskCreatedHooks(
        taskId,
        request.subject,
        request.description,
        teammateModule.getAgentName(),
        teammateModule.getTeamName(),
      )) {
        if (result.blockingError) {
          blockingErrors.push(
            hooksModule.getTaskCreatedHookMessage(result.blockingError),
          )
        }
      }
      if (blockingErrors.length > 0) {
        await tasksModule.deleteTask(resolvedTaskListId, taskId)
        throw new Error(blockingErrors.join('\n'))
      }

      await applyTaskEdges(resolvedTaskListId, taskId, request)
      const task = await tasksModule.getTask(resolvedTaskListId, taskId)
      return {
        task: task ? toRuntimeTaskDescriptor(resolvedTaskListId, task) : null,
        taskListId: resolvedTaskListId,
        taskId,
        updatedFields: [
          'subject',
          'description',
          ...(request.activeForm !== undefined ? ['activeForm'] : []),
          ...(request.owner !== undefined ? ['owner'] : []),
          ...(request.status !== undefined ? ['status'] : []),
          ...(request.ownedFiles !== undefined ? ['ownedFiles'] : []),
          ...(request.metadata !== undefined ? ['metadata'] : []),
          ...(request.blocks?.length ? ['blocks'] : []),
          ...(request.blockedBy?.length ? ['blockedBy'] : []),
        ],
        created: true,
      }
    },
    async updateTask(request) {
      return updateRuntimeTask(request)
    },
    async assignTask(request) {
      return updateRuntimeTask({
        taskId: request.taskId,
        taskListId: request.taskListId,
        owner: request.owner,
        ownedFiles: request.ownedFiles,
        status: request.status,
        metadata: request.metadata,
      }).then(result => ({
        ...result,
        assigned: true,
      }))
    },
  }
}

async function spawnAgentWithDescriptorCheck(
  request: RuntimeAgentSpawnRequest,
  context?: { cwd?: string; metadata?: Record<string, unknown> },
  runtime?: {
    listAgents(context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    }): Promise<RuntimeAgentRegistrySnapshot>
    runs: Map<string, RuntimeAgentRunDescriptor>
    controllers?: Map<string, AbortController>
    executor?: KernelRuntimeAgentExecutor
  },
): Promise<RuntimeAgentSpawnResult> {
  const snapshot = runtime
    ? await runtime.listAgents(context)
    : await readRuntimeAgentRegistrySnapshot(context?.cwd ?? process.cwd())
  const agentType = request.agentType ?? 'general-purpose'
  const descriptor = snapshot.activeAgents.find(
    agent => agent.agentType === agentType,
  )
  if (!descriptor) {
    throw new Error(`Agent ${agentType} is not available`)
  }
  const run = createAcceptedAgentRun(request, descriptor, context)
  runtime?.runs.set(run.runId, run)
  if (runtime?.executor) {
    const output = await createAgentRunOutput(run.runId)
    const runningRun = updateAgentRun(runtime.runs, run.runId, {
      status: 'running',
      startedAt: new Date().toISOString(),
      agentId: run.agentId ?? run.runId,
      backgroundTaskId: run.runId,
      outputFile: output.outputFile,
      outputAvailable: true,
      canReadOutputFile: true,
    })
    const controller = new AbortController()
    runtime.controllers?.set(run.runId, controller)
    void executeAgentRun({
      request,
      agent: descriptor,
      run: runningRun,
      context,
      runs: runtime.runs,
      controllers: runtime.controllers,
      controller,
      executor: runtime.executor,
      output,
    })
    return {
      status: 'async_launched',
      runId: runningRun.runId,
      prompt: request.prompt,
      agentType,
      agentId: runningRun.agentId,
      taskId: request.taskId,
      taskListId: request.taskListId,
      backgroundTaskId: runningRun.backgroundTaskId,
      outputFile: runningRun.outputFile,
      description: request.description,
      isAsync: true,
      canReadOutputFile: true,
      run: runningRun,
      metadata: request.metadata,
    }
  }
  return {
      status: 'accepted',
      runId: run.runId,
      prompt: request.prompt,
      agentType,
      agentId: run.agentId,
      taskId: request.taskId,
      taskListId: request.taskListId,
      outputFile: run.outputFile,
    description: request.description,
    isAsync: run.runInBackground,
    run,
    message:
      'Agent spawn request accepted by the kernel run registry; no agent executor is configured for this runtime.',
    metadata: request.metadata,
  }
}

async function createAgentRunOutput(
  runId: string,
): Promise<KernelRuntimeAgentExecutorOutput> {
  const {
    appendTaskOutput,
    flushTaskOutput,
    getTaskOutputPath,
    initTaskOutput,
  } = await import('../utils/task/diskOutput.js')
  const outputFile = getTaskOutputPath(runId)
  await initTaskOutput(runId).catch(() => outputFile)
  return {
    outputFile,
    append(content) {
      appendTaskOutput(runId, content)
    },
    flush() {
      return flushTaskOutput(runId)
    },
  }
}

async function executeAgentRun(options: {
  request: RuntimeAgentSpawnRequest
  agent: RuntimeAgentDescriptor
  run: RuntimeAgentRunDescriptor
  context?: { cwd?: string; metadata?: Record<string, unknown> }
  runs: Map<string, RuntimeAgentRunDescriptor>
  controllers?: Map<string, AbortController>
  controller: AbortController
  executor: KernelRuntimeAgentExecutor
  output: KernelRuntimeAgentExecutorOutput
}): Promise<void> {
  try {
    const result = await options.executor({
      request: options.request,
      run: options.run,
      agent: options.agent,
      cwd: options.request.cwd ?? options.context?.cwd ?? process.cwd(),
      signal: options.controller.signal,
      output: options.output,
    })
    await options.output.flush()
    if (isAgentRunCancelled(options.runs, options.run.runId)) {
      return
    }
    completeAgentRun(options.runs, options.run.runId, result)
  } catch (error) {
    await options.output.flush().catch(() => undefined)
    if (isAgentRunCancelled(options.runs, options.run.runId)) {
      return
    }
    failAgentRun(options.runs, options.run.runId, error)
  } finally {
    options.controllers?.delete(options.run.runId)
  }
}

function updateAgentRun(
  runs: Map<string, RuntimeAgentRunDescriptor>,
  runId: string,
  patch: Partial<RuntimeAgentRunDescriptor>,
): RuntimeAgentRunDescriptor {
  const existing = runs.get(runId)
  if (!existing) {
    throw new Error(`Agent run ${runId} was not found`)
  }
  const next: RuntimeAgentRunDescriptor = {
    ...existing,
    ...patch,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  }
  runs.set(runId, next)
  return next
}

function completeAgentRun(
  runs: Map<string, RuntimeAgentRunDescriptor>,
  runId: string,
  result: KernelRuntimeAgentExecutorResult | void,
): RuntimeAgentRunDescriptor {
  const now = new Date().toISOString()
  const metadata = mergeRecordMetadata(
    runs.get(runId)?.metadata,
    result?.metadata,
  )
  const patch: Partial<RuntimeAgentRunDescriptor> = {
    status: 'completed',
    completedAt: now,
    updatedAt: now,
    outputAvailable: true,
    metadata,
  }
  if (result?.agentId !== undefined) {
    patch.agentId = result.agentId
  }
  if (result?.backgroundTaskId !== undefined) {
    patch.backgroundTaskId = result.backgroundTaskId
  }
  if (result?.outputFile !== undefined) {
    patch.outputFile = result.outputFile
  }
  if (result && 'result' in result) {
    patch.result = result.result
  }
  return updateAgentRun(runs, runId, patch)
}

function failAgentRun(
  runs: Map<string, RuntimeAgentRunDescriptor>,
  runId: string,
  error: unknown,
): RuntimeAgentRunDescriptor {
  const now = new Date().toISOString()
  return updateAgentRun(runs, runId, {
    status: 'failed',
    completedAt: now,
    updatedAt: now,
    error: toAgentRunError(error),
  })
}

function isAgentRunCancelled(
  runs: Map<string, RuntimeAgentRunDescriptor>,
  runId: string,
): boolean {
  return runs.get(runId)?.status === 'cancelled'
}

function toAgentRunError(
  error: unknown,
): NonNullable<RuntimeAgentRunDescriptor['error']> {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.name === 'Error' ? undefined : error.name,
    }
  }
  return {
    message: String(error),
  }
}

function mergeRecordMetadata(
  existing: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!patch) {
    return existing
  }
  return {
    ...(existing ?? {}),
    ...patch,
  }
}

async function readRuntimeAgentRegistrySnapshot(
  cwd: string,
): Promise<RuntimeAgentRegistrySnapshot> {
  const { getAgentDefinitionsWithOverrides } = await import(
    '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
  )
  return toRuntimeAgentRegistrySnapshot(
    await getAgentDefinitionsWithOverrides(cwd),
  )
}

function createAcceptedAgentRun(
  request: RuntimeAgentSpawnRequest,
  descriptor: RuntimeAgentDescriptor,
  context?: { cwd?: string; metadata?: Record<string, unknown> },
): RuntimeAgentRunDescriptor {
  const now = new Date().toISOString()
  const outputFile = stringOrUndefined(request.metadata?.outputFile)
  const runInBackground =
    request.runInBackground ?? descriptor.background ?? false
  return {
    runId: `agent-run-${randomUUID()}`,
    status: 'accepted',
    prompt: request.prompt,
    createdAt: now,
    updatedAt: now,
    agentType: descriptor.agentType,
    agentId: inferRuntimeAgentId(request, descriptor),
    description: request.description,
    model: request.model ?? descriptor.model,
    taskId: request.taskId,
    taskListId: request.taskListId,
    outputFile,
    outputAvailable: outputFile ? true : false,
    runInBackground,
    canReadOutputFile: outputFile ? true : undefined,
    ownedFiles: request.ownedFiles,
    name: request.name,
    teamName: request.teamName,
    mode: request.mode,
    isolation: request.isolation ?? descriptor.isolation,
    cwd: request.cwd ?? context?.cwd,
    metadata: request.metadata ?? context?.metadata,
  }
}

function inferRuntimeAgentId(
  request: RuntimeAgentSpawnRequest,
  descriptor: RuntimeAgentDescriptor,
): string | undefined {
  if (!request.teamName) {
    return undefined
  }
  const agentName = sanitizeRuntimeAgentName(
    request.name ?? request.agentType ?? descriptor.agentType ?? 'worker',
  )
  return formatAgentId(agentName, request.teamName)
}

function sanitizeRuntimeAgentName(value: string): string {
  const trimmed = value.trim().replaceAll('@', '-')
  return trimmed.length > 0 ? trimmed : 'worker'
}

async function persistAgentTaskExecutionLink(
  request: RuntimeAgentSpawnRequest,
  result: RuntimeAgentSpawnResult,
): Promise<void> {
  if (!request.taskId) {
    return
  }
  const tasksModule = await import('../utils/tasks.js')
  const taskListId = request.taskListId ?? tasksModule.getTaskListId()
  const backgroundTaskId =
    result.backgroundTaskId ?? result.runId ?? result.run?.runId
  if (!backgroundTaskId) {
    return
  }
  const linkedTask = await tasksModule.linkTaskToBackgroundTask(
    taskListId,
    request.taskId,
    {
      backgroundTaskId,
      backgroundTaskType: 'agent_run',
      agentId:
        result.agentId ??
        result.run?.agentId ??
        inferSpawnResultAgentId(request, result),
    },
  )
  if (!linkedTask || request.ownedFiles === undefined) {
    return
  }
  const nextMetadata = {
    ...(linkedTask.metadata ?? {}),
    ownedFiles: uniqueStrings(request.ownedFiles),
  }
  await tasksModule.updateTask(taskListId, request.taskId, {
    metadata: nextMetadata,
  })
}

function inferSpawnResultAgentId(
  request: RuntimeAgentSpawnRequest,
  result: RuntimeAgentSpawnResult,
): string | undefined {
  if (result.agentType && request.teamName) {
    return formatAgentId(
      sanitizeRuntimeAgentName(
        request.name ?? request.agentType ?? result.agentType,
      ),
      request.teamName,
    )
  }
  return undefined
}

async function readAgentRunOutput(
  request: RuntimeAgentRunOutputRequest,
  runs: Map<string, RuntimeAgentRunDescriptor>,
): Promise<RuntimeAgentRunOutput> {
  const run = runs.get(request.runId)
  if (!run) {
    return {
      runId: request.runId,
      available: false,
    }
  }
  if (!run.outputFile) {
    return {
      runId: request.runId,
      status: run.status,
      available: false,
    }
  }

  await flushAgentRunOutput(request.runId)
  let bytes: Buffer
  try {
    bytes = await readFile(run.outputFile)
  } catch {
    return {
      runId: request.runId,
      status: run.status,
      available: false,
      outputFile: run.outputFile,
    }
  }
  const tailBytes = request.tailBytes
  const truncated =
    tailBytes !== undefined && tailBytes >= 0 && bytes.byteLength > tailBytes
  const outputBytes = truncated
    ? bytes.subarray(bytes.byteLength - tailBytes!)
    : bytes
  return {
    runId: request.runId,
    status: run.status,
    available: true,
    output: outputBytes.toString('utf8'),
    outputFile: run.outputFile,
    truncated,
  }
}

async function flushAgentRunOutput(runId: string): Promise<void> {
  try {
    const { flushTaskOutput } = await import('../utils/task/diskOutput.js')
    await flushTaskOutput(runId)
  } catch {
    // Output files can also be host-managed; failed internal flush must not
    // hide already persisted output.
  }
}

function cancelAgentRun(
  request: RuntimeAgentRunCancelRequest,
  runs: Map<string, RuntimeAgentRunDescriptor>,
  controllers?: Map<string, AbortController>,
): RuntimeAgentRunCancelResult {
  const run = runs.get(request.runId)
  if (!run) {
    return {
      runId: request.runId,
      cancelled: false,
      message: `Agent run ${request.runId} was not found`,
      run: null,
    }
  }
  if (isTerminalAgentRunStatus(run.status)) {
    return {
      runId: request.runId,
      cancelled: false,
      status: run.status,
      reason: request.reason,
      message: `Agent run ${request.runId} is already ${run.status}`,
      run,
    }
  }

  const now = new Date().toISOString()
  const next: RuntimeAgentRunDescriptor = {
    ...run,
    status: 'cancelled',
    updatedAt: now,
    completedAt: now,
    cancelledAt: now,
    cancelReason: request.reason,
  }
  runs.set(request.runId, next)
  controllers?.get(request.runId)?.abort(request.reason ?? 'agent_cancelled')
  return {
    runId: request.runId,
    cancelled: true,
    status: next.status,
    reason: request.reason,
    run: next,
  }
}

function isTerminalAgentRunStatus(
  status: RuntimeAgentRunDescriptor['status'],
): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

async function updateRuntimeTask(
  request: RuntimeTaskUpdateRequest,
): Promise<RuntimeTaskMutationResult> {
  const tasksModule = await import('../utils/tasks.js')
  const hooksModule = await import('../utils/hooks.js')
  const teammateModule = await import('../utils/teammate.js')
  const taskListId = request.taskListId ?? tasksModule.getTaskListId()
  const existingTask = await tasksModule.getTask(taskListId, request.taskId)
  if (!existingTask || existingTask.metadata?._internal === true) {
    return {
      task: null,
      taskListId,
      taskId: request.taskId,
      updatedFields: [],
    }
  }

  const updatedFields: string[] = []
  const updates: Partial<Omit<Task, 'id'>> = {}
  if (
    request.subject !== undefined &&
    request.subject !== existingTask.subject
  ) {
    updates.subject = request.subject
    updatedFields.push('subject')
  }
  if (
    request.description !== undefined &&
    request.description !== existingTask.description
  ) {
    updates.description = request.description
    updatedFields.push('description')
  }
  if (
    request.activeForm !== undefined &&
    request.activeForm !== existingTask.activeForm
  ) {
    updates.activeForm = request.activeForm
    updatedFields.push('activeForm')
  }
  if (request.owner !== undefined && request.owner !== existingTask.owner) {
    updates.owner = request.owner
    updatedFields.push('owner')
  }
  if (request.status !== undefined && request.status !== existingTask.status) {
    if (request.status === 'completed') {
      const blockingErrors: string[] = []
      for await (const result of hooksModule.executeTaskCompletedHooks(
        request.taskId,
        existingTask.subject,
        existingTask.description,
        teammateModule.getAgentName(),
        teammateModule.getTeamName(),
      )) {
        if (result.blockingError) {
          blockingErrors.push(
            hooksModule.getTaskCompletedHookMessage(result.blockingError),
          )
        }
      }
      if (blockingErrors.length > 0) {
        throw new Error(blockingErrors.join('\n'))
      }
    }
    updates.status = request.status
    updatedFields.push('status')
  }
  const metadata = mergeTaskMetadata(existingTask.metadata, request.metadata, {
    ownedFiles: request.ownedFiles,
  })
  if (metadata !== existingTask.metadata) {
    updates.metadata = metadata
    if (request.metadata !== undefined) {
      updatedFields.push('metadata')
    }
    if (request.ownedFiles !== undefined) {
      updatedFields.push('ownedFiles')
    }
  }
  if (Object.keys(updates).length > 0) {
    await tasksModule.updateTask(taskListId, request.taskId, updates)
  }
  if (request.addBlocks?.length) {
    for (const taskId of uniqueStrings(request.addBlocks)) {
      await tasksModule.blockTask(taskListId, request.taskId, taskId)
    }
    updatedFields.push('blocks')
  }
  if (request.addBlockedBy?.length) {
    for (const taskId of uniqueStrings(request.addBlockedBy)) {
      await tasksModule.blockTask(taskListId, taskId, request.taskId)
    }
    updatedFields.push('blockedBy')
  }

  const task = await tasksModule.getTask(taskListId, request.taskId)
  return {
    task: task ? toRuntimeTaskDescriptor(taskListId, task) : null,
    taskListId,
    taskId: request.taskId,
    updatedFields: uniqueStrings(updatedFields),
  }
}

async function applyTaskEdges(
  taskListId: string,
  taskId: string,
  request: Pick<RuntimeTaskCreateRequest, 'blocks' | 'blockedBy'>,
): Promise<void> {
  if (!request.blocks?.length && !request.blockedBy?.length) {
    return
  }
  const tasksModule = await import('../utils/tasks.js')
  for (const blockedTaskId of uniqueStrings(request.blocks ?? [])) {
    await tasksModule.blockTask(taskListId, taskId, blockedTaskId)
  }
  for (const blockingTaskId of uniqueStrings(request.blockedBy ?? [])) {
    await tasksModule.blockTask(taskListId, blockingTaskId, taskId)
  }
}

function toRuntimeAgentRegistrySnapshot(
  definitions: AgentDefinitionsResult,
): RuntimeAgentRegistrySnapshot {
  const activeAgentTypes = new Set(
    definitions.activeAgents.map(agent => agent.agentType),
  )
  return {
    activeAgents: definitions.activeAgents.map(agent =>
      toRuntimeAgentDescriptor(agent, true),
    ),
    allAgents: definitions.allAgents.map(agent =>
      toRuntimeAgentDescriptor(agent, activeAgentTypes.has(agent.agentType)),
    ),
    failedFiles: definitions.failedFiles,
    allowedAgentTypes: definitions.allowedAgentTypes,
  }
}

function toRuntimeAgentDescriptor(
  agent: AgentDefinition,
  active: boolean,
): RuntimeAgentDescriptor {
  return {
    agentType: agent.agentType,
    whenToUse: agent.whenToUse,
    source: toRuntimeAgentSource(agent.source),
    active,
    filename: agent.filename,
    baseDir: agent.baseDir,
    plugin: 'plugin' in agent ? agent.plugin : undefined,
    color: agent.color,
    model: agent.model,
    effort: agent.effort,
    permissionMode: agent.permissionMode,
    maxTurns: agent.maxTurns,
    background: agent.background,
    hasInitialPrompt: agent.initialPrompt ? true : undefined,
    hasHooks: hasAgentHooks(agent),
    tools: agent.tools,
    disallowedTools: agent.disallowedTools,
    skills: agent.skills,
    mcpServers: toRuntimeAgentMcpServerRefs(agent.mcpServers),
    memory: agent.memory,
    isolation: agent.isolation,
    pendingSnapshotUpdate: agent.pendingSnapshotUpdate,
  }
}

function toRuntimeAgentMcpServerRefs(
  specs: readonly AgentMcpServerSpec[] | undefined,
): readonly RuntimeAgentMcpServerRef[] | undefined {
  if (!specs?.length) {
    return undefined
  }
  const refs: RuntimeAgentMcpServerRef[] = []
  for (const spec of specs) {
    if (typeof spec === 'string') {
      refs.push({ name: spec, inline: false })
      continue
    }
    for (const name of Object.keys(spec)) {
      refs.push({ name, inline: true })
    }
  }
  return refs
}

function toRuntimeAgentSource(source: string): RuntimeAgentSource {
  switch (source) {
    case 'built-in':
    case 'plugin':
    case 'userSettings':
    case 'projectSettings':
    case 'localSettings':
    case 'flagSettings':
    case 'policySettings':
      return source
    default:
      return 'unknown'
  }
}

function hasAgentHooks(agent: AgentDefinition): boolean | undefined {
  const hooks = agent.hooks
  if (!hooks || Object.keys(hooks).length === 0) {
    return undefined
  }
  return true
}

function mergeTaskMetadata(
  existing: Task['metadata'] | undefined,
  patch: Record<string, unknown | null> | undefined,
  options: { ownedFiles?: readonly string[] },
): Task['metadata'] | undefined {
  if (patch === undefined && options.ownedFiles === undefined) {
    return existing
  }
  const next = { ...(existing ?? {}) }
  if (patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete next[key]
      } else {
        next[key] = value
      }
    }
  }
  if (options.ownedFiles !== undefined) {
    const ownedFiles = uniqueStrings(options.ownedFiles)
    if (ownedFiles.length > 0) {
      next.ownedFiles = ownedFiles
    } else {
      delete next.ownedFiles
    }
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values.map(value => value.trim()).filter(value => value.length > 0),
    ),
  )
}

function toRuntimeTaskDescriptor(
  taskListId: string,
  task: Task,
): RuntimeTaskDescriptor {
  return {
    id: task.id,
    subject: task.subject,
    description: task.description,
    status: task.status,
    taskListId,
    activeForm: task.activeForm,
    owner: task.owner,
    blocks: task.blocks,
    blockedBy: task.blockedBy,
    ownedFiles: getTaskOwnedFiles(task),
    execution: getTaskExecutionMetadata(task),
  }
}

function getTaskOwnedFiles(task: Task): readonly string[] | undefined {
  const value = task.metadata?.ownedFiles
  if (!Array.isArray(value)) {
    return undefined
  }
  const files = value.filter(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  )
  return files.length > 0 ? Array.from(new Set(files)) : undefined
}

function getTaskExecutionMetadata(
  task: Task,
): RuntimeTaskExecutionMetadata | undefined {
  const value = task.metadata?.taskExecution
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const metadata = value as Record<string, unknown>
  return {
    linkedBackgroundTaskId: stringOrUndefined(metadata.linkedBackgroundTaskId),
    linkedBackgroundTaskType: stringOrUndefined(
      metadata.linkedBackgroundTaskType,
    ),
    linkedAgentId: stringOrUndefined(metadata.linkedAgentId),
    completionSuggestedAt: stringOrUndefined(metadata.completionSuggestedAt),
    completionSuggestedByBackgroundTaskId: stringOrUndefined(
      metadata.completionSuggestedByBackgroundTaskId,
    ),
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
