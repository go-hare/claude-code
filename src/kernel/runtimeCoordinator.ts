import type {
  KernelAgentCancelOptions,
  KernelAgentCancelResult,
  KernelAgentOutput,
  KernelAgentOutputOptions,
  KernelAgentRunDescriptor,
  KernelAgentSpawnRequest,
  KernelAgentSpawnResult,
  KernelRuntimeAgents,
} from './runtimeAgents.js'
import type {
  KernelTaskCreateRequest,
  KernelCoordinatorTaskStatus,
  KernelRuntimeTasks,
  KernelTaskAssignRequest,
  KernelTaskDescriptor,
  KernelTaskMutationResult,
} from './runtimeTasks.js'

export type KernelCoordinatorAssignmentFilter = {
  taskListId?: string
  owner?: string | readonly string[]
  status?:
    | KernelCoordinatorTaskStatus
    | readonly KernelCoordinatorTaskStatus[]
  blocked?: boolean
  hasOwnedFiles?: boolean
  linkedBackgroundTaskId?: string
  linkedAgentId?: string
}

export type KernelRuntimeCoordinator = {
  assignTask(request: KernelTaskAssignRequest): Promise<KernelTaskMutationResult>
  spawnWorker(request: KernelAgentSpawnRequest): Promise<KernelAgentSpawnResult>
  invoke(
    request: KernelCoordinatorInvokeRequest,
  ): Promise<KernelCoordinatorInvokeResult>
  listAssignments(
    filter?: KernelCoordinatorAssignmentFilter,
  ): Promise<readonly KernelTaskDescriptor[]>
  getWorkerRun(runId: string): Promise<KernelAgentRunDescriptor | undefined>
  getWorkerOutput(
    runId: string,
    options?: KernelAgentOutputOptions,
  ): Promise<KernelAgentOutput>
  cancelWorker(
    runId: string,
    options?: KernelAgentCancelOptions,
  ): Promise<KernelAgentCancelResult>
}

export type KernelCoordinatorInvokeRequest = {
  worker: Omit<
    KernelAgentSpawnRequest,
    'taskId' | 'taskListId' | 'ownedFiles'
  >
  taskId?: string
  taskListId?: string
  task?: Pick<
    KernelTaskCreateRequest,
    'subject' | 'description' | 'activeForm' | 'blocks' | 'blockedBy' | 'metadata'
  >
  owner?: string
  status?: KernelCoordinatorTaskStatus
  ownedFiles?: readonly string[]
  linkTaskExecution?: boolean
}

export type KernelCoordinatorInvokeResult = {
  task: KernelTaskDescriptor | null
  worker: KernelAgentSpawnResult
  taskResult?: KernelTaskMutationResult
  assignmentResult?: KernelTaskMutationResult
  linkageResult?: KernelTaskMutationResult
}

export function createKernelRuntimeCoordinatorFacade(options: {
  agents: KernelRuntimeAgents
  tasks: KernelRuntimeTasks
}): KernelRuntimeCoordinator {
  return {
    assignTask(request) {
      return options.tasks.assign(request)
    },
    spawnWorker(request) {
      return options.agents.spawn({
        ...request,
        runInBackground: request.runInBackground ?? true,
      })
    },
    async invoke(request) {
      let taskId = request.taskId
      let taskListId = request.taskListId
      let taskResult: KernelTaskMutationResult | undefined
      let assignmentResult: KernelTaskMutationResult | undefined
      let linkageResult: KernelTaskMutationResult | undefined

      if (!taskId) {
        if (!request.task) {
          throw new Error(
            'Coordinator invocation requires taskId or task creation input',
          )
        }
        taskResult = await options.tasks.create({
          taskListId,
          subject: request.task.subject,
          description: request.task.description,
          activeForm: request.task.activeForm,
          owner: request.owner,
          status: request.status,
          blocks: request.task.blocks,
          blockedBy: request.task.blockedBy,
          ownedFiles: request.ownedFiles,
          metadata: request.task.metadata,
        })
        taskId = taskResult.taskId ?? taskResult.task?.id ?? undefined
        taskListId = taskResult.taskListId
      }

      if (!taskId) {
        throw new Error('Coordinator invocation did not resolve a task id')
      }

      const owner = request.owner ?? request.worker.agentType
      if (owner) {
        assignmentResult = await options.tasks.assign({
          taskId,
          taskListId,
          owner,
          ownedFiles: request.ownedFiles,
          status: request.status,
        })
      }

      const worker = await options.agents.spawn({
        ...request.worker,
        taskId,
        taskListId,
        ownedFiles: request.ownedFiles,
        runInBackground: request.worker.runInBackground ?? true,
      })

      if (request.linkTaskExecution !== false) {
        const taskExecution = stripUndefined({
          linkedBackgroundTaskId:
            worker.backgroundTaskId ?? worker.runId,
          linkedBackgroundTaskType:
            worker.backgroundTaskId ?? worker.runId ? 'agent_run' : undefined,
          linkedAgentId: worker.agentId ?? worker.run?.agentId,
        })
        if (Object.keys(taskExecution).length > 0) {
          linkageResult = await options.tasks.update({
            taskId,
            taskListId,
            metadata: {
              taskExecution,
            },
          })
        }
      }

      const task =
        linkageResult?.task ??
        assignmentResult?.task ??
        taskResult?.task ??
        (await options.tasks.get(taskId, { taskListId })) ??
        null

      return {
        task,
        worker,
        ...(taskResult ? { taskResult } : {}),
        ...(assignmentResult ? { assignmentResult } : {}),
        ...(linkageResult ? { linkageResult } : {}),
      }
    },
    listAssignments(filter = {}) {
      const { taskListId, ...taskFilter } = filter
      return options.tasks.list(taskFilter, { taskListId })
    },
    getWorkerRun(runId) {
      return options.agents.getRun(runId)
    },
    getWorkerOutput(runId, optionsArg) {
      return options.agents.output(runId, optionsArg)
    },
    cancelWorker(runId, optionsArg) {
      return options.agents.cancel(runId, optionsArg)
    },
  }
}

function stripUndefined(
  value: Record<string, string | undefined>,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      next[key] = entry
    }
  }
  return next
}
