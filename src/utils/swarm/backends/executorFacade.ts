import type { AgentColorName } from '@go-hare/builtin-tools/tools/AgentTool/agentColorManager.js'
import { isCustomAgent } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { CustomAgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { AppState } from 'src/state/AppState.js'
import { createTaskStateBase, generateTaskId } from 'src/Task.js'
import type { ToolUseContext } from 'src/Tool.js'
import {
  findTeammateTaskByAgentId,
  requestTeammateShutdown as markTeammateShutdownRequested,
} from 'src/tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import type { InProcessTeammateTaskState } from 'src/tasks/InProcessTeammateTask/types.js'
import { quote } from 'src/utils/bash/shellQuote.js'
import { isInBundledMode } from 'src/utils/bundledMode.js'
import { registerCleanup } from 'src/utils/cleanupRegistry.js'
import { logForDebugging } from 'src/utils/debug.js'
import type { PermissionMode } from 'src/utils/permissions/PermissionMode.js'
import {
  SWARM_SESSION_NAME,
  TEAMMATE_COMMAND_ENV_VAR,
} from 'src/utils/swarm/constants.js'
import { startInProcessTeammate } from 'src/utils/swarm/inProcessRunner.js'
import {
  type InProcessSpawnConfig,
  killInProcessTeammate,
  spawnInProcessTeammate,
} from 'src/utils/swarm/spawnInProcess.js'
import {
  buildInheritedCliArgParts,
  buildInheritedEnvVars,
  getInheritedEnvVarAssignments,
} from 'src/utils/swarm/spawnUtils.js'
import { registerTask } from 'src/utils/task/framework.js'
import { sendShutdownRequestToMailbox } from 'src/utils/teammateMailbox.js'
import { getSessionId } from 'src/bootstrap/state.js'
import { isInsideTmux, isInsideTmuxSync } from './detection.js'
import { ensureBackendsRegistered, getBackendByType } from './registry.js'
import type { BackendType, PaneBackend, PaneBackendType } from './types.js'
import { isPaneBackend } from './types.js'

type SetAppState = (updater: (prev: AppState) => AppState) => void

export type TeammateLifecycleMember = {
  agentId: string
  name: string
  tmuxPaneId: string
  backendType?: BackendType
  insideTmux?: boolean
}

export type TeammateLifecycleContext = {
  getAppState(): Pick<AppState, 'tasks'>
  setAppState: SetAppState
}

export type TeammateSpawnRequest = {
  teammateId: string
  sanitizedName: string
  teamName: string
  prompt: string
  cwd: string
  teammateColor: AgentColorName
  model?: string
  agentType?: string
  planModeRequired?: boolean
  description?: string
  useSplitPane: boolean
  permissionMode?: PermissionMode
  invokingRequestId?: string
  agentDefinition?: CustomAgentDefinition
}

export type TeammateSpawnExecutionResult = {
  backendType: BackendType
  paneId: string
  insideTmux: boolean
  sessionName: string
  windowName: string
  isSplitPane: boolean
}

export type TeammateExecutorFacade = {
  readonly type: BackendType
  spawn?(
    request: TeammateSpawnRequest,
    context: ToolUseContext,
  ): Promise<TeammateSpawnExecutionResult>
  requestShutdown(
    teamName: string,
    member: TeammateLifecycleMember,
    context: TeammateLifecycleContext,
    reason?: string,
  ): Promise<boolean>
  terminate(
    teamName: string,
    member: TeammateLifecycleMember,
    context: TeammateLifecycleContext,
  ): Promise<boolean>
  cleanupOrphan(member: TeammateLifecycleMember): Promise<boolean>
}

type TrackedPaneTeammate = {
  paneId: string
  backendType: PaneBackendType
  insideTmux: boolean
}

type PaneCleanupDependencies = {
  registerCleanup: typeof registerCleanup
  ensureBackendsRegistered: typeof ensureBackendsRegistered
  getBackendByType: typeof getBackendByType
}

type TeammateTaskDependencies = {
  findTeammateTaskByAgentId: typeof findTeammateTaskByAgentId
  requestTeammateShutdown: typeof markTeammateShutdownRequested
}

const defaultPaneCleanupDependencies: PaneCleanupDependencies = {
  registerCleanup,
  ensureBackendsRegistered,
  getBackendByType,
}
let paneCleanupDependencies = defaultPaneCleanupDependencies
const defaultTeammateTaskDependencies: TeammateTaskDependencies = {
  findTeammateTaskByAgentId,
  requestTeammateShutdown: markTeammateShutdownRequested,
}
let teammateTaskDependencies = defaultTeammateTaskDependencies

const trackedPaneTeammates = new Map<string, TrackedPaneTeammate>()
let unregisterTrackedPaneCleanup: (() => void) | undefined

function ensureTrackedPaneCleanupRegistered(): void {
  if (unregisterTrackedPaneCleanup) {
    return
  }

  unregisterTrackedPaneCleanup = paneCleanupDependencies.registerCleanup(
    async () => {
      const teammates = Array.from(trackedPaneTeammates.values())
      if (teammates.length === 0) {
        return
      }

      await paneCleanupDependencies.ensureBackendsRegistered()
      await Promise.allSettled(
        teammates.map(async teammate => {
          logForDebugging(
            `[executorFacade] Cleanup: killing ${teammate.backendType} pane ${teammate.paneId}`,
          )
          await paneCleanupDependencies
            .getBackendByType(teammate.backendType)
            .killPane(teammate.paneId, !teammate.insideTmux)
        }),
      )
      trackedPaneTeammates.clear()
    },
  )
}

function trackPaneTeammateForCleanup(
  teammateId: string,
  config: {
    paneId: string
    backendType: BackendType
    insideTmux: boolean
  },
): () => void {
  if (!isPaneBackend(config.backendType)) {
    return () => {}
  }

  trackedPaneTeammates.set(teammateId, {
    paneId: config.paneId,
    backendType: config.backendType,
    insideTmux: config.insideTmux,
  })
  ensureTrackedPaneCleanupRegistered()

  return () => untrackPaneTeammateForCleanup(teammateId)
}

function untrackPaneTeammateForCleanup(teammateId: string): void {
  trackedPaneTeammates.delete(teammateId)
  if (trackedPaneTeammates.size === 0 && unregisterTrackedPaneCleanup) {
    unregisterTrackedPaneCleanup()
    unregisterTrackedPaneCleanup = undefined
  }
}

function registerOutOfProcessTeammateTask(
  setAppState: SetAppState,
  {
    teammateId,
    sanitizedName,
    teamName,
    teammateColor,
    prompt,
    plan_mode_required,
    paneId,
    insideTmux,
    backendType,
    toolUseId,
  }: {
    teammateId: string
    sanitizedName: string
    teamName: string
    teammateColor: AgentColorName
    prompt: string
    plan_mode_required?: boolean
    paneId: string
    insideTmux: boolean
    backendType: BackendType
    toolUseId?: string
  },
): void {
  const taskId = generateTaskId('in_process_teammate')
  const description = `${sanitizedName}: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`

  const abortController = new AbortController()

  const taskState: InProcessTeammateTaskState = {
    ...createTaskStateBase(
      taskId,
      'in_process_teammate',
      description,
      toolUseId,
    ),
    type: 'in_process_teammate',
    status: 'running',
    identity: {
      agentId: teammateId,
      agentName: sanitizedName,
      teamName,
      color: teammateColor,
      planModeRequired: plan_mode_required ?? false,
      parentSessionId: getSessionId(),
    },
    prompt,
    executionBackend: backendType,
    abortController,
    awaitingPlanApproval: false,
    permissionMode: plan_mode_required ? 'plan' : 'default',
    isIdle: false,
    shutdownRequested: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    pendingUserMessages: [],
    messages: [],
  }

  registerTask(taskState, setAppState)

  const unregisterTrackedCleanup = trackPaneTeammateForCleanup(teammateId, {
    paneId,
    backendType,
    insideTmux,
  })

  abortController.signal.addEventListener(
    'abort',
    () => {
      unregisterTrackedCleanup()
      if (isPaneBackend(backendType)) {
        void paneCleanupDependencies
          .getBackendByType(backendType)
          .killPane(paneId, !insideTmux)
      }
    },
    { once: true },
  )
}

export function registerOutOfProcessTeammateTaskForTesting(
  setAppState: SetAppState,
  params: Parameters<typeof registerOutOfProcessTeammateTask>[1],
): void {
  registerOutOfProcessTeammateTask(setAppState, params)
}

export function resetTrackedPaneCleanupForTesting(): void {
  trackedPaneTeammates.clear()
  unregisterTrackedPaneCleanup?.()
  unregisterTrackedPaneCleanup = undefined
}

export function setPaneCleanupDependenciesForTesting(
  overrides: Partial<PaneCleanupDependencies>,
): () => void {
  paneCleanupDependencies = {
    ...defaultPaneCleanupDependencies,
    ...overrides,
  }
  return () => {
    paneCleanupDependencies = defaultPaneCleanupDependencies
  }
}

export function setTeammateTaskDependenciesForTesting(
  overrides: Partial<TeammateTaskDependencies>,
): () => void {
  teammateTaskDependencies = {
    ...defaultTeammateTaskDependencies,
    ...overrides,
  }
  return () => {
    teammateTaskDependencies = defaultTeammateTaskDependencies
  }
}

function withoutModelArg(args: string[]): string[] {
  const filtered: string[] = []
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--model') {
      i += 1
      continue
    }
    filtered.push(args[i]!)
  }
  return filtered
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function getTeammateCommand(): string {
  if (process.env[TEAMMATE_COMMAND_ENV_VAR]) {
    return process.env[TEAMMATE_COMMAND_ENV_VAR]
  }
  return isInBundledMode() ? process.execPath : process.argv[1]!
}

