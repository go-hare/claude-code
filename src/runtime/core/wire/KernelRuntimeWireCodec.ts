import type {
  KernelCapabilityReloadScope,
  KernelRuntimeCapabilityReloadRequest,
} from '../../contracts/capability.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../contracts/events.js'
import type { KernelRuntimeHostIdentity } from '../../contracts/runtime.js'
import type {
  RuntimeProviderAuthRef,
  RuntimeProviderHeaderRef,
  RuntimeProviderScope,
  RuntimeProviderSelection,
} from '../../contracts/provider.js'
import type {
  KernelRuntimeAbortTurnCommand,
  KernelRuntimeAssignTaskCommand,
  KernelRuntimeAuthenticateMcpCommand,
  KernelRuntimeCancelAgentRunCommand,
  KernelRuntimeCallToolCommand,
  KernelRuntimeCommand,
  KernelRuntimeCommandType,
  KernelRuntimeConnectMcpCommand,
  KernelRuntimeConnectHostCommand,
  KernelRuntimeCreateTeamCommand,
  KernelRuntimeDispatchCompanionActionCommand,
  KernelRuntimeDestroyTeamCommand,
  KernelRuntimeEnqueueKairosEventCommand,
  KernelRuntimeCreateTaskCommand,
  KernelRuntimeCreateConversationCommand,
  KernelRuntimeDecidePermissionCommand,
  KernelRuntimeDisconnectHostCommand,
  KernelRuntimeExecuteCommandCommand,
  KernelRuntimeGetCompanionStateCommand,
  KernelRuntimeGetContextGitStatusCommand,
  KernelRuntimeHostDisconnectPolicy,
  KernelRuntimeDisposeConversationCommand,
  KernelRuntimeGetAgentOutputCommand,
  KernelRuntimeGetAgentRunCommand,
  KernelRuntimeGetKairosStatusCommand,
  KernelRuntimeGetSessionTranscriptCommand,
  KernelRuntimeGetSystemPromptInjectionCommand,
  KernelRuntimeGetTaskCommand,
  KernelRuntimeGetTeamCommand,
  KernelRuntimeInstallPluginCommand,
  KernelRuntimeInitCommand,
  KernelRuntimeListAgentsCommand,
  KernelRuntimeListAgentRunsCommand,
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
  KernelRuntimePingCommand,
  KernelRuntimePublishHostEventCommand,
  KernelRuntimeRegisterHookCommand,
  KernelRuntimeReloadAgentsCommand,
  KernelRuntimeReloadCapabilitiesCommand,
  KernelRuntimeReloadHooksCommand,
  KernelRuntimeReloadMcpCommand,
  KernelRuntimeReloadPluginsCommand,
  KernelRuntimeReloadSkillsCommand,
  KernelRuntimeResolveSkillContextCommand,
  KernelRuntimeReactCompanionCommand,
  KernelRuntimeReadContextCommand,
  KernelRuntimeReadMemoryCommand,
  KernelRuntimeResumeKairosCommand,
  KernelRuntimeResumeSessionCommand,
  KernelRuntimeRunHookCommand,
  KernelRuntimeSendTeamMessageCommand,
  KernelRuntimeSetPluginEnabledCommand,
  KernelRuntimeRunTurnCommand,
  KernelRuntimeSetMcpEnabledCommand,
  KernelRuntimeSetSystemPromptInjectionCommand,
  KernelRuntimeSpawnAgentCommand,
  KernelRuntimeSubscribeEventsCommand,
  KernelRuntimeSuspendKairosCommand,
  KernelRuntimeTickKairosCommand,
  KernelRuntimeUninstallPluginCommand,
  KernelRuntimeUpdateMemoryCommand,
  KernelRuntimeUpdatePluginCommand,
  KernelRuntimeUpdateTaskCommand,
} from '../../contracts/wire.js'
import { KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION } from '../../contracts/wire.js'

const COMMAND_TYPES = new Set<KernelRuntimeCommandType>([
  'init_runtime',
  'connect_host',
  'disconnect_host',
  'create_conversation',
  'run_turn',
  'abort_turn',
  'decide_permission',
  'dispose_conversation',
  'reload_capabilities',
  'list_commands',
  'execute_command',
  'list_tools',
  'call_tool',
  'list_mcp_servers',
  'list_mcp_tools',
  'list_mcp_resources',
  'reload_mcp',
  'connect_mcp',
  'authenticate_mcp',
  'set_mcp_enabled',
  'list_hooks',
  'reload_hooks',
  'run_hook',
  'register_hook',
  'list_skills',
  'reload_skills',
  'resolve_skill_context',
  'list_plugins',
  'reload_plugins',
  'set_plugin_enabled',
  'install_plugin',
  'uninstall_plugin',
  'update_plugin',
  'list_agents',
  'reload_agents',
  'spawn_agent',
  'list_agent_runs',
  'get_agent_run',
  'get_agent_output',
  'cancel_agent_run',
  'list_tasks',
  'get_task',
  'create_task',
  'update_task',
  'assign_task',
  'list_teams',
  'get_team',
  'create_team',
  'send_team_message',
  'destroy_team',
  'get_companion_state',
  'dispatch_companion_action',
  'react_companion',
  'get_kairos_status',
  'enqueue_kairos_event',
  'tick_kairos',
  'suspend_kairos',
  'resume_kairos',
  'list_memory',
  'read_memory',
  'update_memory',
  'read_context',
  'get_context_git_status',
  'get_system_prompt_injection',
  'set_system_prompt_injection',
  'list_sessions',
  'resume_session',
  'get_session_transcript',
  'publish_host_event',
  'subscribe_events',
  'ping',
])

type JsonRecord = Record<string, unknown>

export class KernelRuntimeWireCommandParseError extends Error {
  constructor(
    message: string,
    readonly requestId?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'KernelRuntimeWireCommandParseError'
  }
}

export function parseKernelRuntimeCommandLine(
  line: string,
): KernelRuntimeCommand {
  try {
    return parseKernelRuntimeCommand(JSON.parse(line))
  } catch (error) {
    if (error instanceof KernelRuntimeWireCommandParseError) {
      throw error
    }
    throw new KernelRuntimeWireCommandParseError('Invalid JSON command line')
  }
}

