import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { once } from 'events'
import { createInterface } from 'readline'

import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../../contracts/events.js'
import type {
  KernelRuntimeHostIdentity,
  KernelRuntimeTransportKind,
} from '../../contracts/runtime.js'
import type {
  KernelRuntimeAssignTaskCommand,
  KernelRuntimeDispatchCompanionActionCommand,
  KernelRuntimeDestroyTeamCommand,
  KernelRuntimeEnqueueKairosEventCommand,
  KernelRuntimeAuthenticateMcpCommand,
  KernelRuntimeCancelAgentRunCommand,
  KernelRuntimeCallToolCommand,
  KernelRuntimeCommand,
  KernelRuntimeConnectMcpCommand,
  KernelRuntimeConnectHostCommand,
  KernelRuntimeCreateTaskCommand,
  KernelRuntimeCreateTeamCommand,
  KernelRuntimeCreateConversationCommand,
  KernelRuntimeDecidePermissionCommand,
  KernelRuntimeDisconnectHostCommand,
  KernelRuntimeExecuteCommandCommand,
  KernelRuntimeGetCompanionStateCommand,
  KernelRuntimeGetContextGitStatusCommand,
  KernelRuntimeGetAgentOutputCommand,
  KernelRuntimeGetAgentRunCommand,
  KernelRuntimeGetKairosStatusCommand,
  KernelRuntimeGetSessionTranscriptCommand,
  KernelRuntimeGetSystemPromptInjectionCommand,
  KernelRuntimeGetTaskCommand,
  KernelRuntimeGetTeamCommand,
  KernelRuntimeHostDisconnectPolicy,
  KernelRuntimeInstallPluginCommand,
  KernelRuntimeListAgentRunsCommand,
  KernelRuntimeListAgentsCommand,
  KernelRuntimeListCommandsCommand,
  KernelRuntimeListMemoryCommand,
  KernelRuntimeListSessionsCommand,
  KernelRuntimeListHooksCommand,
  KernelRuntimeListMcpResourcesCommand,
  KernelRuntimeListMcpServersCommand,
  KernelRuntimeListMcpToolsCommand,
  KernelRuntimeListPluginsCommand,
  KernelRuntimeListSkillsCommand,
  KernelRuntimeListTasksCommand,
  KernelRuntimeListTeamsCommand,
  KernelRuntimeListToolsCommand,
  KernelRuntimeReloadAgentsCommand,
  KernelRuntimeReloadCapabilitiesCommand,
  KernelRuntimeReloadHooksCommand,
  KernelRuntimeReloadMcpCommand,
  KernelRuntimeReloadPluginsCommand,
  KernelRuntimeReloadSkillsCommand,
  KernelRuntimeRegisterHookCommand,
  KernelRuntimeReactCompanionCommand,
  KernelRuntimeReadContextCommand,
  KernelRuntimeReadMemoryCommand,
  KernelRuntimeResumeKairosCommand,
  KernelRuntimeResumeSessionCommand,
  KernelRuntimeResolveSkillContextCommand,
  KernelRuntimeSetSystemPromptInjectionCommand,
  KernelRuntimeRunHookCommand,
  KernelRuntimeSendTeamMessageCommand,
  KernelRuntimeSetMcpEnabledCommand,
  KernelRuntimeSetPluginEnabledCommand,
  KernelRuntimeSpawnAgentCommand,
  KernelRuntimeSuspendKairosCommand,
  KernelRuntimeSubscribeEventsCommand,
  KernelRuntimeTickKairosCommand,
  KernelRuntimeUninstallPluginCommand,
  KernelRuntimeUpdateMemoryCommand,
  KernelRuntimeUpdatePluginCommand,
  KernelRuntimeUpdateTaskCommand,
} from '../../contracts/wire.js'
import { KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION } from '../../contracts/wire.js'
import type { KernelRuntimeWireRouter } from './KernelRuntimeWireRouter.js'

type PendingRequest = {
  command: KernelRuntimeCommand
  resolve(envelope: KernelRuntimeEnvelopeBase): void
  reject(error: Error): void
}

type EventSubscriptionScope = Pick<
  KernelRuntimeSubscribeEventsCommand,
  'conversationId' | 'turnId'
>

