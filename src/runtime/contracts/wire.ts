import type {
  KernelCapabilityReloadScope,
  KernelRuntimeCapabilityIntent,
  KernelRuntimeCapabilityReloadRequest,
} from './capability.js'
import type {
  RuntimeAgentDescriptor,
  RuntimeAgentRegistrySnapshot,
  RuntimeAgentRunCancelRequest,
  RuntimeAgentRunCancelResult,
  RuntimeAgentRunListSnapshot,
  RuntimeAgentRunOutput,
  RuntimeAgentRunOutputRequest,
  RuntimeAgentRunQuery,
  RuntimeAgentRunDescriptor,
  RuntimeAgentSpawnRequest,
  RuntimeAgentSpawnResult,
} from './agent.js'
import type {
  RuntimeCommandExecuteRequest,
  RuntimeCommandExecutionResult,
  RuntimeCommandGraphEntry,
} from './command.js'
import type {
  KernelConversationId,
  KernelConversationSnapshot,
} from './conversation.js'
import type { KernelEvent } from './events.js'
import type {
  RuntimeHookDescriptor,
  RuntimeHookMutationResult,
  RuntimeHookRegistrySnapshot,
  RuntimeHookRegisterRequest,
  RuntimeHookRunRequest,
  RuntimeHookRunResult,
} from './hook.js'
import type {
  RuntimeMcpAuthRequest,
  RuntimeMcpConnectRequest,
  RuntimeMcpLifecycleResult,
  RuntimeMcpRegistrySnapshot,
  RuntimeMcpResourceRef,
  RuntimeMcpServerRef,
  RuntimeMcpSetEnabledRequest,
  RuntimeMcpToolBinding,
} from './mcp.js'
import type { KernelPermissionDecision } from './permissions.js'
import type {
  RuntimePluginCatalogSnapshot,
  RuntimePluginDescriptor,
  RuntimePluginErrorDescriptor,
  RuntimePluginInstallRequest,
  RuntimePluginMutationResult,
  RuntimePluginSetEnabledRequest,
  RuntimePluginUninstallRequest,
  RuntimePluginUpdateRequest,
} from './plugin.js'
import type { RuntimeProviderSelection } from './provider.js'
import type { KernelRuntimeHostIdentity } from './runtime.js'
import type {
  RuntimeSkillCatalogSnapshot,
  RuntimeSkillDescriptor,
  RuntimeSkillPromptContextRequest,
  RuntimeSkillPromptContextResult,
} from './skill.js'
import type {
  RuntimeTaskAssignRequest,
  RuntimeTaskCreateRequest,
  RuntimeTaskDescriptor,
  RuntimeTaskListSnapshot,
  RuntimeTaskMutationResult,
  RuntimeTaskUpdateRequest,
} from './task.js'
import type {
  RuntimeTeamCreateRequest,
  RuntimeTeamCreateResult,
  RuntimeTeamDescriptor,
  RuntimeTeamDestroyRequest,
  RuntimeTeamDestroyResult,
  RuntimeTeamListSnapshot,
  RuntimeTeamMessageRequest,
  RuntimeTeamMessageResult,
} from './team.js'
import type {
  RuntimeToolCallRequest,
  RuntimeToolCallResult,
  RuntimeToolDescriptor,
} from './tool.js'
import type { KernelTurnId, KernelTurnRunRequest } from './turn.js'

export const KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION = 'kernel.runtime.command.v1'

