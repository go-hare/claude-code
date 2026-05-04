import type {
  KernelCapabilityName,
  KernelCapabilityPlane,
  KernelCapabilityPlaneDenial,
} from '../../contracts/capability.js'
import type { ToolPermissionContext } from '../../../Tool.js'
import { getDenyRuleForTool } from '../../../utils/permissions/permissions.js'
import {
  createKernelCapabilityPlane,
  getKernelCapabilityDenial,
  isKernelCapabilityPermitted,
  toolCapabilityName,
} from '../CapabilityPlane.js'

export type RuntimeToolCapability = {
  name: string
  mcpInfo?: { serverName: string; toolName: string }
}

export type RuntimeToolCapabilityPlane = KernelCapabilityPlane & {
  toolNameByCapability: ReadonlyMap<KernelCapabilityName, string>
}

export type RuntimeToolCapabilityPreflight = {
  capability: KernelCapabilityName
  plane: RuntimeToolCapabilityPlane
  denial?: KernelCapabilityPlaneDenial
}

export function createRuntimeToolCapabilityPlane<
  T extends RuntimeToolCapability,
>(
  tools: readonly T[],
  permissionContext: ToolPermissionContext,
): RuntimeToolCapabilityPlane {
  const toolNameByCapability = new Map<KernelCapabilityName, string>()
  const runtimeSupports: KernelCapabilityName[] = []
  const hostGrants: KernelCapabilityName[] = []
  const modePermits: KernelCapabilityName[] = []
  const toolRequires: KernelCapabilityName[] = []
  const denies: KernelCapabilityPlaneDenial[] = []

  for (const tool of tools) {
    const capability = toolCapabilityName(tool.name)
    toolNameByCapability.set(capability, tool.name)
    runtimeSupports.push(capability)
    hostGrants.push(capability)
    toolRequires.push(capability)

    const denyRule = getDenyRuleForTool(permissionContext, tool)
    if (denyRule) {
      denies.push({
        capability,
        actor: 'mode',
        reason: 'permission_deny_rule',
        metadata: {
          source: denyRule.source,
          ruleBehavior: denyRule.ruleBehavior,
        },
      })
      continue
    }

    modePermits.push(capability)
  }

  return {
    ...createKernelCapabilityPlane({
      runtimeSupports,
      hostGrants,
      modePermits,
      toolRequires,
      denies,
      metadata: {
        source: 'tool_policy',
      },
    }),
    toolNameByCapability,
  }
}

export function filterToolsByRuntimeToolCapabilityPlane<
  T extends RuntimeToolCapability,
>(tools: readonly T[], plane: RuntimeToolCapabilityPlane): T[] {
  return tools.filter(tool =>
    isKernelCapabilityPermitted(plane, toolCapabilityName(tool.name)),
  )
}

export function checkRuntimeToolCapabilityPreflight<
  T extends RuntimeToolCapability,
>(
  tools: readonly T[],
  permissionContext: ToolPermissionContext,
  tool: T,
): RuntimeToolCapabilityPreflight {
  const plane = createRuntimeToolCapabilityPlane(tools, permissionContext)
  const capability = toolCapabilityName(tool.name)
  return {
    capability,
    plane,
    denial: getKernelCapabilityDenial(plane, capability),
  }
}
