import type {
  RuntimeTeamCreateRequest,
  RuntimeTeamCreateResult,
  RuntimeTeamDescriptor,
  RuntimeTeamDestroyRequest,
  RuntimeTeamDestroyResult,
  RuntimeTeamListSnapshot,
  RuntimeTeamMessageRequest,
  RuntimeTeamMessageResult,
} from '../runtime/contracts/team.js'
import type {
  KernelAgentRunDescriptor,
  KernelRuntimeAgents,
} from './runtimeAgents.js'
import { expectPayload } from './runtimeEnvelope.js'
import type {
  KernelRuntimeTasks,
  KernelTaskDescriptor,
} from './runtimeTasks.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'

export type KernelTeamDescriptor = RuntimeTeamDescriptor
export type KernelTeamSnapshot = RuntimeTeamListSnapshot
export type KernelTeamCreateRequest = RuntimeTeamCreateRequest
export type KernelTeamCreateResult = RuntimeTeamCreateResult
export type KernelTeamMessageRequest = RuntimeTeamMessageRequest
export type KernelTeamMessageResult = RuntimeTeamMessageResult
export type KernelTeamDestroyRequest = RuntimeTeamDestroyRequest
export type KernelTeamDestroyResult = RuntimeTeamDestroyResult

export type KernelTeamDetail = KernelTeamDescriptor & {
  tasks: readonly KernelTaskDescriptor[]
  runs: readonly KernelAgentRunDescriptor[]
}

export type KernelRuntimeTeams = {
  list(): Promise<readonly KernelTeamDescriptor[]>
  get(teamName: string): Promise<KernelTeamDetail | undefined>
  create(request: KernelTeamCreateRequest): Promise<KernelTeamCreateResult>
  send(request: KernelTeamMessageRequest): Promise<KernelTeamMessageResult>
  destroy(request: KernelTeamDestroyRequest): Promise<KernelTeamDestroyResult>
}

export function createKernelRuntimeTeamsFacade(options: {
  client: KernelRuntimeWireClient
  agents: KernelRuntimeAgents
  tasks: KernelRuntimeTasks
}): KernelRuntimeTeams {
  async function list(): Promise<readonly KernelTeamDescriptor[]> {
    const payload = expectPayload<Partial<RuntimeTeamListSnapshot>>(
      await options.client.listTeams(),
    )
    return toTeamDescriptors(payload.teams)
  }

  return {
    list,
    async get(teamName) {
      const payload = expectPayload<{ team?: unknown }>(
        await options.client.getTeam({ teamName }),
      )
      const team = toTeamDescriptor(payload.team)
      if (!team) {
        return undefined
      }
      const [tasks, runs] = await Promise.all([
        options.tasks.list(undefined, { taskListId: team.taskListId }),
        listTeamRuns(team, options.agents),
      ])
      return {
        ...team,
        tasks,
        runs,
      }
    },
    async create(request) {
      const payload = expectPayload<RuntimeTeamCreateResult>(
        await options.client.createTeam(request),
      )
      return toTeamCreateResult(payload)
    },
    async send(request) {
      const payload = expectPayload<RuntimeTeamMessageResult>(
        await options.client.sendTeamMessage(request),
      )
      return toTeamMessageResult(payload)
    },
    async destroy(request) {
      const payload = expectPayload<RuntimeTeamDestroyResult>(
        await options.client.destroyTeam(request),
      )
      return toTeamDestroyResult(payload)
    },
  }
}

async function listTeamRuns(
  team: KernelTeamDescriptor,
  agents: KernelRuntimeAgents,
): Promise<readonly KernelAgentRunDescriptor[]> {
  const runs = await agents.runs()
  return runs.filter(run => {
    return (
      run.teamName === team.teamName ||
      run.taskListId === team.taskListId ||
      team.members.some(member => member.agentId === run.agentId)
    )
  })
}

function toTeamDescriptors(value: unknown): readonly KernelTeamDescriptor[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap(candidate => {
    const descriptor = toTeamDescriptor(candidate)
    return descriptor ? [descriptor] : []
  })
}

function toTeamDescriptor(value: unknown): KernelTeamDescriptor | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { teamName?: unknown }).teamName !== 'string' ||
    typeof (value as { taskListId?: unknown }).taskListId !== 'string' ||
    typeof (value as { teamFilePath?: unknown }).teamFilePath !== 'string' ||
    typeof (value as { createdAt?: unknown }).createdAt !== 'number' ||
    typeof (value as { leadAgentId?: unknown }).leadAgentId !== 'string' ||
    typeof (value as { memberCount?: unknown }).memberCount !== 'number' ||
    typeof (value as { activeMemberCount?: unknown }).activeMemberCount !==
      'number' ||
    !Array.isArray((value as { members?: unknown }).members)
  ) {
    return undefined
  }
  return value as KernelTeamDescriptor
}

function toTeamCreateResult(value: unknown): KernelTeamCreateResult {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { created?: unknown }).created !== 'boolean'
  ) {
    throw new Error('Invalid kernel team create result')
  }
  const candidate = value as RuntimeTeamCreateResult
  const team = toTeamDescriptor(candidate.team)
  if (!team) {
    throw new Error('Invalid kernel team create result')
  }
  return {
    ...candidate,
    team,
  }
}

function toTeamMessageResult(value: unknown): KernelTeamMessageResult {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { success?: unknown }).success !== 'boolean' ||
    typeof (value as { teamName?: unknown }).teamName !== 'string' ||
    typeof (value as { message?: unknown }).message !== 'string' ||
    !Array.isArray((value as { recipients?: unknown }).recipients)
  ) {
    throw new Error('Invalid kernel team message result')
  }
  return value as KernelTeamMessageResult
}

function toTeamDestroyResult(value: unknown): KernelTeamDestroyResult {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { success?: unknown }).success !== 'boolean' ||
    typeof (value as { teamName?: unknown }).teamName !== 'string' ||
    typeof (value as { message?: unknown }).message !== 'string'
  ) {
    throw new Error('Invalid kernel team destroy result')
  }
  return value as KernelTeamDestroyResult
}