export type KernelRuntimeCommandType =
  | 'init_runtime'
  | 'connect_host'
  | 'disconnect_host'
  | 'create_conversation'
  | 'run_turn'
  | 'abort_turn'
  | 'decide_permission'
  | 'dispose_conversation'
  | 'reload_capabilities'
  | 'list_commands'
  | 'execute_command'
  | 'list_tools'
  | 'call_tool'
  | 'list_mcp_servers'
  | 'list_mcp_tools'
  | 'list_mcp_resources'
  | 'reload_mcp'
  | 'connect_mcp'
  | 'authenticate_mcp'
  | 'set_mcp_enabled'
  | 'list_hooks'
  | 'reload_hooks'
  | 'run_hook'
  | 'register_hook'
  | 'list_skills'
  | 'reload_skills'
  | 'resolve_skill_context'
  | 'list_plugins'
  | 'reload_plugins'
  | 'set_plugin_enabled'
  | 'install_plugin'
  | 'uninstall_plugin'
  | 'update_plugin'
  | 'list_agents'
  | 'reload_agents'
  | 'spawn_agent'
  | 'list_agent_runs'
  | 'get_agent_run'
  | 'get_agent_output'
  | 'cancel_agent_run'
  | 'list_tasks'
  | 'get_task'
  | 'create_task'
  | 'update_task'
  | 'assign_task'
  | 'list_teams'
  | 'get_team'
  | 'create_team'
  | 'send_team_message'
  | 'destroy_team'
  | 'get_companion_state'
  | 'dispatch_companion_action'
  | 'react_companion'
  | 'get_kairos_status'
  | 'enqueue_kairos_event'
  | 'tick_kairos'
  | 'suspend_kairos'
  | 'resume_kairos'
  | 'list_memory'
  | 'read_memory'
  | 'update_memory'
  | 'read_context'
  | 'get_context_git_status'
  | 'get_system_prompt_injection'
  | 'set_system_prompt_injection'
  | 'list_sessions'
  | 'resume_session'
  | 'get_session_transcript'
  | 'publish_host_event'
  | 'subscribe_events'
  | 'ping'

export type KernelRuntimeCommandBase<TType extends KernelRuntimeCommandType> = {
  schemaVersion: typeof KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION
  type: TType
  requestId: string
  metadata?: Record<string, unknown>
}

export type KernelRuntimeInitCommand =
  KernelRuntimeCommandBase<'init_runtime'> & {
    host?: KernelRuntimeHostIdentity
    workspacePath?: string
    provider?: RuntimeProviderSelection
    defaultProvider?: RuntimeProviderSelection
    auth?: Record<string, unknown>
    model?: string
    capabilities?: Record<string, unknown>
  }

export type KernelRuntimeHostDisconnectPolicy =
  | 'detach'
  | 'continue'
  | 'abort_active_turns'

export type KernelRuntimeConnectHostCommand =
  KernelRuntimeCommandBase<'connect_host'> & {
    host: KernelRuntimeHostIdentity
    sinceEventId?: string
  }

export type KernelRuntimeDisconnectHostCommand =
  KernelRuntimeCommandBase<'disconnect_host'> & {
    hostId: string
    reason?: string
    policy?: KernelRuntimeHostDisconnectPolicy
  }

export type KernelRuntimeCreateConversationCommand =
  KernelRuntimeCommandBase<'create_conversation'> & {
    conversationId: KernelConversationId
    workspacePath: string
    sessionId?: string
    sessionMeta?: Record<string, unknown>
    capabilityIntent?: KernelRuntimeCapabilityIntent
    provider?: RuntimeProviderSelection
  }

export type KernelRuntimeRunTurnCommand =
  KernelRuntimeCommandBase<'run_turn'> & {
    conversationId: KernelConversationId
    turnId: KernelTurnId
    prompt: KernelTurnRunRequest['prompt']
    attachments?: KernelTurnRunRequest['attachments']
    providerOverride?: RuntimeProviderSelection
  }

export type KernelRuntimeAbortTurnCommand =
  KernelRuntimeCommandBase<'abort_turn'> & {
    conversationId: KernelConversationId
    turnId: KernelTurnId
    reason?: string
  }

export type KernelRuntimeDecidePermissionCommand =
  KernelRuntimeCommandBase<'decide_permission'> & KernelPermissionDecision

export type KernelRuntimeDisposeConversationCommand =
  KernelRuntimeCommandBase<'dispose_conversation'> & {
    conversationId: KernelConversationId
    reason?: string
  }

export type KernelRuntimeReloadCapabilitiesCommand =
  KernelRuntimeCommandBase<'reload_capabilities'> &
    KernelRuntimeCapabilityReloadRequest & {
      capabilities?: readonly string[]
    }

export type KernelRuntimeListCommandsCommand =
  KernelRuntimeCommandBase<'list_commands'>

export type KernelRuntimeListCommandsResult = {
  entries: readonly RuntimeCommandGraphEntry[]
}

export type KernelRuntimeExecuteCommandCommand =
  KernelRuntimeCommandBase<'execute_command'> & RuntimeCommandExecuteRequest