function buildPowerShellSpawnCommand(
  binaryPath: string,
  args: string[],
  cwd: string,
): string {
  const envAssignments = getInheritedEnvVarAssignments().map(
    ([key, value]) => `$env:${key} = ${quotePowerShellString(value)}`,
  )
  const invocation = isInBundledMode()
    ? `& ${quotePowerShellString(binaryPath)}`
    : `& ${quotePowerShellString(process.execPath)} ${quotePowerShellString(binaryPath)}`

  return [
    `Set-Location -LiteralPath ${quotePowerShellString(cwd)}`,
    ...envAssignments,
    `${invocation} ${args.map(quotePowerShellString).join(' ')}`,
  ].join('; ')
}

function buildSpawnCommand(
  backendType: BackendType,
  binaryPath: string,
  args: string[],
  cwd: string,
): string {
  if (backendType === 'windows-terminal') {
    return buildPowerShellSpawnCommand(binaryPath, args, cwd)
  }

  const envStr = buildInheritedEnvVars()
  return `cd ${quote([cwd])} && env ${envStr} ${quote([binaryPath])} ${quote(args)}`
}

function buildTeammateArgParts(params: {
  teammateId: string
  sanitizedName: string
  teamName: string
  teammateColor: AgentColorName
  planModeRequired?: boolean
  agentType?: string
  agentDefinition?: CustomAgentDefinition
  model?: string
  permissionMode?: PermissionMode
}): string[] {
  const {
    teammateId,
    sanitizedName,
    teamName,
    teammateColor,
    planModeRequired,
    agentType,
    agentDefinition,
    model,
    permissionMode,
  } = params

  let inheritedArgParts = buildInheritedCliArgParts({
    planModeRequired,
    permissionMode,
  })

  if (model) {
    inheritedArgParts = withoutModelArg(inheritedArgParts)
    inheritedArgParts.push('--model', model)
  }

  return [
    '--agent-id',
    teammateId,
    '--agent-name',
    sanitizedName,
    '--team-name',
    teamName,
    '--agent-color',
    teammateColor,
    '--parent-session-id',
    getSessionId(),
    ...(planModeRequired ? ['--plan-mode-required'] : []),
    ...(agentType ? ['--agent-type', agentType] : []),
    ...(agentDefinition
      ? ['--agents', serializeAgentDefinitionForCli(agentDefinition)]
      : []),
    ...inheritedArgParts,
  ]
}

