import type {
  RuntimeCoordinatorTaskStatus,
  RuntimeTaskAssignRequest,
  RuntimeTaskCreateRequest,
  RuntimeTaskDescriptor,
  RuntimeTaskExecutionMetadata,
  RuntimeTaskListSnapshot,
  RuntimeTaskMutationResult,
  RuntimeTaskUpdateRequest,
} from '../runtime/contracts/task.js'
import type { KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'
import type { KernelRuntimeEventReplayOptions } from './runtime.js'
import type { KernelRuntimeTaskEvent } from './runtimeEvents.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import {
  collectReplayEvents,
  expectPayload,
  waitForRuntimeEventDelivery,
} from './runtimeEnvelope.js'
import {
  isKernelTasksAssignedEvent,
  isKernelTasksCreatedEvent,
  isKernelTasksUpdatedEvent,
} from './runtimeEvents.js'

export type KernelCoordinatorTaskStatus = RuntimeCoordinatorTaskStatus
export type KernelTaskExecutionMetadata = RuntimeTaskExecutionMetadata
export type KernelTaskDescriptor = RuntimeTaskDescriptor
export type KernelTaskSnapshot = RuntimeTaskListSnapshot
export type KernelTaskCreateRequest = RuntimeTaskCreateRequest
export type KernelTaskUpdateRequest = RuntimeTaskUpdateRequest
export type KernelTaskAssignRequest = RuntimeTaskAssignRequest
export type KernelTaskMutationResult = RuntimeTaskMutationResult

export type KernelTaskListOptions = {
  taskListId?: string
}

export type KernelTaskFilter = {
  ids?: readonly string[]
  status?:
    | RuntimeCoordinatorTaskStatus
    | readonly RuntimeCoordinatorTaskStatus[]
  owner?: string | readonly string[]
  blocked?: boolean
  hasOwnedFiles?: boolean
  linkedBackgroundTaskId?: string
  linkedAgentId?: string
}

export type KernelRuntimeTasks = {
  list(
    filter?: KernelTaskFilter,
    options?: KernelTaskListOptions,
  ): Promise<readonly KernelTaskDescriptor[]>
  get(
    taskId: string,
    options?: KernelTaskListOptions,
  ): Promise<KernelTaskDescriptor | undefined>
  snapshot(options?: KernelTaskListOptions): Promise<KernelTaskSnapshot>
  create(request: KernelTaskCreateRequest): Promise<KernelTaskMutationResult>
  update(request: KernelTaskUpdateRequest): Promise<KernelTaskMutationResult>
  assign(request: KernelTaskAssignRequest): Promise<KernelTaskMutationResult>
  onEvent(handler: (event: KernelRuntimeTaskEvent) => void): () => void
  replay(
    options?: KernelRuntimeEventReplayOptions,
  ): Promise<readonly KernelRuntimeTaskEvent[]>
}

export function createKernelRuntimeTasksFacade(
  client: KernelRuntimeWireClient,
): KernelRuntimeTasks {
  async function snapshot(
    options: KernelTaskListOptions = {},
  ): Promise<KernelTaskSnapshot> {
    const payload = expectPayload<Partial<RuntimeTaskListSnapshot>>(
      await client.listTasks({ taskListId: options.taskListId }),
    )
    return toTaskSnapshot(payload)
  }

  return {
    list: async (filter, options) =>
      (await snapshot(options)).tasks.filter(task =>
        matchesTaskFilter(task, filter ?? {}),
      ),
    get: async (taskId, options = {}) => {
      const payload = expectPayload<{ task?: unknown }>(
        await client.getTask({
          taskId,
          taskListId: options.taskListId,
        }),
      )
      return toTaskDescriptor(payload.task) ?? undefined
    },
    snapshot,
    create: async request => {
      const payload = expectPayload<RuntimeTaskMutationResult>(
        await client.createTask(request),
      )
      await waitForRuntimeEventDelivery()
      return toTaskMutationResult(payload)
    },
    update: async request => {
      const payload = expectPayload<RuntimeTaskMutationResult>(
        await client.updateTask(request),
      )
      await waitForRuntimeEventDelivery()
      return toTaskMutationResult(payload)
    },
    assign: async request => {
      const payload = expectPayload<RuntimeTaskMutationResult>(
        await client.assignTask(request),
      )
      await waitForRuntimeEventDelivery()
      return toTaskMutationResult(payload)
    },
    onEvent: handler =>
      client.onEvent(envelope => {
        if (isKernelTaskEvent(envelope)) {
          handler(envelope)
        }
      }),
    replay: async (options = {}) => {
      const replayed = await collectReplayEvents(client, options)
      return replayed.filter(isKernelTaskEvent)
    },
  }
}

function isKernelTaskEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelRuntimeTaskEvent {
  return (
    isKernelTasksCreatedEvent(envelope) ||
    isKernelTasksUpdatedEvent(envelope) ||
    isKernelTasksAssignedEvent(envelope)
  )
}

function toTaskSnapshot(
  value: Partial<RuntimeTaskListSnapshot>,
): KernelTaskSnapshot {
  return {
    taskListId: typeof value.taskListId === 'string' ? value.taskListId : '',
    tasks: toTaskDescriptors(value.tasks),
  }
}

function toTaskDescriptors(value: unknown): readonly KernelTaskDescriptor[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap(task => {
    const descriptor = toTaskDescriptor(task)
    return descriptor ? [descriptor] : []
  })
}

function toTaskDescriptor(value: unknown): KernelTaskDescriptor | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { id?: unknown }).id !== 'string' ||
    typeof (value as { subject?: unknown }).subject !== 'string' ||
    typeof (value as { description?: unknown }).description !== 'string' ||
    typeof (value as { status?: unknown }).status !== 'string' ||
    typeof (value as { taskListId?: unknown }).taskListId !== 'string'
  ) {
    return undefined
  }
  return value as KernelTaskDescriptor
}

function toTaskMutationResult(value: unknown): KernelTaskMutationResult {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { taskListId?: unknown }).taskListId !== 'string' ||
    !Array.isArray((value as { updatedFields?: unknown }).updatedFields)
  ) {
    throw new Error('Invalid kernel task mutation result')
  }
  const candidate = value as RuntimeTaskMutationResult
  return {
    ...candidate,
    task: toTaskDescriptor(candidate.task) ?? null,
  }
}

function matchesTaskFilter(
  task: KernelTaskDescriptor,
  filter: KernelTaskFilter,
): boolean {
  if (filter.ids && !filter.ids.includes(task.id)) {
    return false
  }
  if (filter.status && !asArray(filter.status).includes(task.status)) {
    return false
  }
  if (filter.owner && !matchesOptional(task.owner, filter.owner)) {
    return false
  }
  if (
    filter.blocked !== undefined &&
    task.blockedBy.length > 0 !== filter.blocked
  ) {
    return false
  }
  if (
    filter.hasOwnedFiles !== undefined &&
    !!task.ownedFiles?.length !== filter.hasOwnedFiles
  ) {
    return false
  }
  if (
    filter.linkedBackgroundTaskId !== undefined &&
    task.execution?.linkedBackgroundTaskId !== filter.linkedBackgroundTaskId
  ) {
    return false
  }
  if (
    filter.linkedAgentId !== undefined &&
    task.execution?.linkedAgentId !== filter.linkedAgentId
  ) {
    return false
  }
  return true
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
