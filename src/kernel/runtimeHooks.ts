import type {
  KernelRuntimeEnvelopeBase,
} from '../runtime/contracts/events.js'
import type {
  RuntimeHookDescriptor,
  RuntimeHookMutationResult,
  RuntimeHookRegisterRequest,
  RuntimeHookRunRequest,
  RuntimeHookRunResult,
  RuntimeHookSource,
  RuntimeHookType,
} from '../runtime/contracts/hook.js'
import type { KernelRuntimeEventReplayOptions } from './runtime.js'
import type { KernelRuntimeHookEvent } from './runtimeEvents.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import {
  isKernelHooksRanEvent,
  isKernelHooksRegisteredEvent,
  isKernelHooksReloadedEvent,
} from './runtimeEvents.js'
import { collectReplayEvents, expectPayload } from './runtimeEnvelope.js'

export type KernelHookDescriptor = RuntimeHookDescriptor
export type KernelHookRunRequest = RuntimeHookRunRequest
export type KernelHookRunResult = RuntimeHookRunResult
export type KernelHookRegisterRequest = RuntimeHookRegisterRequest
export type KernelHookMutationResult = RuntimeHookMutationResult
export type KernelHookSource = RuntimeHookSource
export type KernelHookType = RuntimeHookType

export type KernelHookFilter = {
  events?: readonly string[]
  source?: RuntimeHookSource | readonly RuntimeHookSource[]
  type?: RuntimeHookType | readonly RuntimeHookType[]
  matcher?: string
  pluginName?: string
}

export type KernelRuntimeHooks = {
  list(filter?: KernelHookFilter): Promise<readonly KernelHookDescriptor[]>
  reload(): Promise<readonly KernelHookDescriptor[]>
  run(
    eventOrRequest: string | KernelHookRunRequest,
    input?: unknown,
    options?: Omit<KernelHookRunRequest, 'event' | 'input'>,
  ): Promise<KernelHookRunResult>
  register(
    hookOrRequest: KernelHookDescriptor | KernelHookRegisterRequest,
    options?: Omit<KernelHookRegisterRequest, 'hook'>,
  ): Promise<KernelHookMutationResult>
  onEvent(handler: (event: KernelRuntimeHookEvent) => void): () => void
  replay(
    options?: KernelRuntimeEventReplayOptions,
  ): Promise<readonly KernelRuntimeHookEvent[]>
}

export function createKernelRuntimeHooksFacade(
  client: KernelRuntimeWireClient,
): KernelRuntimeHooks {
  async function list(
    filter: KernelHookFilter = {},
  ): Promise<readonly KernelHookDescriptor[]> {
    const payload = expectPayload<{ hooks?: unknown }>(await client.listHooks())
    return toHookDescriptors(payload.hooks).filter(hook =>
      matchesHookFilter(hook, filter),
    )
  }

  return {
    list,
    reload: async () => {
      const payload = expectPayload<{ hooks?: unknown }>(
        await client.reloadHooks(),
      )
      return toHookDescriptors(payload.hooks)
    },
    run: async (eventOrRequest, input, options = {}) => {
      const request =
        typeof eventOrRequest === 'string'
          ? { ...options, event: eventOrRequest, input }
          : eventOrRequest
      return expectPayload<KernelHookRunResult>(await client.runHook(request))
    },
    register: async (hookOrRequest, options = {}) => {
      const request =
        'hook' in hookOrRequest
          ? hookOrRequest
          : { ...options, hook: hookOrRequest }
      return expectPayload<KernelHookMutationResult>(
        await client.registerHook(request),
      )
    },
    onEvent: handler =>
      client.onEvent(envelope => {
        if (isKernelHookEvent(envelope)) {
          handler(envelope)
        }
      }),
    replay: async (options = {}) => {
      const replayed = await collectReplayEvents(client, options)
      return replayed.filter(isKernelHookEvent)
    },
  }
}

function isKernelHookEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelRuntimeHookEvent {
  return (
    isKernelHooksReloadedEvent(envelope) ||
    isKernelHooksRanEvent(envelope) ||
    isKernelHooksRegisteredEvent(envelope)
  )
}

function toHookDescriptors(value: unknown): readonly KernelHookDescriptor[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isHookDescriptor)
}

function isHookDescriptor(value: unknown): value is KernelHookDescriptor {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { event?: unknown }).event === 'string' &&
    typeof (value as { type?: unknown }).type === 'string' &&
    typeof (value as { source?: unknown }).source === 'string'
  )
}

function matchesHookFilter(
  hook: KernelHookDescriptor,
  filter: KernelHookFilter,
): boolean {
  if (filter.events && !filter.events.includes(hook.event)) {
    return false
  }
  if (filter.source && !asArray(filter.source).includes(hook.source)) {
    return false
  }
  if (filter.type && !asArray(filter.type).includes(hook.type)) {
    return false
  }
  if (filter.matcher !== undefined && hook.matcher !== filter.matcher) {
    return false
  }
  if (
    filter.pluginName !== undefined &&
    hook.pluginName !== filter.pluginName
  ) {
    return false
  }
  return true
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [value as T]
}