function serializeAgentDefinitionForCli(
  agentDefinition: CustomAgentDefinition,
): string {
  const definition: Record<string, unknown> = {
    description: agentDefinition.whenToUse,
    prompt: agentDefinition.getSystemPrompt(),
  }

  if (agentDefinition.tools !== undefined) {
    definition.tools = agentDefinition.tools
  }
  if (agentDefinition.disallowedTools !== undefined) {
    definition.disallowedTools = agentDefinition.disallowedTools
  }
  if (agentDefinition.model !== undefined) {
    definition.model = agentDefinition.model
  }
  if (agentDefinition.effort !== undefined) {
    definition.effort = agentDefinition.effort
  }
  if (agentDefinition.permissionMode !== undefined) {
    definition.permissionMode = agentDefinition.permissionMode
  }
  if (agentDefinition.mcpServers !== undefined) {
    definition.mcpServers = agentDefinition.mcpServers
  }
  if (agentDefinition.hooks !== undefined) {
    definition.hooks = agentDefinition.hooks
  }
  if (agentDefinition.maxTurns !== undefined) {
    definition.maxTurns = agentDefinition.maxTurns
  }
  if (agentDefinition.skills !== undefined) {
    definition.skills = agentDefinition.skills
  }
  if (agentDefinition.initialPrompt !== undefined) {
    definition.initialPrompt = agentDefinition.initialPrompt
  }
  if (agentDefinition.background !== undefined) {
    definition.background = agentDefinition.background
  }
  if (agentDefinition.isolation !== undefined) {
    definition.isolation = agentDefinition.isolation
  }

  return JSON.stringify({ [agentDefinition.agentType]: definition })
}

