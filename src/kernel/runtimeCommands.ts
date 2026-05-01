import type {
  KernelRuntimeEnvelopeBase,
} from '../runtime/contracts/events.js'
import type {
  RuntimeCommandDescriptor,
  RuntimeCommandExecuteRequest,
  RuntimeCommandExecutionResult,
  RuntimeCommandGraphEntry,
  RuntimeCommandKind,
  RuntimeCommandResult,
} from '../runtime/contracts/command.js'
import type { KernelRuntimeEventReplayOptions } from './runtime.js'
import type { KernelRuntimeCommandEvent } from './runtimeEvents.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import {
  collectReplayEvents,
  expectPayload,
  waitForRuntimeEventDelivery,
} from './runtimeEnvelope.js'
import { isKernelCommandsExecutedEvent } from './runtimeEvents.js'

export type KernelCommandDescriptor = RuntimeCommandDescriptor
export type KernelCommandEntry = RuntimeCommandGraphEntry
export type KernelRuntimeCommandDescriptor = RuntimeCommandDescriptor
export type KernelRuntimeCommandKind = RuntimeCommandKind
export type KernelCommandExecuteRequest = RuntimeCommandExecuteRequest
export type KernelCommandExecutionResult = RuntimeCommandExecutionResult
export type KernelCommandResult = RuntimeCommandResult

export type KernelCommandFilter = {
  names?: readonly string[]
  kind?: RuntimeCommandKind | readonly RuntimeCommandKind[]
  source?: string | readonly string[]
  loadedFrom?: string | readonly string[]
  supportsNonInteractive?: boolean
  modelInvocable?: boolean
  hidden?: boolean
  terminalOnly?: boolean
}

export type KernelRuntimeCommands = {
  list(filter?: KernelCommandFilter): Promise<readonly KernelCommandEntry[]>
  descriptors(
    filter?: KernelCommandFilter,
  ): Promise<readonly KernelCommandDescriptor[]>
  get(name: string): Promise<KernelCommandEntry | undefined>
  execute(
    nameOrRequest: string | KernelCommandExecuteRequest,
    options?: Omit<KernelCommandExecuteRequest, 'name'>,
  ): Promise<KernelCommandExecutionResult>
  onEvent(handler: (event: KernelRuntimeCommandEvent) => void): () => void
  replay(
    options?: KernelRuntimeEventReplayOptions,
  ): Promise<readonly KernelRuntimeCommandEvent[]>
}

export function createKernelRuntimeCommandsFacade(
  client: KernelRuntimeWireClient,
): KernelRuntimeCommands {
  async function list(
    filter: KernelCommandFilter = {},
  ): Promise<readonly KernelCommandEntry[]> {
    const payload = expectPayload<{ entries?: unknown }>(
      await client.listCommands(),
    )
    return toCommandEntries(payload.entries).filter(entry =>
      matchesCommandFilter(entry, filter),
    )
  }

  return {
    list,
    descriptors: async filter =>
      (await list(filter)).map(entry => entry.descriptor),
    get: async name =>
      (await list()).find(entry => commandEntryMatchesName(entry, name)),
    execute: async (nameOrRequest, options = {}) => {
      const request =
        typeof nameOrRequest === 'string'
          ? { ...options, name: nameOrRequest }
          : nameOrRequest
      const result = expectPayload<KernelCommandExecutionResult>(
        await client.executeCommand(request),
      )
      await waitForRuntimeEventDelivery()
      return result
    },
    onEvent: handler =>
      client.onEvent(envelope => {
        if (isKernelCommandEvent(envelope)) {
          handler(envelope)
        }
      }),
    replay: async (options = {}) => {
      const replayed = await collectReplayEvents(client, options)
      return replayed.filter(isKernelCommandEvent)
    },
  }
}

function isKernelCommandEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelRuntimeCommandEvent {
  return isKernelCommandsExecutedEvent(envelope)
}

function toCommandEntries(value: unknown): readonly KernelCommandEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isCommandEntry)
}

function isCommandEntry(value: unknown): value is KernelCommandEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  const descriptor = (value as { descriptor?: unknown }).descriptor
  return (
    !!descriptor &&
    typeof descriptor === 'object' &&
    typeof (descriptor as { name?: unknown }).name === 'string'
  )
}

function matchesCommandFilter(
  entry: KernelCommandEntry,
  filter: KernelCommandFilter,
): boolean {
  const descriptor = entry.descriptor
  if (
    filter.names &&
    !filter.names.some(name => commandEntryMatchesName(entry, name))
  ) {
    return false
  }
  if (filter.kind && !asArray(filter.kind).includes(descriptor.kind)) {
    return false
  }
  if (filter.source && !matchesOptional(entry.source, filter.source)) {
    return false
  }
  if (
    filter.loadedFrom &&
    !matchesOptional(entry.loadedFrom, filter.loadedFrom)
  ) {
    return false
  }
  if (
    filter.supportsNonInteractive !== undefined &&
    entry.supportsNonInteractive !== filter.supportsNonInteractive
  ) {
    return false
  }
  if (
    filter.modelInvocable !== undefined &&
    entry.modelInvocable !== filter.modelInvocable
  ) {
    return false
  }
  if (filter.hidden !== undefined && descriptor.hidden !== filter.hidden) {
    return false
  }
  if (
    filter.terminalOnly !== undefined &&
    descriptor.terminalOnly !== filter.terminalOnly
  ) {
    return false
  }
  return true
}

function commandEntryMatchesName(
  entry: KernelCommandEntry,
  name: string,
): boolean {
  return (
    entry.descriptor.name === name ||
    (entry.descriptor.aliases?.includes(name) ?? false)
  )
}

function matchesOptional(
  value: string | undefined,
  filter: string | readonly string[],
): boolean {
  return value !== undefined && asArray(filter).includes(value)
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [value as T]
}
