import { describe, expect, test } from 'bun:test'

import {
  createKernelCapabilityPlane,
  getKernelCapabilityDenial,
  isKernelCapabilityPermitted,
  toolCapabilityName,
} from '../CapabilityPlane.js'
import {
  createRuntimeAgentToolCapabilityPlane,
  filterToolsByRuntimeAgentCapabilityPlane,
  resolveRuntimeAgentExecutionMode,
  stripRuntimeAgentToolCapabilityPlane,
} from '../agents/AgentCapabilityPlane.js'
import {
  checkRuntimeToolCapabilityPreflight,
  createRuntimeToolCapabilityPlane,
  filterToolsByRuntimeToolCapabilityPlane,
} from '../tools/ToolCapabilityPlane.js'
import {
  createRuntimeCoordinatorToolCapabilityPlane,
  filterToolsByRuntimeCoordinatorCapabilityPlane,
} from '../coordinator/CoordinatorCapabilityPlane.js'
import { TASK_CREATE_TOOL_NAME } from '@go-hare/builtin-tools/tools/TaskCreateTool/constants.js'
import { getEmptyToolPermissionContext } from '../../../Tool.js'

function tool(name: string) {
  return { name } as any
}

describe('Kernel capability plane', () => {
  test('requires runtime support, host grant, and mode permit', () => {
    const plane = createKernelCapabilityPlane({
      runtimeSupports: ['tool:Read', 'tool:Bash'],
      hostGrants: ['tool:Read'],
      modePermits: ['tool:Read', 'tool:Bash'],
    })

    expect(isKernelCapabilityPermitted(plane, 'tool:Read')).toBe(true)
    expect(isKernelCapabilityPermitted(plane, 'tool:Bash')).toBe(false)
    expect(getKernelCapabilityDenial(plane, 'tool:Bash')).toMatchObject({
      actor: 'host',
      reason: 'host_not_granted',
    })
    expect(getKernelCapabilityDenial(plane, 'tool:Write')).toMatchObject({
      actor: 'runtime',
      reason: 'runtime_unsupported',
    })
  })

  test('projects agent tool rules into the same capability plane', () => {
    const tools = [
      tool('Read'),
      tool(TASK_CREATE_TOOL_NAME),
      tool('mcp__docs__search'),
    ]

    const normalAsyncPlane = createRuntimeAgentToolCapabilityPlane({
      tools,
      isBuiltIn: true,
      isAsync: true,
      allowInProcessTeammateTools: false,
    })
    expect(
      filterToolsByRuntimeAgentCapabilityPlane(
        tools,
        normalAsyncPlane,
      ).map(({ name }: { name: string }) => name),
    ).toEqual(['Read', 'mcp__docs__search'])
    expect(
      getKernelCapabilityDenial(
        normalAsyncPlane,
        toolCapabilityName(TASK_CREATE_TOOL_NAME),
      ),
    ).toMatchObject({
      actor: 'mode',
      reason: 'async_agent_not_permitted',
    })

    const teammatePlane = createRuntimeAgentToolCapabilityPlane({
      tools,
      isBuiltIn: true,
      isAsync: true,
      allowInProcessTeammateTools: true,
    })
    expect(
      filterToolsByRuntimeAgentCapabilityPlane(
        tools,
        teammatePlane,
      ).map(({ name }: { name: string }) => name),
    ).toEqual(['Read', TASK_CREATE_TOOL_NAME, 'mcp__docs__search'])
  })

  test('resolves agent execution mode and exact-parent inheritance declaratively', () => {
    expect(resolveRuntimeAgentExecutionMode({})).toBe('agent')
    expect(resolveRuntimeAgentExecutionMode({ isAsync: true })).toBe(
      'async_agent',
    )
    expect(resolveRuntimeAgentExecutionMode({ isTeammate: true })).toBe(
      'teammate',
    )
    expect(resolveRuntimeAgentExecutionMode({ isCoordinator: true })).toBe(
      'coordinator',
    )

    const exactParentPlane = createRuntimeAgentToolCapabilityPlane({
      tools: [tool(TASK_CREATE_TOOL_NAME)],
      isBuiltIn: true,
      isAsync: true,
      inheritanceMode: 'exact_parent',
    })

    expect(exactParentPlane.metadata).toMatchObject({
      executionMode: 'async_agent',
      inheritanceMode: 'exact_parent',
    })
    expect(
      getKernelCapabilityDenial(
        exactParentPlane,
        toolCapabilityName(TASK_CREATE_TOOL_NAME),
      ),
    ).toBeUndefined()
    expect(stripRuntimeAgentToolCapabilityPlane(exactParentPlane)).not.toHaveProperty(
      'toolNameByCapability',
    )
  })

  test('clamps agent inheritance to the parent capability plane', () => {
    const tools = [
      tool('Read'),
      tool('Bash'),
      tool('Write'),
      tool(TASK_CREATE_TOOL_NAME),
    ]
    const parentCapabilityPlane = createKernelCapabilityPlane({
      runtimeSupports: [
        toolCapabilityName('Read'),
        toolCapabilityName('Bash'),
        toolCapabilityName('Write'),
        toolCapabilityName(TASK_CREATE_TOOL_NAME),
      ],
      hostGrants: [
        toolCapabilityName('Read'),
        toolCapabilityName('Bash'),
        toolCapabilityName(TASK_CREATE_TOOL_NAME),
      ],
      modePermits: [
        toolCapabilityName('Read'),
        toolCapabilityName('Write'),
        toolCapabilityName(TASK_CREATE_TOOL_NAME),
      ],
      denies: [
        {
          capability: toolCapabilityName('Bash'),
          actor: 'host',
          reason: 'parent_capability_denied',
        },
      ],
    })

    const exactParentPlane = createRuntimeAgentToolCapabilityPlane({
      tools,
      isBuiltIn: true,
      inheritanceMode: 'exact_parent',
      parentCapabilityPlane,
    })

    expect(exactParentPlane.metadata).toMatchObject({
      inheritanceMode: 'exact_parent',
      inheritsParentCapabilityPlane: true,
    })
    expect(
      filterToolsByRuntimeAgentCapabilityPlane(
        tools,
        exactParentPlane,
      ).map(({ name }: { name: string }) => name),
    ).toEqual(['Read', TASK_CREATE_TOOL_NAME])
    expect(
      getKernelCapabilityDenial(
        exactParentPlane,
        toolCapabilityName('Bash'),
      ),
    ).toMatchObject({
      actor: 'host',
      reason: 'parent_capability_denied',
    })
    expect(
      getKernelCapabilityDenial(
        exactParentPlane,
        toolCapabilityName('Write'),
      ),
    ).toMatchObject({
      actor: 'host',
      reason: 'host_not_granted',
    })
  })

  test('projects tool policy deny rules into mode grants', () => {
    const tools = [
      tool('Bash'),
      tool('Read'),
      tool('mcp__docs__search'),
    ]
    const plane = createRuntimeToolCapabilityPlane(tools, {
      ...getEmptyToolPermissionContext(),
      alwaysDenyRules: {
        localSettings: ['Bash'],
      },
    })

    expect(
      filterToolsByRuntimeToolCapabilityPlane(
        tools,
        plane,
      ).map(({ name }: { name: string }) => name),
    ).toEqual(['Read', 'mcp__docs__search'])
    expect(getKernelCapabilityDenial(plane, toolCapabilityName('Bash'))).toEqual(
      {
        capability: 'tool:Bash',
        actor: 'mode',
        reason: 'permission_deny_rule',
        metadata: {
          source: 'localSettings',
          ruleBehavior: 'deny',
        },
      },
    )
    expect(plane.hostGrants).toContain('tool:Bash')
    expect(plane.modePermits).not.toContain('tool:Bash')
  })

  test('projects coordinator tool rules into the same capability plane', () => {
    const tools = [
      tool('Agent'),
      tool(TASK_CREATE_TOOL_NAME),
      tool('Bash'),
      tool('mcp__github__subscribe_pr_activity'),
    ]
    const plane = createRuntimeCoordinatorToolCapabilityPlane(tools)

    expect(
      filterToolsByRuntimeCoordinatorCapabilityPlane(
        tools,
        plane,
      ).map(({ name }: { name: string }) => name),
    ).toEqual([
      'Agent',
      TASK_CREATE_TOOL_NAME,
      'mcp__github__subscribe_pr_activity',
    ])
    expect(plane.metadata).toMatchObject({
      executionMode: 'coordinator',
    })
    expect(
      getKernelCapabilityDenial(plane, toolCapabilityName('Bash')),
    ).toMatchObject({
      actor: 'mode',
      reason: 'coordinator_mode_not_permitted',
    })
  })

  test('uses the tool capability plane as an execution preflight', () => {
    const denied = checkRuntimeToolCapabilityPreflight(
      [tool('Bash'), tool('Read')],
      {
        ...getEmptyToolPermissionContext(),
        alwaysDenyRules: {
          localSettings: ['Bash'],
        },
      },
      tool('Bash'),
    )

    expect(denied.denial).toMatchObject({
      capability: 'tool:Bash',
      actor: 'mode',
      reason: 'permission_deny_rule',
    })

    const allowed = checkRuntimeToolCapabilityPreflight(
      [tool('Bash'), tool('Read')],
      getEmptyToolPermissionContext(),
      tool('Read'),
    )
    expect(allowed.denial).toBeUndefined()
  })
})