function isInProcessTeammateMember(member: TeammateLifecycleMember): boolean {
  return (
    member.backendType === 'in-process' || member.tmuxPaneId === 'in-process'
  )
}

class InProcessTeammateExecutor implements TeammateExecutorFacade {
  readonly type = 'in-process' as const

  async spawn(
    request: TeammateSpawnRequest,
    context: ToolUseContext,
  ): Promise<TeammateSpawnExecutionResult> {
    const config: InProcessSpawnConfig = {
      name: request.sanitizedName,
      teamName: request.teamName,
      prompt: request.prompt,
      color: request.teammateColor,
      planModeRequired: request.planModeRequired ?? false,
      model: request.model,
    }

    let agentDefinition = request.agentDefinition
    if (request.agentType) {
      if (!agentDefinition) {
        const allAgents = context.options?.agentDefinitions?.activeAgents ?? []
        const foundAgent = allAgents.find(
          a => a.agentType === request.agentType,
        )
        if (foundAgent && isCustomAgent(foundAgent)) {
          agentDefinition = foundAgent
        }
      }
      logForDebugging(
        `[executorFacade] in-process spawn agent_type=${request.agentType}, found=${!!agentDefinition}`,
      )
    }

    const result = await spawnInProcessTeammate(config, context)

    if (!result.success) {
      throw new Error(result.error ?? 'Failed to spawn in-process teammate')
    }

    logForDebugging(
      `[executorFacade] in-process spawn result: taskId=${result.taskId}, hasContext=${!!result.teammateContext}, hasAbort=${!!result.abortController}`,
    )

    if (result.taskId && result.teammateContext && result.abortController) {
      startInProcessTeammate({
        identity: {
          agentId: request.teammateId,
          agentName: request.sanitizedName,
          teamName: request.teamName,
          color: request.teammateColor,
          planModeRequired: request.planModeRequired ?? false,
          parentSessionId: result.teammateContext.parentSessionId,
        },
        taskId: result.taskId,
        prompt: request.prompt,
        description: request.description,
        model: request.model,
        agentDefinition,
        teammateContext: result.teammateContext,
        toolUseContext: { ...context, messages: [] },
        abortController: result.abortController,
        invokingRequestId: request.invokingRequestId,
      })
      logForDebugging(
        `[executorFacade] Started agent execution for ${request.teammateId}`,
      )
    }

    return {
      backendType: this.type,
      paneId: 'in-process',
      insideTmux: false,
      sessionName: 'in-process',
      windowName: 'in-process',
      isSplitPane: false,
    }
  }

