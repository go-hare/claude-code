import { dirname } from 'path'

import type {
  KernelCapabilityDescriptor,
  KernelCapabilityName,
  KernelRuntimeCapabilityIntent,
  KernelRuntimeCapabilityReloadRequest,
} from '../../contracts/capability.js'
import type {
  RuntimeAgentDescriptor,
  RuntimeAgentRegistrySnapshot,
  RuntimeAgentRunCancelRequest,
  RuntimeAgentRunCancelResult,
  RuntimeAgentRunDescriptor,
  RuntimeAgentRunListSnapshot,
  RuntimeAgentRunOutput,
  RuntimeAgentRunOutputRequest,
  RuntimeAgentSpawnRequest,
  RuntimeAgentSpawnResult,
} from '../../contracts/agent.js'
import type {
  RuntimeCommandExecuteRequest,
  RuntimeCommandExecutionResult,
  RuntimeCommandGraphEntry,
} from '../../contracts/command.js'
import type {
  KernelConversationId,
  KernelConversationSnapshot,
} from '../../contracts/conversation.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../contracts/events.js'
import type {
  RuntimeHookDescriptor,
  RuntimeHookMutationResult,
  RuntimeHookRegistrySnapshot,
  RuntimeHookRegisterRequest,
  RuntimeHookRunRequest,
  RuntimeHookRunResult,
} from '../../contracts/hook.js'
import type {
  RuntimeMcpAuthRequest,
  RuntimeMcpConnectRequest,
  RuntimeMcpLifecycleResult,
  RuntimeMcpRegistrySnapshot,
  RuntimeMcpResourceRef,
  RuntimeMcpServerRef,
  RuntimeMcpSetEnabledRequest,
  RuntimeMcpToolBinding,
} from '../../contracts/mcp.js'
import type {
  KernelRuntimeHostIdentity,
  KernelRuntimeId,
} from '../../contracts/runtime.js'
import type {
  RuntimePluginCatalogSnapshot,
  RuntimePluginDescriptor,
  RuntimePluginErrorDescriptor,
  RuntimePluginInstallRequest,
  RuntimePluginMutationResult,
  RuntimePluginSetEnabledRequest,
  RuntimePluginUninstallRequest,
  RuntimePluginUpdateRequest,
} from '../../contracts/plugin.js'
import type { RuntimeProviderSelection } from '../../contracts/provider.js'
import type {
  KernelPermissionDecision,
  KernelPermissionRequest,
  KernelPermissionRequestId,
} from '../../contracts/permissions.js'
import type {
  RuntimeSkillCatalogSnapshot,
  RuntimeSkillDescriptor,
  RuntimeSkillPromptContextRequest,
  RuntimeSkillPromptContextResult,
} from '../../contracts/skill.js'
import type {
  RuntimeTaskAssignRequest,
  RuntimeTaskCreateRequest,
  RuntimeTaskDescriptor,
  RuntimeTaskListSnapshot,
  RuntimeTaskMutationResult,
  RuntimeTaskUpdateRequest,
} from '../../contracts/task.js'
import type {
  RuntimeTeamCreateRequest,
  RuntimeTeamCreateResult,
  RuntimeTeamDescriptor,
  RuntimeTeamDestroyRequest,
  RuntimeTeamDestroyResult,
  RuntimeTeamListSnapshot,
  RuntimeTeamMessageRequest,
  RuntimeTeamMessageResult,
} from '../../contracts/team.js'
import type {
  KernelTurnId,
  KernelTurnRunRequest,
  KernelTurnSnapshot,
} from '../../contracts/turn.js'
import type {
  KernelRuntimeCompanionAction,
  KernelRuntimeCompanionReactionRequest,
  KernelRuntimeCompanionState,
  KernelRuntimeContextSnapshot,
  KernelRuntimeKairosExternalEvent,
  KernelRuntimeKairosStatus,
  KernelRuntimeKairosTickRequest,
  KernelRuntimeMemoryDescriptor,
  KernelRuntimeMemoryDocument,
  KernelRuntimeMemoryUpdateRequest,
  KernelRuntimeSessionDescriptor,
  KernelRuntimeSessionListFilter,
  KernelRuntimeSessionTranscript,
  KernelRuntimeCommand,
  KernelRuntimeConnectHostCommand,
  KernelRuntimeCreateConversationCommand,
  KernelRuntimeDisconnectHostCommand,
  KernelRuntimeHostDisconnectPolicy,
  KernelRuntimeRunTurnCommand,
  KernelRuntimeSubscribeEventsCommand,
} from '../../contracts/wire.js'
import type {
  RuntimeToolCallRequest,
  RuntimeToolCallResult,
  RuntimeToolDescriptor,
} from '../../contracts/tool.js'
import { RuntimeConversationBusyError } from '../conversation/RuntimeConversation.js'
import {
  RuntimeEventBus,
  RuntimeEventReplayError,
} from '../events/RuntimeEventBus.js'
import { applyResumeSessionAtToTranscript } from '../session/sessionContinuation.js'
import {
  KernelRuntimeWireCommandParseError,
  parseKernelRuntimeCommandLine,
  parseKernelRuntimeCommand,
} from './KernelRuntimeWireCodec.js'

export type KernelRuntimeWireConversationOptions = {
  runtimeId: KernelRuntimeId
  conversationId: KernelConversationId
  workspacePath: string
  sessionId?: string
  capabilityIntent?: KernelRuntimeCapabilityIntent
  provider?: RuntimeProviderSelection
  metadata?: Record<string, unknown>
  initialSnapshot?: KernelConversationSnapshot
  initialActiveTurnSnapshot?: KernelTurnSnapshot
  eventBus: RuntimeEventBus
}

export type KernelRuntimeWireConversation = {
  readonly id: KernelConversationId
  readonly activeTurnId: KernelTurnId | undefined
  snapshot(): KernelConversationSnapshot
  runTurn(
    request: Omit<KernelTurnRunRequest, 'conversationId'>,
  ): KernelTurnSnapshot
  completeTurn(
    turnId: KernelTurnId,
    stopReason?: string | null,
  ): KernelTurnSnapshot
  failTurn(turnId: KernelTurnId, error: unknown): KernelTurnSnapshot
  abortTurn(turnId: KernelTurnId, reason?: string): KernelTurnSnapshot
  dispose(reason?: string): Promise<void>
}

export type KernelRuntimeWireTurnExecutionEvent =
  | {
      type: 'output'
      payload: unknown
      replayable?: boolean
      metadata?: Record<string, unknown>
    }
  | {
      type: 'event'
      event: Omit<KernelEvent, 'runtimeId' | 'conversationId' | 'turnId'> &
        Partial<Pick<KernelEvent, 'runtimeId' | 'conversationId' | 'turnId'>>
    }
  | {
      type: 'completed'
      stopReason?: string | null
      metadata?: Record<string, unknown>
    }
  | {
      type: 'failed'
      error: unknown
      metadata?: Record<string, unknown>
    }

export type KernelRuntimeWireTurnExecutionResult =
  | void
  | Promise<void>
  | AsyncIterable<KernelRuntimeWireTurnExecutionEvent>

export type KernelRuntimeWireTurnExecutionContext = {
  command: Extract<KernelRuntimeCommand, { type: 'run_turn' }>
  conversation: KernelRuntimeWireConversation
  eventBus: RuntimeEventBus
  permissionBroker?: KernelRuntimeWirePermissionBroker
  providerSelection?: RuntimeProviderSelection
  signal: AbortSignal
}

export type KernelRuntimeWireTurnExecutor = (
  context: KernelRuntimeWireTurnExecutionContext,
) => KernelRuntimeWireTurnExecutionResult

type Awaitable<T> = T | Promise<T>

export type KernelRuntimeWireRequestContext = {
  cwd?: string
  resumeInterruptedTurn?: boolean
  resumeSessionAt?: string
  metadata?: Record<string, unknown>
}

