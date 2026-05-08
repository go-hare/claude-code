import type {
  RuntimeTaskAssignRequest,
  RuntimeTaskCreateRequest,
  RuntimeTaskUpdateRequest,
} from '../runtime/contracts/task.js'
import type { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import { stripUndefined } from './corePayload.js'
import {
  createDefaultKernelRuntimeTaskRegistry,
  type KernelRuntimeTaskRegistry,
} from './runtimeAgentTaskRegistries.js'

export type TaskCoreServiceOptions = {
  workspacePath?: string
  eventBus?: RuntimeEventBus
  taskRegistry?: KernelRuntimeTaskRegistry
}

export class TaskCoreService {
  private readonly taskRegistry: KernelRuntimeTaskRegistry

  constructor(private readonly options: TaskCoreServiceOptions = {}) {
    this.taskRegistry =
      options.taskRegistry ??
      createDefaultKernelRuntimeTaskRegistry(options.workspacePath)
  }

  async listTasks(taskListId?: string): Promise<unknown> {
    return stripUndefined(
      await this.taskRegistry.listTasks(taskListId, this.context()),
    )
  }

  async createTask(request: RuntimeTaskCreateRequest): Promise<unknown> {
    const createTask = this.taskRegistry.createTask
    if (!createTask) {
      throw new TaskCoreError('unavailable', 'Task mutator is not available')
    }
    const result = await createTask(request, this.context(request.metadata))
    this.emit('tasks.created', result, request.metadata)
    return stripUndefined(result)
  }

  async updateTask(request: RuntimeTaskUpdateRequest): Promise<unknown> {
    const updateTask = this.taskRegistry.updateTask
    if (!updateTask) {
      throw new TaskCoreError('unavailable', 'Task mutator is not available')
    }
    const result = await updateTask(request, this.context(request.metadata))
    this.emit('tasks.updated', result, request.metadata)
    return stripUndefined(result)
  }

  async assignTask(request: RuntimeTaskAssignRequest): Promise<unknown> {
    const assignTask = this.taskRegistry.assignTask
    if (!assignTask) {
      throw new TaskCoreError('unavailable', 'Task mutator is not available')
    }
    const result = await assignTask(request, this.context(request.metadata))
    this.emit('tasks.assigned', result, request.metadata)
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

export class TaskCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'TaskCoreError'
  }
}