export function parseKernelRuntimeCommand(
  input: unknown,
): KernelRuntimeCommand {
  const record = requireRecord(input, 'command')
  const requestId = requireString(record, 'requestId')
  const type = requireCommandType(record)
  const metadata = optionalRecord(record, 'metadata')

  if (record.schemaVersion !== KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION) {
    throw new KernelRuntimeWireCommandParseError(
      'Unsupported kernel runtime command schema version',
      requestId,
      {
        expected: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        actual: record.schemaVersion,
      },
    )
  }

  switch (type) {
    case 'ping':
      return withMetadata<KernelRuntimePingCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'init_runtime':
      return parseInitRuntimeCommand(record, requestId, metadata)
    case 'connect_host':
      return parseConnectHostCommand(record, requestId, metadata)
    case 'disconnect_host':
      return parseDisconnectHostCommand(record, requestId, metadata)
    case 'create_conversation':
      return parseCreateConversationCommand(record, requestId, metadata)
    case 'run_turn':
      return parseRunTurnCommand(record, requestId, metadata)
    case 'abort_turn':
      return parseAbortTurnCommand(record, requestId, metadata)
    case 'decide_permission':
      return parseDecidePermissionCommand(record, requestId, metadata)
    case 'dispose_conversation':
      return parseDisposeConversationCommand(record, requestId, metadata)
    case 'reload_capabilities':
      return parseReloadCapabilitiesCommand(record, requestId, metadata)
    case 'list_commands':
      return withMetadata<KernelRuntimeListCommandsCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'execute_command':
      return parseExecuteCommandCommand(record, requestId, metadata)
    case 'list_tools':
      return withMetadata<KernelRuntimeListToolsCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'call_tool':
      return parseCallToolCommand(record, requestId, metadata)
    case 'list_mcp_servers':
      return withMetadata<KernelRuntimeListMcpServersCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'list_mcp_tools':
      return parseListMcpToolsCommand(record, requestId, metadata)
    case 'list_mcp_resources':
      return parseListMcpResourcesCommand(record, requestId, metadata)
    case 'reload_mcp':
      return withMetadata<KernelRuntimeReloadMcpCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'connect_mcp':
      return parseConnectMcpCommand(record, requestId, metadata)
    case 'authenticate_mcp':
      return parseAuthenticateMcpCommand(record, requestId, metadata)
    case 'set_mcp_enabled':
      return parseSetMcpEnabledCommand(record, requestId, metadata)
    case 'list_hooks':
      return withMetadata<KernelRuntimeListHooksCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'reload_hooks':
      return withMetadata<KernelRuntimeReloadHooksCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'run_hook':
      return parseRunHookCommand(record, requestId, metadata)
    case 'register_hook':
      return parseRegisterHookCommand(record, requestId, metadata)
    case 'list_skills':
      return withMetadata<KernelRuntimeListSkillsCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'reload_skills':
      return withMetadata<KernelRuntimeReloadSkillsCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'resolve_skill_context':
      return parseResolveSkillContextCommand(record, requestId, metadata)
    case 'list_plugins':
      return withMetadata<KernelRuntimeListPluginsCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'reload_plugins':
      return withMetadata<KernelRuntimeReloadPluginsCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'set_plugin_enabled':
      return parseSetPluginEnabledCommand(record, requestId, metadata)
    case 'install_plugin':
      return parseInstallPluginCommand(record, requestId, metadata)
    case 'uninstall_plugin':
      return parseUninstallPluginCommand(record, requestId, metadata)
    case 'update_plugin':
      return parseUpdatePluginCommand(record, requestId, metadata)
    case 'list_agents':
      return withMetadata<KernelRuntimeListAgentsCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'reload_agents':
      return withMetadata<KernelRuntimeReloadAgentsCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'spawn_agent':
      return parseSpawnAgentCommand(record, requestId, metadata)
    case 'list_agent_runs':
      return withMetadata<KernelRuntimeListAgentRunsCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'get_agent_run':
      return parseGetAgentRunCommand(record, requestId, metadata)
    case 'get_agent_output':
      return parseGetAgentOutputCommand(record, requestId, metadata)
    case 'cancel_agent_run':
      return parseCancelAgentRunCommand(record, requestId, metadata)
    case 'list_tasks':
      return parseListTasksCommand(record, requestId, metadata)
    case 'get_task':
      return parseGetTaskCommand(record, requestId, metadata)
    case 'create_task':
      return parseCreateTaskCommand(record, requestId, metadata)
    case 'update_task':
      return parseUpdateTaskCommand(record, requestId, metadata)
    case 'assign_task':
      return parseAssignTaskCommand(record, requestId, metadata)
    case 'list_teams':
      return withMetadata<KernelRuntimeListTeamsCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'get_team':
      return parseGetTeamCommand(record, requestId, metadata)
    case 'create_team':
      return parseCreateTeamCommand(record, requestId, metadata)
    case 'send_team_message':
      return parseSendTeamMessageCommand(record, requestId, metadata)
    case 'destroy_team':
      return parseDestroyTeamCommand(record, requestId, metadata)
    case 'get_companion_state':
      return withMetadata<KernelRuntimeGetCompanionStateCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'dispatch_companion_action':
      return parseDispatchCompanionActionCommand(record, requestId, metadata)
    case 'react_companion':
      return parseReactCompanionCommand(record, requestId, metadata)
    case 'get_kairos_status':
      return withMetadata<KernelRuntimeGetKairosStatusCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'enqueue_kairos_event':
      return parseEnqueueKairosEventCommand(record, requestId, metadata)
    case 'tick_kairos':
      return parseTickKairosCommand(record, requestId, metadata)
    case 'suspend_kairos':
      return parseSuspendKairosCommand(record, requestId, metadata)
    case 'resume_kairos':
      return parseResumeKairosCommand(record, requestId, metadata)
    case 'list_memory':
      return withMetadata<KernelRuntimeListMemoryCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'read_memory':
      return parseReadMemoryCommand(record, requestId, metadata)
    case 'update_memory':
      return parseUpdateMemoryCommand(record, requestId, metadata)
    case 'read_context':
      return withMetadata<KernelRuntimeReadContextCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'get_context_git_status':
      return withMetadata<KernelRuntimeGetContextGitStatusCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'get_system_prompt_injection':
      return withMetadata<KernelRuntimeGetSystemPromptInjectionCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'set_system_prompt_injection':
      return parseSetSystemPromptInjectionCommand(record, requestId, metadata)
    case 'list_sessions':
      return parseListSessionsCommand(record, requestId, metadata)
    case 'resume_session':
      return parseResumeSessionCommand(record, requestId, metadata)
    case 'get_session_transcript':
      return parseGetSessionTranscriptCommand(record, requestId, metadata)
    case 'publish_host_event':
      return parsePublishHostEventCommand(record, requestId, metadata)
    case 'subscribe_events':
      return parseSubscribeEventsCommand(record, requestId, metadata)
  }
}

