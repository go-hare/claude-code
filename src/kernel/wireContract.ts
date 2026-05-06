import type { KernelRuntimeCommandType } from '../runtime/contracts/wire.js'

export type KernelRuntimeWireCommandFamily =
  | 'core'
  | 'host'
  | 'conversation'
  | 'permission'
  | 'capability'
  | 'commands'
  | 'tools'
  | 'mcp'
  | 'hooks'
  | 'skills'
  | 'plugins'
  | 'agents'
  | 'tasks'
  | 'teams'
  | 'autonomy'
  | 'memory'
  | 'context'
  | 'sessions'

export type KernelRuntimeWireCommandSupport =
  | 'guaranteed'
  | 'guaranteed_with_optional_effects'

export type KernelRuntimeWireHostDependency =
  | 'capability_resolver'
  | 'permission_broker'
  | 'turn_executor'
  | 'command_catalog'
  | 'tool_catalog'
  | 'mcp_registry'
  | 'hook_catalog'
  | 'skill_catalog'
  | 'plugin_catalog'
  | 'agent_registry'
  | 'task_registry'
  | 'team_registry'
  | 'companion_runtime'
  | 'kairos_runtime'
  | 'memory_manager'
  | 'context_manager'
  | 'session_manager'

export type KernelRuntimeWireMissingDependencyBehavior =
  | 'unavailable_error'
  | 'ack_without_terminal_event'

export type KernelRuntimeWireUnavailableContract = {
  readonly code: 'unavailable'
  readonly retryable: false
  readonly emitsDomainEventBeforeError: false
}

export type KernelRuntimeWireCommandContract = {
  readonly command: KernelRuntimeCommandType
  readonly family: KernelRuntimeWireCommandFamily
  readonly support: KernelRuntimeWireCommandSupport
  readonly rawRouterDependency?: KernelRuntimeWireHostDependency
  readonly missingDependencyBehavior?: KernelRuntimeWireMissingDependencyBehavior
  readonly unavailable: KernelRuntimeWireUnavailableContract
}

const unavailableContract: KernelRuntimeWireUnavailableContract = {
  code: 'unavailable',
  retryable: false,
  emitsDomainEventBeforeError: false,
}

