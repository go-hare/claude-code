import type {
  RuntimePluginComponents,
  RuntimePluginDescriptor,
  RuntimePluginErrorDescriptor,
  RuntimePluginInstallRequest,
  RuntimePluginMutationResult,
  RuntimePluginScope,
  RuntimePluginSetEnabledRequest,
  RuntimePluginStatus,
  RuntimePluginUninstallRequest,
  RuntimePluginUpdateRequest,
} from '../runtime/contracts/plugin.js'
import type { KernelRuntimeEventReplayOptions } from './runtime.js'
import type { KernelRuntimePluginEvent } from './runtimeEvents.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import { collectReplayEvents, expectPayload } from './runtimeEnvelope.js'
import {
  isKernelPluginsEnabledChangedEvent,
  isKernelPluginsInstalledEvent,
  isKernelPluginsReloadedEvent,
  isKernelPluginsUninstalledEvent,
  isKernelPluginsUpdatedEvent,
} from './runtimeEvents.js'

export type KernelPluginComponents = RuntimePluginComponents
export type KernelPluginDescriptor = RuntimePluginDescriptor
export type KernelPluginErrorDescriptor = RuntimePluginErrorDescriptor
export type KernelPluginInstallRequest = RuntimePluginInstallRequest
export type KernelPluginMutationResult = RuntimePluginMutationResult
export type KernelPluginScope = RuntimePluginScope
export type KernelPluginSetEnabledRequest = RuntimePluginSetEnabledRequest
export type KernelPluginStatus = RuntimePluginStatus
export type KernelPluginUninstallRequest = RuntimePluginUninstallRequest
export type KernelPluginUpdateRequest = RuntimePluginUpdateRequest

export type KernelPluginSnapshot = {
  plugins: readonly KernelPluginDescriptor[]
  errors: readonly KernelPluginErrorDescriptor[]
}

export type KernelPluginFilter = {
  names?: readonly string[]
  source?: string | readonly string[]
  status?: RuntimePluginStatus | readonly RuntimePluginStatus[]
  enabled?: boolean
  builtin?: boolean
  hasComponent?: keyof RuntimePluginComponents
}

export type KernelRuntimePlugins = {
  list(filter?: KernelPluginFilter): Promise<readonly KernelPluginDescriptor[]>
  status(): Promise<KernelPluginSnapshot>
  reload(): Promise<KernelPluginSnapshot>
  setEnabled(
    nameOrRequest: string | KernelPluginSetEnabledRequest,
    enabled?: boolean,
    options?: Omit<KernelPluginSetEnabledRequest, 'name' | 'enabled'>,
  ): Promise<KernelPluginMutationResult>
  enable(
    name: string,
    options?: Omit<KernelPluginSetEnabledRequest, 'name' | 'enabled'>,
  ): Promise<KernelPluginMutationResult>
  disable(
    name: string,
    options?: Omit<KernelPluginSetEnabledRequest, 'name' | 'enabled'>,
  ): Promise<KernelPluginMutationResult>
  install(
    nameOrRequest: string | KernelPluginInstallRequest,
    options?: Omit<KernelPluginInstallRequest, 'name'>,
  ): Promise<KernelPluginMutationResult>
  uninstall(
    nameOrRequest: string | KernelPluginUninstallRequest,
    options?: Omit<KernelPluginUninstallRequest, 'name'>,
  ): Promise<KernelPluginMutationResult>
  update(
    nameOrRequest: string | KernelPluginUpdateRequest,
    options?: Omit<KernelPluginUpdateRequest, 'name'>,
  ): Promise<KernelPluginMutationResult>
  onEvent(handler: (event: KernelRuntimePluginEvent) => void): () => void
  replay(
    options?: KernelRuntimeEventReplayOptions,
  ): Promise<readonly KernelRuntimePluginEvent[]>
}