export type KernelRuntimeExecuteCommandResult = RuntimeCommandExecutionResult

export type KernelRuntimeListToolsCommand =
  KernelRuntimeCommandBase<'list_tools'>

export type KernelRuntimeListToolsResult = {
  tools: readonly RuntimeToolDescriptor[]
}

export type KernelRuntimeCallToolCommand =
  KernelRuntimeCommandBase<'call_tool'> & RuntimeToolCallRequest

export type KernelRuntimeCallToolResult = RuntimeToolCallResult

export type KernelRuntimeListMcpServersCommand =
  KernelRuntimeCommandBase<'list_mcp_servers'>

export type KernelRuntimeListMcpServersResult = {
  servers: readonly RuntimeMcpServerRef[]
}

export type KernelRuntimeListMcpToolsCommand =
  KernelRuntimeCommandBase<'list_mcp_tools'> & {
    serverName?: string
  }

export type KernelRuntimeListMcpToolsResult = {
  tools: readonly RuntimeMcpToolBinding[]
}

export type KernelRuntimeListMcpResourcesCommand =
  KernelRuntimeCommandBase<'list_mcp_resources'> & {
    serverName?: string
  }

export type KernelRuntimeListMcpResourcesResult = {
  resources: readonly RuntimeMcpResourceRef[]
}

export type KernelRuntimeReloadMcpCommand =
  KernelRuntimeCommandBase<'reload_mcp'>

export type KernelRuntimeReloadMcpResult = RuntimeMcpRegistrySnapshot

export type KernelRuntimeConnectMcpCommand =
  KernelRuntimeCommandBase<'connect_mcp'> & RuntimeMcpConnectRequest

export type KernelRuntimeConnectMcpResult = RuntimeMcpLifecycleResult

export type KernelRuntimeAuthenticateMcpCommand =
  KernelRuntimeCommandBase<'authenticate_mcp'> & RuntimeMcpAuthRequest

export type KernelRuntimeAuthenticateMcpResult = RuntimeMcpLifecycleResult

export type KernelRuntimeSetMcpEnabledCommand =
  KernelRuntimeCommandBase<'set_mcp_enabled'> & RuntimeMcpSetEnabledRequest

export type KernelRuntimeSetMcpEnabledResult = RuntimeMcpLifecycleResult

export type KernelRuntimeListHooksCommand =
  KernelRuntimeCommandBase<'list_hooks'>

export type KernelRuntimeListHooksResult = {
  hooks: readonly RuntimeHookDescriptor[]
}

export type KernelRuntimeReloadHooksCommand =
  KernelRuntimeCommandBase<'reload_hooks'>

export type KernelRuntimeReloadHooksResult = RuntimeHookRegistrySnapshot

export type KernelRuntimeRunHookCommand = KernelRuntimeCommandBase<'run_hook'> &
  RuntimeHookRunRequest

export type KernelRuntimeRunHookResult = RuntimeHookRunResult

export type KernelRuntimeRegisterHookCommand =
  KernelRuntimeCommandBase<'register_hook'> & RuntimeHookRegisterRequest

export type KernelRuntimeRegisterHookResult = RuntimeHookMutationResult

export type KernelRuntimeListSkillsCommand =
  KernelRuntimeCommandBase<'list_skills'>

export type KernelRuntimeListSkillsResult = {
  skills: readonly RuntimeSkillDescriptor[]
}

export type KernelRuntimeReloadSkillsCommand =
  KernelRuntimeCommandBase<'reload_skills'>

export type KernelRuntimeReloadSkillsResult = RuntimeSkillCatalogSnapshot

export type KernelRuntimeResolveSkillContextCommand =
  KernelRuntimeCommandBase<'resolve_skill_context'> &
    RuntimeSkillPromptContextRequest

export type KernelRuntimeResolveSkillContextResult =
  RuntimeSkillPromptContextResult

export type KernelRuntimeListPluginsCommand =
  KernelRuntimeCommandBase<'list_plugins'>

export type KernelRuntimeListPluginsResult = {
  plugins: readonly RuntimePluginDescriptor[]
  errors: readonly RuntimePluginErrorDescriptor[]
}

export type KernelRuntimeReloadPluginsCommand =
  KernelRuntimeCommandBase<'reload_plugins'>

