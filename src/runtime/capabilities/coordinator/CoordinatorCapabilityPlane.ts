import { COORDINATOR_MODE_ALLOWED_TOOLS } from '../../../constants/tools.js'
import type { Tool, Tools } from '../../../Tool.js'
import type {
  KernelCapabilityName,
  KernelCapabilityPlane,
  KernelCapabilityPlaneDenial,
} from '../../contracts/capability.js'
import {
  createKernelCapabilityPlane,
  isKernelCapabilityPermitted,
  toolCapabilityName,
} from '../CapabilityPlane.js'

const PR_ACTIVITY_TOOL_SUFFIXES = [
  'subscribe_pr_activity',
  'unsubscribe_pr_activity',
]

export type RuntimeCoordinatorToolCapabilityPlane = KernelCapabilityPlane & {
  toolNameByCapability: ReadonlyMap<KernelCapabilityName, string>
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
  const toolNameByCapability = new Map<KernelCapabilityName, string>()
  const runtimeSupports: KernelCapabilityName[] = []
  const hostGrants: KernelCapabilityName[] = []
  const modePermits: KernelCapabilityName[] = []
  const denies: KernelCapabilityPlaneDenial[] = []

  for (const tool of tools) {
    const capability = toolCapabilityName(tool.name)
    toolNameByCapability.set(capability, tool.name)
    runtimeSupports.push(capability)
    hostGrants.push(capability)
    if (isCoordinatorToolPermitted(tool)) {
      modePermits.push(capability)
      continue
    }
    denies.push({
      capability,
      actor: 'mode',
      reason: 'coordinator_mode_not_permitted',
    })
  }

  return {
    ...createKernelCapabilityPlane({
      runtimeSupports,
      hostGrants,
      modePermits,
      denies,
      metadata: {
        executionMode: 'coordinator',
      },
    }),
    toolNameByCapability,
  }
}

export function filterToolsByRuntimeCoordinatorCapabilityPlane(
  tools: Tools,
  plane: RuntimeCoordinatorToolCapabilityPlane,
): Tools {
  return tools.filter(tool =>
    isKernelCapabilityPermitted(plane, toolCapabilityName(tool.name)),
  )
}

export function stripRuntimeCoordinatorToolCapabilityPlane(
  plane: RuntimeCoordinatorToolCapabilityPlane,
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
