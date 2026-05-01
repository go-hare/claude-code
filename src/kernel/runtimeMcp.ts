import type {
  RuntimeMcpAuthAction,
  RuntimeMcpAuthRequest,
  RuntimeMcpConnectRequest,
  RuntimeMcpConnectionState,
  RuntimeMcpLifecycleResult,
  RuntimeMcpRegistrySnapshot,
  RuntimeMcpResourceRef,
  RuntimeMcpServerRef,
  RuntimeMcpSetEnabledRequest,
  RuntimeMcpToolBinding,
  RuntimeMcpTransport,
} from '../runtime/contracts/mcp.js'
import type { KernelRuntimeEventReplayOptions } from './runtime.js'
import type { KernelRuntimeMcpEvent } from './runtimeEvents.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import { collectReplayEvents, expectPayload } from './runtimeEnvelope.js'
import {
  isKernelMcpAuthenticatedEvent,
  isKernelMcpConnectedEvent,
  isKernelMcpEnabledChangedEvent,
  isKernelMcpReloadedEvent,
} from './runtimeEvents.js'

export type KernelMcpTransport = RuntimeMcpTransport
export type KernelMcpConnectionState = RuntimeMcpConnectionState
export type KernelMcpServerRef = RuntimeMcpServerRef
export type KernelMcpResourceRef = RuntimeMcpResourceRef
export type KernelMcpToolBinding = RuntimeMcpToolBinding
export type KernelMcpSnapshot = RuntimeMcpRegistrySnapshot
export type KernelMcpConnectRequest = RuntimeMcpConnectRequest
export type KernelMcpAuthAction = RuntimeMcpAuthAction
export type KernelMcpAuthRequest = RuntimeMcpAuthRequest
export type KernelMcpSetEnabledRequest = RuntimeMcpSetEnabledRequest
export type KernelMcpLifecycleResult = RuntimeMcpLifecycleResult

export type KernelRuntimeMcp = {
  status(): Promise<readonly KernelMcpServerRef[]>
  listServers(): Promise<readonly KernelMcpServerRef[]>
  listTools(serverName?: string): Promise<readonly KernelMcpToolBinding[]>
  listResources(serverName?: string): Promise<readonly KernelMcpResourceRef[]>
  snapshot(): Promise<KernelMcpSnapshot>
  reload(): Promise<KernelMcpSnapshot>
  connect(
    serverNameOrRequest: string | KernelMcpConnectRequest,
    options?: Omit<KernelMcpConnectRequest, 'serverName'>,
  ): Promise<KernelMcpLifecycleResult>
  authenticate(
    serverNameOrRequest: string | KernelMcpAuthRequest,
    options?: Omit<KernelMcpAuthRequest, 'serverName'>,
  ): Promise<KernelMcpLifecycleResult>
  clearAuth(
    serverNameOrRequest: string | KernelMcpAuthRequest,
    options?: Omit<KernelMcpAuthRequest, 'serverName' | 'action'>,
  ): Promise<KernelMcpLifecycleResult>
  setEnabled(
    serverNameOrRequest: string | KernelMcpSetEnabledRequest,
    enabled?: boolean,
    options?: Omit<KernelMcpSetEnabledRequest, 'serverName' | 'enabled'>,
  ): Promise<KernelMcpLifecycleResult>
  enable(
    serverName: string,
    options?: Omit<KernelMcpSetEnabledRequest, 'serverName' | 'enabled'>,
  ): Promise<KernelMcpLifecycleResult>
  disable(
    serverName: string,
    options?: Omit<KernelMcpSetEnabledRequest, 'serverName' | 'enabled'>,
  ): Promise<KernelMcpLifecycleResult>
  onEvent(handler: (event: KernelRuntimeMcpEvent) => void): () => void
  replay(
    options?: KernelRuntimeEventReplayOptions,
  ): Promise<readonly KernelRuntimeMcpEvent[]>
}