export type KernelRuntimeWireTransport = {
  readonly kind: KernelRuntimeTransportKind
  send(command: KernelRuntimeCommand): Promise<KernelRuntimeEnvelopeBase>
  subscribe(handler: KernelRuntimeEventSink): () => void
  close(): Promise<void> | void
}

export type KernelRuntimeWireClientCommand<
  TCommand extends KernelRuntimeCommand,
> = Omit<TCommand, 'schemaVersion' | 'requestId'> & {
  requestId?: string
  schemaVersion?: typeof KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION
}

export type KernelRuntimeWireClientOptions = {
  createRequestId?: (command: KernelRuntimeCommand['type']) => string
}

export type KernelRuntimeWireClient = {
  request<TCommand extends KernelRuntimeCommand>(
    command: KernelRuntimeWireClientCommand<TCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  onEvent(handler: KernelRuntimeEventSink): () => void
  ping(): Promise<KernelRuntimeEnvelopeBase>
  connectHost(
    host: KernelRuntimeHostIdentity,
    options?: {
      requestId?: string
      sinceEventId?: string
      metadata?: Record<string, unknown>
    },
  ): Promise<KernelRuntimeEnvelopeBase>
  disconnectHost(
    hostId: string,
    options?: {
      requestId?: string
      reason?: string
      policy?: KernelRuntimeHostDisconnectPolicy
      metadata?: Record<string, unknown>
    },
  ): Promise<KernelRuntimeEnvelopeBase>
  createConversation(
    command: KernelRuntimeWireClientCommand<KernelRuntimeCreateConversationCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  runTurn(
    command: KernelRuntimeWireClientCommand<
      Extract<KernelRuntimeCommand, { type: 'run_turn' }>
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  abortTurn(
    command: KernelRuntimeWireClientCommand<
      Extract<KernelRuntimeCommand, { type: 'abort_turn' }>
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  decidePermission(
    command: KernelRuntimeWireClientCommand<KernelRuntimeDecidePermissionCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  subscribeEvents(
    command: KernelRuntimeWireClientCommand<KernelRuntimeSubscribeEventsCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadCapabilities(
    command: KernelRuntimeWireClientCommand<KernelRuntimeReloadCapabilitiesCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  listCommands(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListCommandsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  executeCommand(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeExecuteCommandCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listTools(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListToolsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  callTool(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeCallToolCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listMcpServers(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListMcpServersCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listMcpTools(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListMcpToolsCommand>,
      'requestId' | 'metadata' | 'serverName'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listMcpResources(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListMcpResourcesCommand>,
      'requestId' | 'metadata' | 'serverName'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadMcp(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeReloadMcpCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  connectMcp(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeConnectMcpCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  authenticateMcp(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeAuthenticateMcpCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  setMcpEnabled(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeSetMcpEnabledCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listHooks(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListHooksCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadHooks(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeReloadHooksCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  runHook(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeRunHookCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  registerHook(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeRegisterHookCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listSkills(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListSkillsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadSkills(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeReloadSkillsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  resolveSkillContext(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeResolveSkillContextCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listPlugins(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListPluginsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadPlugins(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeReloadPluginsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  setPluginEnabled(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeSetPluginEnabledCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  installPlugin(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeInstallPluginCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  uninstallPlugin(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeUninstallPluginCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  updatePlugin(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeUpdatePluginCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listAgents(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListAgentsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadAgents(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeReloadAgentsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  spawnAgent(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeSpawnAgentCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listAgentRuns(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListAgentRunsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getAgentRun(
    options: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetAgentRunCommand>,
      'runId' | 'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getAgentOutput(
    options: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetAgentOutputCommand>,
      'runId' | 'tailBytes' | 'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  cancelAgentRun(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeCancelAgentRunCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listTasks(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListTasksCommand>,
      'requestId' | 'metadata' | 'taskListId'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getTask(
    options: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetTaskCommand>,
      'taskId' | 'requestId' | 'metadata' | 'taskListId'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  createTask(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeCreateTaskCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  updateTask(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeUpdateTaskCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  assignTask(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeAssignTaskCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listTeams(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListTeamsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getTeam(
    options: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetTeamCommand>,
      'teamName' | 'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  createTeam(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeCreateTeamCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  sendTeamMessage(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeSendTeamMessageCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  destroyTeam(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeDestroyTeamCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getCompanionState(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetCompanionStateCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  dispatchCompanionAction(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeDispatchCompanionActionCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  reactCompanion(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeReactCompanionCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getKairosStatus(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetKairosStatusCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  enqueueKairosEvent(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeEnqueueKairosEventCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  tickKairos(
    command?: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeTickKairosCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  suspendKairos(
    command?: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeSuspendKairosCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  resumeKairos(
    command?: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeResumeKairosCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listMemory(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListMemoryCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  readMemory(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeReadMemoryCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  updateMemory(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeUpdateMemoryCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  readContext(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeReadContextCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getContextGitStatus(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetContextGitStatusCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getSystemPromptInjection(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetSystemPromptInjectionCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  setSystemPromptInjection(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeSetSystemPromptInjectionCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listSessions(
    command?: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeListSessionsCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  resumeSession(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeResumeSessionCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getSessionTranscript(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeGetSessionTranscriptCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  publishHostEvent(
    event: KernelEvent,
    options?: { requestId?: string; metadata?: Record<string, unknown> },
  ): Promise<KernelRuntimeEnvelopeBase>
  close(): Promise<void> | void
}

export type KernelRuntimeInProcessWireTransportOptions = {
  router: KernelRuntimeWireRouter
}

export type KernelRuntimeStdioWireTransportOptions = {
  command: string
  args?: readonly string[]
  cwd?: string
  env?: Record<string, string | undefined>
  closeTimeoutMs?: number
  stderr?: (chunk: string) => void
}

export function createKernelRuntimeWireClient(
  transport: KernelRuntimeWireTransport,
  options: KernelRuntimeWireClientOptions = {},
): KernelRuntimeWireClient {
  let nextRequestNumber = 1
  const createRequestId =
    options.createRequestId ??
    ((type: KernelRuntimeCommand['type']) => {
      return `${type}-${nextRequestNumber++}`
    })

  const request = <TCommand extends KernelRuntimeCommand>(
    command: KernelRuntimeWireClientCommand<TCommand>,
  ): Promise<KernelRuntimeEnvelopeBase> => {
    return transport.send(normalizeCommand(command, createRequestId))
  }

  return {
    request,
    onEvent: handler => transport.subscribe(handler),
    ping: () =>
      request({ type: 'ping' } as KernelRuntimeWireClientCommand<
        Extract<KernelRuntimeCommand, { type: 'ping' }>
      >),
    connectHost: (host, commandOptions = {}) =>
      request<KernelRuntimeConnectHostCommand>({
        type: 'connect_host',
        host,
        ...commandOptions,
      }),
    disconnectHost: (hostId, commandOptions = {}) =>
      request<KernelRuntimeDisconnectHostCommand>({
        type: 'disconnect_host',
        hostId,
        ...commandOptions,
      }),
    createConversation: command =>
      request<KernelRuntimeCreateConversationCommand>({
        ...command,
        type: 'create_conversation',
      }),
    runTurn: command =>
      request<Extract<KernelRuntimeCommand, { type: 'run_turn' }>>({
        ...command,
        type: 'run_turn',
      }),
    abortTurn: command =>
      request<Extract<KernelRuntimeCommand, { type: 'abort_turn' }>>({
        ...command,
        type: 'abort_turn',
      }),
    decidePermission: command =>
      request<KernelRuntimeDecidePermissionCommand>({
        ...command,
        type: 'decide_permission',
      }),
    subscribeEvents: command =>
      request<KernelRuntimeSubscribeEventsCommand>({
        ...command,
        type: 'subscribe_events',
      }),
    reloadCapabilities: command =>
      request<KernelRuntimeReloadCapabilitiesCommand>({
        ...command,
        type: 'reload_capabilities',
      }),
    listCommands: (command = {}) =>
      request<KernelRuntimeListCommandsCommand>({
        ...command,
        type: 'list_commands',
      }),
    executeCommand: command =>
      request<KernelRuntimeExecuteCommandCommand>({
        ...command,
        type: 'execute_command',
      }),
    listTools: (command = {}) =>
      request<KernelRuntimeListToolsCommand>({
        ...command,
        type: 'list_tools',
      }),
    callTool: command =>
      request<KernelRuntimeCallToolCommand>({
        ...command,
        type: 'call_tool',
      }),
    listMcpServers: (command = {}) =>
      request<KernelRuntimeListMcpServersCommand>({
        ...command,
        type: 'list_mcp_servers',
      }),
    listMcpTools: (command = {}) =>
      request<KernelRuntimeListMcpToolsCommand>({
        ...command,
        type: 'list_mcp_tools',
      }),
    listMcpResources: (command = {}) =>
      request<KernelRuntimeListMcpResourcesCommand>({
        ...command,
        type: 'list_mcp_resources',
      }),
    reloadMcp: (command = {}) =>
      request<KernelRuntimeReloadMcpCommand>({
        ...command,
        type: 'reload_mcp',
      }),
    connectMcp: command =>
      request<KernelRuntimeConnectMcpCommand>({
        ...command,
        type: 'connect_mcp',
      }),
    authenticateMcp: command =>
      request<KernelRuntimeAuthenticateMcpCommand>({
        ...command,
        type: 'authenticate_mcp',
      }),
    setMcpEnabled: command =>
      request<KernelRuntimeSetMcpEnabledCommand>({
        ...command,
        type: 'set_mcp_enabled',
      }),
    listHooks: (command = {}) =>
      request<KernelRuntimeListHooksCommand>({
        ...command,
        type: 'list_hooks',
      }),
    reloadHooks: (command = {}) =>
      request<KernelRuntimeReloadHooksCommand>({
        ...command,
        type: 'reload_hooks',
      }),
    runHook: command =>
      request<KernelRuntimeRunHookCommand>({
        ...command,
        type: 'run_hook',
      }),
    registerHook: command =>
      request<KernelRuntimeRegisterHookCommand>({
        ...command,
        type: 'register_hook',
      }),
    listSkills: (command = {}) =>
      request<KernelRuntimeListSkillsCommand>({
        ...command,
        type: 'list_skills',
      }),
    reloadSkills: (command = {}) =>
      request<KernelRuntimeReloadSkillsCommand>({
        ...command,
        type: 'reload_skills',
      }),
    resolveSkillContext: command =>
      request<KernelRuntimeResolveSkillContextCommand>({
        ...command,
        type: 'resolve_skill_context',
      }),
    listPlugins: (command = {}) =>
      request<KernelRuntimeListPluginsCommand>({
        ...command,
        type: 'list_plugins',
      }),
    reloadPlugins: (command = {}) =>
      request<KernelRuntimeReloadPluginsCommand>({
        ...command,
        type: 'reload_plugins',
      }),
    setPluginEnabled: command =>
      request<KernelRuntimeSetPluginEnabledCommand>({
        ...command,
        type: 'set_plugin_enabled',
      }),
    installPlugin: command =>
      request<KernelRuntimeInstallPluginCommand>({
        ...command,
        type: 'install_plugin',
      }),
    uninstallPlugin: command =>
      request<KernelRuntimeUninstallPluginCommand>({
        ...command,
        type: 'uninstall_plugin',
      }),
    updatePlugin: command =>
      request<KernelRuntimeUpdatePluginCommand>({
        ...command,
        type: 'update_plugin',
      }),
    listAgents: (command = {}) =>
      request<KernelRuntimeListAgentsCommand>({
        ...command,
        type: 'list_agents',
      }),
    reloadAgents: (command = {}) =>
      request<KernelRuntimeReloadAgentsCommand>({
        ...command,
        type: 'reload_agents',
      }),
    spawnAgent: command =>
      request<KernelRuntimeSpawnAgentCommand>({
        ...command,
        type: 'spawn_agent',
      }),
    listAgentRuns: (command = {}) =>
      request<KernelRuntimeListAgentRunsCommand>({
        ...command,
        type: 'list_agent_runs',
      }),
    getAgentRun: command =>
      request<KernelRuntimeGetAgentRunCommand>({
        ...command,
        type: 'get_agent_run',
      }),
    getAgentOutput: command =>
      request<KernelRuntimeGetAgentOutputCommand>({
        ...command,
        type: 'get_agent_output',
      }),
    cancelAgentRun: command =>
      request<KernelRuntimeCancelAgentRunCommand>({
        ...command,
        type: 'cancel_agent_run',
      }),
    listTasks: (command = {}) =>
      request<KernelRuntimeListTasksCommand>({
        ...command,
        type: 'list_tasks',
      }),
    getTask: command =>
      request<KernelRuntimeGetTaskCommand>({
        ...command,
        type: 'get_task',
      }),
    createTask: command =>
      request<KernelRuntimeCreateTaskCommand>({
        ...command,
        type: 'create_task',
      }),
    updateTask: command =>
      request<KernelRuntimeUpdateTaskCommand>({
        ...command,
        type: 'update_task',
      }),
    assignTask: command =>
      request<KernelRuntimeAssignTaskCommand>({
        ...command,
        type: 'assign_task',
      }),
    listTeams: (command = {}) =>
      request<KernelRuntimeListTeamsCommand>({
        ...command,
        type: 'list_teams',
      }),
    getTeam: command =>
      request<KernelRuntimeGetTeamCommand>({
        ...command,
        type: 'get_team',
      }),
    createTeam: command =>
      request<KernelRuntimeCreateTeamCommand>({
        ...command,
        type: 'create_team',
      }),
    sendTeamMessage: command =>
      request<KernelRuntimeSendTeamMessageCommand>({
        ...command,
        type: 'send_team_message',
      }),
    destroyTeam: command =>
      request<KernelRuntimeDestroyTeamCommand>({
        ...command,
        type: 'destroy_team',
      }),
    getCompanionState: (command = {}) =>
      request<KernelRuntimeGetCompanionStateCommand>({
        ...command,
        type: 'get_companion_state',
      }),
    dispatchCompanionAction: command =>
      request<KernelRuntimeDispatchCompanionActionCommand>({
        ...command,
        type: 'dispatch_companion_action',
      }),
    reactCompanion: command =>
      request<KernelRuntimeReactCompanionCommand>({
        ...command,
        type: 'react_companion',
      }),
    getKairosStatus: (command = {}) =>
      request<KernelRuntimeGetKairosStatusCommand>({
        ...command,
        type: 'get_kairos_status',
      }),
    enqueueKairosEvent: command =>
      request<KernelRuntimeEnqueueKairosEventCommand>({
        ...command,
        type: 'enqueue_kairos_event',
      }),
    tickKairos: (command = {}) =>
      request<KernelRuntimeTickKairosCommand>({
        ...command,
        type: 'tick_kairos',
      }),
    suspendKairos: (command = {}) =>
      request<KernelRuntimeSuspendKairosCommand>({
        ...command,
        type: 'suspend_kairos',
      }),
    resumeKairos: (command = {}) =>
      request<KernelRuntimeResumeKairosCommand>({
        ...command,
        type: 'resume_kairos',
      }),
    listMemory: (command = {}) =>
      request<KernelRuntimeListMemoryCommand>({
        ...command,
        type: 'list_memory',
      }),
    readMemory: command =>
      request<KernelRuntimeReadMemoryCommand>({
        ...command,
        type: 'read_memory',
      }),
    updateMemory: command =>
      request<KernelRuntimeUpdateMemoryCommand>({
        ...command,
        type: 'update_memory',
      }),
    readContext: (command = {}) =>
      request<KernelRuntimeReadContextCommand>({
        ...command,
        type: 'read_context',
      }),
    getContextGitStatus: (command = {}) =>
      request<KernelRuntimeGetContextGitStatusCommand>({
        ...command,
        type: 'get_context_git_status',
      }),
    getSystemPromptInjection: (command = {}) =>
      request<KernelRuntimeGetSystemPromptInjectionCommand>({
        ...command,
        type: 'get_system_prompt_injection',
      }),
    setSystemPromptInjection: command =>
      request<KernelRuntimeSetSystemPromptInjectionCommand>({
        ...command,
        type: 'set_system_prompt_injection',
      }),
    listSessions: (command = {}) =>
      request<KernelRuntimeListSessionsCommand>({
        ...command,
        type: 'list_sessions',
      }),
    resumeSession: command =>
      request<KernelRuntimeResumeSessionCommand>({
        ...command,
        type: 'resume_session',
      }),
    getSessionTranscript: command =>
      request<KernelRuntimeGetSessionTranscriptCommand>({
        ...command,
        type: 'get_session_transcript',
      }),
    publishHostEvent: (event, commandOptions = {}) =>
      request<Extract<KernelRuntimeCommand, { type: 'publish_host_event' }>>({
        type: 'publish_host_event',
        event,
        ...commandOptions,
      }),
    close: () => transport.close(),
  }
}

export function createKernelRuntimeInProcessWireTransport(
  options: KernelRuntimeInProcessWireTransportOptions,
): KernelRuntimeWireTransport {
  let closed = false
  const listeners = new Set<KernelRuntimeEventSink>()
  const liveSubscriptions: EventSubscriptionScope[] = []
  const bufferedEvents: KernelRuntimeEnvelopeBase[] = []
  let deliveryBarrierCount = 0
  const bufferOrNotify = (envelope: KernelRuntimeEnvelopeBase): void => {
    if (envelope.kind !== 'event') {
      return
    }
    if (deliveryBarrierCount > 0) {
      bufferedEvents.push(envelope)
      return
    }
    if (shouldDeliverEvent(liveSubscriptions, envelope)) {
      notifyListeners(listeners, envelope)
    }
  }
  const flushBufferedEvents = (): void => {
    if (deliveryBarrierCount > 0 || bufferedEvents.length === 0) {
      return
    }
    for (const envelope of bufferedEvents.splice(0)) {
      if (shouldDeliverEvent(liveSubscriptions, envelope)) {
        notifyListeners(listeners, envelope)
      }
    }
  }
  const unsubscribe = options.router.eventBus.subscribe(envelope => {
    bufferOrNotify(envelope)
  })

  return {
    kind: 'in-process',
    async send(command) {
      if (closed) {
        throw new Error('Kernel runtime wire transport is closed')
      }

      deliveryBarrierCount += 1
      try {
        const responses = await options.router.handleCommand(command)
        let controlEnvelope: KernelRuntimeEnvelopeBase | undefined
        for (const envelope of responses) {
          if (
            envelope.requestId === command.requestId &&
            isControlEnvelope(envelope)
          ) {
            controlEnvelope = envelope
          }
        }
        if (
          command.type === 'subscribe_events' &&
          controlEnvelope?.kind === 'ack'
        ) {
          recordLiveSubscription(liveSubscriptions, command)
        }
        for (const envelope of responses) {
          bufferOrNotify(envelope)
        }
        if (!controlEnvelope) {
          throw new Error(
            `Kernel runtime command ${command.requestId} completed without an ack, pong, or error envelope`,
          )
        }

        return new Promise<KernelRuntimeEnvelopeBase>(resolve => {
          resolve(controlEnvelope)
          setTimeout(() => {
            deliveryBarrierCount -= 1
            flushBufferedEvents()
          }, 0)
        })
      } catch (error) {
        deliveryBarrierCount -= 1
        throw error
      }
    },
    subscribe(handler) {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
    close() {
      if (closed) {
        return
      }
      closed = true
      unsubscribe()
      listeners.clear()
    },
  }
}

export function createKernelRuntimeStdioWireTransport(
  options: KernelRuntimeStdioWireTransportOptions,
): KernelRuntimeWireTransport {
  return new KernelRuntimeStdioWireTransport(options)
}

class KernelRuntimeStdioWireTransport implements KernelRuntimeWireTransport {
  readonly kind: KernelRuntimeTransportKind = 'stdio'
  private readonly child: ChildProcessWithoutNullStreams
  private readonly listeners = new Set<KernelRuntimeEventSink>()
  private readonly pending = new Map<string, PendingRequest>()
  private readonly liveSubscriptions: EventSubscriptionScope[] = []
  private readonly closeTimeoutMs: number
  private closed = false

  constructor(options: KernelRuntimeStdioWireTransportOptions) {
    this.closeTimeoutMs = options.closeTimeoutMs ?? 2_000
    this.child = spawn(options.command, [...(options.args ?? [])], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', chunk => {
      options.stderr?.(String(chunk))
    })
    this.child.once('error', error => {
      this.rejectAll(error)
    })
    this.child.once('exit', (code, signal) => {
      this.closed = true
      this.rejectAll(
        new Error(
          `Kernel runtime stdio transport exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`,
        ),
      )
    })
    void this.consumeStdout()
  }

  async send(
    command: KernelRuntimeCommand,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (this.closed || !this.child.stdin.writable) {
      throw new Error('Kernel runtime stdio transport is closed')
    }
    if (this.pending.has(command.requestId)) {
      throw new Error(`Duplicate pending requestId ${command.requestId}`)
    }

    const promise = new Promise<KernelRuntimeEnvelopeBase>(
      (resolve, reject) => {
        this.pending.set(command.requestId, {
          command,
          resolve,
          reject,
        })
      },
    )

    this.child.stdin.write(`${JSON.stringify(command)}\n`, error => {
      if (!error) {
        return
      }
      const pending = this.pending.get(command.requestId)
      this.pending.delete(command.requestId)
      pending?.reject(error)
    })

    return promise
  }

  subscribe(handler: KernelRuntimeEventSink): () => void {
    this.listeners.add(handler)
    return () => {
      this.listeners.delete(handler)
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    this.child.stdin.end()
    const timeout = setTimeout(() => {
      this.child.kill('SIGTERM')
    }, this.closeTimeoutMs)
    try {
      if (this.child.exitCode === null && !this.child.killed) {
        await once(this.child, 'exit')
      }
    } finally {
      clearTimeout(timeout)
      this.rejectAll(new Error('Kernel runtime stdio transport closed'))
      this.listeners.clear()
    }
  }

  private async consumeStdout(): Promise<void> {
    const lines = createInterface({
      input: this.child.stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    })
    try {
      for await (const line of lines) {
        if (line.trim().length === 0) {
          continue
        }
        this.handleEnvelope(JSON.parse(line) as KernelRuntimeEnvelopeBase)
      }
    } catch (error) {
      this.rejectAll(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private handleEnvelope(envelope: KernelRuntimeEnvelopeBase): void {
    if (shouldDeliverEvent(this.liveSubscriptions, envelope)) {
      queueMicrotask(() => {
        if (!this.closed) {
          notifyListeners(this.listeners, envelope)
        }
      })
    }

    if (!envelope.requestId || !isControlEnvelope(envelope)) {
      return
    }

    const pending = this.pending.get(envelope.requestId)
    if (!pending) {
      return
    }
    this.pending.delete(envelope.requestId)
    if (
      pending.command.type === 'subscribe_events' &&
      envelope.kind === 'ack'
    ) {
      recordLiveSubscription(this.liveSubscriptions, pending.command)
    }
    pending.resolve(envelope)
  }

  private rejectAll(error: Error): void {
    for (const [, pending] of this.pending) {
      pending.reject(error)
    }
    this.pending.clear()
  }
}

function normalizeCommand<TCommand extends KernelRuntimeCommand>(
  command: KernelRuntimeWireClientCommand<TCommand>,
  createRequestId: (type: KernelRuntimeCommand['type']) => string,
): TCommand {
  const type = command.type as KernelRuntimeCommand['type']
  return {
    ...command,
    schemaVersion:
      command.schemaVersion ?? KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    requestId: command.requestId ?? createRequestId(type),
  } as TCommand
}

function isControlEnvelope(envelope: KernelRuntimeEnvelopeBase): boolean {
  return (
    envelope.kind === 'ack' ||
    envelope.kind === 'pong' ||
    envelope.kind === 'error'
  )
}

function notifyListeners(
  listeners: Set<KernelRuntimeEventSink>,
  envelope: KernelRuntimeEnvelopeBase,
): void {
  for (const listener of listeners) {
    try {
      listener(envelope)
    } catch {
      // Host observers must not change transport request semantics.
    }
  }
}

function recordLiveSubscription(
  subscriptions: EventSubscriptionScope[],
  command: KernelRuntimeSubscribeEventsCommand,
): void {
  const scope: EventSubscriptionScope = {
    conversationId: command.conversationId,
    turnId: command.turnId,
  }
  if (
    subscriptions.some(
      subscription =>
        subscription.conversationId === scope.conversationId &&
        subscription.turnId === scope.turnId,
    )
  ) {
    return
  }
  subscriptions.push(scope)
}

function shouldDeliverEvent(
  subscriptions: readonly EventSubscriptionScope[],
  envelope: KernelRuntimeEnvelopeBase,
): boolean {
  if (envelope.kind !== 'event') {
    return false
  }
  if (!envelope.conversationId && !envelope.turnId) {
    return true
  }
  if (subscriptions.length === 0) {
    return true
  }
  return subscriptions.some(subscription =>
    matchesSubscription(subscription, envelope),
  )
}

function matchesSubscription(
  subscription: EventSubscriptionScope,
  envelope: KernelRuntimeEnvelopeBase,
): boolean {
  if (
    subscription.conversationId &&
    envelope.conversationId !== subscription.conversationId
  ) {
    return false
  }
  if (subscription.turnId && envelope.turnId !== subscription.turnId) {
    return false
  }
  return true
}
