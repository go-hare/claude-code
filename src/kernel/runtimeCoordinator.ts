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