export type KernelRuntimeReloadPluginsResult = RuntimePluginCatalogSnapshot

export type KernelRuntimeSetPluginEnabledCommand =
  KernelRuntimeCommandBase<'set_plugin_enabled'> &
    RuntimePluginSetEnabledRequest

export type KernelRuntimeSetPluginEnabledResult = RuntimePluginMutationResult

export type KernelRuntimeInstallPluginCommand =
  KernelRuntimeCommandBase<'install_plugin'> & RuntimePluginInstallRequest

export type KernelRuntimeInstallPluginResult = RuntimePluginMutationResult

export type KernelRuntimeUninstallPluginCommand =
  KernelRuntimeCommandBase<'uninstall_plugin'> & RuntimePluginUninstallRequest

export type KernelRuntimeUninstallPluginResult = RuntimePluginMutationResult

export type KernelRuntimeUpdatePluginCommand =
  KernelRuntimeCommandBase<'update_plugin'> & RuntimePluginUpdateRequest

export type KernelRuntimeUpdatePluginResult = RuntimePluginMutationResult

export type KernelRuntimeListAgentsCommand =
  KernelRuntimeCommandBase<'list_agents'>

export type KernelRuntimeListAgentsResult = RuntimeAgentRegistrySnapshot

export type KernelRuntimeReloadAgentsCommand =
  KernelRuntimeCommandBase<'reload_agents'>

export type KernelRuntimeReloadAgentsResult = RuntimeAgentRegistrySnapshot

export type KernelRuntimeSpawnAgentCommand =
  KernelRuntimeCommandBase<'spawn_agent'> & RuntimeAgentSpawnRequest

export type KernelRuntimeSpawnAgentResult = RuntimeAgentSpawnResult

export type KernelRuntimeListAgentRunsCommand =
  KernelRuntimeCommandBase<'list_agent_runs'>

export type KernelRuntimeListAgentRunsResult = RuntimeAgentRunListSnapshot

export type KernelRuntimeGetAgentRunCommand =
  KernelRuntimeCommandBase<'get_agent_run'> & RuntimeAgentRunQuery

export type KernelRuntimeGetAgentRunResult = {
  run: RuntimeAgentRunDescriptor | null
}

export type KernelRuntimeGetAgentOutputCommand =
  KernelRuntimeCommandBase<'get_agent_output'> & RuntimeAgentRunOutputRequest

export type KernelRuntimeGetAgentOutputResult = RuntimeAgentRunOutput

export type KernelRuntimeCancelAgentRunCommand =
  KernelRuntimeCommandBase<'cancel_agent_run'> & RuntimeAgentRunCancelRequest

export type KernelRuntimeCancelAgentRunResult = RuntimeAgentRunCancelResult

export type KernelRuntimeListTasksCommand =
  KernelRuntimeCommandBase<'list_tasks'> & {
    taskListId?: string
  }

export type KernelRuntimeListTasksResult = RuntimeTaskListSnapshot

export type KernelRuntimeGetTaskCommand =
  KernelRuntimeCommandBase<'get_task'> & {
    taskId: string
    taskListId?: string
  }

export type KernelRuntimeGetTaskResult = {
  task: RuntimeTaskDescriptor | null
}

export type KernelRuntimeCreateTaskCommand =
  KernelRuntimeCommandBase<'create_task'> & RuntimeTaskCreateRequest

export type KernelRuntimeUpdateTaskCommand =
  KernelRuntimeCommandBase<'update_task'> & RuntimeTaskUpdateRequest

export type KernelRuntimeAssignTaskCommand =
  KernelRuntimeCommandBase<'assign_task'> & RuntimeTaskAssignRequest

export type KernelRuntimeTaskMutationResult = RuntimeTaskMutationResult

export type KernelRuntimeListTeamsCommand =
  KernelRuntimeCommandBase<'list_teams'>

export type KernelRuntimeListTeamsResult = RuntimeTeamListSnapshot

export type KernelRuntimeGetTeamCommand =
  KernelRuntimeCommandBase<'get_team'> & {
    teamName: string
  }

export type KernelRuntimeGetTeamResult = {
  team: RuntimeTeamDescriptor | null
}

export type KernelRuntimeCreateTeamCommand =
  KernelRuntimeCommandBase<'create_team'> & RuntimeTeamCreateRequest

