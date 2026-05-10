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
  RuntimeCapabilityName,
  RuntimeCapabilityPlane,
  RuntimeCapabilityPlaneDenial,
} from '../../contracts/capability.js'
import type { RuntimeExecutionMode } from '../../contracts/execution.js'
import {
  createRuntimeCapabilityPlane,
  isRuntimeCapabilityPermitted,
  toolCapabilityName,
} from '../CapabilityPlane.js'

export type RuntimeAgentCapabilityInheritanceMode =
  | 'isolated'
  | 'parent_context'
  | 'exact_parent'

export type RuntimeAgentExecutionModeOptions = {
  executionMode?: RuntimeExecutionMode
  isAsync?: boolean
  isTeammate?: boolean
  isCoordinator?: boolean
}

export type RuntimeAgentToolCapabilityPlaneOptions = {
  tools: Tools
  isBuiltIn: boolean
  parentCapabilityPlane?: RuntimeCapabilityPlane
  isAsync?: boolean
  isTeammate?: boolean
  isCoordinator?: boolean
  executionMode?: RuntimeExecutionMode
  inheritanceMode?: RuntimeAgentCapabilityInheritanceMode
  permissionMode?: PermissionMode
  allowInProcessTeammateTools?: boolean
  matchesToolName?: (tool: Tool, name: string) => boolean
}

export type RuntimeAgentToolCapabilityPlane = RuntimeCapabilityPlane & {
  toolNameByCapability: ReadonlyMap<RuntimeCapabilityName, string>
}

export function resolveRuntimeAgentExecutionMode(
  options: RuntimeAgentExecutionModeOptions,
): RuntimeExecutionMode {
  if (options.executionMode) return options.executionMode
  if (options.isCoordinator) return 'coordinator'
  if (options.isTeammate) return 'teammate'
  if (options.isAsync) return 'async_agent'
  return 'agent'
}

export function createRuntimeAgentToolCapabilityPlane(
  options: RuntimeAgentToolCapabilityPlaneOptions,
): RuntimeAgentToolCapabilityPlane {
  const executionMode = resolveRuntimeAgentExecutionMode(options)
  const inheritanceMode = options.inheritanceMode ?? 'isolated'
  const toolNameByCapability = new Map<RuntimeCapabilityName, string>()
  const runtimeSupports: RuntimeCapabilityName[] = []
  const hostGrants: RuntimeCapabilityName[] = []
  const modePermits: RuntimeCapabilityName[] = []
  const denies: RuntimeCapabilityPlaneDenial[] = []

  for (const tool of options.tools) {
    const capability = toolCapabilityName(tool.name)
    toolNameByCapability.set(capability, tool.name)
    runtimeSupports.push(capability)

    const parentDenial = options.parentCapabilityPlane?.denies?.find(
      denial => denial.capability === capability,
    )
    if (parentDenial) denies.push(parentDenial)
    if (isParentCapabilityGranted('hostGrants', capability, options)) {
      hostGrants.push(capability)
    }

    const denial = getAgentToolDenial(tool, capability, options)
    if (denial) {
      denies.push(denial)
      continue
    }
    if (isParentCapabilityGranted('modePermits', capability, options)) {
      modePermits.push(capability)
    }
  }

  return {
    ...createRuntimeCapabilityPlane({
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
    isRuntimeCapabilityPermitted(plane, toolCapabilityName(tool.name)),
  )
}

export function stripRuntimeAgentToolCapabilityPlane(
  plane: RuntimeAgentToolCapabilityPlane,
): RuntimeCapabilityPlane {
  const stripped: RuntimeCapabilityPlane = {
    runtimeSupports: plane.runtimeSupports,
    hostGrants: plane.hostGrants,
    modePermits: plane.modePermits,
    toolRequires: plane.toolRequires,
  }
  if (plane.denies) stripped.denies = plane.denies
  if (plane.metadata) stripped.metadata = plane.metadata
  return stripped
}

function getAgentToolDenial(
  tool: Tool,
  capability: RuntimeCapabilityName,
  options: RuntimeAgentToolCapabilityPlaneOptions,
): RuntimeCapabilityPlaneDenial | undefined {
  if (options.inheritanceMode === 'exact_parent') return undefined
  if (tool.name.startsWith('mcp__')) return undefined
  if (
    options.permissionMode === 'plan' &&
    matchesToolName(tool, EXIT_PLAN_MODE_V2_TOOL_NAME, options)
  ) {
    return undefined
  }
  if (ALL_AGENT_DISALLOWED_TOOLS.has(tool.name)) {
    return { capability, actor: 'agent', reason: 'agent_global_disallow' }
  }
  if (!options.isBuiltIn && CUSTOM_AGENT_DISALLOWED_TOOLS.has(tool.name)) {
    return { capability, actor: 'agent', reason: 'custom_agent_disallow' }
  }
  if (options.isAsync && !ASYNC_AGENT_ALLOWED_TOOLS.has(tool.name)) {
    if (options.allowInProcessTeammateTools) {
      if (matchesToolName(tool, AGENT_TOOL_NAME, options)) return undefined
      if (IN_PROCESS_TEAMMATE_ALLOWED_TOOLS.has(tool.name)) return undefined
    }
    return { capability, actor: 'mode', reason: 'async_agent_not_permitted' }
  }
  return undefined
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

function isParentCapabilityGranted(
  field: 'hostGrants' | 'modePermits',
  capability: RuntimeCapabilityName,
  options: RuntimeAgentToolCapabilityPlaneOptions,
): boolean {
  const parentCapabilityPlane = options.parentCapabilityPlane
  if (!parentCapabilityPlane) return true
  return parentCapabilityPlane[field].includes(capability)
}