export const KERNEL_RUNTIME_WIRE_COMMAND_CONTRACTS = {
  ping: contract('ping', 'core'),
  init_runtime: contract('init_runtime', 'core'),
  connect_host: contract('connect_host', 'host'),
  disconnect_host: contract('disconnect_host', 'host'),
  publish_host_event: contract('publish_host_event', 'host'),
  subscribe_events: contract('subscribe_events', 'host'),

  create_conversation: contract('create_conversation', 'conversation'),
  run_turn: contract('run_turn', 'conversation', {
    support: 'guaranteed_with_optional_effects',
    rawRouterDependency: 'turn_executor',
    missingDependencyBehavior: 'ack_without_terminal_event',
  }),
  abort_turn: contract('abort_turn', 'conversation'),
  dispose_conversation: contract('dispose_conversation', 'conversation'),

  decide_permission: contract('decide_permission', 'permission', {
    rawRouterDependency: 'permission_broker',
  }),
  reload_capabilities: contract('reload_capabilities', 'capability', {
    rawRouterDependency: 'capability_resolver',
  }),

  list_commands: contract('list_commands', 'commands', {
    rawRouterDependency: 'command_catalog',
  }),
  execute_command: contract('execute_command', 'commands', {
    rawRouterDependency: 'command_catalog',
  }),
  list_tools: contract('list_tools', 'tools', {
    rawRouterDependency: 'tool_catalog',
  }),
  call_tool: contract('call_tool', 'tools', {
    rawRouterDependency: 'tool_catalog',
  }),

  list_mcp_servers: contract('list_mcp_servers', 'mcp', {
    rawRouterDependency: 'mcp_registry',
  }),
  list_mcp_tools: contract('list_mcp_tools', 'mcp', {
    rawRouterDependency: 'mcp_registry',
  }),
  list_mcp_resources: contract('list_mcp_resources', 'mcp', {
    rawRouterDependency: 'mcp_registry',
  }),
  reload_mcp: contract('reload_mcp', 'mcp', {
    rawRouterDependency: 'mcp_registry',
  }),
  connect_mcp: contract('connect_mcp', 'mcp', {
    rawRouterDependency: 'mcp_registry',
  }),
  authenticate_mcp: contract('authenticate_mcp', 'mcp', {
    rawRouterDependency: 'mcp_registry',
  }),
  set_mcp_enabled: contract('set_mcp_enabled', 'mcp', {
    rawRouterDependency: 'mcp_registry',
  }),

  list_hooks: contract('list_hooks', 'hooks', {
    rawRouterDependency: 'hook_catalog',
  }),
  reload_hooks: contract('reload_hooks', 'hooks', {
    rawRouterDependency: 'hook_catalog',
  }),
  run_hook: contract('run_hook', 'hooks', {
    rawRouterDependency: 'hook_catalog',
  }),
  register_hook: contract('register_hook', 'hooks', {
    rawRouterDependency: 'hook_catalog',
  }),

  list_skills: contract('list_skills', 'skills', {
    rawRouterDependency: 'skill_catalog',
  }),
  reload_skills: contract('reload_skills', 'skills', {
    rawRouterDependency: 'skill_catalog',
  }),
  resolve_skill_context: contract('resolve_skill_context', 'skills', {
    rawRouterDependency: 'skill_catalog',
  }),

  list_plugins: contract('list_plugins', 'plugins', {
    rawRouterDependency: 'plugin_catalog',
  }),
  reload_plugins: contract('reload_plugins', 'plugins', {
    rawRouterDependency: 'plugin_catalog',
  }),
  set_plugin_enabled: contract('set_plugin_enabled', 'plugins', {
    rawRouterDependency: 'plugin_catalog',
  }),
  install_plugin: contract('install_plugin', 'plugins', {
    rawRouterDependency: 'plugin_catalog',
  }),
  uninstall_plugin: contract('uninstall_plugin', 'plugins', {
    rawRouterDependency: 'plugin_catalog',
  }),
  update_plugin: contract('update_plugin', 'plugins', {
    rawRouterDependency: 'plugin_catalog',
  }),

  list_agents: contract('list_agents', 'agents', {
    rawRouterDependency: 'agent_registry',
  }),
  reload_agents: contract('reload_agents', 'agents', {
    rawRouterDependency: 'agent_registry',
  }),
  spawn_agent: contract('spawn_agent', 'agents', {
    rawRouterDependency: 'agent_registry',
  }),
  list_agent_runs: contract('list_agent_runs', 'agents', {
    rawRouterDependency: 'agent_registry',
  }),
  get_agent_run: contract('get_agent_run', 'agents', {
    rawRouterDependency: 'agent_registry',
  }),
  get_agent_output: contract('get_agent_output', 'agents', {
    rawRouterDependency: 'agent_registry',
  }),
  cancel_agent_run: contract('cancel_agent_run', 'agents', {
    rawRouterDependency: 'agent_registry',
  }),

  list_tasks: contract('list_tasks', 'tasks', {
    rawRouterDependency: 'task_registry',
  }),
  get_task: contract('get_task', 'tasks', {
    rawRouterDependency: 'task_registry',
  }),
  create_task: contract('create_task', 'tasks', {
    rawRouterDependency: 'task_registry',
  }),
  update_task: contract('update_task', 'tasks', {
    rawRouterDependency: 'task_registry',
  }),
  assign_task: contract('assign_task', 'tasks', {
    rawRouterDependency: 'task_registry',
  }),

  list_teams: contract('list_teams', 'teams', {
    rawRouterDependency: 'team_registry',
  }),
  get_team: contract('get_team', 'teams', {
    rawRouterDependency: 'team_registry',
  }),
  create_team: contract('create_team', 'teams', {
    rawRouterDependency: 'team_registry',
  }),
  send_team_message: contract('send_team_message', 'teams', {
    rawRouterDependency: 'team_registry',
  }),
  destroy_team: contract('destroy_team', 'teams', {
    rawRouterDependency: 'team_registry',
  }),

  get_companion_state: contract('get_companion_state', 'autonomy', {
    rawRouterDependency: 'companion_runtime',
  }),
  dispatch_companion_action: contract('dispatch_companion_action', 'autonomy', {
    rawRouterDependency: 'companion_runtime',
  }),
  react_companion: contract('react_companion', 'autonomy', {
    rawRouterDependency: 'companion_runtime',
  }),
  get_kairos_status: contract('get_kairos_status', 'autonomy', {
    rawRouterDependency: 'kairos_runtime',
  }),
  enqueue_kairos_event: contract('enqueue_kairos_event', 'autonomy', {
    rawRouterDependency: 'kairos_runtime',
  }),
  tick_kairos: contract('tick_kairos', 'autonomy', {
    rawRouterDependency: 'kairos_runtime',
  }),
  suspend_kairos: contract('suspend_kairos', 'autonomy', {
    rawRouterDependency: 'kairos_runtime',
  }),
  resume_kairos: contract('resume_kairos', 'autonomy', {
    rawRouterDependency: 'kairos_runtime',
  }),

  list_memory: contract('list_memory', 'memory', {
    rawRouterDependency: 'memory_manager',
  }),
  read_memory: contract('read_memory', 'memory', {
    rawRouterDependency: 'memory_manager',
  }),
  update_memory: contract('update_memory', 'memory', {
    rawRouterDependency: 'memory_manager',
  }),

  read_context: contract('read_context', 'context', {
    rawRouterDependency: 'context_manager',
  }),
  get_context_git_status: contract('get_context_git_status', 'context', {
    rawRouterDependency: 'context_manager',
  }),
  get_system_prompt_injection: contract(
    'get_system_prompt_injection',
    'context',
    { rawRouterDependency: 'context_manager' },
  ),
  set_system_prompt_injection: contract(
    'set_system_prompt_injection',
    'context',
    { rawRouterDependency: 'context_manager' },
  ),

  list_sessions: contract('list_sessions', 'sessions', {
    rawRouterDependency: 'session_manager',
  }),
  resume_session: contract('resume_session', 'sessions', {
    rawRouterDependency: 'session_manager',
  }),
  get_session_transcript: contract('get_session_transcript', 'sessions', {
    rawRouterDependency: 'session_manager',
  }),
} satisfies {
  readonly [TCommand in KernelRuntimeCommandType]: KernelRuntimeWireCommandContract & {
    readonly command: TCommand
  }
}