export type KernelRuntimeCreateTeamResult = RuntimeTeamCreateResult

export type KernelRuntimeSendTeamMessageCommand =
  KernelRuntimeCommandBase<'send_team_message'> & RuntimeTeamMessageRequest

export type KernelRuntimeSendTeamMessageResult = RuntimeTeamMessageResult

export type KernelRuntimeDestroyTeamCommand =
  KernelRuntimeCommandBase<'destroy_team'> & RuntimeTeamDestroyRequest

export type KernelRuntimeDestroyTeamResult = RuntimeTeamDestroyResult

export type KernelRuntimeCompanionState = {
  seed: string
  muted: boolean
  hasStoredCompanion: boolean
  profile: Record<string, unknown> | null
  companion: Record<string, unknown> | null
}

export type KernelRuntimeCompanionAction =
  | { type: 'hatch'; seed?: string }
  | { type: 'rehatch'; seed?: string }
  | { type: 'mute' }
  | { type: 'unmute' }
  | { type: 'pet'; note?: string }
  | { type: 'clear'; seed?: string }

export type KernelRuntimeCompanionReactionRequest = {
  messages: readonly unknown[]
}

export type KernelRuntimeGetCompanionStateCommand =
  KernelRuntimeCommandBase<'get_companion_state'>

export type KernelRuntimeGetCompanionStateResult = {
  state: KernelRuntimeCompanionState | null
}

export type KernelRuntimeDispatchCompanionActionCommand =
  KernelRuntimeCommandBase<'dispatch_companion_action'> & {
    action: KernelRuntimeCompanionAction
  }

export type KernelRuntimeDispatchCompanionActionResult = {
  state: KernelRuntimeCompanionState | null
}

export type KernelRuntimeReactCompanionCommand =
  KernelRuntimeCommandBase<'react_companion'> &
    KernelRuntimeCompanionReactionRequest

export type KernelRuntimeKairosProactiveState = {
  active: boolean
  paused: boolean
  contextBlocked: boolean
  shouldTick: boolean
  nextTickAt: number | null
  activationSource?: string
}

export type KernelRuntimeKairosAutonomyCommand = {
  value: unknown
  mode: string
  priority?: 'now' | 'next' | 'later'
  workload?: string
  isMeta?: boolean
  origin?: unknown
  autonomy?: unknown
}

export type KernelRuntimeKairosStatus = {
  enabled: boolean
  runtimeEnabled: boolean
  proactive?: KernelRuntimeKairosProactiveState
  suspended: boolean
  pendingEvents: number
  lastTickAt?: string
  suspendedReason?: string
}

export type KernelRuntimeKairosExternalEvent = {
  type: string
  payload?: unknown
  metadata?: Record<string, unknown>
}

export type KernelRuntimeKairosTickRequest = {
  reason?: string
  drain?: boolean
  createAutonomyCommands?: boolean
  basePrompt?: string
  rootDir?: string
  currentDir?: string
  workload?: string
  priority?: 'now' | 'next' | 'later'
}

export type KernelRuntimeGetKairosStatusCommand =
  KernelRuntimeCommandBase<'get_kairos_status'>

export type KernelRuntimeGetKairosStatusResult = {
  status: KernelRuntimeKairosStatus
}

export type KernelRuntimeEnqueueKairosEventCommand =
  KernelRuntimeCommandBase<'enqueue_kairos_event'> & {
    event: KernelRuntimeKairosExternalEvent
  }

export type KernelRuntimeTickKairosCommand =
  KernelRuntimeCommandBase<'tick_kairos'> &
    KernelRuntimeKairosTickRequest

export type KernelRuntimeSuspendKairosCommand =
  KernelRuntimeCommandBase<'suspend_kairos'> & {
    reason?: string
  }

export type KernelRuntimeResumeKairosCommand =
  KernelRuntimeCommandBase<'resume_kairos'> & {
    reason?: string
  }

export type KernelRuntimeKairosMutationResult = {
  status: KernelRuntimeKairosStatus
}

export type KernelRuntimeMemorySource =
  | 'managed'
  | 'user'
  | 'project'
  | 'local'
  | 'auto'
  | 'team'
  | 'unknown'