  async requestShutdown(
    teamName: string,
    member: TeammateLifecycleMember,
    context: TeammateLifecycleContext,
    reason?: string,
  ): Promise<boolean> {
    const task = teammateTaskDependencies.findTeammateTaskByAgentId(
      member.agentId,
      context.getAppState().tasks,
    )

    if (!task) {
      logForDebugging(
        `[executorFacade] No in-process task found for ${member.agentId} in ${teamName}`,
      )
      return false
    }

    if (task.shutdownRequested) {
      logForDebugging(
        `[executorFacade] Shutdown already requested for ${member.agentId}`,
      )
      return true
    }

    await sendShutdownRequestToMailbox(member.name, teamName, reason)
    teammateTaskDependencies.requestTeammateShutdown(
      task.id,
      context.setAppState,
    )
    return true
  }

  async terminate(
    teamName: string,
    member: TeammateLifecycleMember,
    context: TeammateLifecycleContext,
  ): Promise<boolean> {
    const task = teammateTaskDependencies.findTeammateTaskByAgentId(
      member.agentId,
      context.getAppState().tasks,
    )

    if (!task) {
      logForDebugging(
        `[executorFacade] No in-process task found for ${member.agentId} in ${teamName}`,
      )
      return false
    }

    return killInProcessTeammate(task.id, context.setAppState)
  }

  async cleanupOrphan(): Promise<boolean> {
    return false
  }
}

class PaneTeammateExecutor implements TeammateExecutorFacade {
  readonly type: PaneBackendType

  constructor(private readonly backendOrType: PaneBackend | PaneBackendType) {
    this.type =
      typeof backendOrType === 'string' ? backendOrType : backendOrType.type
  }

  private async getBackend(): Promise<PaneBackend> {
    if (typeof this.backendOrType !== 'string') {
      return this.backendOrType
    }

    await paneCleanupDependencies.ensureBackendsRegistered()
    return paneCleanupDependencies.getBackendByType(this.type)
  }

  async spawn(
    request: TeammateSpawnRequest,
    context: ToolUseContext,
  ): Promise<TeammateSpawnExecutionResult> {
    const backend = await this.getBackend()
    const insideTmux = await isInsideTmux()
    const paneResult =
      request.useSplitPane === false && backend.createTeammateWindowInSwarmView
        ? await backend.createTeammateWindowInSwarmView(
            request.sanitizedName,
            request.teammateColor,
          )
        : await backend.createTeammatePaneInSwarmView(
            request.sanitizedName,
            request.teammateColor,
          )
    const { paneId, isFirstTeammate } = paneResult

    if (isFirstTeammate && insideTmux) {
      await backend.enablePaneBorderStatus()
    }

    const teammateArgs = buildTeammateArgParts({
      teammateId: request.teammateId,
      sanitizedName: request.sanitizedName,
      teamName: request.teamName,
      teammateColor: request.teammateColor,
      planModeRequired: request.planModeRequired,
      agentType: request.agentType,
      agentDefinition: request.agentDefinition,
      model: request.model,
      permissionMode: request.permissionMode,
    })
    const spawnCommand = buildSpawnCommand(
      this.type,
      getTeammateCommand(),
      teammateArgs,
      request.cwd,
    )
    const paneInsideTmux =
      request.useSplitPane || this.type !== 'tmux'
        ? insideTmux
        : !('windowName' in paneResult) && insideTmux

    await backend.sendCommandToPane(paneId, spawnCommand, !paneInsideTmux)

    registerOutOfProcessTeammateTask(context.setAppState, {
      teammateId: request.teammateId,
      sanitizedName: request.sanitizedName,
      teamName: request.teamName,
      teammateColor: request.teammateColor,
      prompt: request.prompt,
      plan_mode_required: request.planModeRequired,
      paneId,
      insideTmux: paneInsideTmux,
      backendType: this.type,
      toolUseId: context.toolUseId,
    })

    const sessionName =
      this.type === 'tmux'
        ? request.useSplitPane && insideTmux
          ? 'current'
          : SWARM_SESSION_NAME
        : this.type
    const rawWindowName = (paneResult as unknown as { windowName?: unknown })
      .windowName
    const windowName =
      request.useSplitPane && this.type === 'tmux'
        ? insideTmux
          ? 'current'
          : 'swarm-view'
        : typeof rawWindowName === 'string'
          ? rawWindowName
          : 'current'

    return {
      backendType: this.type,
      paneId,
      insideTmux: paneInsideTmux,
      sessionName,
      windowName,
      isSplitPane: request.useSplitPane,
    }
  }