export function createKernelRuntimePluginsFacade(
  client: KernelRuntimeWireClient,
): KernelRuntimePlugins {
  async function status(): Promise<KernelPluginSnapshot> {
    const payload = expectPayload<{
      plugins?: unknown
      errors?: unknown
    }>(await client.listPlugins())
    return toPluginSnapshot(payload)
  }

  return {
    list: async filter =>
      (await status()).plugins.filter(plugin =>
        matchesPluginFilter(plugin, filter ?? {}),
      ),
    status,
    reload: async () => {
      const payload = expectPayload<{
        plugins?: unknown
        errors?: unknown
      }>(await client.reloadPlugins())
      return toPluginSnapshot(payload)
    },
    setEnabled: async (nameOrRequest, enabled, options = {}) => {
      const request =
        typeof nameOrRequest === 'string'
          ? { ...options, name: nameOrRequest, enabled: enabled ?? true }
          : nameOrRequest
      return expectPayload<KernelPluginMutationResult>(
        await client.setPluginEnabled(request),
      )
    },
    enable: async (name, options = {}) =>
      expectPayload<KernelPluginMutationResult>(
        await client.setPluginEnabled({ ...options, name, enabled: true }),
      ),
    disable: async (name, options = {}) =>
      expectPayload<KernelPluginMutationResult>(
        await client.setPluginEnabled({ ...options, name, enabled: false }),
      ),
    install: async (nameOrRequest, options = {}) => {
      const request =
        typeof nameOrRequest === 'string'
          ? { ...options, name: nameOrRequest }
          : nameOrRequest
      return expectPayload<KernelPluginMutationResult>(
        await client.installPlugin(request),
      )
    },
    uninstall: async (nameOrRequest, options = {}) => {
      const request =
        typeof nameOrRequest === 'string'
          ? { ...options, name: nameOrRequest }
          : nameOrRequest
      return expectPayload<KernelPluginMutationResult>(
        await client.uninstallPlugin(request),
      )
    },
    update: async (nameOrRequest, options = {}) => {
      const request =
        typeof nameOrRequest === 'string'
          ? { ...options, name: nameOrRequest }
          : nameOrRequest
      return expectPayload<KernelPluginMutationResult>(
        await client.updatePlugin(request),
      )
    },
    onEvent: handler =>
      client.onEvent(envelope => {
        if (isKernelPluginEvent(envelope)) {
          handler(envelope)
        }
      }),
    replay: async (options = {}) => {
      const replayed = await collectReplayEvents(client, options)
      return replayed.filter(isKernelPluginEvent)
    },
  }
}

function isKernelPluginEvent(
  envelope: import('../runtime/contracts/events.js').KernelRuntimeEnvelopeBase,
): envelope is KernelRuntimePluginEvent {
  return (
    isKernelPluginsReloadedEvent(envelope) ||
    isKernelPluginsEnabledChangedEvent(envelope) ||
    isKernelPluginsInstalledEvent(envelope) ||
    isKernelPluginsUninstalledEvent(envelope) ||
    isKernelPluginsUpdatedEvent(envelope)
  )
}

function toPluginSnapshot(value: {
  plugins?: unknown
  errors?: unknown
}): KernelPluginSnapshot {
  return {
    plugins: toPluginDescriptors(value.plugins),
    errors: toPluginErrors(value.errors),
  }
}

function toPluginDescriptors(
  value: unknown,
): readonly KernelPluginDescriptor[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isPluginDescriptor)
}

function toPluginErrors(
  value: unknown,
): readonly KernelPluginErrorDescriptor[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isPluginError)
}

function isPluginDescriptor(value: unknown): value is KernelPluginDescriptor {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { source?: unknown }).source === 'string' &&
    typeof (value as { status?: unknown }).status === 'string'
  )
}

function isPluginError(value: unknown): value is KernelPluginErrorDescriptor {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { type?: unknown }).type === 'string' &&
    typeof (value as { source?: unknown }).source === 'string'
  )
}

function matchesPluginFilter(
  plugin: KernelPluginDescriptor,
  filter: KernelPluginFilter,
): boolean {
  if (filter.names && !filter.names.includes(plugin.name)) {
    return false
  }
  if (filter.source && !asArray(filter.source).includes(plugin.source)) {
    return false
  }
  if (filter.status && !asArray(filter.status).includes(plugin.status)) {
    return false
  }
  if (filter.enabled !== undefined && plugin.enabled !== filter.enabled) {
    return false
  }
  if (filter.builtin !== undefined && plugin.builtin !== filter.builtin) {
    return false
  }
  if (
    filter.hasComponent !== undefined &&
    !plugin.components[filter.hasComponent]
  ) {
    return false
  }
  return true
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [value as T]
}