export type KernelRuntimeMemoryDescriptor = {
  id: string
  path: string
  source: KernelRuntimeMemorySource
  bytes: number
  parent?: string
  globs?: readonly string[]
}

export type KernelRuntimeMemoryDocument = KernelRuntimeMemoryDescriptor & {
  content: string
}

export type KernelRuntimeMemoryUpdateRequest = {
  id: string
  content: string
}

export type KernelRuntimeListMemoryCommand =
  KernelRuntimeCommandBase<'list_memory'>

export type KernelRuntimeListMemoryResult = {
  descriptors: readonly KernelRuntimeMemoryDescriptor[]
}

export type KernelRuntimeReadMemoryCommand =
  KernelRuntimeCommandBase<'read_memory'> & {
    id: string
  }

export type KernelRuntimeReadMemoryResult = {
  document: KernelRuntimeMemoryDocument
}

export type KernelRuntimeUpdateMemoryCommand =
  KernelRuntimeCommandBase<'update_memory'> &
    KernelRuntimeMemoryUpdateRequest

export type KernelRuntimeUpdateMemoryResult = {
  document: KernelRuntimeMemoryDocument
}

export type KernelRuntimeContextSnapshot = {
  system: Record<string, string>
  user: Record<string, string>
}

export type KernelRuntimeReadContextCommand =
  KernelRuntimeCommandBase<'read_context'>

export type KernelRuntimeReadContextResult = {
  snapshot: KernelRuntimeContextSnapshot
}

export type KernelRuntimeGetContextGitStatusCommand =
  KernelRuntimeCommandBase<'get_context_git_status'>

export type KernelRuntimeGetContextGitStatusResult = {
  gitStatus: string | null
}

export type KernelRuntimeGetSystemPromptInjectionCommand =
  KernelRuntimeCommandBase<'get_system_prompt_injection'>

export type KernelRuntimeGetSystemPromptInjectionResult = {
  value: string | null
}

export type KernelRuntimeSetSystemPromptInjectionCommand =
  KernelRuntimeCommandBase<'set_system_prompt_injection'> & {
    value: string | null
  }

export type KernelRuntimeSetSystemPromptInjectionResult = {
  value: string | null
}

export type KernelRuntimeSessionDescriptor = {
  sessionId: string
  summary: string
  lastModified: number
  fileSize?: number
  customTitle?: string
  firstPrompt?: string
  gitBranch?: string
  cwd?: string
  tag?: string
  createdAt?: number
}

export type KernelRuntimeSessionListFilter = {
  cwd?: string
  limit?: number
  offset?: number
  includeWorktrees?: boolean
}

export type KernelRuntimeSessionTranscript = {
  sessionId?: string
  fullPath?: string
  messages: readonly unknown[]
  customTitle?: string
  summary?: string
  tag?: string
  mode?: 'coordinator' | 'normal'
  turnInterruptionState: 'none' | 'interrupted_prompt'
  taskSnapshot?: unknown
  todoSnapshot?: unknown
  nestedMemorySnapshot?: unknown
  attributionSnapshots?: readonly unknown[]
  fileHistorySnapshots?: readonly unknown[]
  contentReplacements?: readonly unknown[]
  contextCollapseCommits?: readonly unknown[]
  contextCollapseSnapshot?: unknown
}

export type KernelRuntimeListSessionsCommand =
  KernelRuntimeCommandBase<'list_sessions'> &
    KernelRuntimeSessionListFilter

export type KernelRuntimeListSessionsResult = {
  sessions: readonly KernelRuntimeSessionDescriptor[]
}

export type KernelRuntimeResumeSessionCommand =
  KernelRuntimeCommandBase<'resume_session'> & {
    sessionId: string
    conversationId?: KernelConversationId
    workspacePath?: string
    resumeInterruptedTurn?: boolean
    resumeSessionAt?: string
  }

export type KernelRuntimeResumeSessionResult = {
  conversation: KernelConversationSnapshot
}

export type KernelRuntimeGetSessionTranscriptCommand =
  KernelRuntimeCommandBase<'get_session_transcript'> & {
    sessionId: string
  }

export type KernelRuntimeGetSessionTranscriptResult = {
  transcript: KernelRuntimeSessionTranscript
}