export function serializeKernelRuntimeEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): string {
  return JSON.stringify(envelope)
}

export function serializeKernelRuntimeEnvelopes(
  envelopes: readonly KernelRuntimeEnvelopeBase[],
): string {
  return envelopes.map(serializeKernelRuntimeEnvelope).join('\n')
}

function parseInitRuntimeCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeInitCommand {
  const command: KernelRuntimeInitCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'init_runtime',
    requestId,
  }
  assignOptional(
    command,
    'host',
    optionalRecord(record, 'host') as KernelRuntimeHostIdentity | undefined,
  )
  assignOptional(
    command,
    'workspacePath',
    optionalString(record, 'workspacePath'),
  )
  assignOptional(command, 'provider', optionalProviderSelection(record, 'provider'))
  assignOptional(
    command,
    'defaultProvider',
    optionalProviderSelection(record, 'defaultProvider'),
  )
  assignOptional(command, 'auth', optionalRecord(record, 'auth'))
  assignOptional(command, 'model', optionalString(record, 'model'))
  assignOptional(
    command,
    'capabilities',
    optionalRecord(record, 'capabilities'),
  )
  return withMetadata(command, metadata)
}

function parseConnectHostCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeConnectHostCommand {
  const command: KernelRuntimeConnectHostCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'connect_host',
    requestId,
    host: requireRecordField(record, 'host') as KernelRuntimeHostIdentity,
  }
  assignOptional(
    command,
    'sinceEventId',
    optionalString(record, 'sinceEventId'),
  )
  return withMetadata(command, metadata)
}

function parseDisconnectHostCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeDisconnectHostCommand {
  const command: KernelRuntimeDisconnectHostCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'disconnect_host',
    requestId,
    hostId: requireString(record, 'hostId'),
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  assignOptional(
    command,
    'policy',
    optionalHostDisconnectPolicy(record, 'policy'),
  )
  return withMetadata(command, metadata)
}

function parseCreateConversationCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeCreateConversationCommand {
  const command: KernelRuntimeCreateConversationCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'create_conversation',
    requestId,
    conversationId: requireString(record, 'conversationId'),
    workspacePath: requireString(record, 'workspacePath'),
  }
  assignOptional(command, 'sessionId', optionalString(record, 'sessionId'))
  assignOptional(command, 'sessionMeta', optionalRecord(record, 'sessionMeta'))
  assignOptional(command, 'provider', optionalProviderSelection(record, 'provider'))
  assignOptional(command, 'capabilityIntent', optionalCapabilityIntent(record))
  return withMetadata(command, metadata)
}

function parseRunTurnCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeRunTurnCommand {
  const command: KernelRuntimeRunTurnCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'run_turn',
    requestId,
    conversationId: requireString(record, 'conversationId'),
    turnId: requireString(record, 'turnId'),
    prompt: requirePrompt(record, 'prompt'),
  }
  assignOptional(command, 'attachments', optionalArray(record, 'attachments'))
  assignOptional(
    command,
    'providerOverride',
    optionalProviderSelection(record, 'providerOverride'),
  )
  assignOptional(
    command,
    'executionMode',
    optionalString(record, 'executionMode') as
      | KernelRuntimeRunTurnCommand['executionMode']
      | undefined,
  )
  assignOptional(
    command,
    'contextAssembly',
    optionalRecord(record, 'contextAssembly') as
      | KernelRuntimeRunTurnCommand['contextAssembly']
      | undefined,
  )
  assignOptional(
    command,
    'capabilityPlane',
    optionalRecord(record, 'capabilityPlane') as
      | KernelRuntimeRunTurnCommand['capabilityPlane']
      | undefined,
  )
  return withMetadata(command, metadata)
}

function parseAbortTurnCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeAbortTurnCommand {
  const command: KernelRuntimeAbortTurnCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'abort_turn',
    requestId,
    conversationId: requireString(record, 'conversationId'),
    turnId: requireString(record, 'turnId'),
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  return withMetadata(command, metadata)
}

function parseDecidePermissionCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeDecidePermissionCommand {
  const command: KernelRuntimeDecidePermissionCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'decide_permission',
    requestId,
    permissionRequestId: requireString(record, 'permissionRequestId'),
    decision: requirePermissionDecision(record, 'decision'),
    decidedBy: requirePermissionDecisionSource(record, 'decidedBy'),
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  assignOptional(command, 'expiresAt', optionalString(record, 'expiresAt'))
  return withMetadata(command, metadata)
}

function parseDisposeConversationCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeDisposeConversationCommand {
  const command: KernelRuntimeDisposeConversationCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'dispose_conversation',
    requestId,
    conversationId: requireString(record, 'conversationId'),
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  return withMetadata(command, metadata)
}

function parseReloadCapabilitiesCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeReloadCapabilitiesCommand {
  const scope = requireRecordField(
    record,
    'scope',
  ) as KernelCapabilityReloadScope
  const command: KernelRuntimeReloadCapabilitiesCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'reload_capabilities',
    requestId,
    scope,
  }
  assignOptional(
    command,
    'capabilities',
    optionalArray(record, 'capabilities') as readonly string[] | undefined,
  )
  return withMetadata(command, metadata)
}

function parseExecuteCommandCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeExecuteCommandCommand {
  const command: KernelRuntimeExecuteCommandCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'execute_command',
    requestId,
    name: requireString(record, 'name'),
  }
  assignOptional(command, 'args', optionalString(record, 'args'))
  assignOptional(command, 'source', optionalCommandInvocationSource(record))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseCallToolCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeCallToolCommand {
  const command: KernelRuntimeCallToolCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'call_tool',
    requestId,
    toolName: requireString(record, 'toolName'),
    input: record.input,
  }
  assignOptional(
    command,
    'permissionMode',
    optionalString(record, 'permissionMode'),
  )
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function optionalCommandInvocationSource(
  record: JsonRecord,
): KernelRuntimeExecuteCommandCommand['source'] | undefined {
  const value = optionalString(record, 'source')
  switch (value) {
    case undefined:
    case 'cli':
    case 'repl':
    case 'bridge':
    case 'daemon':
    case 'sdk':
    case 'test':
      return value
    default:
      throw new KernelRuntimeWireCommandParseError(
        `Invalid command source ${value}`,
        optionalString(record, 'requestId'),
      )
  }
}

function parseListMcpToolsCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeListMcpToolsCommand {
  const command: KernelRuntimeListMcpToolsCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'list_mcp_tools',
    requestId,
  }
  assignOptional(command, 'serverName', optionalString(record, 'serverName'))
  return withMetadata(command, metadata)
}

function parseListMcpResourcesCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeListMcpResourcesCommand {
  const command: KernelRuntimeListMcpResourcesCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'list_mcp_resources',
    requestId,
  }
  assignOptional(command, 'serverName', optionalString(record, 'serverName'))
  return withMetadata(command, metadata)
}

function parseConnectMcpCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeConnectMcpCommand {
  const command: KernelRuntimeConnectMcpCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'connect_mcp',
    requestId,
    serverName: requireString(record, 'serverName'),
  }
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseAuthenticateMcpCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeAuthenticateMcpCommand {
  const command: KernelRuntimeAuthenticateMcpCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'authenticate_mcp',
    requestId,
    serverName: requireString(record, 'serverName'),
  }
  assignOptional(command, 'action', optionalMcpAuthAction(record))
  assignOptional(command, 'callbackUrl', optionalString(record, 'callbackUrl'))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseSetMcpEnabledCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeSetMcpEnabledCommand {
  const command: KernelRuntimeSetMcpEnabledCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'set_mcp_enabled',
    requestId,
    serverName: requireString(record, 'serverName'),
    enabled: requireBoolean(record, 'enabled'),
  }
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseRunHookCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeRunHookCommand {
  const command: KernelRuntimeRunHookCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'run_hook',
    requestId,
    event: requireString(record, 'event'),
  }
  assignOptional(command, 'input', record.input)
  assignOptional(command, 'matcher', optionalString(record, 'matcher'))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseRegisterHookCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeRegisterHookCommand {
  const command: KernelRuntimeRegisterHookCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'register_hook',
    requestId,
    hook: requireHookDescriptor(record),
  }
  assignOptional(command, 'handlerRef', optionalString(record, 'handlerRef'))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseResolveSkillContextCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeResolveSkillContextCommand {
  const command: KernelRuntimeResolveSkillContextCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'resolve_skill_context',
    requestId,
    name: requireString(record, 'name'),
  }
  assignOptional(command, 'args', optionalString(record, 'args'))
  assignOptional(command, 'input', record.input)
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseSetPluginEnabledCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeSetPluginEnabledCommand {
  const command: KernelRuntimeSetPluginEnabledCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'set_plugin_enabled',
    requestId,
    name: requireString(record, 'name'),
    enabled: requireBoolean(record, 'enabled'),
  }
  assignOptional(command, 'scope', optionalPluginScope(record))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseInstallPluginCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeInstallPluginCommand {
  const command: KernelRuntimeInstallPluginCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'install_plugin',
    requestId,
    name: requireString(record, 'name'),
  }
  assignOptional(command, 'scope', optionalPluginScope(record))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseUninstallPluginCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeUninstallPluginCommand {
  const command: KernelRuntimeUninstallPluginCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'uninstall_plugin',
    requestId,
    name: requireString(record, 'name'),
  }
  assignOptional(command, 'scope', optionalPluginScope(record))
  assignOptional(command, 'keepData', optionalBoolean(record, 'keepData'))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseUpdatePluginCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeUpdatePluginCommand {
  const command: KernelRuntimeUpdatePluginCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'update_plugin',
    requestId,
    name: requireString(record, 'name'),
  }
  assignOptional(command, 'scope', optionalPluginScope(record))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseListTasksCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeListTasksCommand {
  const command: KernelRuntimeListTasksCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'list_tasks',
    requestId,
  }
  assignOptional(command, 'taskListId', optionalString(record, 'taskListId'))
  return withMetadata(command, metadata)
}

function parseSpawnAgentCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeSpawnAgentCommand {
  const command: KernelRuntimeSpawnAgentCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'spawn_agent',
    requestId,
    prompt: requireString(record, 'prompt'),
  }
  assignOptional(command, 'agentType', optionalString(record, 'agentType'))
  assignOptional(command, 'description', optionalString(record, 'description'))
  assignOptional(command, 'model', optionalString(record, 'model'))
  assignOptional(
    command,
    'runInBackground',
    optionalBoolean(record, 'runInBackground'),
  )
  assignOptional(command, 'taskId', optionalString(record, 'taskId'))
  assignOptional(command, 'taskListId', optionalString(record, 'taskListId'))
  assignOptional(
    command,
    'ownedFiles',
    optionalStringArray(record, 'ownedFiles'),
  )
  assignOptional(command, 'name', optionalString(record, 'name'))
  assignOptional(command, 'teamName', optionalString(record, 'teamName'))
  assignOptional(command, 'mode', optionalString(record, 'mode'))
  assignOptional(
    command,
    'isolation',
    optionalAgentIsolation(record, 'isolation'),
  )
  assignOptional(command, 'cwd', optionalString(record, 'cwd'))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseGetAgentRunCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeGetAgentRunCommand {
  return withMetadata<KernelRuntimeGetAgentRunCommand>(
    {
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'get_agent_run',
      requestId,
      runId: requireString(record, 'runId'),
    },
    metadata,
  )
}

function parseGetAgentOutputCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeGetAgentOutputCommand {
  const command: KernelRuntimeGetAgentOutputCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'get_agent_output',
    requestId,
    runId: requireString(record, 'runId'),
  }
  assignOptional(
    command,
    'tailBytes',
    optionalNonNegativeInteger(record, 'tailBytes'),
  )
  return withMetadata(command, metadata)
}

function parseCancelAgentRunCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeCancelAgentRunCommand {
  const command: KernelRuntimeCancelAgentRunCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'cancel_agent_run',
    requestId,
    runId: requireString(record, 'runId'),
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  return withMetadata(command, metadata)
}

function parseGetTaskCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeGetTaskCommand {
  const command: KernelRuntimeGetTaskCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'get_task',
    requestId,
    taskId: requireString(record, 'taskId'),
  }
  assignOptional(command, 'taskListId', optionalString(record, 'taskListId'))
  return withMetadata(command, metadata)
}

function parseCreateTaskCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeCreateTaskCommand {
  const command: KernelRuntimeCreateTaskCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'create_task',
    requestId,
    subject: requireString(record, 'subject'),
    description: requireString(record, 'description'),
  }
  assignOptional(command, 'taskListId', optionalString(record, 'taskListId'))
  assignOptional(command, 'activeForm', optionalString(record, 'activeForm'))
  assignOptional(command, 'owner', optionalString(record, 'owner'))
  assignOptional(command, 'status', optionalTaskStatus(record, 'status'))
  assignOptional(command, 'blocks', optionalStringArray(record, 'blocks'))
  assignOptional(command, 'blockedBy', optionalStringArray(record, 'blockedBy'))
  assignOptional(
    command,
    'ownedFiles',
    optionalStringArray(record, 'ownedFiles'),
  )
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseUpdateTaskCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeUpdateTaskCommand {
  const command: KernelRuntimeUpdateTaskCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'update_task',
    requestId,
    taskId: requireString(record, 'taskId'),
  }
  assignOptional(command, 'taskListId', optionalString(record, 'taskListId'))
  assignOptional(command, 'subject', optionalString(record, 'subject'))
  assignOptional(command, 'description', optionalString(record, 'description'))
  assignOptional(command, 'activeForm', optionalString(record, 'activeForm'))
  assignOptional(command, 'status', optionalTaskStatus(record, 'status'))
  assignOptional(command, 'owner', optionalString(record, 'owner'))
  assignOptional(command, 'addBlocks', optionalStringArray(record, 'addBlocks'))
  assignOptional(
    command,
    'addBlockedBy',
    optionalStringArray(record, 'addBlockedBy'),
  )
  assignOptional(
    command,
    'ownedFiles',
    optionalStringArray(record, 'ownedFiles'),
  )
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseAssignTaskCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeAssignTaskCommand {
  const command: KernelRuntimeAssignTaskCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'assign_task',
    requestId,
    taskId: requireString(record, 'taskId'),
    owner: requireString(record, 'owner'),
  }
  assignOptional(command, 'taskListId', optionalString(record, 'taskListId'))
  assignOptional(
    command,
    'ownedFiles',
    optionalStringArray(record, 'ownedFiles'),
  )
  assignOptional(command, 'status', optionalTaskStatus(record, 'status'))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseGetTeamCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeGetTeamCommand {
  return withMetadata<KernelRuntimeGetTeamCommand>(
    {
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'get_team',
      requestId,
      teamName: requireString(record, 'teamName'),
    },
    metadata,
  )
}

function parseCreateTeamCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeCreateTeamCommand {
  const command: KernelRuntimeCreateTeamCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'create_team',
    requestId,
    teamName: requireString(record, 'teamName'),
  }
  assignOptional(command, 'description', optionalString(record, 'description'))
  assignOptional(
    command,
    'leadAgentType',
    optionalString(record, 'leadAgentType'),
  )
  assignOptional(command, 'leadModel', optionalString(record, 'leadModel'))
  assignOptional(
    command,
    'workspacePath',
    optionalString(record, 'workspacePath'),
  )
  assignOptional(
    command,
    'leadSessionId',
    optionalString(record, 'leadSessionId'),
  )
  assignOptional(
    command,
    'allowRename',
    optionalBoolean(record, 'allowRename'),
  )
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseSendTeamMessageCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeSendTeamMessageCommand {
  const command: KernelRuntimeSendTeamMessageCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'send_team_message',
    requestId,
    teamName: requireString(record, 'teamName'),
    recipient: requireString(record, 'recipient'),
    message: requireString(record, 'message'),
  }
  assignOptional(command, 'summary', optionalString(record, 'summary'))
  assignOptional(command, 'sender', optionalString(record, 'sender'))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseDestroyTeamCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeDestroyTeamCommand {
  const command: KernelRuntimeDestroyTeamCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'destroy_team',
    requestId,
    teamName: requireString(record, 'teamName'),
  }
  assignOptional(command, 'force', optionalBoolean(record, 'force'))
  assignOptional(command, 'metadata', optionalRecord(record, 'metadata'))
  return withMetadata(command, metadata)
}

function parseDispatchCompanionActionCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeDispatchCompanionActionCommand {
  const action = requireRecordField(record, 'action')
  const type = requireCompanionActionType(action)
  const parsedAction = parseCompanionAction(action, type)
  const command: KernelRuntimeDispatchCompanionActionCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'dispatch_companion_action',
    requestId,
    action: parsedAction,
  }
  return withMetadata(command, metadata)
}

function parseReactCompanionCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeReactCompanionCommand {
  const command: KernelRuntimeReactCompanionCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'react_companion',
    requestId,
    messages: optionalArray(record, 'messages') ?? [],
  }
  return withMetadata(command, metadata)
}

function parseEnqueueKairosEventCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeEnqueueKairosEventCommand {
  const event = requireRecordField(record, 'event')
  const command: KernelRuntimeEnqueueKairosEventCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'enqueue_kairos_event',
    requestId,
    event: {
      type: requireString(event, 'type'),
    },
  }
  assignOptional(command.event, 'payload', event.payload)
  assignOptional(command.event, 'metadata', optionalRecord(event, 'metadata'))
  return withMetadata(command, metadata)
}

function parseTickKairosCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeTickKairosCommand {
  const command: KernelRuntimeTickKairosCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'tick_kairos',
    requestId,
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  assignOptional(command, 'drain', optionalBoolean(record, 'drain'))
  assignOptional(
    command,
    'createAutonomyCommands',
    optionalBoolean(record, 'createAutonomyCommands'),
  )
  assignOptional(command, 'basePrompt', optionalString(record, 'basePrompt'))
  assignOptional(command, 'rootDir', optionalString(record, 'rootDir'))
  assignOptional(command, 'currentDir', optionalString(record, 'currentDir'))
  assignOptional(command, 'workload', optionalString(record, 'workload'))
  assignOptional(command, 'priority', optionalQueuePriority(record, 'priority'))
  return withMetadata(command, metadata)
}

function parseSuspendKairosCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeSuspendKairosCommand {
  const command: KernelRuntimeSuspendKairosCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'suspend_kairos',
    requestId,
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  return withMetadata(command, metadata)
}

function parseResumeKairosCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeResumeKairosCommand {
  const command: KernelRuntimeResumeKairosCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'resume_kairos',
    requestId,
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  return withMetadata(command, metadata)
}

function parseReadMemoryCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeReadMemoryCommand {
  return withMetadata<KernelRuntimeReadMemoryCommand>(
    {
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'read_memory',
      requestId,
      id: requireString(record, 'id'),
    },
    metadata,
  )
}

function parseUpdateMemoryCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeUpdateMemoryCommand {
  return withMetadata<KernelRuntimeUpdateMemoryCommand>(
    {
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'update_memory',
      requestId,
      id: requireString(record, 'id'),
      content: requireString(record, 'content'),
    },
    metadata,
  )
}

function parseSetSystemPromptInjectionCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeSetSystemPromptInjectionCommand {
  const command: KernelRuntimeSetSystemPromptInjectionCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'set_system_prompt_injection',
    requestId,
    value: null,
  }
  const value = record.value
  if (value !== null && typeof value !== 'string') {
    throw new KernelRuntimeWireCommandParseError(
      'value must be a string or null',
    )
  }
  command.value = value
  return withMetadata(command, metadata)
}

function parseListSessionsCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeListSessionsCommand {
  const command: KernelRuntimeListSessionsCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'list_sessions',
    requestId,
  }
  assignOptional(command, 'cwd', optionalString(record, 'cwd'))
  assignOptional(command, 'limit', optionalNonNegativeInteger(record, 'limit'))
  assignOptional(
    command,
    'offset',
    optionalNonNegativeInteger(record, 'offset'),
  )
  assignOptional(
    command,
    'includeWorktrees',
    optionalBoolean(record, 'includeWorktrees'),
  )
  return withMetadata(command, metadata)
}

function parseResumeSessionCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeResumeSessionCommand {
  return withMetadata<KernelRuntimeResumeSessionCommand>(
    {
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'resume_session',
      requestId,
      sessionId: requireString(record, 'sessionId'),
      conversationId: optionalString(record, 'conversationId'),
      workspacePath: optionalString(record, 'workspacePath'),
      resumeInterruptedTurn: optionalBoolean(record, 'resumeInterruptedTurn'),
      resumeSessionAt: optionalString(record, 'resumeSessionAt'),
    },
    metadata,
  )
}

function parseGetSessionTranscriptCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeGetSessionTranscriptCommand {
  return withMetadata<KernelRuntimeGetSessionTranscriptCommand>(
    {
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'get_session_transcript',
      requestId,
      sessionId: requireString(record, 'sessionId'),
    },
    metadata,
  )
}

function parsePublishHostEventCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimePublishHostEventCommand {
  return withMetadata<KernelRuntimePublishHostEventCommand>(
    {
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'publish_host_event',
      requestId,
      event: requireRecordField(record, 'event') as KernelEvent,
    },
    metadata,
  )
}

function parseSubscribeEventsCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeSubscribeEventsCommand {
  const command: KernelRuntimeSubscribeEventsCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'subscribe_events',
    requestId,
  }
  assignOptional(
    command,
    'conversationId',
    optionalString(record, 'conversationId'),
  )
  assignOptional(command, 'turnId', optionalString(record, 'turnId'))
  assignOptional(
    command,
    'sinceEventId',
    optionalString(record, 'sinceEventId'),
  )
  assignOptional(command, 'filters', optionalRecord(record, 'filters'))
  return withMetadata(command, metadata)
}

function requireRecord(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) {
    throw new KernelRuntimeWireCommandParseError(`${path} must be an object`)
  }
  return value
}

function requireRecordField(record: JsonRecord, key: string): JsonRecord {
  return requireRecord(record[key], key)
}

function requireString(record: JsonRecord, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new KernelRuntimeWireCommandParseError(`${key} must be a string`)
  }
  return value
}

function optionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new KernelRuntimeWireCommandParseError(`${key} must be a string`)
  }
  return value
}

function optionalRecord(
  record: JsonRecord,
  key: string,
): JsonRecord | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  return requireRecord(value, key)
}

function optionalCapabilityIntent(
  record: JsonRecord,
): (JsonRecord & { provider?: RuntimeProviderSelection }) | undefined {
  const capabilityIntent = optionalRecord(record, 'capabilityIntent')
  if (!capabilityIntent) {
    return undefined
  }
  const provider = optionalProviderSelection(capabilityIntent, 'provider')
  return provider ? { ...capabilityIntent, provider } : capabilityIntent
}

function optionalProviderSelection(
  record: JsonRecord,
  key: string,
): RuntimeProviderSelection | undefined {
  const value = optionalRecord(record, key)
  if (!value) {
    return undefined
  }
  const providerId = requireString(value, 'providerId')
  const selection: RuntimeProviderSelection = { providerId }
  assignOptional(selection, 'kind', optionalProviderScope(value, 'kind'))
  assignOptional(selection, 'model', optionalString(value, 'model'))
  assignOptional(selection, 'baseURL', optionalString(value, 'baseURL'))
  assignOptional(selection, 'authRef', optionalProviderAuthRef(value, 'authRef'))
  assignOptional(selection, 'headers', optionalStringRecord(value, 'headers'))
  assignOptional(
    selection,
    'secretHeadersRef',
    optionalProviderHeaderRef(value, 'secretHeadersRef'),
  )
  assignOptional(selection, 'options', optionalRecord(value, 'options'))
  assignOptional(selection, 'metadata', optionalRecord(value, 'metadata'))
  return selection
}