export const KERNEL_RUNTIME_WIRE_GUARANTEED_COMMANDS =
  Object.values(KERNEL_RUNTIME_WIRE_COMMAND_CONTRACTS)
    .filter(contract => contract.support === 'guaranteed')
    .map(contract => contract.command)

export const KERNEL_RUNTIME_WIRE_HOST_OPTIONAL_COMMANDS =
  Object.values(KERNEL_RUNTIME_WIRE_COMMAND_CONTRACTS)
    .filter(contract => contract.support === 'guaranteed_with_optional_effects')
    .map(contract => contract.command)

export const KERNEL_RUNTIME_WIRE_RAW_ROUTER_OPTIONAL_COMMANDS =
  Object.values(KERNEL_RUNTIME_WIRE_COMMAND_CONTRACTS)
    .filter(contract => contract.rawRouterDependency !== undefined)
    .map(contract => contract.command)

export function getKernelRuntimeWireCommandContract(
  command: KernelRuntimeCommandType,
): KernelRuntimeWireCommandContract {
  return KERNEL_RUNTIME_WIRE_COMMAND_CONTRACTS[command]
}

export function isKernelRuntimeWireCommandGuaranteed(
  command: KernelRuntimeCommandType,
): boolean {
  return getKernelRuntimeWireCommandContract(command).support === 'guaranteed'
}

export function isKernelRuntimeWireCommandHostOptional(
  command: KernelRuntimeCommandType,
): boolean {
  return (
    getKernelRuntimeWireCommandContract(command).support ===
    'guaranteed_with_optional_effects'
  )
}

function contract<TCommand extends KernelRuntimeCommandType>(
  command: TCommand,
  family: KernelRuntimeWireCommandFamily,
  options: Partial<
    Pick<
      KernelRuntimeWireCommandContract,
      | 'support'
      | 'rawRouterDependency'
      | 'missingDependencyBehavior'
    >
  > = {},
): KernelRuntimeWireCommandContract & { readonly command: TCommand } {
  return {
    command,
    family,
    support: options.support ?? 'guaranteed',
    rawRouterDependency: options.rawRouterDependency,
    missingDependencyBehavior:
      options.missingDependencyBehavior ??
      (options.rawRouterDependency ? 'unavailable_error' : undefined),
    unavailable: unavailableContract,
  }
}
