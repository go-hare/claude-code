import type {
  ActiveTaskExecutionContext,
  Task,
} from 'src/utils/tasks.js'
import { isTodoV2Enabled } from 'src/utils/tasks.js'

export type AgentTaskLookup = (
  taskListId: string,
  taskId: string,
) => Promise<Task | null | undefined>

export type ResolveAgentTaskExecutionContextInput = {
  taskId?: string
  explicitOwnedFiles?: string[]
  getTaskListId: () => string
  getTask: AgentTaskLookup
  getTaskOwnedFiles: (task: Task) => string[] | undefined
  logWarning?: (message: string) => void
}

export type ResolveAgentTaskExecutionContextResult = {
  taskExecutionContext?: ActiveTaskExecutionContext
  taskLinkingWarning?: string
}

export function shouldExposeTaskIdInput(): boolean {
  return isTodoV2Enabled()
}

export function normalizeAgentOwnedFiles(
  ownedFiles: string[] | undefined,
): string[] | undefined {
  const normalized = ownedFiles
    ?.map(filePath => filePath.trim())
    .filter(filePath => filePath.length > 0)

  return normalized && normalized.length > 0 ? normalized : undefined
}

export async function resolveAgentTaskExecutionContext({
  taskId,
  explicitOwnedFiles,
  getTaskListId,
  getTask,
  getTaskOwnedFiles,
  logWarning,
}: ResolveAgentTaskExecutionContextInput): Promise<ResolveAgentTaskExecutionContextResult> {
  const requestedTaskId = taskId?.trim()
  if (!requestedTaskId) {
    return {}
  }

  const taskListId = getTaskListId()
  const task = await getTask(taskListId, requestedTaskId)
  if (!task) {
    const message =
      `Task '${requestedTaskId}' was not found in task list '${taskListId}'. ` +
      'Create the task with TaskCreate or pass a valid task_id before launching the agent.'
    logWarning?.(`[AgentTool] ${message}`)
    throw new Error(message)
  }

  return {
    taskExecutionContext: {
      taskListId,
      taskId: requestedTaskId,
      ownedFiles: explicitOwnedFiles ?? getTaskOwnedFiles(task),
    },
  }
}