function optionalProviderScope(
  record: JsonRecord,
  key: string,
): RuntimeProviderScope | undefined {
  const value = optionalString(record, key)
  switch (value) {
    case undefined:
    case 'anthropic':
    case 'bedrock':
    case 'vertex':
    case 'foundry':
    case 'openai-compatible':
    case 'custom':
      return value
    default:
      throw new KernelRuntimeWireCommandParseError(
        `${key} must be a supported provider scope`,
      )
  }
}

function optionalProviderAuthRef(
  record: JsonRecord,
  key: string,
): RuntimeProviderAuthRef | undefined {
  const value = record[key]
  if (value === undefined || typeof value === 'string') {
    return value
  }
  const ref = requireRecord(value, key)
  const type = requireProviderAuthRefType(ref, key)
  const authRef: {
    type: 'env' | 'secret' | 'desktop' | 'keychain'
    id?: string
    name?: string
    service?: string
    account?: string
  } = { type }
  assignOptional(authRef, 'id', optionalString(ref, 'id'))
  assignOptional(authRef, 'name', optionalString(ref, 'name'))
  assignOptional(authRef, 'service', optionalString(ref, 'service'))
  assignOptional(authRef, 'account', optionalString(ref, 'account'))
  return authRef
}

function optionalProviderHeaderRef(
  record: JsonRecord,
  key: string,
): RuntimeProviderHeaderRef | undefined {
  const value = record[key]
  if (value === undefined || typeof value === 'string') {
    return value
  }
  const ref = requireRecord(value, key)
  const type = requireProviderHeaderRefType(ref, key)
  const headerRef: {
    type: 'env' | 'secret' | 'desktop'
    id?: string
    name?: string
  } = { type }
  assignOptional(headerRef, 'id', optionalString(ref, 'id'))
  assignOptional(headerRef, 'name', optionalString(ref, 'name'))
  return headerRef
}

function optionalStringRecord(
  record: JsonRecord,
  key: string,
): Readonly<Record<string, string>> | undefined {
  const value = optionalRecord(record, key)
  if (!value) {
    return undefined
  }
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== 'string') {
      throw new KernelRuntimeWireCommandParseError(
        `${key}.${entryKey} must be a string`,
      )
    }
  }
  return value as Readonly<Record<string, string>>
}

function requireProviderAuthRefType(
  record: JsonRecord,
  key: string,
): 'env' | 'secret' | 'desktop' | 'keychain' {
  const type = requireString(record, 'type')
  switch (type) {
    case 'env':
    case 'secret':
    case 'desktop':
    case 'keychain':
      return type
    default:
      throw new KernelRuntimeWireCommandParseError(
        `${key}.type must be env, secret, desktop, or keychain`,
      )
  }
}

function requireProviderHeaderRefType(
  record: JsonRecord,
  key: string,
): 'env' | 'secret' | 'desktop' {
  const type = requireString(record, 'type')
  switch (type) {
    case 'env':
    case 'secret':
    case 'desktop':
      return type
    default:
      throw new KernelRuntimeWireCommandParseError(
        `${key}.type must be env, secret, or desktop`,
      )
  }
}

function optionalArray(
  record: JsonRecord,
  key: string,
): readonly unknown[] | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    throw new KernelRuntimeWireCommandParseError(`${key} must be an array`)
  }
  return value
}

function optionalStringArray(
  record: JsonRecord,
  key: string,
): readonly string[] | undefined {
  const value = optionalArray(record, key)
  if (value === undefined) {
    return undefined
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new KernelRuntimeWireCommandParseError(
        `${key} must be an array of strings`,
      )
    }
  }
  return value as readonly string[]
}

function optionalBoolean(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'boolean') {
    throw new KernelRuntimeWireCommandParseError(`${key} must be a boolean`)
  }
  return value
}

function requireBoolean(record: JsonRecord, key: string): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') {
    throw new KernelRuntimeWireCommandParseError(`${key} must be a boolean`)
  }
  return value
}

function requireCompanionActionType(
  record: JsonRecord,
): KernelRuntimeDispatchCompanionActionCommand['action']['type'] {
  const value = requireString(record, 'type')
  switch (value) {
    case 'hatch':
    case 'rehatch':
    case 'mute':
    case 'unmute':
    case 'pet':
    case 'clear':
      return value
    default:
      throw new KernelRuntimeWireCommandParseError(
        `Invalid companion action ${value}`,
      )
  }
}

function parseCompanionAction(
  record: JsonRecord,
  type: KernelRuntimeDispatchCompanionActionCommand['action']['type'],
): KernelRuntimeDispatchCompanionActionCommand['action'] {
  switch (type) {
    case 'hatch':
    case 'rehatch':
    case 'clear':
      return {
        type,
        ...(optionalString(record, 'seed')
          ? { seed: optionalString(record, 'seed') }
          : {}),
      }
    case 'pet':
      return {
        type,
        ...(optionalString(record, 'note')
          ? { note: optionalString(record, 'note') }
          : {}),
      }
    case 'mute':
    case 'unmute':
      return { type }
  }
}

function optionalMcpAuthAction(
  record: JsonRecord,
): KernelRuntimeAuthenticateMcpCommand['action'] | undefined {
  const value = optionalString(record, 'action')
  switch (value) {
    case undefined:
    case 'authenticate':
    case 'clear':
      return value
    default:
      throw new KernelRuntimeWireCommandParseError(
        `Invalid MCP auth action ${value}`,
        optionalString(record, 'requestId'),
      )
  }
}

