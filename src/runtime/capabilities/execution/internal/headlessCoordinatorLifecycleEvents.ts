import type { KernelEvent } from '../../../contracts/events.js'
import type {
  RuntimeCoordinatorLifecyclePayload,
  RuntimeCoordinatorLifecyclePhase,
  RuntimeCoordinatorLifecycleState,
} from '../../../contracts/team.js'

export type CoordinatorLifecycleRuntimeEvent = Omit<
  KernelEvent,
  'runtimeId' | 'eventId' | 'conversationId'
>

export function createCoordinatorLifecycleEvent({
  type,
  phase,
  state,
  source,
  turnId,
  ...payload
}: RuntimeCoordinatorLifecyclePayload & {
  type: string
  phase: RuntimeCoordinatorLifecyclePhase
  state: RuntimeCoordinatorLifecycleState
  turnId?: string
}): CoordinatorLifecycleRuntimeEvent {
  return {
    ...(turnId ? { turnId } : {}),
    type,
    replayable: true,
    payload: {
      phase,
      state,
      source,
      ...dropUndefined(payload),
    },
  }
}

export function projectCoordinatorLifecycleFromSdkMessage(
  message: unknown,
  activeTurnId?: string,
): CoordinatorLifecycleRuntimeEvent | undefined {
  const record = message as Record<string, unknown>
  if (record.type !== 'system') {
    return undefined
  }

  const taskId =
    typeof record.task_id === 'string' ? record.task_id : undefined
  if (!taskId) {
    return undefined
  }

  if (record.subtype === 'task_started') {
    const taskType =
      typeof record.task_type === 'string' ? record.task_type : undefined
    if (taskType !== 'local_agent' && taskType !== 'local_bash') {
      return undefined
    }
    return createCoordinatorLifecycleEvent({
      type: 'handoff.started',
      phase: 'handoff',
      state: 'started',
      source: 'sdk_task_started',
      turnId: activeTurnId,
      taskId,
      taskType,
      toolUseId:
        typeof record.tool_use_id === 'string'
          ? record.tool_use_id
          : undefined,
      description:
        typeof record.description === 'string'
          ? record.description
          : undefined,
    })
  }

  if (record.subtype !== 'task_notification') {
    return undefined
  }

  const status = typeof record.status === 'string' ? record.status : undefined
  const completed = status === 'completed'
  return createCoordinatorLifecycleEvent({
    type: completed ? 'handoff.completed' : 'handoff.failed',
    phase: 'handoff',
    state: completed ? 'completed' : 'failed',
    source: 'sdk_task_notification',
    turnId: activeTurnId,
    taskId,
    toolUseId:
      typeof record.tool_use_id === 'string' ? record.tool_use_id : undefined,
    status,
    summary:
      typeof record.summary === 'string' ? record.summary : undefined,
    reason: completed ? undefined : status,
  })
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T
}
