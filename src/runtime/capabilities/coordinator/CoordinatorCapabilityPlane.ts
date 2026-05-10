import { COORDINATOR_MODE_ALLOWED_TOOLS } from '../../../constants/tools.js'
import type { Tool, Tools } from '../../../Tool.js'
import type {
  RuntimeCapabilityName,
  RuntimeCapabilityPlane,
  RuntimeCapabilityPlaneDenial,
} from '../../contracts/capability.js'
import {
  createRuntimeCapabilityPlane,
  isRuntimeCapabilityPermitted,
  toolCapabilityName,
} from '../CapabilityPlane.js'

const PR_ACTIVITY_TOOL_SUFFIXES = [
  'subscribe_pr_activity',
  'unsubscribe_pr_activity',
]

export type RuntimeCoordinatorToolCapabilityPlane = RuntimeCapabilityPlane & {
  toolNameByCapability: ReadonlyMap<RuntimeCapabilityName, string>
}

export function isPrActivitySubscriptionTool(name: string): boolean {
  return PR_ACTIVITY_TOOL_SUFFIXES.some(suffix => name.endsWith(suffix))
}

export function isCoordinatorToolPermitted(tool: Tool): boolean {
  return (
    COORDINATOR_MODE_ALLOWED_TOOLS.has(tool.name) ||
    isPrActivitySubscriptionTool(tool.name)
  )
}

export function createRuntimeCoordinatorToolCapabilityPlane(
  tools: Tools,
): RuntimeCoordinatorToolCapabilityPlane {
  const toolNameByCapability = new Map<RuntimeCapabilityName, string>()
  const runtimeSupports: RuntimeCapabilityName[] = []
  const hostGrants: RuntimeCapabilityName[] = []
  const modePermits: RuntimeCapabilityName[] = []
  const denies: RuntimeCapabilityPlaneDenial[] = []

  for (const tool of tools) {
    const capability = toolCapabilityName(tool.name)
    toolNameByCapability.set(capability, tool.name)
    runtimeSupports.push(capability)
    hostGrants.push(capability)
    if (isCoordinatorToolPermitted(tool)) {
      modePermits.push(capability)
    } else {
      denies.push({
        capability,
        actor: 'mode',
        reason: 'coordinator_mode_not_permitted',
      })
    }
  }

  return {
    ...createRuntimeCapabilityPlane({
      runtimeSupports,
      hostGrants,
      modePermits,
      denies,
      metadata: { executionMode: 'coordinator' },
    }),
    toolNameByCapability,
  }
}

export function filterToolsByRuntimeCoordinatorCapabilityPlane(
  tools: Tools,
  plane: RuntimeCoordinatorToolCapabilityPlane,
): Tools {
  return tools.filter(tool =>
    isRuntimeCapabilityPermitted(plane, toolCapabilityName(tool.name)),
  )
}

export function stripRuntimeCoordinatorToolCapabilityPlane(
  plane: RuntimeCoordinatorToolCapabilityPlane,
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