  async requestShutdown(
    teamName: string,
    member: TeammateLifecycleMember,
    context: TeammateLifecycleContext,
    reason?: string,
  ): Promise<boolean> {
    const task = teammateTaskDependencies.findTeammateTaskByAgentId(
      member.agentId,
      context.getAppState().tasks,
    )

    if (task?.shutdownRequested) {
      logForDebugging(
        `[executorFacade] Shutdown already requested for ${member.agentId}`,
      )
      return true
    }

    await sendShutdownRequestToMailbox(member.name, teamName, reason)

    if (task) {
      teammateTaskDependencies.requestTeammateShutdown(
        task.id,
        context.setAppState,
      )
    } else {
      logForDebugging(
        `[executorFacade] No pane task found to mark shutdownRequested for ${member.agentId} in ${teamName}`,
      )
    }

    return true
  }

  async terminate(
    _teamName: string,
    member: TeammateLifecycleMember,
    _context: TeammateLifecycleContext,
  ): Promise<boolean> {
    try {
      const backend = await this.getBackend()
      const insideTmux = member.insideTmux ?? isInsideTmuxSync()
      const terminated = await backend.killPane(member.tmuxPaneId, !insideTmux)
      if (terminated) {
        untrackPaneTeammateForCleanup(member.agentId)
      }
      return terminated
    } catch (error) {
      logForDebugging(
        `[executorFacade] Failed to kill pane ${member.tmuxPaneId} for ${member.agentId}: ${String(error)}`,
      )
      return false
    }
  }

  async cleanupOrphan(member: TeammateLifecycleMember): Promise<boolean> {
    try {
      const backend = await this.getBackend()
      const insideTmux = member.insideTmux ?? (await isInsideTmux())
      return await backend.killPane(member.tmuxPaneId, !insideTmux)
    } catch (error) {
      logForDebugging(
        `[executorFacade] Failed orphan cleanup for ${member.agentId}: ${String(error)}`,
      )
      return false
    }
  }
}

export function createInProcessTeammateExecutor(): TeammateExecutorFacade {
  return new InProcessTeammateExecutor()
}

export function createPaneTeammateExecutor(
  backendOrType: PaneBackend | PaneBackendType,
): TeammateExecutorFacade {
  return new PaneTeammateExecutor(backendOrType)
}

export function createTeammateExecutorForMember(
  member: TeammateLifecycleMember,
): TeammateExecutorFacade | undefined {
  if (isInProcessTeammateMember(member)) {
    return createInProcessTeammateExecutor()
  }

  if (member.backendType && isPaneBackend(member.backendType)) {
    return createPaneTeammateExecutor(member.backendType)
  }

  return undefined
}
