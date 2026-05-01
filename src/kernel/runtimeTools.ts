import type {
  KernelRuntimeEnvelopeBase,
} from '../runtime/contracts/events.js'
import type {
  RuntimeToolDescriptor,
  RuntimeToolCallRequest,
  RuntimeToolCallResult,
  RuntimeToolSafety,
  RuntimeToolSource,
} from '../runtime/contracts/tool.js'
import type { KernelRuntimeEventReplayOptions } from './runtime.js'
import type { KernelRuntimeToolEvent } from './runtimeEvents.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import {
  collectReplayEvents,
  expectPayload,
  waitForRuntimeEventDelivery,
} from './runtimeEnvelope.js'
import { isKernelToolsCalledEvent } from './runtimeEvents.js'

export type KernelToolDescriptor = RuntimeToolDescriptor
export type KernelToolCallRequest = RuntimeToolCallRequest
export type KernelToolCallResult = RuntimeToolCallResult
export type KernelRuntimeToolSafety = RuntimeToolSafety
export type KernelRuntimeToolSource = RuntimeToolSource

export type KernelToolFilter = {
  names?: readonly string[]
  source?: RuntimeToolSource | readonly RuntimeToolSource[]
  safety?: RuntimeToolSafety | readonly RuntimeToolSafety[]
  aliases?: readonly string[]
  mcp?: boolean
  deferred?: boolean
  concurrencySafe?: boolean
  openWorld?: boolean
  requiresUserInteraction?: boolean
}

export type KernelRuntimeTools = {
  list(filter?: KernelToolFilter): Promise<readonly KernelToolDescriptor[]>
  get(name: string): Promise<KernelToolDescriptor | undefined>
  call(
    nameOrRequest: string | KernelToolCallRequest,
    input?: unknown,
    options?: Omit<KernelToolCallRequest, 'toolName' | 'input'>,
  ): Promise<KernelToolCallResult>
  onEvent(handler: (event: KernelRuntimeToolEvent) => void): () => void
  replay(
    options?: KernelRuntimeEventReplayOptions,
  ): Promise<readonly KernelRuntimeToolEvent[]>
}

export function createKernelRuntimeToolsFacade(
  client: KernelRuntimeWireClient,
): KernelRuntimeTools {
  async function list(
    filter: KernelToolFilter = {},
  ): Promise<readonly KernelToolDescriptor[]> {
    const payload = expectPayload<{ tools?: unknown }>(await client.listTools())
    return toToolDescriptors(payload.tools).filter(tool =>
      matchesToolFilter(tool, filter),
    )
  }

  return {
    list,
    get: async name => (await list()).find(tool => toolMatchesName(tool, name)),
    call: async (nameOrRequest, input, options = {}) => {
      const request =
        typeof nameOrRequest === 'string'
          ? { ...options, toolName: nameOrRequest, input }
          : nameOrRequest
      const result = expectPayload<KernelToolCallResult>(
        await client.callTool(request),
      )
      await waitForRuntimeEventDelivery()
      return result
    },
    onEvent: handler =>
      client.onEvent(envelope => {
        if (isKernelToolEvent(envelope)) {
          handler(envelope)
        }
      }),
    replay: async (options = {}) => {
      const replayed = await collectReplayEvents(client, options)
      return replayed.filter(isKernelToolEvent)
    },
  }
}

function isKernelToolEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelRuntimeToolEvent {
  return isKernelToolsCalledEvent(envelope)
}

function toToolDescriptors(value: unknown): readonly KernelToolDescriptor[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isToolDescriptor)
}

function isToolDescriptor(value: unknown): value is KernelToolDescriptor {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { name?: unknown }).name === 'string'
  )
}

function matchesToolFilter(
  tool: KernelToolDescriptor,
  filter: KernelToolFilter,
): boolean {
  if (filter.names && !filter.names.some(name => toolMatchesName(tool, name))) {
    return false
  }
  if (
    filter.aliases &&
    !filter.aliases.some(alias => tool.aliases?.includes(alias))
  ) {
    return false
  }
  if (filter.source && !asArray(filter.source).includes(tool.source)) {
    return false
  }
  if (filter.safety && !asArray(filter.safety).includes(tool.safety)) {
    return false
  }
  if (filter.mcp !== undefined && tool.isMcp !== filter.mcp) {
    return false
  }
  if (filter.deferred !== undefined && tool.isDeferred !== filter.deferred) {
    return false
  }
  if (
    filter.concurrencySafe !== undefined &&
    tool.isConcurrencySafe !== filter.concurrencySafe
  ) {
    return false
  }
  if (filter.openWorld !== undefined && tool.isOpenWorld !== filter.openWorld) {
    return false
  }
  if (
    filter.requiresUserInteraction !== undefined &&
    tool.requiresUserInteraction !== filter.requiresUserInteraction
  ) {
    return false
  }
  return true
}

function toolMatchesName(tool: KernelToolDescriptor, name: string): boolean {
  return tool.name === name || (tool.aliases?.includes(name) ?? false)
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [value as T]
}
