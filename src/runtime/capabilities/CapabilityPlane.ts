import type {
  RuntimeCapabilityName,
  RuntimeCapabilityPlane,
  RuntimeCapabilityPlaneDenial,
} from '../contracts/capability.js'

export type RuntimeCapabilityPlaneInput = {
  runtimeSupports?: readonly RuntimeCapabilityName[]
  hostGrants?: readonly RuntimeCapabilityName[]
  modePermits?: readonly RuntimeCapabilityName[]
  toolRequires?: readonly RuntimeCapabilityName[]
  denies?: readonly RuntimeCapabilityPlaneDenial[]
  metadata?: Record<string, unknown>
}

export function createRuntimeCapabilityPlane(
  input: RuntimeCapabilityPlaneInput,
): RuntimeCapabilityPlane {
  const plane: RuntimeCapabilityPlane = {
    runtimeSupports: uniqueSorted(input.runtimeSupports ?? []),
    hostGrants: uniqueSorted(input.hostGrants ?? []),
    modePermits: uniqueSorted(input.modePermits ?? []),
    toolRequires: uniqueSorted(input.toolRequires ?? []),
  }
  const withMetadata = input.metadata
    ? { ...plane, metadata: input.metadata }
    : plane
  return input.denies
    ? { ...withMetadata, denies: [...input.denies] }
    : withMetadata
}

export function isRuntimeCapabilityPermitted(
  plane: RuntimeCapabilityPlane,
  capability: RuntimeCapabilityName,
): boolean {
  if (plane.denies?.some(denial => denial.capability === capability)) {
    return false
  }
  return (
    plane.runtimeSupports.includes(capability) &&
    plane.hostGrants.includes(capability) &&
    plane.modePermits.includes(capability)
  )
}

export function toolCapabilityName(toolName: string): RuntimeCapabilityName {
  return `tool:${toolName}`
}

function uniqueSorted(
  values: readonly RuntimeCapabilityName[],
): readonly RuntimeCapabilityName[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}