export type KernelRuntimeWireCommandCatalog = {
  listCommands(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeCommandGraphEntry[]>
  executeCommand?(
    request: RuntimeCommandExecuteRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeCommandExecutionResult>
}

export type KernelRuntimeWireToolCatalog = {
  listTools(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeToolDescriptor[]>
  callTool?(
    request: RuntimeToolCallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeToolCallResult>
}

export type KernelRuntimeWireMcpRegistry = {
  listServers(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeMcpServerRef[]>
  listResources(
    serverName?: string,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<readonly RuntimeMcpResourceRef[]>
  listToolBindings(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeMcpToolBinding[]>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<void | Partial<RuntimeMcpRegistrySnapshot>>
  connectServer?(
    request: RuntimeMcpConnectRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeMcpLifecycleResult>
  authenticateServer?(
    request: RuntimeMcpAuthRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeMcpLifecycleResult>
  setServerEnabled?(
    request: RuntimeMcpSetEnabledRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeMcpLifecycleResult>
}

export type KernelRuntimeWireHookCatalog = {
  listHooks(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeHookDescriptor[]>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<void | Partial<RuntimeHookRegistrySnapshot>>
  runHook?(
    request: RuntimeHookRunRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeHookRunResult>
  registerHook?(
    request: RuntimeHookRegisterRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeHookMutationResult>
}

export type KernelRuntimeWireSkillCatalog = {
  listSkills(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeSkillDescriptor[]>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<void | Partial<RuntimeSkillCatalogSnapshot>>
  resolvePromptContext?(
    request: RuntimeSkillPromptContextRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeSkillPromptContextResult>
}

export type KernelRuntimeWirePluginCatalog = {
  listPlugins(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<{
    plugins: readonly RuntimePluginDescriptor[]
    errors?: readonly RuntimePluginErrorDescriptor[]
  }>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<void | Partial<RuntimePluginCatalogSnapshot>>
  setPluginEnabled?(
    request: RuntimePluginSetEnabledRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimePluginMutationResult>
  installPlugin?(
    request: RuntimePluginInstallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimePluginMutationResult>
  uninstallPlugin?(
    request: RuntimePluginUninstallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimePluginMutationResult>
  updatePlugin?(
    request: RuntimePluginUpdateRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimePluginMutationResult>
}

export type KernelRuntimeWireAgentRegistry = {
  listAgents(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<RuntimeAgentRegistrySnapshot>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<void | Partial<RuntimeAgentRegistrySnapshot>>
  spawnAgent?(
    request: RuntimeAgentSpawnRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeAgentSpawnResult>
  listAgentRuns?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<RuntimeAgentRunListSnapshot>
  getAgentRun?(
    runId: string,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeAgentRunDescriptor | null>
  getAgentOutput?(
    request: RuntimeAgentRunOutputRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeAgentRunOutput>
  cancelAgentRun?(
    request: RuntimeAgentRunCancelRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeAgentRunCancelResult>
}

export type KernelRuntimeWireTaskRegistry = {
  listTasks(
    taskListId?: string,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeTaskListSnapshot>
  getTask(
    taskId: string,
    taskListId?: string,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeTaskDescriptor | null>
  createTask?(
    request: RuntimeTaskCreateRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeTaskMutationResult>
  updateTask?(
    request: RuntimeTaskUpdateRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeTaskMutationResult>
  assignTask?(
    request: RuntimeTaskAssignRequest,
    context?: {
      cwd?: string
      metadata?: Record<string, unknown>
    },
  ): Awaitable<RuntimeTaskMutationResult>
}

export type KernelRuntimeWireTeamRegistry = {
  listTeams(context?: KernelRuntimeWireRequestContext): Awaitable<RuntimeTeamListSnapshot>
  getTeam(
    teamName: string,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<RuntimeTeamDescriptor | null>
  createTeam?(
    request: RuntimeTeamCreateRequest,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<RuntimeTeamCreateResult>
  sendMessage?(
    request: RuntimeTeamMessageRequest,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<RuntimeTeamMessageResult>
  destroyTeam?(
    request: RuntimeTeamDestroyRequest,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<RuntimeTeamDestroyResult>
}

export type KernelRuntimeWireCompanionRuntime = {
  getState(
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<KernelRuntimeCompanionState | null>
  dispatch(
    action: KernelRuntimeCompanionAction,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<KernelRuntimeCompanionState | null>
  reactToTurn(
    request: KernelRuntimeCompanionReactionRequest,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<void>
  onEvent?(handler: (event: unknown) => void): (() => void) | void
}

export type KernelRuntimeWireKairosRuntime = {
  getStatus(
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<KernelRuntimeKairosStatus>
  enqueueEvent(
    event: KernelRuntimeKairosExternalEvent,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<void>
  tick(
    request?: KernelRuntimeKairosTickRequest,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<void>
  suspend(
    reason?: string,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<void>
  resume(
    reason?: string,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<void>
  onEvent?(handler: (event: unknown) => void): (() => void) | void
}

export type KernelRuntimeWireMemoryManager = {
  listMemory(
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<readonly KernelRuntimeMemoryDescriptor[]>
  readMemory(
    id: string,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<KernelRuntimeMemoryDocument>
  updateMemory(
    request: KernelRuntimeMemoryUpdateRequest,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<KernelRuntimeMemoryDocument>
}

export type KernelRuntimeWireContextManager = {
  readContext(
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<KernelRuntimeContextSnapshot>
  getGitStatus(
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<string | null>
  getSystemPromptInjection(
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<string | null>
  setSystemPromptInjection(
    value: string | null,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<string | null>
}

export type KernelRuntimeWireSessionManager = {
  listSessions(
    filter?: KernelRuntimeSessionListFilter,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<readonly KernelRuntimeSessionDescriptor[]>
  resumeSession(
    sessionId: string,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<KernelRuntimeSessionTranscript>
  getSessionTranscript(
    sessionId: string,
    context?: KernelRuntimeWireRequestContext,
  ): Awaitable<KernelRuntimeSessionTranscript>
}

export type KernelRuntimeWireRouterOptions = {
  runtimeId: KernelRuntimeId
  workspacePath: string
  eventBus?: RuntimeEventBus
  conversationSnapshotStore?: KernelRuntimeWireConversationSnapshotStore
  capabilityResolver?: KernelRuntimeWireCapabilityResolver
  commandCatalog?: KernelRuntimeWireCommandCatalog
  toolCatalog?: KernelRuntimeWireToolCatalog
  mcpRegistry?: KernelRuntimeWireMcpRegistry
  hookCatalog?: KernelRuntimeWireHookCatalog
  skillCatalog?: KernelRuntimeWireSkillCatalog
  pluginCatalog?: KernelRuntimeWirePluginCatalog
  agentRegistry?: KernelRuntimeWireAgentRegistry
  taskRegistry?: KernelRuntimeWireTaskRegistry
  teamRegistry?: KernelRuntimeWireTeamRegistry
  companionRuntime?: KernelRuntimeWireCompanionRuntime
  kairosRuntime?: KernelRuntimeWireKairosRuntime
  memoryManager?: KernelRuntimeWireMemoryManager
  contextManager?: KernelRuntimeWireContextManager
  sessionManager?: KernelRuntimeWireSessionManager
  permissionBroker?: KernelRuntimeWirePermissionBroker
  runTurnExecutor?: KernelRuntimeWireTurnExecutor
  createConversation(
    options: KernelRuntimeWireConversationOptions,
    command: KernelRuntimeCreateConversationCommand,
  ): KernelRuntimeWireConversation
}

type KernelRuntimeWireHostState = 'connected' | 'disconnected'

type KernelRuntimeWireHostRecord = {
  identity: KernelRuntimeHostIdentity
  state: KernelRuntimeWireHostState
  connectCount: number
  disconnectReason?: string
  disconnectPolicy?: KernelRuntimeHostDisconnectPolicy
}

export type KernelRuntimeWireConversationRecoverySnapshot = {
  conversation: KernelConversationSnapshot
  activeTurn?: KernelTurnSnapshot
  activeExecution?: KernelRuntimeRunTurnCommand
}

export type KernelRuntimeWireConversationSnapshotStore = {
  readLatest(
    conversationId: KernelConversationId,
  ): Awaitable<KernelRuntimeWireConversationRecoverySnapshot | undefined>
  append(
    snapshot: KernelRuntimeWireConversationRecoverySnapshot,
  ): Awaitable<void>
}

export type KernelRuntimeWireCapabilityResolver = {
  listDescriptors(): readonly KernelCapabilityDescriptor[]
  requireCapability?(
    name: KernelCapabilityName,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<unknown>
  reloadCapabilities(
    scope: KernelRuntimeCapabilityReloadRequest['scope'],
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<readonly KernelCapabilityDescriptor[]>
}

export type KernelRuntimeWirePermissionBroker = {
  requestPermission(
    request: KernelPermissionRequest,
  ): Promise<KernelPermissionDecision>
  decide(decision: KernelPermissionDecision): KernelPermissionDecision
  snapshot?(): {
    pendingRequestIds: KernelPermissionRequestId[]
    finalizedRequestIds: KernelPermissionRequestId[]
  }
}

export class KernelRuntimeWireRouter {
  readonly eventBus: RuntimeEventBus
  private runtimeWorkspacePath: string
  private readonly conversations = new Map<
    KernelConversationId,
    KernelRuntimeWireConversation
  >()
  private readonly activeExecutions = new Map<
    string,
    {
      controller: AbortController
      command: KernelRuntimeRunTurnCommand
    }
  >()
  private readonly hosts = new Map<string, KernelRuntimeWireHostRecord>()
  private defaultProviderSelection: RuntimeProviderSelection | undefined

  constructor(private readonly options: KernelRuntimeWireRouterOptions) {
    this.runtimeWorkspacePath = options.workspacePath
    this.eventBus =
      options.eventBus ??
      new RuntimeEventBus({
        runtimeId: options.runtimeId,
      })
    options.companionRuntime?.onEvent?.(event => {
      this.emitRuntimeDomainEvent('companion.event', event)
    })
    options.kairosRuntime?.onEvent?.(event => {
      this.emitRuntimeDomainEvent('kairos.event', event)
    })
  }

  async handleCommand(
    command: KernelRuntimeCommand,
  ): Promise<KernelRuntimeEnvelopeBase[]> {
    try {
      switch (command.type) {
        case 'ping':
          return [this.eventBus.pong({ requestId: command.requestId })]
        case 'init_runtime':
          return this.handleInit(command)
        case 'connect_host':
          return this.handleConnectHost(command)
        case 'disconnect_host':
          return [await this.handleDisconnectHost(command)]
        case 'create_conversation':
          return [await this.handleCreateConversation(command)]
        case 'run_turn':
          return [await this.handleRunTurn(command)]
        case 'abort_turn':
          return [await this.handleAbortTurn(command)]
        case 'decide_permission':
          return [this.handleDecidePermission(command)]
        case 'dispose_conversation':
          return [await this.handleDisposeConversation(command)]
        case 'subscribe_events':
          return this.handleSubscribeEvents(command)
        case 'reload_capabilities':
          return [await this.handleReloadCapabilities(command)]
        case 'list_commands':
          return [await this.handleListCommands(command)]
        case 'execute_command':
          return [await this.handleExecuteCommand(command)]
        case 'list_tools':
          return [await this.handleListTools(command)]
        case 'call_tool':
          return [await this.handleCallTool(command)]
        case 'list_mcp_servers':
          return [await this.handleListMcpServers(command)]
        case 'list_mcp_tools':
          return [await this.handleListMcpTools(command)]
        case 'list_mcp_resources':
          return [await this.handleListMcpResources(command)]
        case 'reload_mcp':
          return [await this.handleReloadMcp(command)]
        case 'connect_mcp':
          return [await this.handleConnectMcp(command)]
        case 'authenticate_mcp':
          return [await this.handleAuthenticateMcp(command)]
        case 'set_mcp_enabled':
          return [await this.handleSetMcpEnabled(command)]
        case 'list_hooks':
          return [await this.handleListHooks(command)]
        case 'reload_hooks':
          return [await this.handleReloadHooks(command)]
        case 'run_hook':
          return [await this.handleRunHook(command)]
        case 'register_hook':
          return [await this.handleRegisterHook(command)]
        case 'list_skills':
          return [await this.handleListSkills(command)]
        case 'reload_skills':
          return [await this.handleReloadSkills(command)]
        case 'resolve_skill_context':
          return [await this.handleResolveSkillContext(command)]
        case 'list_plugins':
          return [await this.handleListPlugins(command)]
        case 'reload_plugins':
          return [await this.handleReloadPlugins(command)]
        case 'set_plugin_enabled':
          return [await this.handleSetPluginEnabled(command)]
        case 'install_plugin':
          return [await this.handleInstallPlugin(command)]
        case 'uninstall_plugin':
          return [await this.handleUninstallPlugin(command)]
        case 'update_plugin':
          return [await this.handleUpdatePlugin(command)]
        case 'list_agents':
          return [await this.handleListAgents(command)]
        case 'reload_agents':
          return [await this.handleReloadAgents(command)]
        case 'spawn_agent':
          return [await this.handleSpawnAgent(command)]
        case 'list_agent_runs':
          return [await this.handleListAgentRuns(command)]
        case 'get_agent_run':
          return [await this.handleGetAgentRun(command)]
        case 'get_agent_output':
          return [await this.handleGetAgentOutput(command)]
        case 'cancel_agent_run':
          return [await this.handleCancelAgentRun(command)]
        case 'list_tasks':
          return [await this.handleListTasks(command)]
        case 'get_task':
          return [await this.handleGetTask(command)]
        case 'create_task':
          return [await this.handleCreateTask(command)]
        case 'update_task':
          return [await this.handleUpdateTask(command)]
        case 'assign_task':
          return [await this.handleAssignTask(command)]
        case 'list_teams':
          return [await this.handleListTeams(command)]
        case 'get_team':
          return [await this.handleGetTeam(command)]
        case 'create_team':
          return [await this.handleCreateTeam(command)]
        case 'send_team_message':
          return [await this.handleSendTeamMessage(command)]
        case 'destroy_team':
          return [await this.handleDestroyTeam(command)]
        case 'get_companion_state':
          return [await this.handleGetCompanionState(command)]
        case 'dispatch_companion_action':
          return [await this.handleDispatchCompanionAction(command)]
        case 'react_companion':
          return [await this.handleReactCompanion(command)]
        case 'get_kairos_status':
          return [await this.handleGetKairosStatus(command)]
        case 'enqueue_kairos_event':
          return [await this.handleEnqueueKairosEvent(command)]
        case 'tick_kairos':
          return [await this.handleTickKairos(command)]
        case 'suspend_kairos':
          return [await this.handleSuspendKairos(command)]
        case 'resume_kairos':
          return [await this.handleResumeKairos(command)]
        case 'list_memory':
          return [await this.handleListMemory(command)]
        case 'read_memory':
          return [await this.handleReadMemory(command)]
        case 'update_memory':
          return [await this.handleUpdateMemory(command)]
        case 'read_context':
          return [await this.handleReadContext(command)]
        case 'get_context_git_status':
          return [await this.handleGetContextGitStatus(command)]
        case 'get_system_prompt_injection':
          return [await this.handleGetSystemPromptInjection(command)]
        case 'set_system_prompt_injection':
          return [await this.handleSetSystemPromptInjection(command)]
        case 'list_sessions':
          return [await this.handleListSessionsCatalog(command)]
        case 'resume_session':
          return [await this.handleResumeSession(command)]
        case 'get_session_transcript':
          return [await this.handleGetSessionTranscript(command)]
        case 'publish_host_event':
          return [this.handlePublishHostEvent(command)]
      }
    } catch (error) {
      return [this.mapError(command, error)]
    }
  }

  async handleMessage(message: unknown): Promise<KernelRuntimeEnvelopeBase[]> {
    try {
      return await this.handleCommand(parseKernelRuntimeCommand(message))
    } catch (error) {
      if (error instanceof KernelRuntimeWireCommandParseError) {
        return [
          this.eventBus.error({
            requestId: error.requestId,
            code: 'schema_mismatch',
            message: error.message,
            retryable: false,
            details: error.details,
          }),
        ]
      }
      return [
        this.eventBus.error({
          code: 'internal_error',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        }),
      ]
    }
  }

  async handleCommandLine(line: string): Promise<KernelRuntimeEnvelopeBase[]> {
    try {
      return await this.handleCommand(parseKernelRuntimeCommandLine(line))
    } catch (error) {
      if (error instanceof KernelRuntimeWireCommandParseError) {
        return [
          this.eventBus.error({
            requestId: error.requestId,
            code: 'schema_mismatch',
            message: error.message,
            retryable: false,
            details: error.details,
          }),
        ]
      }
      return [
        this.eventBus.error({
          code: 'internal_error',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        }),
      ]
    }
  }

  private handleInit(
    command: Extract<KernelRuntimeCommand, { type: 'init_runtime' }>,
  ): KernelRuntimeEnvelopeBase[] {
    this.runtimeWorkspacePath = command.workspacePath ?? this.runtimeWorkspacePath
    this.defaultProviderSelection =
      command.defaultProvider ?? command.provider ?? this.defaultProviderSelection
    const ack = this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        runtimeId: this.options.runtimeId,
        state: 'ready',
        workspacePath: this.runtimeWorkspacePath,
      },
    })
    this.eventBus.emit({
      type: 'runtime.ready',
      replayable: true,
      payload: {
        runtimeId: this.options.runtimeId,
        workspacePath: this.runtimeWorkspacePath,
      },
    })
    return [ack]
  }

  private handleConnectHost(
    command: KernelRuntimeConnectHostCommand,
  ): KernelRuntimeEnvelopeBase[] {
    const replay = this.replayRuntimeScopedEvents(command.sinceEventId)
    const previous = this.hosts.get(command.host.id)
    const record: KernelRuntimeWireHostRecord = {
      identity: command.host,
      state: 'connected',
      connectCount: (previous?.connectCount ?? 0) + 1,
    }
    this.hosts.set(command.host.id, record)
    this.eventBus.emit({
      type: previous ? 'host.reconnected' : 'host.connected',
      replayable: true,
      payload: sanitizeWirePayload({
        host: command.host,
        previousState: previous?.state,
        replayedEvents: replay.length,
        sinceEventId: command.sinceEventId,
      }),
      metadata: command.metadata,
    })
    const ack = this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({
        connected: true,
        hostId: command.host.id,
        state: record.state,
        previousState: previous?.state,
        replayedEvents: replay.length,
      }),
    })
    return [ack, ...replay]
  }

  private async handleDisconnectHost(
    command: KernelRuntimeDisconnectHostCommand,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const host = this.requireHost(command.hostId, command.requestId)
    const policy = command.policy ?? 'detach'
    const abortedTurnIds =
      policy === 'abort_active_turns'
        ? await this.abortActiveTurnsForHostDisconnect(command)
        : []
    const record: KernelRuntimeWireHostRecord = {
      ...host,
      state: 'disconnected',
      disconnectReason: command.reason,
      disconnectPolicy: policy,
    }
    this.hosts.set(command.hostId, record)
    this.eventBus.emit({
      type: 'host.disconnected',
      replayable: true,
      payload: sanitizeWirePayload({
        hostId: command.hostId,
        policy,
        reason: command.reason,
        abortedTurnIds,
      }),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({
        disconnected: true,
        hostId: command.hostId,
        policy,
        reason: command.reason,
        abortedTurnIds,
      }),
    })
  }

  private async handleCreateConversation(
    command: KernelRuntimeCreateConversationCommand,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const existing = this.conversations.get(command.conversationId)
    if (existing) {
      this.assertExistingConversationMatches(existing, command)
      return this.eventBus.ack({
        requestId: command.requestId,
        conversationId: existing.id,
        payload: sanitizeWirePayload(existing.snapshot()),
      })
    }
    await this.requireCapabilityIntent(command)
    const recoveredSnapshot = await this.readRecoveredConversation(command)
    const sessionId =
      command.sessionId ?? recoveredSnapshot?.conversation.sessionId
    const provider = this.resolveConversationProvider(command, recoveredSnapshot)

    const conversation = this.options.createConversation(
      {
        runtimeId: this.options.runtimeId,
        conversationId: command.conversationId,
        workspacePath: command.workspacePath,
        sessionId,
        capabilityIntent:
          command.capabilityIntent ??
          recoveredSnapshot?.conversation.capabilityIntent,
        provider,
        metadata: command.metadata ?? recoveredSnapshot?.conversation.metadata,
        initialSnapshot: recoveredSnapshot?.conversation,
        initialActiveTurnSnapshot: recoveredSnapshot?.activeTurn,
        eventBus: this.eventBus,
      },
      command,
    )
    this.conversations.set(conversation.id, conversation)
    await this.recordConversationSnapshot(
      conversation,
      recoveredSnapshot?.activeTurn,
      recoveredSnapshot?.activeExecution,
    )
    const ack = this.eventBus.ack({
      requestId: command.requestId,
      conversationId: conversation.id,
      payload: sanitizeWirePayload(conversation.snapshot()),
    })
    if (recoveredSnapshot?.activeExecution && recoveredSnapshot.activeTurn) {
      queueMicrotask(() => {
        this.startTurnExecution(
          recoveredSnapshot.activeExecution!,
          conversation,
          recoveredSnapshot.activeTurn!,
        )
      })
    }
    return ack
  }

  private async handleRunTurn(
    command: Extract<KernelRuntimeCommand, { type: 'run_turn' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const conversation = this.requireConversation(
      command.conversationId,
      command.requestId,
    )
    const snapshot = conversation.runTurn({
      turnId: command.turnId,
      prompt: command.prompt,
      attachments: command.attachments,
      executionMode: command.executionMode,
      contextAssembly: command.contextAssembly,
      capabilityPlane: command.capabilityPlane,
      metadata: command.metadata,
    })
    await this.recordConversationSnapshot(conversation, snapshot, command)
    const ack = this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      turnId: command.turnId,
      payload: sanitizeWirePayload(snapshot),
    })
    queueMicrotask(() => {
      this.startTurnExecution(command, conversation, snapshot)
    })
    return ack
  }

  private async handleAbortTurn(
    command: Extract<KernelRuntimeCommand, { type: 'abort_turn' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const conversation = this.requireConversation(
      command.conversationId,
      command.requestId,
    )
    const snapshot = conversation.abortTurn(command.turnId, command.reason)
    const activeExecution = this.activeExecutions.get(
      this.turnExecutionKey(command.conversationId, command.turnId),
    )
    await this.recordConversationSnapshot(
      conversation,
      snapshot,
      activeExecution?.command,
    )
    activeExecution?.controller.abort(command.reason ?? 'aborted')
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      turnId: command.turnId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private handleDecidePermission(
    command: Extract<KernelRuntimeCommand, { type: 'decide_permission' }>,
  ): KernelRuntimeEnvelopeBase {
    if (!this.options.permissionBroker) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Permission broker is not available',
        retryable: false,
      })
    }

    const decision = this.options.permissionBroker.decide(command)
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(decision),
    })
  }

  private async handleDisposeConversation(
    command: Extract<KernelRuntimeCommand, { type: 'dispose_conversation' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const conversation = this.requireConversation(
      command.conversationId,
      command.requestId,
    )
    const activeTurnId = conversation.activeTurnId
    await conversation.dispose(command.reason)
    await this.recordConversationSnapshot(conversation)
    this.conversations.delete(command.conversationId)
    if (activeTurnId) {
      const key = this.turnExecutionKey(command.conversationId, activeTurnId)
      const activeExecution = this.activeExecutions.get(key)
      activeExecution?.controller.abort(
        command.reason ?? 'conversation_disposed',
      )
      this.activeExecutions.delete(key)
    }
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      payload: { disposed: true },
    })
  }

  private handleSubscribeEvents(
    command: KernelRuntimeSubscribeEventsCommand,
  ): KernelRuntimeEnvelopeBase[] {
    const events = this.eventBus.replay({
      conversationId: command.conversationId,
      turnId: command.turnId,
      sinceEventId: command.sinceEventId,
    })
    const ack = this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      turnId: command.turnId,
      payload: { subscribed: true },
    })
    return [ack, ...events]
  }

  private replayRuntimeScopedEvents(
    sinceEventId: string | undefined,
  ): KernelRuntimeEnvelopeBase[] {
    if (!sinceEventId) {
      return []
    }
    return this.eventBus
      .replay({ sinceEventId })
      .filter(envelope => !envelope.conversationId && !envelope.turnId)
  }

  private async requireCapabilityIntent(
    command: KernelRuntimeCreateConversationCommand,
  ): Promise<void> {
    const capabilityNames = getCapabilityIntentNames(command.capabilityIntent)
    if (capabilityNames.length === 0) {
      return
    }
    const resolver = this.options.capabilityResolver
    if (!resolver?.requireCapability) {
      throw new KernelRuntimeWireCapabilityUnavailableError(
        command.requestId,
        capabilityNames,
      )
    }

    await Promise.all(
      capabilityNames.map(name =>
        resolver.requireCapability!(name, {
          cwd: command.workspacePath,
          metadata: sanitizeWirePayload({
            conversationId: command.conversationId,
            sessionId: command.sessionId,
            provider: command.provider,
            capabilityIntent: command.capabilityIntent,
            commandMetadata: command.metadata,
          }),
        }),
      ),
    )
    this.eventBus.emit({
      conversationId: command.conversationId,
      type: 'capabilities.required',
      replayable: true,
      payload: sanitizeWirePayload({
        capabilities: capabilityNames,
        descriptors: resolver.listDescriptors(),
      }),
      metadata: command.metadata,
    })
  }

  private assertExistingConversationMatches(
    conversation: KernelRuntimeWireConversation,
    command: KernelRuntimeCreateConversationCommand,
  ): void {
    const snapshot = conversation.snapshot()
    if (snapshot.workspacePath !== command.workspacePath) {
      throw new KernelRuntimeWireConversationConflictError(
        command.requestId,
        command.conversationId,
        'workspacePath',
        {
          existingWorkspacePath: snapshot.workspacePath,
          requestedWorkspacePath: command.workspacePath,
        },
      )
    }
    if (
      command.sessionId !== undefined &&
      snapshot.sessionId !== undefined &&
      command.sessionId !== snapshot.sessionId
    ) {
      throw new KernelRuntimeWireConversationConflictError(
        command.requestId,
        command.conversationId,
        'sessionId',
        {
          existingSessionId: snapshot.sessionId,
          requestedSessionId: command.sessionId,
        },
      )
    }
    const requestedProvider = this.resolveExplicitConversationProvider(command)
    if (
      requestedProvider !== undefined &&
      !providerSelectionsEqual(requestedProvider, snapshot.provider)
    ) {
      throw new KernelRuntimeWireConversationConflictError(
        command.requestId,
        command.conversationId,
        'provider',
        {
          existingProvider: sanitizeWirePayload(snapshot.provider),
          requestedProvider: sanitizeWirePayload(requestedProvider),
        },
      )
    }
  }

  private resolveExplicitConversationProvider(
    command: KernelRuntimeCreateConversationCommand,
  ): RuntimeProviderSelection | undefined {
    return command.provider ?? command.capabilityIntent?.provider
  }

  private resolveConversationProvider(
    command: KernelRuntimeCreateConversationCommand,
    recoveredSnapshot?: KernelRuntimeWireConversationRecoverySnapshot,
  ): RuntimeProviderSelection | undefined {
    return (
      command.provider ??
      command.capabilityIntent?.provider ??
      recoveredSnapshot?.conversation.provider ??
      this.defaultProviderSelection
    )
  }

  private resolveTurnProvider(
    command: KernelRuntimeRunTurnCommand,
    conversation: KernelRuntimeWireConversation,
  ): RuntimeProviderSelection | undefined {
    return (
      command.providerOverride ??
      conversation.snapshot().provider ??
      this.defaultProviderSelection
    )
  }

  private async handleReloadCapabilities(
    command: Extract<KernelRuntimeCommand, { type: 'reload_capabilities' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.capabilityResolver) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Capability resolver is not available',
        retryable: false,
      })
    }

    const descriptors =
      await this.options.capabilityResolver.reloadCapabilities(command.scope, {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      })
    this.eventBus.emit({
      type: 'capabilities.reloaded',
      replayable: true,
      payload: sanitizeWirePayload({
        scope: command.scope,
        capabilities: command.capabilities,
        descriptors,
      }),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        descriptors: sanitizeWirePayload(descriptors),
      },
    })
  }

  private async handleListCommands(
    command: Extract<KernelRuntimeCommand, { type: 'list_commands' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.commandCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Command catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('commands', command)
    const entries = await this.options.commandCatalog.listCommands({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        entries: sanitizeWirePayload(entries),
      },
    })
  }

  private async handleExecuteCommand(
    command: Extract<KernelRuntimeCommand, { type: 'execute_command' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const executeCommand = this.options.commandCatalog?.executeCommand
    if (!executeCommand) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Command execution is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('commands', command)
    const result = await executeCommand(stripWireCommandFields(command), {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'commands.executed',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListTools(
    command: Extract<KernelRuntimeCommand, { type: 'list_tools' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.toolCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Tool catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tools', command)
    const tools = await this.options.toolCatalog.listTools({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        tools: sanitizeWirePayload(tools),
      },
    })
  }

  private async handleCallTool(
    command: Extract<KernelRuntimeCommand, { type: 'call_tool' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const callTool = this.options.toolCatalog?.callTool
    if (!callTool) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Tool execution is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tools', command)
    const result = await callTool(stripWireCommandFields(command), {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'tools.called',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListMcpServers(
    command: Extract<KernelRuntimeCommand, { type: 'list_mcp_servers' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const servers = await this.options.mcpRegistry.listServers({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        servers: sanitizeWirePayload(servers),
      },
    })
  }

  private async handleListMcpTools(
    command: Extract<KernelRuntimeCommand, { type: 'list_mcp_tools' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const tools = await this.options.mcpRegistry.listToolBindings({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        tools: sanitizeWirePayload(
          filterMcpToolBindings(tools, command.serverName),
        ),
      },
    })
  }

  private async handleListMcpResources(
    command: Extract<KernelRuntimeCommand, { type: 'list_mcp_resources' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const resources = await this.options.mcpRegistry.listResources(
      command.serverName,
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        resources: sanitizeWirePayload(resources),
      },
    })
  }

  private async handleReloadMcp(
    command: Extract<KernelRuntimeCommand, { type: 'reload_mcp' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    await this.options.mcpRegistry.reload?.({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    const snapshot = await this.readMcpRegistrySnapshot(command.metadata)
    this.eventBus.emit({
      type: 'mcp.reloaded',
      replayable: true,
      payload: sanitizeWirePayload(snapshot),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleConnectMcp(
    command: Extract<KernelRuntimeCommand, { type: 'connect_mcp' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry?.connectServer) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP connect is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const result = await this.options.mcpRegistry.connectServer(
      stripWireCommandFields(command),
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    return this.ackMcpLifecycle(command, result, 'mcp.connected')
  }

  private async handleAuthenticateMcp(
    command: Extract<KernelRuntimeCommand, { type: 'authenticate_mcp' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry?.authenticateServer) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP authentication is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const result = await this.options.mcpRegistry.authenticateServer(
      stripWireCommandFields(command),
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    return this.ackMcpLifecycle(command, result, 'mcp.authenticated')
  }

  private async handleSetMcpEnabled(
    command: Extract<KernelRuntimeCommand, { type: 'set_mcp_enabled' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.mcpRegistry?.setServerEnabled) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'MCP enable/disable is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('mcp', command)
    const result = await this.options.mcpRegistry.setServerEnabled(
      stripWireCommandFields(command),
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    return this.ackMcpLifecycle(command, result, 'mcp.enabled_changed')
  }

  private ackMcpLifecycle(
    command: Extract<
      KernelRuntimeCommand,
      { type: 'connect_mcp' | 'authenticate_mcp' | 'set_mcp_enabled' }
    >,
    result: RuntimeMcpLifecycleResult,
    eventType: string,
  ): KernelRuntimeEnvelopeBase {
    const payload = sanitizeWirePayload(result)
    this.eventBus.emit({
      type: eventType,
      replayable: true,
      payload,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload,
    })
  }

  private async readMcpRegistrySnapshot(
    metadata: Record<string, unknown> | undefined,
  ): Promise<RuntimeMcpRegistrySnapshot> {
    const context = {
      cwd: this.runtimeWorkspacePath,
      metadata,
    }
    const [servers, resources, toolBindings] = await Promise.all([
      this.options.mcpRegistry!.listServers(context),
      this.options.mcpRegistry!.listResources(undefined, context),
      this.options.mcpRegistry!.listToolBindings(context),
    ])
    return { servers, resources, toolBindings }
  }

  private async handleListHooks(
    command: Extract<KernelRuntimeCommand, { type: 'list_hooks' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.hookCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Hook catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('hooks', command)
    const hooks = await this.options.hookCatalog.listHooks({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        hooks: sanitizeWirePayload(hooks),
      },
    })
  }

  private async handleReloadHooks(
    command: Extract<KernelRuntimeCommand, { type: 'reload_hooks' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.hookCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Hook catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('hooks', command)
    await this.options.hookCatalog.reload?.({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    const snapshot: RuntimeHookRegistrySnapshot = {
      hooks: await this.options.hookCatalog.listHooks({
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      }),
    }
    this.eventBus.emit({
      type: 'hooks.reloaded',
      replayable: true,
      payload: sanitizeWirePayload(snapshot),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleRunHook(
    command: Extract<KernelRuntimeCommand, { type: 'run_hook' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.hookCatalog?.runHook) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Hook run is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('hooks', command)
    const result = await this.options.hookCatalog.runHook(
      stripWireCommandFields(command),
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'hooks.ran',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleRegisterHook(
    command: Extract<KernelRuntimeCommand, { type: 'register_hook' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.hookCatalog?.registerHook) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Hook registration is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('hooks', command)
    const result = await this.options.hookCatalog.registerHook(
      stripWireCommandFields(command),
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'hooks.registered',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListSkills(
    command: Extract<KernelRuntimeCommand, { type: 'list_skills' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.skillCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Skill catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('skills', command)
    const skills = await this.options.skillCatalog.listSkills({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        skills: sanitizeWirePayload(skills),
      },
    })
  }

  private async handleReloadSkills(
    command: Extract<KernelRuntimeCommand, { type: 'reload_skills' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.skillCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Skill catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('skills', command)
    await this.options.skillCatalog.reload?.({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    const snapshot: RuntimeSkillCatalogSnapshot = {
      skills: await this.options.skillCatalog.listSkills({
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      }),
    }
    this.eventBus.emit({
      type: 'skills.reloaded',
      replayable: true,
      payload: sanitizeWirePayload(snapshot),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleResolveSkillContext(
    command: Extract<KernelRuntimeCommand, { type: 'resolve_skill_context' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.skillCatalog?.resolvePromptContext) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Skill prompt context resolution is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('skills', command)
    const result = await this.options.skillCatalog.resolvePromptContext(
      stripWireCommandFields(command),
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'skills.context_resolved',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListPlugins(
    command: Extract<KernelRuntimeCommand, { type: 'list_plugins' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    const snapshot = await this.options.pluginCatalog.listPlugins({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({
        plugins: snapshot.plugins,
        errors: snapshot.errors ?? [],
      }),
    })
  }

  private async handleReloadPlugins(
    command: Extract<KernelRuntimeCommand, { type: 'reload_plugins' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin catalog is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    await this.options.pluginCatalog.reload?.({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    const listed = await this.options.pluginCatalog.listPlugins({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    const snapshot: RuntimePluginCatalogSnapshot = {
      plugins: listed.plugins,
      errors: listed.errors ?? [],
    }
    this.eventBus.emit({
      type: 'plugins.reloaded',
      replayable: true,
      payload: sanitizeWirePayload(snapshot),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleSetPluginEnabled(
    command: Extract<KernelRuntimeCommand, { type: 'set_plugin_enabled' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog?.setPluginEnabled) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin enable/disable is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    const result = await this.options.pluginCatalog.setPluginEnabled(
      stripWireCommandFields(command),
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'plugins.enabled_changed',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleInstallPlugin(
    command: Extract<KernelRuntimeCommand, { type: 'install_plugin' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog?.installPlugin) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin install is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    const result = await this.options.pluginCatalog.installPlugin(
      stripWireCommandFields(command),
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'plugins.installed',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleUninstallPlugin(
    command: Extract<KernelRuntimeCommand, { type: 'uninstall_plugin' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog?.uninstallPlugin) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin uninstall is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    const result = await this.options.pluginCatalog.uninstallPlugin(
      stripWireCommandFields(command),
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'plugins.uninstalled',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleUpdatePlugin(
    command: Extract<KernelRuntimeCommand, { type: 'update_plugin' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.pluginCatalog?.updatePlugin) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Plugin update is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('plugins', command)
    const result = await this.options.pluginCatalog.updatePlugin(
      stripWireCommandFields(command),
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'plugins.updated',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListAgents(
    command: Extract<KernelRuntimeCommand, { type: 'list_agents' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.agentRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const snapshot = await this.options.agentRegistry.listAgents({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleReloadAgents(
    command: Extract<KernelRuntimeCommand, { type: 'reload_agents' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.agentRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    await this.options.agentRegistry.reload?.({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    const snapshot = await this.options.agentRegistry.listAgents({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'agents.reloaded',
      replayable: true,
      payload: sanitizeWirePayload(snapshot),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleSpawnAgent(
    command: Extract<KernelRuntimeCommand, { type: 'spawn_agent' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.agentRegistry?.spawnAgent) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent spawner is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const result = await this.options.agentRegistry.spawnAgent(
      stripWireCommandFields(command),
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    this.eventBus.emit({
      type: 'agents.spawned',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListAgentRuns(
    command: Extract<KernelRuntimeCommand, { type: 'list_agent_runs' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const listAgentRuns = this.options.agentRegistry?.listAgentRuns
    if (!listAgentRuns) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent run registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const snapshot = await listAgentRuns({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleGetAgentRun(
    command: Extract<KernelRuntimeCommand, { type: 'get_agent_run' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const getAgentRun = this.options.agentRegistry?.getAgentRun
    if (!getAgentRun) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent run registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const run = await getAgentRun(command.runId, {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        run: sanitizeWirePayload(run),
      },
    })
  }

  private async handleGetAgentOutput(
    command: Extract<KernelRuntimeCommand, { type: 'get_agent_output' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const getAgentOutput = this.options.agentRegistry?.getAgentOutput
    if (!getAgentOutput) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent run output is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const output = await getAgentOutput(stripWireCommandFields(command), {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(output),
    })
  }

  private async handleCancelAgentRun(
    command: Extract<KernelRuntimeCommand, { type: 'cancel_agent_run' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const cancelAgentRun = this.options.agentRegistry?.cancelAgentRun
    if (!cancelAgentRun) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Agent run cancellation is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('agents', command)
    const result = await cancelAgentRun(stripWireCommandFields(command), {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    if (result.cancelled) {
      this.eventBus.emit({
        type: 'agents.run.cancelled',
        replayable: true,
        payload: sanitizeWirePayload(result),
        metadata: command.metadata,
      })
    }
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListTasks(
    command: Extract<KernelRuntimeCommand, { type: 'list_tasks' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.taskRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Task registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tasks', command)
    const snapshot = await this.options.taskRegistry.listTasks(
      command.taskListId,
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleGetTask(
    command: Extract<KernelRuntimeCommand, { type: 'get_task' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.taskRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Task registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tasks', command)
    const task = await this.options.taskRegistry.getTask(
      command.taskId,
      command.taskListId,
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        task: sanitizeWirePayload(task),
      },
    })
  }

  private async handleCreateTask(
    command: Extract<KernelRuntimeCommand, { type: 'create_task' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const createTask = this.options.taskRegistry?.createTask
    if (!createTask) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Task mutator is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tasks', command)
    const result = await createTask(stripWireCommandFields(command), {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'tasks.created',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleUpdateTask(
    command: Extract<KernelRuntimeCommand, { type: 'update_task' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const updateTask = this.options.taskRegistry?.updateTask
    if (!updateTask) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Task mutator is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tasks', command)
    const result = await updateTask(stripWireCommandFields(command), {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'tasks.updated',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleAssignTask(
    command: Extract<KernelRuntimeCommand, { type: 'assign_task' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const assignTask = this.options.taskRegistry?.assignTask
    if (!assignTask) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Task mutator is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('tasks', command)
    const result = await assignTask(stripWireCommandFields(command), {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'tasks.assigned',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleListTeams(
    command: Extract<KernelRuntimeCommand, { type: 'list_teams' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.teamRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Team registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('teams', command)
    const snapshot = await this.options.teamRegistry.listTeams({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleGetTeam(
    command: Extract<KernelRuntimeCommand, { type: 'get_team' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.teamRegistry) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Team registry is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('teams', command)
    const team = await this.options.teamRegistry.getTeam(command.teamName, {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        team: sanitizeWirePayload(team),
      },
    })
  }

  private async handleCreateTeam(
    command: Extract<KernelRuntimeCommand, { type: 'create_team' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const createTeam = this.options.teamRegistry?.createTeam
    if (!createTeam) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Team mutator is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('teams', command)
    const result = await createTeam(stripWireCommandFields(command), {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'teams.created',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleSendTeamMessage(
    command: Extract<KernelRuntimeCommand, { type: 'send_team_message' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const sendMessage = this.options.teamRegistry?.sendMessage
    if (!sendMessage) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Team messaging is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('teams', command)
    const result = await sendMessage(stripWireCommandFields(command), {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    this.eventBus.emit({
      type: 'teams.message.sent',
      replayable: true,
      payload: sanitizeWirePayload(result),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleDestroyTeam(
    command: Extract<KernelRuntimeCommand, { type: 'destroy_team' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const destroyTeam = this.options.teamRegistry?.destroyTeam
    if (!destroyTeam) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Team mutator is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('teams', command)
    const result = await destroyTeam(stripWireCommandFields(command), {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    if (result.success) {
      this.eventBus.emit({
        type: 'teams.destroyed',
        replayable: true,
        payload: sanitizeWirePayload(result),
        metadata: command.metadata,
      })
    }
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(result),
    })
  }

  private async handleGetCompanionState(
    command: Extract<KernelRuntimeCommand, { type: 'get_companion_state' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.companionRuntime) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Companion runtime is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('companion', command)
    const state = await this.options.companionRuntime.getState({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ state }),
    })
  }

  private async handleDispatchCompanionAction(
    command: Extract<
      KernelRuntimeCommand,
      { type: 'dispatch_companion_action' }
    >,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.companionRuntime) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Companion runtime is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('companion', command)
    const state = await this.options.companionRuntime.dispatch(command.action, {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ state }),
    })
  }

  private async handleReactCompanion(
    command: Extract<KernelRuntimeCommand, { type: 'react_companion' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.companionRuntime) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Companion runtime is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('companion', command)
    await this.options.companionRuntime.reactToTurn(
      { messages: command.messages },
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: { ok: true },
    })
  }

  private async handleGetKairosStatus(
    command: Extract<KernelRuntimeCommand, { type: 'get_kairos_status' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.kairosRuntime) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Kairos runtime is not available',
        retryable: false,
      })
    }

    const status = await this.options.kairosRuntime.getStatus({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ status }),
    })
  }

  private async handleEnqueueKairosEvent(
    command: Extract<KernelRuntimeCommand, { type: 'enqueue_kairos_event' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.kairosRuntime) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Kairos runtime is not available',
        retryable: false,
      })
    }

    await this.options.kairosRuntime.enqueueEvent(command.event, {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    const status = await this.options.kairosRuntime.getStatus({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ status }),
    })
  }

  private async handleTickKairos(
    command: Extract<KernelRuntimeCommand, { type: 'tick_kairos' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.kairosRuntime) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Kairos runtime is not available',
        retryable: false,
      })
    }

    await this.options.kairosRuntime.tick(
      {
        reason: command.reason,
        drain: command.drain,
        createAutonomyCommands: command.createAutonomyCommands,
        basePrompt: command.basePrompt,
        rootDir: command.rootDir,
        currentDir: command.currentDir,
        workload: command.workload,
        priority: command.priority,
      },
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    const status = await this.options.kairosRuntime.getStatus({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ status }),
    })
  }

  private async handleSuspendKairos(
    command: Extract<KernelRuntimeCommand, { type: 'suspend_kairos' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.kairosRuntime) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Kairos runtime is not available',
        retryable: false,
      })
    }

    await this.options.kairosRuntime.suspend(command.reason, {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    const status = await this.options.kairosRuntime.getStatus({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ status }),
    })
  }

  private async handleResumeKairos(
    command: Extract<KernelRuntimeCommand, { type: 'resume_kairos' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.kairosRuntime) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Kairos runtime is not available',
        retryable: false,
      })
    }

    await this.options.kairosRuntime.resume(command.reason, {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    const status = await this.options.kairosRuntime.getStatus({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ status }),
    })
  }

  private async handleListMemory(
    command: Extract<KernelRuntimeCommand, { type: 'list_memory' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.memoryManager) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Memory manager is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('memory', command)
    const descriptors = await this.options.memoryManager.listMemory({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ descriptors }),
    })
  }

  private async handleReadMemory(
    command: Extract<KernelRuntimeCommand, { type: 'read_memory' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.memoryManager) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Memory manager is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('memory', command)
    const document = await this.options.memoryManager.readMemory(command.id, {
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ document }),
    })
  }

  private async handleUpdateMemory(
    command: Extract<KernelRuntimeCommand, { type: 'update_memory' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.memoryManager) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Memory manager is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('memory', command)
    const document = await this.options.memoryManager.updateMemory(
      {
        id: command.id,
        content: command.content,
      },
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ document }),
    })
  }

  private async handleReadContext(
    command: Extract<KernelRuntimeCommand, { type: 'read_context' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.contextManager) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Context manager is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('context', command)
    const snapshot = await this.options.contextManager.readContext({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ snapshot }),
    })
  }

  private async handleGetContextGitStatus(
    command: Extract<KernelRuntimeCommand, { type: 'get_context_git_status' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.contextManager) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Context manager is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('context', command)
    const gitStatus = await this.options.contextManager.getGitStatus({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ gitStatus }),
    })
  }

  private async handleGetSystemPromptInjection(
    command: Extract<
      KernelRuntimeCommand,
      { type: 'get_system_prompt_injection' }
    >,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.contextManager) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Context manager is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('context', command)
    const value = await this.options.contextManager.getSystemPromptInjection({
      cwd: this.runtimeWorkspacePath,
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ value }),
    })
  }

  private async handleSetSystemPromptInjection(
    command: Extract<
      KernelRuntimeCommand,
      { type: 'set_system_prompt_injection' }
    >,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.contextManager) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Context manager is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('context', command)
    const value = await this.options.contextManager.setSystemPromptInjection(
      command.value,
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ value }),
    })
  }

  private async handleListSessionsCatalog(
    command: Extract<KernelRuntimeCommand, { type: 'list_sessions' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.sessionManager) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Session manager is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('sessions', command)
    const sessions = await this.options.sessionManager.listSessions(
      {
        cwd: command.cwd,
        limit: command.limit,
        offset: command.offset,
        includeWorktrees: command.includeWorktrees,
      },
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ sessions }),
    })
  }

  private async handleResumeSession(
    command: Extract<KernelRuntimeCommand, { type: 'resume_session' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    await this.requireCatalogCapability('sessions', command)
    const pathResume = command.sessionId.endsWith('.jsonl')
    if (!pathResume && !this.options.sessionManager) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Session manager is not available',
        retryable: false,
      })
    }

    let workspacePath = command.workspacePath
    if (pathResume) {
      if (!(await Bun.file(command.sessionId).exists())) {
        return this.eventBus.error({
          requestId: command.requestId,
          code: 'not_found',
          message: `Unknown session transcript: ${command.sessionId}`,
          retryable: false,
        })
      }
      workspacePath ??= dirname(command.sessionId)
    } else {
      const descriptor = await this.findSessionDescriptor(
        command.sessionId,
        command.metadata,
      )
      if (!descriptor) {
        return this.eventBus.error({
          requestId: command.requestId,
          code: 'not_found',
          message: `Unknown session: ${command.sessionId}`,
          retryable: false,
        })
      }
      workspacePath ??= descriptor.cwd ?? this.runtimeWorkspacePath
    }

    const conversationId =
      command.conversationId ?? `session-${command.sessionId}`
    const shouldHydrateTranscript = !this.conversations.has(conversationId)
    const transcript = this.options.sessionManager
      ? await this.options.sessionManager.resumeSession(command.sessionId, {
          cwd: workspacePath ?? this.runtimeWorkspacePath,
          resumeInterruptedTurn: command.resumeInterruptedTurn,
          resumeSessionAt: command.resumeSessionAt,
          metadata: command.metadata,
        })
      : undefined
    const resumedTranscript = transcript
      ? applyResumeSessionAtToTranscript(transcript, command.resumeSessionAt)
      : undefined
    if (resumedTranscript?.error) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'invalid_request',
        message: resumedTranscript.error,
        retryable: false,
      })
    }
    const effectiveTranscript = resumedTranscript?.transcript

    const createConversationCommand: KernelRuntimeCreateConversationCommand = {
      schemaVersion: command.schemaVersion,
      type: 'create_conversation',
      requestId: command.requestId,
      conversationId,
      workspacePath: workspacePath ?? this.runtimeWorkspacePath,
      sessionId: command.sessionId,
      sessionMeta: sanitizeWirePayload({
        resumeSource: pathResume ? 'transcript_path' : 'session_id',
        sessionId: command.sessionId,
        resumeInterruptedTurn: command.resumeInterruptedTurn,
        resumeSessionAt: command.resumeSessionAt,
      }),
      metadata: command.metadata,
    }
    const ack = await this.handleCreateConversation(createConversationCommand)
    const snapshot = ack.payload as KernelConversationSnapshot
    if (shouldHydrateTranscript && effectiveTranscript) {
      this.hydrateResumedConversationTranscript(
        snapshot.conversationId,
        command.sessionId,
        effectiveTranscript,
      )
      this.hydrateResumedConversationTodo(
        snapshot.conversationId,
        command.sessionId,
        effectiveTranscript,
      )
      this.hydrateResumedConversationNestedMemory(
        snapshot.conversationId,
        command.sessionId,
        effectiveTranscript,
      )
      this.hydrateResumedConversationTasks(
        snapshot.conversationId,
        command.sessionId,
        effectiveTranscript,
      )
      this.hydrateResumedConversationAttribution(
        snapshot.conversationId,
        command.sessionId,
        effectiveTranscript,
      )
      this.hydrateResumedConversationFileHistory(
        snapshot.conversationId,
        command.sessionId,
        effectiveTranscript,
      )
      this.hydrateResumedConversationContentReplacements(
        snapshot.conversationId,
        command.sessionId,
        effectiveTranscript,
      )
      this.hydrateResumedConversationContextCollapse(
        snapshot.conversationId,
        command.sessionId,
        effectiveTranscript,
      )
    }
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: snapshot.conversationId,
      payload: sanitizeWirePayload({ conversation: snapshot }),
    })
  }

  private async handleGetSessionTranscript(
    command: Extract<
      KernelRuntimeCommand,
      { type: 'get_session_transcript' }
    >,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.sessionManager) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Session manager is not available',
        retryable: false,
      })
    }

    await this.requireCatalogCapability('sessions', command)
    const transcript = await this.options.sessionManager.getSessionTranscript(
      command.sessionId,
      {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      },
    )
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({ transcript }),
    })
  }

  private async requireCatalogCapability(
    name: KernelCapabilityName,
    command: Pick<KernelRuntimeCommand, 'requestId' | 'metadata'>,
  ): Promise<void> {
    try {
      await this.options.capabilityResolver?.requireCapability?.(name, {
        cwd: this.runtimeWorkspacePath,
        metadata: command.metadata,
      })
    } catch {
      throw new KernelRuntimeWireCapabilityUnavailableError(command.requestId, [
        name,
      ])
    }
  }

  private handlePublishHostEvent(
    command: Extract<KernelRuntimeCommand, { type: 'publish_host_event' }>,
  ): KernelRuntimeEnvelopeBase {
    const event = this.eventBus.emit({
      ...command.event,
      metadata: {
        ...command.event.metadata,
        publishedBy: 'host',
        requestId: command.requestId,
      },
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: event.conversationId,
      turnId: event.turnId,
      eventId: event.eventId,
      payload: {
        published: true,
        eventId: event.eventId,
      },
    })
  }

  private startTurnExecution(
    command: KernelRuntimeRunTurnCommand,
    conversation: KernelRuntimeWireConversation,
    snapshot: KernelTurnSnapshot,
  ): void {
    if (
      !this.options.runTurnExecutor ||
      (snapshot.state !== 'running' && snapshot.state !== 'aborting')
    ) {
      return
    }

    const executionKey = this.turnExecutionKey(
      command.conversationId,
      command.turnId,
    )
    if (this.activeExecutions.has(executionKey)) {
      return
    }

    const controller = new AbortController()
    this.activeExecutions.set(executionKey, {
      controller,
      command,
    })
    if (snapshot.state === 'aborting') {
      controller.abort(snapshot.stopReason ?? 'aborted')
    }
    void this.runTurnExecution({
      command,
      conversation,
      eventBus: this.eventBus,
      permissionBroker: this.options.permissionBroker,
      providerSelection: this.resolveTurnProvider(command, conversation),
      signal: controller.signal,
    }).finally(() => {
      this.activeExecutions.delete(executionKey)
    })
  }

  private async runTurnExecution(
    context: KernelRuntimeWireTurnExecutionContext,
  ): Promise<void> {
    let terminalEmitted = false
    try {
      const result = this.options.runTurnExecutor?.(context)
      if (isAsyncIterable(result)) {
        for await (const event of result) {
          terminalEmitted =
            (await this.handleTurnExecutionEvent(context, event)) ||
            terminalEmitted
        }
      } else {
        await result
      }

      if (!terminalEmitted && context.signal.aborted) {
        await this.completeTurnExecution(context, 'aborted')
        return
      }

      if (!terminalEmitted) {
        await this.completeTurnExecution(context, 'end_turn')
      }
    } catch (error) {
      if (terminalEmitted) {
        return
      }
      if (context.signal.aborted) {
        await this.completeTurnExecution(context, 'aborted')
        return
      }
      await this.failTurnExecution(context, error)
    }
  }

  private async handleTurnExecutionEvent(
    context: KernelRuntimeWireTurnExecutionContext,
    event: KernelRuntimeWireTurnExecutionEvent,
  ): Promise<boolean> {
    if (!this.shouldAcceptTurnExecutionEvent(context, event)) {
      return false
    }

    switch (event.type) {
      case 'output':
        this.eventBus.emit({
          conversationId: context.command.conversationId,
          turnId: context.command.turnId,
          type: 'turn.output_delta',
          replayable: event.replayable ?? true,
          payload: sanitizeWirePayload(event.payload),
          metadata: event.metadata,
        })
        return false
      case 'event':
        this.eventBus.emit({
          ...event.event,
          conversationId:
            event.event.conversationId ?? context.command.conversationId,
          turnId: event.event.turnId ?? context.command.turnId,
          replayable: event.event.replayable,
          payload: sanitizeWirePayload(event.event.payload),
        })
        return false
      case 'completed':
        await this.completeTurnExecution(
          context,
          event.stopReason ?? 'end_turn',
        )
        return true
      case 'failed':
        await this.failTurnExecution(context, event.error, event.metadata)
        return true
    }
  }

  private async findSessionDescriptor(
    sessionId: string,
    metadata?: Record<string, unknown>,
  ): Promise<KernelRuntimeSessionDescriptor | undefined> {
    if (!this.options.sessionManager) {
      return undefined
    }

    const sessions = await this.options.sessionManager.listSessions(
      {},
      {
        cwd: this.runtimeWorkspacePath,
        metadata,
      },
    )
    return sessions.find(session => session.sessionId === sessionId)
  }

  private emitRuntimeDomainEvent(type: string, event: unknown): void {
    this.eventBus.emit({
      type,
      replayable: true,
      payload: sanitizeWirePayload({ event }),
    })
  }

  private hydrateResumedConversationTranscript(
    conversationId: KernelConversationId,
    resumeSessionId: string,
    transcript: KernelRuntimeSessionTranscript,
  ): void {
    const transcriptSessionId = transcript.sessionId ?? resumeSessionId
    transcript.messages.forEach((message, index) => {
      if (!isTranscriptHistoryMessage(message)) {
        return
      }
      this.eventBus.emit({
        conversationId,
        type: 'conversation.transcript_message',
        replayable: true,
        payload: sanitizeWirePayload({
          sessionId: transcriptSessionId,
          fullPath: transcript.fullPath,
          index,
          message,
        }),
      })
    })
  }

  private hydrateResumedConversationFileHistory(
    conversationId: KernelConversationId,
    resumeSessionId: string,
    transcript: KernelRuntimeSessionTranscript,
  ): void {
    const fileHistorySnapshots = getResumedFileHistorySnapshots(transcript)
    if (fileHistorySnapshots.length === 0) {
      return
    }

    const transcriptSessionId = transcript.sessionId ?? resumeSessionId
    fileHistorySnapshots.forEach((snapshot, index) => {
      this.eventBus.emit({
        conversationId,
        type: 'conversation.file_history_snapshot',
        replayable: true,
        payload: {
          sessionId: transcriptSessionId,
          fullPath: transcript.fullPath,
          index,
          snapshot: cloneReplayableResumeState(snapshot),
        },
      })
    })
  }

  private hydrateResumedConversationTodo(
    conversationId: KernelConversationId,
    resumeSessionId: string,
    transcript: KernelRuntimeSessionTranscript,
  ): void {
    const todoSnapshot = getResumedTodoSnapshot(transcript)
    if (todoSnapshot === undefined) {
      return
    }

    const transcriptSessionId = transcript.sessionId ?? resumeSessionId
    this.eventBus.emit({
      conversationId,
      type: 'conversation.todo_snapshot',
      replayable: true,
      payload: sanitizeWirePayload({
        sessionId: transcriptSessionId,
        fullPath: transcript.fullPath,
        snapshot: cloneReplayableResumeState(todoSnapshot),
      }),
    })
  }

  private hydrateResumedConversationNestedMemory(
    conversationId: KernelConversationId,
    resumeSessionId: string,
    transcript: KernelRuntimeSessionTranscript,
  ): void {
    const nestedMemorySnapshot = getResumedNestedMemorySnapshot(transcript)
    if (nestedMemorySnapshot === undefined) {
      return
    }

    const transcriptSessionId = transcript.sessionId ?? resumeSessionId
    this.eventBus.emit({
      conversationId,
      type: 'conversation.nested_memory_snapshot',
      replayable: true,
      payload: sanitizeWirePayload({
        sessionId: transcriptSessionId,
        fullPath: transcript.fullPath,
        snapshot: cloneReplayableResumeState(nestedMemorySnapshot),
      }),
    })
  }

  private hydrateResumedConversationTasks(
    conversationId: KernelConversationId,
    resumeSessionId: string,
    transcript: KernelRuntimeSessionTranscript,
  ): void {
    const taskSnapshot = getResumedTaskSnapshot(transcript)
    if (taskSnapshot === undefined) {
      return
    }

    const transcriptSessionId = transcript.sessionId ?? resumeSessionId
    this.eventBus.emit({
      conversationId,
      type: 'conversation.task_snapshot',
      replayable: true,
      payload: sanitizeWirePayload({
        sessionId: transcriptSessionId,
        fullPath: transcript.fullPath,
        snapshot: cloneReplayableResumeState(taskSnapshot),
      }),
    })
  }

  private hydrateResumedConversationAttribution(
    conversationId: KernelConversationId,
    resumeSessionId: string,
    transcript: KernelRuntimeSessionTranscript,
  ): void {
    const attributionSnapshots =
      getResumedAttributionSnapshots(transcript)
    if (attributionSnapshots.length === 0) {
      return
    }

    const transcriptSessionId = transcript.sessionId ?? resumeSessionId
    attributionSnapshots.forEach((snapshot, index) => {
      this.eventBus.emit({
        conversationId,
        type: 'conversation.attribution_snapshot',
        replayable: true,
        payload: sanitizeWirePayload({
          sessionId: transcriptSessionId,
          fullPath: transcript.fullPath,
          index,
          snapshot: cloneReplayableResumeState(snapshot),
        }),
      })
    })
  }

  private hydrateResumedConversationContentReplacements(
    conversationId: KernelConversationId,
    resumeSessionId: string,
    transcript: KernelRuntimeSessionTranscript,
  ): void {
    const contentReplacements = getResumedContentReplacements(transcript)
    if (contentReplacements.length === 0) {
      return
    }

    const transcriptSessionId = transcript.sessionId ?? resumeSessionId
    contentReplacements.forEach((replacement, index) => {
      this.eventBus.emit({
        conversationId,
        type: 'conversation.content_replacement',
        replayable: true,
        payload: sanitizeWirePayload({
          sessionId: transcriptSessionId,
          fullPath: transcript.fullPath,
          index,
          replacement: cloneReplayableResumeState(replacement),
        }),
      })
    })
  }

  private hydrateResumedConversationContextCollapse(
    conversationId: KernelConversationId,
    resumeSessionId: string,
    transcript: KernelRuntimeSessionTranscript,
  ): void {
    const contextCollapseCommits = getResumedContextCollapseCommits(transcript)
    const contextCollapseSnapshot =
      getResumedContextCollapseSnapshot(transcript)
    if (
      contextCollapseCommits.length === 0 &&
      contextCollapseSnapshot === undefined
    ) {
      return
    }

    const transcriptSessionId = transcript.sessionId ?? resumeSessionId
    contextCollapseCommits.forEach((commit, index) => {
      this.eventBus.emit({
        conversationId,
        type: 'conversation.context_collapse_commit',
        replayable: true,
        payload: sanitizeWirePayload({
          sessionId: transcriptSessionId,
          fullPath: transcript.fullPath,
          index,
          commit: cloneReplayableResumeState(commit),
        }),
      })
    })

    if (contextCollapseSnapshot !== undefined) {
      this.eventBus.emit({
        conversationId,
        type: 'conversation.context_collapse_snapshot',
        replayable: true,
        payload: sanitizeWirePayload({
          sessionId: transcriptSessionId,
          fullPath: transcript.fullPath,
          snapshot: cloneReplayableResumeState(contextCollapseSnapshot),
        }),
      })
    }
  }

  private shouldAcceptTurnExecutionEvent(
    context: KernelRuntimeWireTurnExecutionContext,
    event: KernelRuntimeWireTurnExecutionEvent,
  ): boolean {
    if (context.conversation.activeTurnId !== context.command.turnId) {
      return false
    }

    if (!context.signal.aborted) {
      return true
    }

    return false
  }

  private async completeTurnExecution(
    context: KernelRuntimeWireTurnExecutionContext,
    stopReason: string | null,
  ): Promise<void> {
    if (context.conversation.activeTurnId !== context.command.turnId) {
      return
    }
    const snapshot = context.conversation.completeTurn(
      context.command.turnId,
      stopReason,
    )
    await this.recordConversationSnapshot(context.conversation, snapshot)
  }

  private async failTurnExecution(
    context: KernelRuntimeWireTurnExecutionContext,
    error: unknown,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (context.conversation.activeTurnId !== context.command.turnId) {
      return
    }
    try {
      const snapshot = context.conversation.failTurn(
        context.command.turnId,
        error,
      )
      await this.recordConversationSnapshot(context.conversation, snapshot)
    } catch (failError) {
      this.eventBus.error({
        requestId: context.command.requestId,
        conversationId: context.command.conversationId,
        turnId: context.command.turnId,
        code: 'internal_error',
        message:
          failError instanceof Error ? failError.message : String(failError),
        retryable: false,
        details: {
          executorError: sanitizeWirePayload(error),
        },
        metadata,
      })
    }
  }

  private turnExecutionKey(
    conversationId: KernelConversationId,
    turnId: KernelTurnId,
  ): string {
    return `${conversationId}:${turnId}`
  }

  private async abortActiveTurnsForHostDisconnect(
    command: KernelRuntimeDisconnectHostCommand,
  ): Promise<KernelTurnId[]> {
    const abortedTurnIds: KernelTurnId[] = []
    const reason = command.reason ?? 'host_disconnected'
    for (const [conversationId, conversation] of this.conversations) {
      const activeTurnId = conversation.activeTurnId
      if (!activeTurnId) {
        continue
      }
      const snapshot = conversation.abortTurn(activeTurnId, reason)
      const activeExecution = this.activeExecutions.get(
        this.turnExecutionKey(conversationId, activeTurnId),
      )
      await this.recordConversationSnapshot(
        conversation,
        snapshot,
        activeExecution?.command,
      )
      this.activeExecutions
        .get(this.turnExecutionKey(conversationId, activeTurnId))
        ?.controller.abort(reason)
      abortedTurnIds.push(activeTurnId)
    }
    return abortedTurnIds
  }

  private async readRecoveredConversation(
    command: KernelRuntimeCreateConversationCommand,
  ): Promise<KernelRuntimeWireConversationRecoverySnapshot | undefined> {
    if (!this.options.conversationSnapshotStore) {
      return undefined
    }

    try {
      const recovered = await this.options.conversationSnapshotStore.readLatest(
        command.conversationId,
      )
      if (!recovered) {
        return undefined
      }
      if (
        command.sessionId !== undefined &&
        recovered.conversation.sessionId !== undefined &&
        command.sessionId !== recovered.conversation.sessionId
      ) {
        return undefined
      }
      if (recovered.conversation.state === 'disposed') {
        return undefined
      }
      const conversation = normalizeRecoveredConversationSnapshot(
        recovered.conversation,
        {
          runtimeId: this.options.runtimeId,
          conversationId: command.conversationId,
          workspacePath: command.workspacePath,
          sessionId: command.sessionId,
        },
      )
      const activeTurn = selectRecoveredActiveTurn(
        conversation,
        recovered.activeTurn,
      )
      const activeExecution = selectRecoveredActiveExecution(
        conversation,
        activeTurn,
        recovered.activeExecution,
      )
      return {
        conversation,
        activeTurn,
        activeExecution,
      }
    } catch (error) {
      this.emitConversationSnapshotFailure(command.conversationId, error, {
        operation: 'readLatest',
      })
      return undefined
    }
  }

  private async recordConversationSnapshot(
    conversation: KernelRuntimeWireConversation,
    activeTurnSnapshot?: KernelTurnSnapshot,
    activeExecution?: KernelRuntimeRunTurnCommand,
  ): Promise<void> {
    if (!this.options.conversationSnapshotStore) {
      return
    }

    const conversationSnapshot = conversation.snapshot()
    const entry = sanitizeWirePayload({
      conversation: conversationSnapshot,
      activeTurn:
        activeTurnSnapshot &&
        conversationSnapshot.activeTurnId === activeTurnSnapshot.turnId
          ? activeTurnSnapshot
          : undefined,
      activeExecution:
        activeExecution &&
        (activeTurnSnapshot?.state === 'running' ||
          activeTurnSnapshot?.state === 'aborting') &&
        conversationSnapshot.activeTurnId === activeExecution.turnId &&
        activeTurnSnapshot.turnId === activeExecution.turnId
          ? activeExecution
          : undefined,
    }) as KernelRuntimeWireConversationRecoverySnapshot

    try {
      await this.options.conversationSnapshotStore.append(entry)
    } catch (error) {
      this.emitConversationSnapshotFailure(conversation.id, error, {
        operation: 'append',
      })
    }
  }

  private emitConversationSnapshotFailure(
    conversationId: KernelConversationId,
    error: unknown,
    metadata?: Record<string, unknown>,
  ): void {
    this.eventBus.emit({
      conversationId,
      type: 'conversation.snapshot_failed',
      replayable: false,
      payload: sanitizeWirePayload({
        message: error instanceof Error ? error.message : String(error),
      }),
      metadata,
    })
  }

  private requireConversation(
    conversationId: KernelConversationId,
    requestId: string,
  ): KernelRuntimeWireConversation {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      throw new KernelRuntimeWireNotFoundError(requestId, conversationId)
    }
    return conversation
  }

  private requireHost(
    hostId: string,
    requestId: string,
  ): KernelRuntimeWireHostRecord {
    const host = this.hosts.get(hostId)
    if (!host) {
      throw new KernelRuntimeWireHostNotFoundError(requestId, hostId)
    }
    return host
  }

  private mapError(
    command: KernelRuntimeCommand,
    error: unknown,
  ): KernelRuntimeEnvelopeBase {
    if (error instanceof KernelRuntimeWireNotFoundError) {
      return this.eventBus.error({
        requestId: error.requestId,
        conversationId: error.conversationId,
        code: 'not_found',
        message: `Conversation ${error.conversationId} was not found`,
        retryable: false,
      })
    }
    if (error instanceof KernelRuntimeWireHostNotFoundError) {
      return this.eventBus.error({
        requestId: error.requestId,
        code: 'not_found',
        message: `Host ${error.hostId} was not found`,
        retryable: false,
        details: { hostId: error.hostId },
      })
    }
    if (error instanceof KernelRuntimeWireConversationConflictError) {
      return this.eventBus.error({
        requestId: error.requestId,
        conversationId: error.conversationId,
        code: 'invalid_request',
        message: error.message,
        retryable: false,
        details: error.details,
      })
    }
    if (error instanceof KernelRuntimeWireCapabilityUnavailableError) {
      return this.eventBus.error({
        requestId: error.requestId,
        code: 'unavailable',
        message: error.message,
        retryable: false,
        details: { capabilities: error.capabilityNames },
      })
    }
    if (error instanceof RuntimeConversationBusyError) {
      return this.eventBus.error({
        requestId: command.requestId,
        conversationId: error.conversationId,
        turnId: error.activeTurnId,
        code: 'busy',
        message: error.message,
        retryable: true,
      })
    }
    if (error instanceof RuntimeEventReplayError) {
      return this.eventBus.error({
        requestId: command.requestId,
        conversationId:
          'conversationId' in command ? command.conversationId : undefined,
        code: error.code === 'not_found' ? 'not_found' : 'unavailable',
        message: error.message,
        retryable: error.code === 'expired',
        details: { eventId: error.eventId, replayError: error.code },
      })
    }
    if (isPermissionDecisionNotFoundError(error)) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'not_found',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
        details:
          'permissionRequestId' in command
            ? { permissionRequestId: command.permissionRequestId }
            : undefined,
      })
    }
    return this.eventBus.error({
      requestId: command.requestId,
      conversationId:
        'conversationId' in command ? command.conversationId : undefined,
      turnId: 'turnId' in command ? command.turnId : undefined,
      code: 'internal_error',
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
    })
  }
}

class KernelRuntimeWireHostNotFoundError extends Error {
  constructor(
    readonly requestId: string,
    readonly hostId: string,
  ) {
    super(`Host ${hostId} was not found`)
    this.name = 'KernelRuntimeWireHostNotFoundError'
  }
}

class KernelRuntimeWireNotFoundError extends Error {
  constructor(
    readonly requestId: string,
    readonly conversationId: KernelConversationId,
  ) {
    super(`Conversation ${conversationId} was not found`)
    this.name = 'KernelRuntimeWireNotFoundError'
  }
}

class KernelRuntimeWireConversationConflictError extends Error {
  constructor(
    readonly requestId: string,
    readonly conversationId: KernelConversationId,
    readonly conflictField: string,
    readonly details: Record<string, unknown>,
  ) {
    super(
      `Conversation ${conversationId} already exists with a different ${conflictField}`,
    )
    this.name = 'KernelRuntimeWireConversationConflictError'
  }
}

class KernelRuntimeWireCapabilityUnavailableError extends Error {
  constructor(
    readonly requestId: string,
    readonly capabilityNames: readonly KernelCapabilityName[],
  ) {
    super(
      `Capability resolver cannot load required capabilities: ${capabilityNames.join(', ')}`,
    )
    this.name = 'KernelRuntimeWireCapabilityUnavailableError'
  }
}

function sanitizeWirePayload<T>(value: T): T {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    } as T
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeWirePayload(item)) as T
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, sanitizeWirePayload(item)]),
  ) as T
}

function isTranscriptHistoryMessage(
  value: unknown,
): value is Record<string, unknown> & { type: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

function getResumedFileHistorySnapshots(
  transcript: KernelRuntimeSessionTranscript,
): readonly unknown[] {
  const candidate = transcript as { fileHistorySnapshots?: unknown }
  return Array.isArray(candidate.fileHistorySnapshots)
    ? candidate.fileHistorySnapshots
    : []
}

function getResumedTodoSnapshot(
  transcript: KernelRuntimeSessionTranscript,
): unknown {
  const candidate = transcript as { todoSnapshot?: unknown }
  return candidate.todoSnapshot ?? undefined
}

function getResumedNestedMemorySnapshot(
  transcript: KernelRuntimeSessionTranscript,
): unknown {
  const candidate = transcript as { nestedMemorySnapshot?: unknown }
  return candidate.nestedMemorySnapshot ?? undefined
}

function getResumedTaskSnapshot(
  transcript: KernelRuntimeSessionTranscript,
): unknown {
  const candidate = transcript as { taskSnapshot?: unknown }
  return candidate.taskSnapshot ?? undefined
}

function getResumedAttributionSnapshots(
  transcript: KernelRuntimeSessionTranscript,
): readonly unknown[] {
  const candidate = transcript as { attributionSnapshots?: unknown }
  return Array.isArray(candidate.attributionSnapshots)
    ? candidate.attributionSnapshots
    : []
}

function getResumedContentReplacements(
  transcript: KernelRuntimeSessionTranscript,
): readonly unknown[] {
  const candidate = transcript as { contentReplacements?: unknown }
  return Array.isArray(candidate.contentReplacements)
    ? candidate.contentReplacements
    : []
}

function getResumedContextCollapseCommits(
  transcript: KernelRuntimeSessionTranscript,
): readonly unknown[] {
  const candidate = transcript as { contextCollapseCommits?: unknown }
  return Array.isArray(candidate.contextCollapseCommits)
    ? candidate.contextCollapseCommits
    : []
}

function getResumedContextCollapseSnapshot(
  transcript: KernelRuntimeSessionTranscript,
): unknown {
  const candidate = transcript as { contextCollapseSnapshot?: unknown }
  return candidate.contextCollapseSnapshot ?? undefined
}

function cloneReplayableResumeState<T>(value: T): T {
  const serialized = JSON.stringify(value)
  return serialized === undefined ? value : (JSON.parse(serialized) as T)
}

function providerSelectionsEqual(
  left: RuntimeProviderSelection,
  right: RuntimeProviderSelection | undefined,
): boolean {
  if (!right) {
    return false
  }
  return stableSerializeWirePayload(left) === stableSerializeWirePayload(right)
}

function stableSerializeWirePayload(value: unknown): string {
  return JSON.stringify(toStableWirePayload(sanitizeWirePayload(value)))
}

function toStableWirePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => toStableWirePayload(item))
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, toStableWirePayload(item)]),
  )
}

function stripWireCommandFields<
  TCommand extends {
    schemaVersion: string
    type: string
    requestId: string
    metadata?: Record<string, unknown>
  },
>(command: TCommand): Omit<TCommand, 'schemaVersion' | 'type' | 'requestId'> {
  const {
    schemaVersion: _schemaVersion,
    type: _type,
    requestId: _requestId,
    ...payload
  } = command
  return payload
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  )
}

function normalizeRecoveredConversationSnapshot(
  snapshot: KernelConversationSnapshot,
  scope: {
    runtimeId: KernelRuntimeId
    conversationId: KernelConversationId
    workspacePath: string
    sessionId?: string
  },
): KernelConversationSnapshot {
  return sanitizeWirePayload({
    ...snapshot,
    runtimeId: scope.runtimeId,
    conversationId: scope.conversationId,
    workspacePath: scope.workspacePath,
    sessionId: scope.sessionId ?? snapshot.sessionId,
    state: isRuntimeOwnedActiveState(snapshot.state)
      ? 'detached'
      : snapshot.state,
  }) as KernelConversationSnapshot
}

function selectRecoveredActiveTurn(
  conversation: KernelConversationSnapshot,
  activeTurn: KernelTurnSnapshot | undefined,
): KernelTurnSnapshot | undefined {
  if (!conversation.activeTurnId || !activeTurn) {
    return undefined
  }
  if (
    activeTurn.conversationId !== conversation.conversationId ||
    activeTurn.turnId !== conversation.activeTurnId
  ) {
    return undefined
  }
  if (!isActiveTurnState(activeTurn.state)) {
    return undefined
  }
  return activeTurn
}

function selectRecoveredActiveExecution(
  conversation: KernelConversationSnapshot,
  activeTurn: KernelTurnSnapshot | undefined,
  activeExecution: KernelRuntimeRunTurnCommand | undefined,
): KernelRuntimeRunTurnCommand | undefined {
  if (
    !activeTurn ||
    (activeTurn.state !== 'running' && activeTurn.state !== 'aborting') ||
    !activeExecution
  ) {
    return undefined
  }
  if (
    activeExecution.type !== 'run_turn' ||
    activeExecution.conversationId !== conversation.conversationId ||
    activeExecution.turnId !== activeTurn.turnId
  ) {
    return undefined
  }
  return activeExecution
}

function isRuntimeOwnedActiveState(
  state: KernelConversationSnapshot['state'],
): boolean {
  return state === 'running' || state === 'aborting'
}

function isActiveTurnState(state: KernelTurnSnapshot['state']): boolean {
  return state === 'starting' || state === 'running' || state === 'aborting'
}

function isPermissionDecisionNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && error.name === 'RuntimePermissionDecisionError'
  )
}

function filterMcpToolBindings(
  bindings: readonly RuntimeMcpToolBinding[],
  serverName: string | undefined,
): readonly RuntimeMcpToolBinding[] {
  if (!serverName) {
    return bindings
  }
  return bindings.filter(binding => binding.server === serverName)
}

function getCapabilityIntentNames(
  capabilityIntent: KernelRuntimeCapabilityIntent | undefined,
): readonly KernelCapabilityName[] {
  if (!capabilityIntent) {
    return []
  }

  const names = new Set<KernelCapabilityName>()
  for (const key of [
    'capabilities',
    'requiredCapabilities',
    'require',
    'requires',
    'load',
  ]) {
    addCapabilityNames(names, capabilityIntent[key])
  }

  for (const [key, value] of Object.entries(capabilityIntent)) {
    if (value === true) {
      names.add(key)
    }
  }

  return [...names]
}

function addCapabilityNames(
  names: Set<KernelCapabilityName>,
  value: unknown,
): void {
  if (typeof value === 'string') {
    names.add(value)
    return
  }
  if (!Array.isArray(value)) {
    return
  }
  for (const item of value) {
    if (typeof item === 'string') {
      names.add(item)
    }
  }
}

export function createKernelRuntimeWireRouter(
  options: KernelRuntimeWireRouterOptions,
): KernelRuntimeWireRouter {
  return new KernelRuntimeWireRouter(options)
}
