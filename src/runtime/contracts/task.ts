export type RuntimeCoordinatorTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'

export type RuntimeTaskExecutionMetadata = {
  linkedBackgroundTaskId?: string
  linkedBackgroundTaskType?: string
  linkedAgentId?: string
  completionSuggestedAt?: string
  completionSuggestedByBackgroundTaskId?: string
}

export interface RuntimeTaskDescriptor {
  id: string
  subject: string
  description: string
  status: RuntimeCoordinatorTaskStatus
  taskListId: string
  activeForm?: string
  owner?: string
  blocks: readonly string[]
  blockedBy: readonly string[]
  ownedFiles?: readonly string[]
  execution?: RuntimeTaskExecutionMetadata
}

export interface RuntimeTaskListSnapshot {
  taskListId: string
  tasks: readonly RuntimeTaskDescriptor[]
}

export type RuntimeTaskMetadataPatch = Record<string, unknown | null>

export interface RuntimeTaskCreateRequest {
  taskListId?: string
  subject: string
  description: string
  activeForm?: string
  owner?: string
  status?: RuntimeCoordinatorTaskStatus
  blocks?: readonly string[]
  blockedBy?: readonly string[]
  ownedFiles?: readonly string[]
  metadata?: RuntimeTaskMetadataPatch
}

export interface RuntimeTaskUpdateRequest {
  taskId: string
  taskListId?: string
  subject?: string
  description?: string
  activeForm?: string
  status?: RuntimeCoordinatorTaskStatus
  owner?: string
  addBlocks?: readonly string[]
  addBlockedBy?: readonly string[]
  ownedFiles?: readonly string[]
  metadata?: RuntimeTaskMetadataPatch
}

export interface RuntimeTaskAssignRequest {
  taskId: string
  owner: string
  taskListId?: string
  ownedFiles?: readonly string[]
  status?: RuntimeCoordinatorTaskStatus
  metadata?: RuntimeTaskMetadataPatch
}

export interface RuntimeTaskMutationResult {
  task: RuntimeTaskDescriptor | null
  taskListId: string
  taskId?: string
  updatedFields: readonly string[]
  created?: boolean
  assigned?: boolean
}

export type RuntimeTaskTerminalStatus = 'completed' | 'failed' | 'stopped'

export type RuntimeTaskUsage = {
  total_tokens: number
  tool_uses: number
  duration_ms: number
}

export interface RuntimeTaskNotificationPayload {
  taskId: string
  toolUseId?: string
  status: RuntimeTaskTerminalStatus
  outputFile: string
  summary: string
  usage?: RuntimeTaskUsage
  source: 'queued_task_notification'
}