export type KernelRuntimePublishHostEventCommand =
  KernelRuntimeCommandBase<'publish_host_event'> & {
    event: KernelEvent
  }

export type KernelRuntimeSubscribeEventsCommand =
  KernelRuntimeCommandBase<'subscribe_events'> & {
    conversationId?: KernelConversationId
    turnId?: KernelTurnId
    sinceEventId?: string
    filters?: Record<string, unknown>
  }

export type KernelRuntimePingCommand = KernelRuntimeCommandBase<'ping'>

export type KernelRuntimeCommand =
  | KernelRuntimeInitCommand
  | KernelRuntimeConnectHostCommand
  | KernelRuntimeDisconnectHostCommand
  | KernelRuntimeCreateConversationCommand
  | KernelRuntimeRunTurnCommand
  | KernelRuntimeAbortTurnCommand
  | KernelRuntimeDecidePermissionCommand
  | KernelRuntimeDisposeConversationCommand
  | KernelRuntimeReloadCapabilitiesCommand
  | KernelRuntimeListCommandsCommand
  | KernelRuntimeExecuteCommandCommand
  | KernelRuntimeListToolsCommand
  | KernelRuntimeCallToolCommand
  | KernelRuntimeListMcpServersCommand
  | KernelRuntimeListMcpToolsCommand
  | KernelRuntimeListMcpResourcesCommand
  | KernelRuntimeReloadMcpCommand
  | KernelRuntimeConnectMcpCommand
  | KernelRuntimeAuthenticateMcpCommand
  | KernelRuntimeSetMcpEnabledCommand
  | KernelRuntimeListHooksCommand
  | KernelRuntimeReloadHooksCommand
  | KernelRuntimeRunHookCommand
  | KernelRuntimeRegisterHookCommand
  | KernelRuntimeListSkillsCommand
  | KernelRuntimeReloadSkillsCommand
  | KernelRuntimeResolveSkillContextCommand
  | KernelRuntimeListPluginsCommand
  | KernelRuntimeReloadPluginsCommand
  | KernelRuntimeSetPluginEnabledCommand
  | KernelRuntimeInstallPluginCommand
  | KernelRuntimeUninstallPluginCommand
  | KernelRuntimeUpdatePluginCommand
  | KernelRuntimeListAgentsCommand
  | KernelRuntimeReloadAgentsCommand
  | KernelRuntimeSpawnAgentCommand
  | KernelRuntimeListAgentRunsCommand
  | KernelRuntimeGetAgentRunCommand
  | KernelRuntimeGetAgentOutputCommand
  | KernelRuntimeCancelAgentRunCommand
  | KernelRuntimeListTasksCommand
  | KernelRuntimeGetTaskCommand
  | KernelRuntimeCreateTaskCommand
  | KernelRuntimeUpdateTaskCommand
  | KernelRuntimeAssignTaskCommand
  | KernelRuntimeListTeamsCommand
  | KernelRuntimeGetTeamCommand
  | KernelRuntimeCreateTeamCommand
  | KernelRuntimeSendTeamMessageCommand
  | KernelRuntimeDestroyTeamCommand
  | KernelRuntimeGetCompanionStateCommand
  | KernelRuntimeDispatchCompanionActionCommand
  | KernelRuntimeReactCompanionCommand
  | KernelRuntimeGetKairosStatusCommand
  | KernelRuntimeEnqueueKairosEventCommand
  | KernelRuntimeTickKairosCommand
  | KernelRuntimeSuspendKairosCommand
  | KernelRuntimeResumeKairosCommand
  | KernelRuntimeListMemoryCommand
  | KernelRuntimeReadMemoryCommand
  | KernelRuntimeUpdateMemoryCommand
  | KernelRuntimeReadContextCommand
  | KernelRuntimeGetContextGitStatusCommand
  | KernelRuntimeGetSystemPromptInjectionCommand
  | KernelRuntimeSetSystemPromptInjectionCommand
  | KernelRuntimeListSessionsCommand
  | KernelRuntimeResumeSessionCommand
  | KernelRuntimeGetSessionTranscriptCommand
  | KernelRuntimePublishHostEventCommand
  | KernelRuntimeSubscribeEventsCommand
  | KernelRuntimePingCommand

export type KernelRuntimeWireReloadScope = KernelCapabilityReloadScope
