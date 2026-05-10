import type { AppState } from '../../state/AppState.js'
import { logForDebugging } from '../debug.js'
import {
  createTeammateExecutorForMember,
  type TeammateExecutorFacade,
} from './backends/executorFacade.js'
import type { TeamFile } from './teamHelpers.js'

type TeamMember = Pick<
  TeamFile['members'][number],
  'agentId' | 'name' | 'tmuxPaneId' | 'backendType' | 'insideTmux'
>

type TeammateLifecycleContext = {
  getAppState(): Pick<AppState, 'tasks'>
  setAppState: (updater: (prev: AppState) => AppState) => void
}

function getTeammateExecutor(member: TeamMember): TeammateExecutorFacade | undefined {
  return createTeammateExecutorForMember(member)
}

export async function terminateTeammate(
  teamName: string,
  member: TeamMember,
  context: TeammateLifecycleContext,
): Promise<boolean> {
  const executor = getTeammateExecutor(member)
  if (executor) {
    return executor.terminate(teamName, member, context)
  }

  logForDebugging(
    `[teammateLifecycle] Skipping termination for ${member.agentId}: no backendType recorded`,
  )
  return false
}

/**
 * Requests graceful shutdown for a teammate using the main swarm lifecycle.
 *
 * Pane teammates receive a mailbox shutdown request. In-process teammates use
 * the same mailbox flow and additionally mark their AppState task so duplicate
 * requests are suppressed and TeamDelete can observe the shutdown state.
 */
export async function requestTeammateShutdown(
  teamName: string,
  member: TeamMember,
  context: TeammateLifecycleContext,
  reason?: string,
): Promise<boolean> {
  const executor = getTeammateExecutor(member)
  if (executor) {
    return executor.requestShutdown(teamName, member, context, reason)
  }

  logForDebugging(
    `[teammateLifecycle] Skipping shutdown request for ${member.agentId}: no backendType recorded`,
  )
  return false
}
