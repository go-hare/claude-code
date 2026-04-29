import type {
  KernelCapabilityDescriptor,
  KernelCapabilityName,
  KernelCapabilityStatus,
} from '../runtime/contracts/capability.js'

export const KERNEL_CAPABILITY_FAMILIES = [
  'core',
  'execution',
  'model',
  'extension',
  'security',
  'host',
  'autonomy',
  'observability',
] as const

export type KernelCapabilityFamily = (typeof KERNEL_CAPABILITY_FAMILIES)[number]

export type KernelCapabilityView = KernelCapabilityDescriptor & {
  family: KernelCapabilityFamily
  ready: boolean
  unavailable: boolean
  optional: boolean
  loaded: boolean
}

export type KernelCapabilityFilter = {
  names?: readonly KernelCapabilityName[]
  family?: KernelCapabilityFamily | readonly KernelCapabilityFamily[]
  status?: KernelCapabilityStatus | readonly KernelCapabilityStatus[]
  lazy?: boolean
  reloadable?: boolean
  optional?: boolean
  unavailable?: boolean
}

export type KernelCapabilityGroups = Record<
  KernelCapabilityFamily,
  readonly KernelCapabilityView[]
>

const CAPABILITY_FAMILY_BY_NAME: Record<string, KernelCapabilityFamily> = {
  agents: 'extension',
  auth: 'security',
  background: 'host',
  bridge: 'host',
  commands: 'extension',
  companion: 'autonomy',
  coordinator: 'extension',
  context: 'execution',
  conversation: 'execution',
  daemon: 'host',
  events: 'core',
  execution: 'execution',
  hooks: 'extension',
  kairos: 'autonomy',
  logs: 'observability',
  mcp: 'extension',
  memory: 'execution',
  permissions: 'security',
  plugins: 'extension',
  provider: 'model',
  runtime: 'core',
  server: 'host',
  sessions: 'execution',
  skills: 'extension',
  tasks: 'extension',
  teams: 'extension',
  tools: 'extension',
  turn: 'execution',
}

export function getKernelCapabilityFamily(
  capability: KernelCapabilityDescriptor | KernelCapabilityName,
): KernelCapabilityFamily {
  const name = typeof capability === 'string' ? capability : capability.name
  return CAPABILITY_FAMILY_BY_NAME[name] ?? 'extension'
}

export function toKernelCapabilityView(
  descriptor: KernelCapabilityDescriptor,
): KernelCapabilityView {
  return {
    ...descriptor,
    family: getKernelCapabilityFamily(descriptor),
    ready: descriptor.status === 'ready',
    unavailable:
      descriptor.status === 'disabled' || descriptor.status === 'failed',
    optional: descriptor.metadata?.optional === true,
    loaded: descriptor.status === 'ready',
  }
}

export function toKernelCapabilityViews(
  descriptors: readonly KernelCapabilityDescriptor[],
): readonly KernelCapabilityView[] {
  return descriptors.map(toKernelCapabilityView).sort(compareCapabilityViews)
}

export function filterKernelCapabilities(
  descriptors: readonly KernelCapabilityDescriptor[],
  filter: KernelCapabilityFilter = {},
): readonly KernelCapabilityView[] {
  return toKernelCapabilityViews(descriptors).filter(view =>
    matchesCapabilityFilter(view, filter),
  )
}

export function groupKernelCapabilities(
  descriptors: readonly KernelCapabilityDescriptor[],
): KernelCapabilityGroups {
  const groups = createEmptyCapabilityGroups()
  for (const view of toKernelCapabilityViews(descriptors)) {
    groups[view.family] = [...groups[view.family], view]
  }
  return groups
}

export function isKernelCapabilityReady(
  descriptor: KernelCapabilityDescriptor,
): boolean {
  return descriptor.status === 'ready'
}

export function isKernelCapabilityUnavailable(
  descriptor: KernelCapabilityDescriptor,
): boolean {
  return descriptor.status === 'disabled' || descriptor.status === 'failed'
}

function matchesCapabilityFilter(
  view: KernelCapabilityView,
  filter: KernelCapabilityFilter,
): boolean {
  if (filter.names && !filter.names.includes(view.name)) {
    return false
  }
  if (filter.family && !asArray(filter.family).includes(view.family)) {
    return false
  }
  if (filter.status && !asArray(filter.status).includes(view.status)) {
    return false
  }
  if (filter.lazy !== undefined && view.lazy !== filter.lazy) {
    return false
  }
  if (
    filter.reloadable !== undefined &&
    view.reloadable !== filter.reloadable
  ) {
    return false
  }
  if (filter.optional !== undefined && view.optional !== filter.optional) {
    return false
  }
  if (
    filter.unavailable !== undefined &&
    view.unavailable !== filter.unavailable
  ) {
    return false
  }
  return true
}

function createEmptyCapabilityGroups(): KernelCapabilityGroups {
  return Object.fromEntries(
    KERNEL_CAPABILITY_FAMILIES.map(family => [family, []]),
  ) as unknown as KernelCapabilityGroups
}

function compareCapabilityViews(
  left: KernelCapabilityView,
  right: KernelCapabilityView,
): number {
  const familyOrder =
    KERNEL_CAPABILITY_FAMILIES.indexOf(left.family) -
    KERNEL_CAPABILITY_FAMILIES.indexOf(right.family)
  return familyOrder === 0 ? left.name.localeCompare(right.name) : familyOrder
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [value as T]
}