function requireHookDescriptor(
  record: JsonRecord,
): KernelRuntimeRegisterHookCommand['hook'] {
  const hook = requireRecordField(record, 'hook')
  const descriptor: KernelRuntimeRegisterHookCommand['hook'] = {
    event: requireString(hook, 'event'),
    type: requireHookType(hook),
    source: requireHookSource(hook),
  }
  assignOptional(descriptor, 'matcher', optionalString(hook, 'matcher'))
  assignOptional(descriptor, 'pluginName', optionalString(hook, 'pluginName'))
  assignOptional(descriptor, 'displayName', optionalString(hook, 'displayName'))
  assignOptional(
    descriptor,
    'timeoutSeconds',
    optionalNonNegativeInteger(hook, 'timeoutSeconds'),
  )
  assignOptional(descriptor, 'async', optionalBoolean(hook, 'async'))
  assignOptional(descriptor, 'once', optionalBoolean(hook, 'once'))
  return descriptor
}

function requireHookType(
  record: JsonRecord,
): KernelRuntimeRegisterHookCommand['hook']['type'] {
  const value = requireString(record, 'type')
  switch (value) {
    case 'command':
    case 'prompt':
    case 'agent':
    case 'http':
    case 'callback':
    case 'function':
    case 'unknown':
      return value
    default:
      throw new KernelRuntimeWireCommandParseError(
        `Invalid hook type ${value}`,
        optionalString(record, 'requestId'),
      )
  }
}

function requireHookSource(
  record: JsonRecord,
): KernelRuntimeRegisterHookCommand['hook']['source'] {
  const value = requireString(record, 'source')
  switch (value) {
    case 'userSettings':
    case 'projectSettings':
    case 'localSettings':
    case 'policySettings':
    case 'pluginHook':
    case 'sessionHook':
    case 'builtinHook':
    case 'unknown':
      return value
    default:
      throw new KernelRuntimeWireCommandParseError(
        `Invalid hook source ${value}`,
        optionalString(record, 'requestId'),
      )
  }
}

function optionalPluginScope(
  record: JsonRecord,
): KernelRuntimeSetPluginEnabledCommand['scope'] | undefined {
  const value = optionalString(record, 'scope')
  switch (value) {
    case undefined:
    case 'user':
    case 'project':
    case 'local':
      return value
    default:
      throw new KernelRuntimeWireCommandParseError(
        `Invalid plugin scope ${value}`,
        optionalString(record, 'requestId'),
      )
  }
}

function optionalNonNegativeInteger(
  record: JsonRecord,
  key: string,
): number | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new KernelRuntimeWireCommandParseError(
      `${key} must be a non-negative integer`,
    )
  }
  return value
}

function requirePrompt(
  record: JsonRecord,
  key: string,
): string | readonly unknown[] {
  const value = record[key]
  if (typeof value === 'string' || Array.isArray(value)) {
    return value
  }
  throw new KernelRuntimeWireCommandParseError(
    `${key} must be a string or array`,
  )
}

function requireCommandType(record: JsonRecord): KernelRuntimeCommandType {
  const type = requireString(record, 'type')
  if (!COMMAND_TYPES.has(type as KernelRuntimeCommandType)) {
    throw new KernelRuntimeWireCommandParseError(
      `Unsupported command type ${type}`,
      typeof record.requestId === 'string' ? record.requestId : undefined,
      { type },
    )
  }
  return type as KernelRuntimeCommandType
}

function optionalTaskStatus(
  record: JsonRecord,
  key: string,
): KernelRuntimeCreateTaskCommand['status'] {
  const value = optionalString(record, key)
  if (value === undefined) {
    return undefined
  }
  if (value === 'pending' || value === 'in_progress' || value === 'completed') {
    return value
  }
  throw new KernelRuntimeWireCommandParseError(
    `${key} must be pending, in_progress, or completed`,
  )
}

function optionalQueuePriority(
  record: JsonRecord,
  key: string,
): KernelRuntimeTickKairosCommand['priority'] {
  const value = optionalString(record, key)
  if (value === undefined) {
    return undefined
  }
  if (value === 'now' || value === 'next' || value === 'later') {
    return value
  }
  throw new KernelRuntimeWireCommandParseError(
    `${key} must be now, next, or later`,
  )
}

function optionalAgentIsolation(
  record: JsonRecord,
  key: string,
): KernelRuntimeSpawnAgentCommand['isolation'] {
  const value = optionalString(record, key)
  if (value === undefined) {
    return undefined
  }
  if (value === 'worktree' || value === 'remote') {
    return value
  }
  throw new KernelRuntimeWireCommandParseError(
    `${key} must be worktree or remote`,
  )
}

function optionalHostDisconnectPolicy(
  record: JsonRecord,
  key: string,
): KernelRuntimeHostDisconnectPolicy | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (
    value === 'detach' ||
    value === 'continue' ||
    value === 'abort_active_turns'
  ) {
    return value
  }
  throw new KernelRuntimeWireCommandParseError(
    `${key} must be detach, continue, or abort_active_turns`,
  )
}

function requirePermissionDecision(
  record: JsonRecord,
  key: string,
): KernelRuntimeDecidePermissionCommand['decision'] {
  const value = requireString(record, key)
  if (
    value === 'allow' ||
    value === 'deny' ||
    value === 'allow_once' ||
    value === 'allow_session' ||
    value === 'abort'
  ) {
    return value
  }
  throw new KernelRuntimeWireCommandParseError(
    `${key} must be allow, deny, allow_once, allow_session, or abort`,
  )
}

function requirePermissionDecisionSource(
  record: JsonRecord,
  key: string,
): KernelRuntimeDecidePermissionCommand['decidedBy'] {
  const value = requireString(record, key)
  if (
    value === 'host' ||
    value === 'policy' ||
    value === 'timeout' ||
    value === 'runtime'
  ) {
    return value
  }
  throw new KernelRuntimeWireCommandParseError(
    `${key} must be host, policy, timeout, or runtime`,
  )
}

function withMetadata<T extends { metadata?: Record<string, unknown> }>(
  command: T,
  metadata: JsonRecord | undefined,
): T {
  if (metadata !== undefined) {
    command.metadata = metadata
  }
  return command
}

function assignOptional<TTarget, TKey extends keyof TTarget>(
  target: TTarget,
  key: TKey,
  value: TTarget[TKey] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
