import type {
  KernelCapabilityName,
  KernelCapabilityPlane,
  KernelCapabilityPlaneDenial,
} from '../contracts/capability.js'

export type RuntimeCapabilityPlaneInput = {
  runtimeSupports?: readonly KernelCapabilityName[]
  hostGrants?: readonly KernelCapabilityName[]
  modePermits?: readonly KernelCapabilityName[]
  toolRequires?: readonly KernelCapabilityName[]
  denies?: readonly KernelCapabilityPlaneDenial[]
  metadata?: Record<string, unknown>
}

export function createKernelCapabilityPlane(
  input: RuntimeCapabilityPlaneInput,
): KernelCapabilityPlane {
  const plane: KernelCapabilityPlane = {
    runtimeSupports: uniqueSorted(input.runtimeSupports ?? []),
    hostGrants: uniqueSorted(input.hostGrants ?? []),
    modePermits: uniqueSorted(input.modePermits ?? []),
    toolRequires: uniqueSorted(input.toolRequires ?? []),
  }
  if (input.denies) {
    return input.metadata
      ? { ...plane, denies: [...input.denies], metadata: input.metadata }
      : { ...plane, denies: [...input.denies] }
  }
  return input.metadata ? { ...plane, metadata: input.metadata } : plane
}

export function isKernelCapabilityPermitted(
  plane: KernelCapabilityPlane,
  capability: KernelCapabilityName,
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

export function getKernelCapabilityDenial(
  plane: KernelCapabilityPlane,
  capability: KernelCapabilityName,
): KernelCapabilityPlaneDenial | undefined {
  if (!plane.runtimeSupports.includes(capability)) {
    return {
      capability,
      actor: 'runtime',
      reason: 'runtime_unsupported',
    }
  }
  const explicitDenial = plane.denies?.find(
    denial => denial.capability === capability,
  )
  if (explicitDenial) {
    return explicitDenial
  }
  if (!plane.hostGrants.includes(capability)) {
    return {
      capability,
      actor: 'host',
      reason: 'host_not_granted',
    }
  }
  if (!plane.modePermits.includes(capability)) {
    return {
      capability,
      actor: 'mode',
      reason: 'mode_not_permitted',
    }
  }
  return undefined
}

export function toolCapabilityName(toolName: string): KernelCapabilityName {
  return `tool:${toolName}`
}

function uniqueSorted(
  values: readonly KernelCapabilityName[],
): readonly KernelCapabilityName[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}
