import type {
  KernelCapabilityDescriptor,
  KernelCapabilityName,
  KernelCapabilityReloadScope,
} from '../runtime/contracts/capability.js'
import {
  filterKernelCapabilities,
  groupKernelCapabilities,
  toKernelCapabilityView,
  toKernelCapabilityViews,
  type KernelCapabilityFamily,
  type KernelCapabilityFilter,
  type KernelCapabilityView,
} from './capabilities.js'

type KernelRuntimeCapabilitySource = {
  listCapabilities(): readonly KernelCapabilityDescriptor[]
  getCapability(
    name: KernelCapabilityName,
  ): KernelCapabilityDescriptor | undefined
  reloadCapabilities(
    scope?: KernelCapabilityReloadScope,
  ): Promise<readonly KernelCapabilityDescriptor[]>
}

export type KernelRuntimeCapabilities = {
  list(): readonly KernelCapabilityDescriptor[]
  views(): readonly KernelCapabilityView[]
  get(name: KernelCapabilityName): KernelCapabilityDescriptor | undefined
  getView(name: KernelCapabilityName): KernelCapabilityView | undefined
  filter(filter?: KernelCapabilityFilter): readonly KernelCapabilityDescriptor[]
  groupByFamily(): Record<KernelCapabilityFamily, readonly KernelCapabilityDescriptor[]>
  listByFamily(family: KernelCapabilityFamily): readonly KernelCapabilityDescriptor[]
  reload(
    scope?: KernelCapabilityReloadScope,
  ): Promise<readonly KernelCapabilityDescriptor[]>
}

export type KernelRuntimeCapabilityContainer = {
  readonly capabilities: KernelRuntimeCapabilities
}

export function createKernelRuntimeCapabilitiesFacade(
  runtime: KernelRuntimeCapabilitySource,
): KernelRuntimeCapabilities {
  return {
    list: () => runtime.listCapabilities(),
    views: () => toKernelCapabilityViews(runtime.listCapabilities()),
    get: name => runtime.getCapability(name),
    getView: name => {
      const descriptor = runtime.getCapability(name)
      return descriptor ? toKernelCapabilityView(descriptor) : undefined
    },
    filter: (filter: KernelCapabilityFilter = {}) =>
      filterKernelCapabilities(runtime.listCapabilities(), filter),
    groupByFamily: () => groupKernelCapabilities(runtime.listCapabilities()),
    listByFamily: (family: KernelCapabilityFamily) =>
      filterKernelCapabilities(runtime.listCapabilities(), { family }),
    reload: scope => runtime.reloadCapabilities(scope),
  }
}

export function resolveKernelRuntimeCapabilities(
  source:
    | KernelRuntimeCapabilityContainer
    | KernelRuntimeCapabilities
    | readonly KernelCapabilityDescriptor[],
): readonly KernelCapabilityView[] {
  if (isKernelCapabilityDescriptorList(source)) {
    return toKernelCapabilityViews(source)
  }
  return getKernelRuntimeCapabilities(source).views()
}

export async function reloadKernelRuntimeCapabilities(
  source: KernelRuntimeCapabilityContainer | KernelRuntimeCapabilities,
  scope?: KernelCapabilityReloadScope,
): Promise<readonly KernelCapabilityView[]> {
  const descriptors = await getKernelRuntimeCapabilities(source).reload(scope)
  return toKernelCapabilityViews(descriptors)
}

function getKernelRuntimeCapabilities(
  source: KernelRuntimeCapabilityContainer | KernelRuntimeCapabilities,
): KernelRuntimeCapabilities {
  return hasKernelRuntime(source) ? source.capabilities : source
}

function hasKernelRuntime(
  source: KernelRuntimeCapabilityContainer | KernelRuntimeCapabilities,
): source is KernelRuntimeCapabilityContainer {
  return 'capabilities' in source
}

function isKernelCapabilityDescriptorList(
  source:
    | KernelRuntimeCapabilityContainer
    | KernelRuntimeCapabilities
    | readonly KernelCapabilityDescriptor[],
): source is readonly KernelCapabilityDescriptor[] {
  return Array.isArray(source)
}