export function createKernelRuntimeMcpFacade(
  client: KernelRuntimeWireClient,
): KernelRuntimeMcp {
  async function listServers(): Promise<readonly KernelMcpServerRef[]> {
    const payload = expectPayload<{ servers?: unknown }>(
      await client.listMcpServers(),
    )
    return toMcpServers(payload.servers)
  }

  async function listTools(
    serverName?: string,
  ): Promise<readonly KernelMcpToolBinding[]> {
    const payload = expectPayload<{ tools?: unknown }>(
      await client.listMcpTools({ serverName }),
    )
    return toMcpToolBindings(payload.tools)
  }

  async function listResources(
    serverName?: string,
  ): Promise<readonly KernelMcpResourceRef[]> {
    const payload = expectPayload<{ resources?: unknown }>(
      await client.listMcpResources({ serverName }),
    )
    return toMcpResources(payload.resources)
  }

  return {
    status: listServers,
    listServers,
    listTools,
    listResources,
    snapshot: async () => ({
      servers: await listServers(),
      resources: await listResources(),
      toolBindings: await listTools(),
    }),
    reload: async () => {
      const payload = expectPayload<Partial<RuntimeMcpRegistrySnapshot>>(
        await client.reloadMcp(),
      )
      return toMcpSnapshot(payload)
    },
    connect: async (serverNameOrRequest, options = {}) => {
      const request =
        typeof serverNameOrRequest === 'string'
          ? { ...options, serverName: serverNameOrRequest }
          : serverNameOrRequest
      return expectPayload<KernelMcpLifecycleResult>(
        await client.connectMcp(request),
      )
    },
    authenticate: async (serverNameOrRequest, options = {}) => {
      const request =
        typeof serverNameOrRequest === 'string'
          ? { ...options, serverName: serverNameOrRequest }
          : serverNameOrRequest
      return expectPayload<KernelMcpLifecycleResult>(
        await client.authenticateMcp(request),
      )
    },
    clearAuth: async (serverNameOrRequest, options = {}) => {
      const request =
        typeof serverNameOrRequest === 'string'
          ? {
              ...options,
              serverName: serverNameOrRequest,
              action: 'clear' as const,
            }
          : { ...serverNameOrRequest, action: 'clear' as const }
      return expectPayload<KernelMcpLifecycleResult>(
        await client.authenticateMcp(request),
      )
    },
    setEnabled: async (serverNameOrRequest, enabled, options = {}) => {
      const request =
        typeof serverNameOrRequest === 'string'
          ? {
              ...options,
              serverName: serverNameOrRequest,
              enabled: enabled ?? true,
            }
          : serverNameOrRequest
      return expectPayload<KernelMcpLifecycleResult>(
        await client.setMcpEnabled(request),
      )
    },
    enable: async (serverName, options = {}) =>
      expectPayload<KernelMcpLifecycleResult>(
        await client.setMcpEnabled({ ...options, serverName, enabled: true }),
      ),
    disable: async (serverName, options = {}) =>
      expectPayload<KernelMcpLifecycleResult>(
        await client.setMcpEnabled({ ...options, serverName, enabled: false }),
      ),
    onEvent: handler =>
      client.onEvent(envelope => {
        if (isKernelMcpEvent(envelope)) {
          handler(envelope)
        }
      }),
    replay: async (options = {}) => {
      const replayed = await collectReplayEvents(client, options)
      return replayed.filter(isKernelMcpEvent)
    },
  }
}

function isKernelMcpEvent(
  envelope: import('../runtime/contracts/events.js').KernelRuntimeEnvelopeBase,
): envelope is KernelRuntimeMcpEvent {
  return (
    isKernelMcpReloadedEvent(envelope) ||
    isKernelMcpConnectedEvent(envelope) ||
    isKernelMcpAuthenticatedEvent(envelope) ||
    isKernelMcpEnabledChangedEvent(envelope)
  )
}

function toMcpSnapshot(
  value: Partial<RuntimeMcpRegistrySnapshot>,
): KernelMcpSnapshot {
  return {
    servers: toMcpServers(value.servers),
    resources: toMcpResources(value.resources),
    toolBindings: toMcpToolBindings(value.toolBindings),
  }
}

function toMcpServers(value: unknown): readonly KernelMcpServerRef[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isMcpServerRef)
}

function toMcpResources(value: unknown): readonly KernelMcpResourceRef[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isMcpResourceRef)
}

function toMcpToolBindings(value: unknown): readonly KernelMcpToolBinding[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isMcpToolBinding)
}

function isMcpServerRef(value: unknown): value is KernelMcpServerRef {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { transport?: unknown }).transport === 'string' &&
    typeof (value as { state?: unknown }).state === 'string'
  )
}

function isMcpResourceRef(value: unknown): value is KernelMcpResourceRef {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { server?: unknown }).server === 'string' &&
    typeof (value as { uri?: unknown }).uri === 'string'
  )
}

function isMcpToolBinding(value: unknown): value is KernelMcpToolBinding {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { server?: unknown }).server === 'string' &&
    typeof (value as { serverToolName?: unknown }).serverToolName ===
      'string' &&
    typeof (value as { runtimeToolName?: unknown }).runtimeToolName === 'string'
  )
}
