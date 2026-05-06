import { describe, expect, test } from 'bun:test'

import {
  KERNEL_RUNTIME_WIRE_COMMAND_CONTRACTS,
  KERNEL_RUNTIME_WIRE_GUARANTEED_COMMANDS,
  KERNEL_RUNTIME_WIRE_HOST_OPTIONAL_COMMANDS,
  KERNEL_RUNTIME_WIRE_RAW_ROUTER_OPTIONAL_COMMANDS,
  getKernelRuntimeWireCommandContract,
  isKernelRuntimeWireCommandGuaranteed,
  isKernelRuntimeWireCommandHostOptional,
} from '../wireContract.js'
import {
  KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
  type KernelRuntimeCommand,
  type KernelRuntimeCommandType,
} from '../../runtime/contracts/wire.js'
import { createKernelRuntimeWireRouter } from '../../runtime/core/wire/KernelRuntimeWireRouter.js'
import { createHeadlessConversation } from '../../runtime/capabilities/execution/internal/headlessConversationAdapter.js'

const ALL_WIRE_COMMAND_TYPES = [
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
] as const satisfies readonly KernelRuntimeCommandType[]

describe('kernel runtime wire contract', () => {
  test('classifies every wire command exactly once', () => {
    const contractCommands = Object.keys(
      KERNEL_RUNTIME_WIRE_COMMAND_CONTRACTS,
    ).sort() as KernelRuntimeCommandType[]

    expect(contractCommands).toEqual(
      ([...ALL_WIRE_COMMAND_TYPES] as KernelRuntimeCommandType[]).sort(),
    )
    expect(
      [
        ...KERNEL_RUNTIME_WIRE_GUARANTEED_COMMANDS,
        ...KERNEL_RUNTIME_WIRE_HOST_OPTIONAL_COMMANDS,
      ].sort(),
    ).toEqual(contractCommands)
  })

  test('marks host-optional commands without weakening unavailable semantics', () => {
    expect(KERNEL_RUNTIME_WIRE_HOST_OPTIONAL_COMMANDS).toEqual(['run_turn'])
    expect(isKernelRuntimeWireCommandHostOptional('run_turn')).toBe(true)
    expect(isKernelRuntimeWireCommandGuaranteed('run_turn')).toBe(false)

    for (const command of ALL_WIRE_COMMAND_TYPES) {
      const contract = getKernelRuntimeWireCommandContract(command)
      expect(contract.unavailable).toEqual({
        code: 'unavailable',
        retryable: false,
        emitsDomainEventBeforeError: false,
      })
      if (command !== 'run_turn') {
        expect(contract.support).toBe('guaranteed')
      }
    }
  })

  test('documents raw router optional dependencies as unavailable errors', () => {
    expect(KERNEL_RUNTIME_WIRE_RAW_ROUTER_OPTIONAL_COMMANDS.length).toBeGreaterThan(0)
    expect(KERNEL_RUNTIME_WIRE_RAW_ROUTER_OPTIONAL_COMMANDS).not.toContain('ping')
    expect(KERNEL_RUNTIME_WIRE_RAW_ROUTER_OPTIONAL_COMMANDS).not.toContain(
      'create_conversation',
    )

    for (const command of KERNEL_RUNTIME_WIRE_RAW_ROUTER_OPTIONAL_COMMANDS) {
      const contract = getKernelRuntimeWireCommandContract(command)
      expect(contract.rawRouterDependency).toBeDefined()
      if (command === 'run_turn') {
        expect(contract.missingDependencyBehavior).toBe(
          'ack_without_terminal_event',
        )
      } else {
        expect(contract.missingDependencyBehavior).toBe('unavailable_error')
      }
    }
  })

  test('keeps raw router missing dependency errors stable', async () => {
    const router = createKernelRuntimeWireRouter({
      runtimeId: 'runtime-1',
      workspacePath: '/tmp/workspace',
      createConversation: options => createHeadlessConversation(options),
    })
    const optionalCommands = [
      makeCommand('reload_capabilities', {}),
      makeCommand('decide_permission', {
        permissionRequestId: 'permission-1',
        decision: 'allow',
        decidedBy: 'host',
      }),
      makeCommand('list_tools', {}),
      makeCommand('call_tool', {
        toolName: 'Bash',
        input: {},
      }),
      makeCommand('connect_mcp', {
        serverName: 'github',
      }),
      makeCommand('run_hook', {
        event: 'PreToolUse',
      }),
      makeCommand('resolve_skill_context', {
        name: 'review',
      }),
      makeCommand('install_plugin', {
        name: 'example-plugin',
      }),
      makeCommand('spawn_agent', {
        prompt: 'hello',
      }),
      makeCommand('create_task', {
        subject: 'Wire contract',
        description: 'Lock default router contract',
      }),
      makeCommand('create_team', {
        teamName: 'kernel-wire-contract',
      }),
      makeCommand('get_companion_state', {}),
      makeCommand('get_kairos_status', {}),
      makeCommand('list_memory', {}),
      makeCommand('read_context', {}),
      makeCommand('list_sessions', {}),
    ]

    for (const command of optionalCommands) {
      const [response] = await router.handleCommand(command)
      expect(response.kind).toBe('error')
      expect(response.requestId).toBe(command.requestId)
      expect(response.error).toMatchObject({
        code: 'unavailable',
        retryable: false,
      })
    }
  })
})

function makeCommand<TType extends KernelRuntimeCommandType>(
  type: TType,
  fields: Record<string, unknown>,
): Extract<KernelRuntimeCommand, { type: TType }> {
  return {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type,
    requestId: `request-${type}`,
    ...fields,
  } as Extract<KernelRuntimeCommand, { type: TType }>
}
