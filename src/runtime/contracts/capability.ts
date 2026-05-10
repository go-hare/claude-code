export type RuntimeCapabilityName = string

export type RuntimeCapabilityPlaneDenial = {
  capability: RuntimeCapabilityName
  actor: 'runtime' | 'host' | 'mode' | 'tool' | 'agent'
  reason: string
  metadata?: Record<string, unknown>
}

export type RuntimeCapabilityPlane = {
  runtimeSupports: readonly RuntimeCapabilityName[]
  hostGrants: readonly RuntimeCapabilityName[]
  modePermits: readonly RuntimeCapabilityName[]
  toolRequires: readonly RuntimeCapabilityName[]
  denies?: readonly RuntimeCapabilityPlaneDenial[]
  metadata?: Record<string, unknown>
}
