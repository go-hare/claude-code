import { AGENT_TOOL_NAME } from '@go-hare/builtin-tools/tools/AgentTool/constants.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '@go-hare/builtin-tools/tools/ExitPlanModeTool/constants.js'
import {
  ALL_AGENT_DISALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  IN_PROCESS_TEAMMATE_ALLOWED_TOOLS,
} from '../../../constants/tools.js'
import type { Tool, Tools } from '../../../Tool.js'
import type { PermissionMode } from '../../../utils/permissions/PermissionMode.js'
import type {
  KernelCapabilityName,
  KernelCapabilityPlane,
  KernelCapabilityPlaneDenial,
} from '../../contracts/capability.js'
import type { KernelExecutionMode } from '../../contracts/turn.js'
import {
  createKernelCapabilityPlane,
  isKernelCapabilityPermitted,
  toolCapabilityName,
} from '../CapabilityPlane.js'

export type RuntimeAgentCapabilityInheritanceMode =
  | 'isolated'
  | 'parent_context'
  | 'exact_parent'

export type RuntimeAgentExecutionModeOptions = {
  executionMode?: KernelExecutionMode
  isAsync?: boolean
  isTeammate?: boolean
  isCoordinator?: boolean
}

export type RuntimeAgentToolCapabilityPlaneOptions = {
  tools: Tools
  isBuiltIn: boolean
  parentCapabilityPlane?: KernelCapabilityPlane
  isAsync?: boolean
  isTeammate?: boolean
  isCoordinator?: boolean
  executionMode?: KernelExecutionMode
  inheritanceMode?: RuntimeAgentCapabilityInheritanceMode
  permissionMode?: PermissionMode
  allowInProcessTeammateTools?: boolean
  matchesToolName?: (tool: Tool, name: string) => boolean
}

export type RuntimeAgentToolCapabilityPlane = KernelCapabilityPlane & {
  toolNameByCapability: ReadonlyMap<KernelCapabilityName, string>
}

export function resolveRuntimeAgentExecutionMode(
  options: RuntimeAgentExecutionModeOptions,
): KernelExecutionMode {
  if (options.executionMode) {
    return options.executionMode
  }
  if (options.isCoordinator) {
    return 'coordinator'
  }
  if (options.isTeammate) {
    return 'teammate'
  }
  if (options.isAsync) {
    return 'async_agent'
  }
  return 'agent'
}

export function createRuntimeAgentToolCapabilityPlane(
  options: RuntimeAgentToolCapabilityPlaneOptions,
): RuntimeAgentToolCapabilityPlane {
  const executionMode = resolveRuntimeAgentExecutionMode(options)
  const inheritanceMode = options.inheritanceMode ?? 'isolated'
  const toolNameByCapability = new Map<KernelCapabilityName, string>()
  const runtimeSupports: KernelCapabilityName[] = []
  const hostGrants: KernelCapabilityName[] = []
  const modePermits: KernelCapabilityName[] = []
  const denies: KernelCapabilityPlaneDenial[] = []

  for (const tool of options.tools) {
    const capability = toolCapabilityName(tool.name)
    toolNameByCapability.set(capability, tool.name)
    runtimeSupports.push(capability)

    const denial = getAgentToolDenial(tool, capability, options)
    const parentDenial = getParentCapabilityDenial(
      capability,
      options.parentCapabilityPlane,
    )
    if (parentDenial) {
      denies.push(parentDenial)
    }
    if (isParentCapabilityGranted('hostGrants', capability, options)) {
      hostGrants.push(capability)
    }
    if (denial) {
      denies.push(denial)
      continue
    }
    if (isParentCapabilityGranted('modePermits', capability, options)) {
      modePermits.push(capability)
    }
  }

  return {
    ...createKernelCapabilityPlane({
      runtimeSupports,
      hostGrants,
      modePermits,
      denies,
      metadata: {
        executionMode,
        inheritanceMode,
        isBuiltIn: options.isBuiltIn,
        permissionMode: options.permissionMode,
        allowInProcessTeammateTools: options.allowInProcessTeammateTools,
        inheritsParentCapabilityPlane: options.parentCapabilityPlane !== undefined,
      },
    }),
    toolNameByCapability,
  }
}

export function filterToolsByRuntimeAgentCapabilityPlane(
  tools: Tools,
  plane: RuntimeAgentToolCapabilityPlane,
): Tools {
  return tools.filter(tool =>
    isKernelCapabilityPermitted(plane, toolCapabilityName(tool.name)),
  )
}

function getAgentToolDenial(
  tool: Tool,
  capability: KernelCapabilityName,
  options: RuntimeAgentToolCapabilityPlaneOptions,
): KernelCapabilityPlaneDenial | undefined {
  if (options.inheritanceMode === 'exact_parent') {
    return undefined
  }
  if (tool.name.startsWith('mcp__')) {
    return undefined
  }
  if (isPlanModeExitTool(tool, options)) {
    return undefined
  }
  if (ALL_AGENT_DISALLOWED_TOOLS.has(tool.name)) {
    return {
      capability,
      actor: 'agent',
      reason: 'agent_global_disallow',
    }
  }
  if (!options.isBuiltIn && CUSTOM_AGENT_DISALLOWED_TOOLS.has(tool.name)) {
    return {
      capability,
      actor: 'agent',
      reason: 'custom_agent_disallow',
    }
  }
  if (options.isAsync && !ASYNC_AGENT_ALLOWED_TOOLS.has(tool.name)) {
    if (options.allowInProcessTeammateTools) {
      if (matchesToolName(tool, AGENT_TOOL_NAME, options)) {
        return undefined
      }
      if (IN_PROCESS_TEAMMATE_ALLOWED_TOOLS.has(tool.name)) {
        return undefined
      }
    }
    return {
      capability,
      actor: 'mode',
      reason: 'async_agent_not_permitted',
    }
  }
  return undefined
}

export function stripRuntimeAgentToolCapabilityPlane(
  plane: RuntimeAgentToolCapabilityPlane,
): KernelCapabilityPlane {
  const stripped: KernelCapabilityPlane = {
    runtimeSupports: plane.runtimeSupports,
    hostGrants: plane.hostGrants,
    modePermits: plane.modePermits,
    toolRequires: plane.toolRequires,
  }
  if (plane.denies) {
    stripped.denies = plane.denies
  }
  if (plane.metadata) {
    stripped.metadata = plane.metadata
  }
  return stripped
}

function isPlanModeExitTool(
  tool: Tool,
  options: RuntimeAgentToolCapabilityPlaneOptions,
): boolean {
  return (
    options.permissionMode === 'plan' &&
    matchesToolName(tool, EXIT_PLAN_MODE_V2_TOOL_NAME, options)
  )
}

function matchesToolName(
  tool: Tool,
  name: string,
  options: RuntimeAgentToolCapabilityPlaneOptions,
): boolean {
  return options.matchesToolName
    ? options.matchesToolName(tool, name)
    : tool.name === name
}

function getParentCapabilityDenial(
  capability: KernelCapabilityName,
  parentCapabilityPlane: KernelCapabilityPlane | undefined,
): KernelCapabilityPlaneDenial | undefined {
  return parentCapabilityPlane?.denies?.find(
    denial => denial.capability === capability,
  )
}

function isParentCapabilityGranted(
  field: 'hostGrants' | 'modePermits',
  capability: KernelCapabilityName,
  options: RuntimeAgentToolCapabilityPlaneOptions,
): boolean {
  const parentCapabilityPlane = options.parentCapabilityPlane
  if (!parentCapabilityPlane) {
    return true
  }
  return parentCapabilityPlane[field].includes(capability)
}
