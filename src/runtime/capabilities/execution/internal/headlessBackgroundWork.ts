import type { AppState } from 'src/state/AppStateStore.js'
import { isBackgroundTask } from '../../../../tasks/types.js'
import { getRunningTasks } from '../../../../utils/task/framework.js'

export type HeadlessBackgroundEventTrackingState = {
  pendingTaskIds: Set<string>
  handoffTurnIds: Set<string>
}

function isBackgroundedLocalAgentAwaitingNotification(
  task: AppState['tasks'][string],
): boolean {
  return (
    task.type === 'local_agent' &&
    task.isBackgrounded !== false &&
    !task.notified &&
    task.status !== 'running' &&
    task.status !== 'pending'
  )
}

export function hasHeadlessBackgroundWorkPending(state: AppState): boolean {
  const hasRunningBackgroundTask = getRunningTasks(state).some(
    task => isBackgroundTask(task) && task.type !== 'in_process_teammate',
  )
  if (hasRunningBackgroundTask) {
    return true
  }

  // LocalAgentTask marks itself terminal before it enqueues the final XML
  // notification so TaskOutput(block=true) can unblock quickly. Headless must
  // still wait in that terminal/notified=false window, otherwise -p can close
  // before coordinator worker results are delivered.
  return Object.values(state.tasks ?? {}).some(
    isBackgroundedLocalAgentAwaitingNotification,
  )
}

export function observeHeadlessBackgroundCompatibilityMessage(
  message: unknown,
  tracking: HeadlessBackgroundEventTrackingState,
  activeTurnId?: string,
): void {
  const record = message as Record<string, unknown>
  if (record.type !== 'system') {
    return
  }

  const taskId =
    typeof record.task_id === 'string' ? record.task_id : undefined
  if (!taskId) {
    return
  }

  if (record.subtype === 'task_started') {
    const taskType =
      typeof record.task_type === 'string' ? record.task_type : undefined
    if (taskType === 'local_agent' || taskType === 'local_bash') {
      tracking.pendingTaskIds.add(taskId)
      if (activeTurnId) {
        tracking.handoffTurnIds.add(activeTurnId)
      }
    }
    return
  }

  if (record.subtype === 'task_notification') {
    tracking.pendingTaskIds.delete(taskId)
  }
}
