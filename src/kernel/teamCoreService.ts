import type {
  RuntimeTeamCreateRequest,
  RuntimeTeamDestroyRequest,
  RuntimeTeamMessageRequest,
} from '../runtime/contracts/team.js'
import type { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import { stripUndefined } from './corePayload.js'
import {
  createDefaultKernelRuntimeTeamRegistry,
  type KernelRuntimeTeamRegistry,
} from './runtimeTeamsRegistry.js'

export type TeamCoreServiceOptions = {
  workspacePath?: string
  eventBus?: RuntimeEventBus
  teamRegistry?: KernelRuntimeTeamRegistry
  getSessionId?(): string | undefined
}

export class TeamCoreService {
  private readonly teamRegistry: KernelRuntimeTeamRegistry

  constructor(private readonly options: TeamCoreServiceOptions = {}) {
    this.teamRegistry =
      options.teamRegistry ??
      createDefaultKernelRuntimeTeamRegistry({
        getSessionId: options.getSessionId,
      })
  }

  async listTeams(): Promise<unknown> {
    return stripUndefined(await this.teamRegistry.listTeams(this.context()))
  }

  async getTeam(teamName: string): Promise<unknown> {
    return {
      team:
        stripUndefined(
          await this.teamRegistry.getTeam(teamName, this.context()),
        ) ?? null,
    }
  }

  async createTeam(request: RuntimeTeamCreateRequest): Promise<unknown> {
    const createTeam = this.teamRegistry.createTeam
    if (!createTeam) {
      throw new TeamCoreError('unavailable', 'Team mutator is not available')
    }
    const result = await createTeam(request, this.context())
    this.emit('teams.created', result)
    return stripUndefined(result)
  }

  async sendMessage(request: RuntimeTeamMessageRequest): Promise<unknown> {
    const sendMessage = this.teamRegistry.sendMessage
    if (!sendMessage) {
      throw new TeamCoreError('unavailable', 'Team messaging is not available')
    }
    const result = await sendMessage(request, this.context())
    this.emit('teams.message.sent', result)
    return stripUndefined(result)
  }

  async destroyTeam(request: RuntimeTeamDestroyRequest): Promise<unknown> {
    const destroyTeam = this.teamRegistry.destroyTeam
    if (!destroyTeam) {
      throw new TeamCoreError('unavailable', 'Team mutator is not available')
    }
    const result = await destroyTeam(request, this.context())
    if (result.success) {
      this.emit('teams.destroyed', result)
    }
    return stripUndefined(result)
  }

  private context(): {
    cwd: string
    metadata: Record<string, unknown>
  } {
    return {
      cwd: this.options.workspacePath ?? process.cwd(),
      metadata: {
        protocol: 'json-rpc-lite',
      },
    }
  }

  private emit(type: string, payload: unknown): void {
    this.options.eventBus?.emit({
      type,
      replayable: true,
      payload: stripUndefined(payload),
      metadata: {
        protocol: 'json-rpc-lite',
      },
    })
  }
}

export class TeamCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'TeamCoreError'
  }
}
