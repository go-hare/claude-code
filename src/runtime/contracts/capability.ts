import type { RuntimeProviderSelection } from './provider.js'

export type KernelCapabilityName = string

export type KernelCapabilityStatus =
  | 'declared'
  | 'loading'
  | 'ready'
  | 'degraded'
  | 'failed'
  | 'disabled'

export type KernelCapabilityError = {
  code: string
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export type KernelCapabilityUnavailableCode =
  | 'CAPABILITY_NOT_FOUND'
  | 'CAPABILITY_DISABLED'
  | 'CAPABILITY_FAILED'
  | 'CAPABILITY_UNAVAILABLE'

export type KernelCapabilityDescriptor = {
  name: KernelCapabilityName
  status: KernelCapabilityStatus
  lazy: boolean
  dependencies: readonly KernelCapabilityName[]
  reloadable: boolean
  error?: KernelCapabilityError
  metadata?: Record<string, unknown>
}

export type KernelCapabilityPlaneDenial = {
  capability: KernelCapabilityName
  actor: 'runtime' | 'host' | 'mode' | 'tool' | 'agent'
  reason: string
  metadata?: Record<string, unknown>
}

export type KernelCapabilityPlane = {
  runtimeSupports: readonly KernelCapabilityName[]
  hostGrants: readonly KernelCapabilityName[]
  modePermits: readonly KernelCapabilityName[]
  toolRequires: readonly KernelCapabilityName[]
  denies?: readonly KernelCapabilityPlaneDenial[]
  metadata?: Record<string, unknown>
}

export type KernelCapabilityReloadScope =
  | { type: 'capability'; name: KernelCapabilityName }
  | { type: 'dependency-closure'; name: KernelCapabilityName }
  | { type: 'workspace' }
  | { type: 'runtime' }

export type KernelRuntimeCapabilityReloadRequest = {
  scope: KernelCapabilityReloadScope
}

export type KernelRuntimeCapabilityIntent = {
  capabilities?: readonly KernelCapabilityName[]
  requiredCapabilities?: readonly KernelCapabilityName[]
  require?: readonly KernelCapabilityName[] | KernelCapabilityName
  requires?: readonly KernelCapabilityName[] | KernelCapabilityName
  load?: readonly KernelCapabilityName[] | KernelCapabilityName
  provider?: RuntimeProviderSelection
  [key: string]: unknown
}

export type KernelResolvedRuntimeCapabilities = {
  descriptors: readonly KernelCapabilityDescriptor[]
}
