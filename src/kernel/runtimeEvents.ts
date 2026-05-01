import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../runtime/contracts/events.js'
import type {
  KernelPermissionDecision,
  KernelPermissionRequest,
} from '../runtime/contracts/permissions.js'
import type {
  RuntimeAgentRunCancelResult,
  RuntimeAgentSpawnResult,
} from '../runtime/contracts/agent.js'
import type { RuntimeCommandExecutionResult } from '../runtime/contracts/command.js'
import type {
  RuntimeHookDescriptor,
  RuntimeHookMutationResult,
  RuntimeHookRegistrySnapshot,
  RuntimeHookRunResult,
} from '../runtime/contracts/hook.js'
import type {
  RuntimeMcpLifecycleResult,
  RuntimeMcpRegistrySnapshot,
} from '../runtime/contracts/mcp.js'
import type {
  RuntimePluginCatalogSnapshot,
  RuntimePluginMutationResult,
} from '../runtime/contracts/plugin.js'
import type {
  RuntimeSkillCatalogSnapshot,
  RuntimeSkillPromptContextResult,
} from '../runtime/contracts/skill.js'
import type { RuntimeTaskMutationResult } from '../runtime/contracts/task.js'
import type { RuntimeToolCallResult } from '../runtime/contracts/tool.js'
import type { KernelTurnSnapshot } from '../runtime/contracts/turn.js'

export type KernelRuntimeEventCategory =
  | 'runtime'
  | 'host'
  | 'conversation'
  | 'turn'
  | 'permission'
  | 'capability'
  | 'compatibility'
  | 'extension'

export type KernelRuntimeEventScope = 'runtime' | 'conversation' | 'turn'

export type KernelRuntimeEventTaxonomyEntry = {
  readonly type: string
  readonly category: KernelRuntimeEventCategory
  readonly scope: KernelRuntimeEventScope
  readonly terminal?: boolean
  readonly compatibility?: boolean
}

export const KERNEL_RUNTIME_EVENT_TAXONOMY = [
  { type: 'runtime.ready', category: 'runtime', scope: 'runtime' },
  { type: 'host.connected', category: 'host', scope: 'runtime' },
  { type: 'host.reconnected', category: 'host', scope: 'runtime' },
  { type: 'host.disconnected', category: 'host', scope: 'runtime' },
  { type: 'host.focus_changed', category: 'host', scope: 'runtime' },
  {
    type: 'conversation.ready',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.recovered',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.disposed',
    category: 'conversation',
    scope: 'conversation',
    terminal: true,
  },
  {
    type: 'conversation.snapshot_failed',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.transcript_message',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.todo_snapshot',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.nested_memory_snapshot',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.task_snapshot',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.attribution_snapshot',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.file_history_snapshot',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.content_replacement',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.context_collapse_commit',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.context_collapse_snapshot',
    category: 'conversation',
    scope: 'conversation',
  },
  { type: 'turn.started', category: 'turn', scope: 'turn' },
  { type: 'turn.abort_requested', category: 'turn', scope: 'turn' },
  { type: 'turn.output_delta', category: 'turn', scope: 'turn' },
  { type: 'turn.delta', category: 'turn', scope: 'turn' },
  { type: 'turn.progress', category: 'turn', scope: 'turn' },
  {
    type: 'turn.completed',
    category: 'turn',
    scope: 'turn',
    terminal: true,
  },
  { type: 'turn.failed', category: 'turn', scope: 'turn', terminal: true },
  { type: 'permission.requested', category: 'permission', scope: 'turn' },
  { type: 'permission.resolved', category: 'permission', scope: 'turn' },
  {
    type: 'capabilities.required',
    category: 'capability',
    scope: 'conversation',
  },
  { type: 'capabilities.reloaded', category: 'capability', scope: 'runtime' },
  { type: 'commands.executed', category: 'extension', scope: 'runtime' },
  { type: 'tools.called', category: 'extension', scope: 'runtime' },
  { type: 'mcp.reloaded', category: 'extension', scope: 'runtime' },
  { type: 'mcp.connected', category: 'extension', scope: 'runtime' },
  { type: 'mcp.authenticated', category: 'extension', scope: 'runtime' },
  { type: 'mcp.enabled_changed', category: 'extension', scope: 'runtime' },
  { type: 'hooks.reloaded', category: 'extension', scope: 'runtime' },
  { type: 'hooks.ran', category: 'extension', scope: 'runtime' },
  { type: 'hooks.registered', category: 'extension', scope: 'runtime' },
  { type: 'skills.reloaded', category: 'extension', scope: 'runtime' },
  {
    type: 'skills.context_resolved',
    category: 'extension',
    scope: 'runtime',
  },
  { type: 'plugins.reloaded', category: 'extension', scope: 'runtime' },
  {
    type: 'plugins.enabled_changed',
    category: 'extension',
    scope: 'runtime',
  },
  { type: 'plugins.installed', category: 'extension', scope: 'runtime' },
  { type: 'plugins.uninstalled', category: 'extension', scope: 'runtime' },
  { type: 'plugins.updated', category: 'extension', scope: 'runtime' },
  { type: 'agents.reloaded', category: 'extension', scope: 'runtime' },
  { type: 'agents.spawned', category: 'extension', scope: 'runtime' },
  { type: 'agents.run.cancelled', category: 'extension', scope: 'runtime' },
  { type: 'tasks.created', category: 'extension', scope: 'runtime' },
  { type: 'tasks.updated', category: 'extension', scope: 'runtime' },
  { type: 'tasks.assigned', category: 'extension', scope: 'runtime' },
  { type: 'companion.event', category: 'extension', scope: 'runtime' },
  { type: 'kairos.event', category: 'extension', scope: 'runtime' },
  {
    type: 'headless.sdk_message',
    category: 'compatibility',
    scope: 'turn',
    compatibility: true,
  },
] as const satisfies readonly KernelRuntimeEventTaxonomyEntry[]

export type KernelRuntimeEventType =
  (typeof KERNEL_RUNTIME_EVENT_TAXONOMY)[number]['type']

export type KernelEventType = KernelRuntimeEventType | (string & {})

export type KernelTurnEventType = Extract<
  KernelRuntimeEventType,
  `turn.${string}`
>

export const KERNEL_RUNTIME_EVENT_TYPES = KERNEL_RUNTIME_EVENT_TAXONOMY.map(
  entry => entry.type,
) as readonly KernelRuntimeEventType[]

export type KernelRuntimeEventEnvelope =
  KernelRuntimeEnvelopeBase<KernelEvent> & {
    kind: 'event'
    payload: KernelEvent
  }

export type KnownKernelRuntimeEventEnvelope<
  TType extends KernelRuntimeEventType = KernelRuntimeEventType,
> = KernelRuntimeEventEnvelope & {
  payload: KernelEvent & { type: TType }
}

export type KernelTurnOutputDeltaEvent =
  KnownKernelRuntimeEventEnvelope<'turn.output_delta'>

export type KernelTurnCompletedEvent =
  KnownKernelRuntimeEventEnvelope<'turn.completed'>

export type KernelTurnFailedEvent =
  KnownKernelRuntimeEventEnvelope<'turn.failed'>

export type KernelPermissionRequestedEvent = KnownKernelRuntimeEventEnvelope<
  'permission.requested'
> & {
  payload: KernelEvent & {
    type: 'permission.requested'
    payload: KernelPermissionRequest
  }
}

export type KernelPermissionResolvedPayload = KernelPermissionRequest & {
  decision: KernelPermissionDecision['decision']
  decidedBy: KernelPermissionDecision['decidedBy']
  reason?: string
  expiresAt?: string
  decisionMetadata?: Record<string, unknown>
}

export type KernelPermissionResolvedEvent = KnownKernelRuntimeEventEnvelope<
  'permission.resolved'
> & {
  payload: KernelEvent & {
    type: 'permission.resolved'
    payload: KernelPermissionResolvedPayload
  }
}

export type KernelKnownEvent = KnownKernelRuntimeEventEnvelope
export type KernelRuntimePermissionEvent =
  | KernelPermissionRequestedEvent
  | KernelPermissionResolvedEvent

export type KernelCommandsExecutedEvent = KnownKernelRuntimeEventEnvelope<
  'commands.executed'
> & {
  payload: KernelEvent & {
    type: 'commands.executed'
    payload: RuntimeCommandExecutionResult
  }
}

export type KernelRuntimeCommandEvent = KernelCommandsExecutedEvent

export type KernelToolsCalledEvent = KnownKernelRuntimeEventEnvelope<
  'tools.called'
> & {
  payload: KernelEvent & {
    type: 'tools.called'
    payload: RuntimeToolCallResult
  }
}

export type KernelRuntimeToolEvent = KernelToolsCalledEvent

export type KernelHooksReloadedEvent = KnownKernelRuntimeEventEnvelope<
  'hooks.reloaded'
> & {
  payload: KernelEvent & {
    type: 'hooks.reloaded'
    payload: RuntimeHookRegistrySnapshot
  }
}

export type KernelHooksRanEvent = KnownKernelRuntimeEventEnvelope<
  'hooks.ran'
> & {
  payload: KernelEvent & {
    type: 'hooks.ran'
    payload: RuntimeHookRunResult
  }
}

export type KernelHooksRegisteredEvent = KnownKernelRuntimeEventEnvelope<
  'hooks.registered'
> & {
  payload: KernelEvent & {
    type: 'hooks.registered'
    payload: RuntimeHookMutationResult
  }
}

export type KernelRuntimeHookEvent =
  | KernelHooksReloadedEvent
  | KernelHooksRanEvent
  | KernelHooksRegisteredEvent

export type KernelSkillsReloadedEvent = KnownKernelRuntimeEventEnvelope<
  'skills.reloaded'
> & {
  payload: KernelEvent & {
    type: 'skills.reloaded'
    payload: RuntimeSkillCatalogSnapshot
  }
}

export type KernelSkillsContextResolvedEvent = KnownKernelRuntimeEventEnvelope<
  'skills.context_resolved'
> & {
  payload: KernelEvent & {
    type: 'skills.context_resolved'
    payload: RuntimeSkillPromptContextResult
  }
}

export type KernelRuntimeSkillEvent =
  | KernelSkillsReloadedEvent
  | KernelSkillsContextResolvedEvent

export type KernelMcpReloadedEvent = KnownKernelRuntimeEventEnvelope<
  'mcp.reloaded'
> & {
  payload: KernelEvent & {
    type: 'mcp.reloaded'
    payload: RuntimeMcpRegistrySnapshot
  }
}

export type KernelMcpConnectedEvent = KnownKernelRuntimeEventEnvelope<
  'mcp.connected'
> & {
  payload: KernelEvent & {
    type: 'mcp.connected'
    payload: RuntimeMcpLifecycleResult
  }
}

export type KernelMcpAuthenticatedEvent = KnownKernelRuntimeEventEnvelope<
  'mcp.authenticated'
> & {
  payload: KernelEvent & {
    type: 'mcp.authenticated'
    payload: RuntimeMcpLifecycleResult
  }
}

export type KernelMcpEnabledChangedEvent = KnownKernelRuntimeEventEnvelope<
  'mcp.enabled_changed'
> & {
  payload: KernelEvent & {
    type: 'mcp.enabled_changed'
    payload: RuntimeMcpLifecycleResult
  }
}

export type KernelRuntimeMcpEvent =
  | KernelMcpReloadedEvent
  | KernelMcpConnectedEvent
  | KernelMcpAuthenticatedEvent
  | KernelMcpEnabledChangedEvent

export type KernelPluginsReloadedEvent = KnownKernelRuntimeEventEnvelope<
  'plugins.reloaded'
> & {
  payload: KernelEvent & {
    type: 'plugins.reloaded'
    payload: RuntimePluginCatalogSnapshot
  }
}

export type KernelPluginsEnabledChangedEvent =
  KnownKernelRuntimeEventEnvelope<'plugins.enabled_changed'> & {
    payload: KernelEvent & {
      type: 'plugins.enabled_changed'
      payload: RuntimePluginMutationResult
    }
  }

export type KernelPluginsInstalledEvent = KnownKernelRuntimeEventEnvelope<
  'plugins.installed'
> & {
  payload: KernelEvent & {
    type: 'plugins.installed'
    payload: RuntimePluginMutationResult
  }
}

export type KernelPluginsUninstalledEvent = KnownKernelRuntimeEventEnvelope<
  'plugins.uninstalled'
> & {
  payload: KernelEvent & {
    type: 'plugins.uninstalled'
    payload: RuntimePluginMutationResult
  }
}

export type KernelPluginsUpdatedEvent = KnownKernelRuntimeEventEnvelope<
  'plugins.updated'
> & {
  payload: KernelEvent & {
    type: 'plugins.updated'
    payload: RuntimePluginMutationResult
  }
}

export type KernelRuntimePluginEvent =
  | KernelPluginsReloadedEvent
  | KernelPluginsEnabledChangedEvent
  | KernelPluginsInstalledEvent
  | KernelPluginsUninstalledEvent
  | KernelPluginsUpdatedEvent

export type KernelAgentsSpawnedEvent = KnownKernelRuntimeEventEnvelope<
  'agents.spawned'
> & {
  payload: KernelEvent & {
    type: 'agents.spawned'
    payload: RuntimeAgentSpawnResult
  }
}

export type KernelAgentsRunCancelledEvent = KnownKernelRuntimeEventEnvelope<
  'agents.run.cancelled'
> & {
  payload: KernelEvent & {
    type: 'agents.run.cancelled'
    payload: RuntimeAgentRunCancelResult
  }
}

export type KernelRuntimeAgentEvent =
  | KernelAgentsSpawnedEvent
  | KernelAgentsRunCancelledEvent

export type KernelTasksCreatedEvent = KnownKernelRuntimeEventEnvelope<
  'tasks.created'
> & {
  payload: KernelEvent & {
    type: 'tasks.created'
    payload: RuntimeTaskMutationResult
  }
}

export type KernelTasksUpdatedEvent = KnownKernelRuntimeEventEnvelope<
  'tasks.updated'
> & {
  payload: KernelEvent & {
    type: 'tasks.updated'
    payload: RuntimeTaskMutationResult
  }
}

export type KernelTasksAssignedEvent = KnownKernelRuntimeEventEnvelope<
  'tasks.assigned'
> & {
  payload: KernelEvent & {
    type: 'tasks.assigned'
    payload: RuntimeTaskMutationResult
  }
}

export type KernelRuntimeTaskEvent =
  | KernelTasksCreatedEvent
  | KernelTasksUpdatedEvent
  | KernelTasksAssignedEvent

export type KernelRuntimeEventHandler = (
  envelope: KernelRuntimeEventEnvelope,
) => void

export function collectKernelRuntimeEventEnvelopes(
  envelopes: readonly KernelRuntimeEnvelopeBase[],
): KernelRuntimeEventEnvelope[] {
  return envelopes.filter(isKernelRuntimeEventEnvelope)
}

export function isKernelRuntimeEventEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelRuntimeEventEnvelope {
  return (
    envelope.kind === 'event' &&
    isRecord(envelope.payload) &&
    typeof envelope.payload.type === 'string'
  )
}

export function isKnownKernelRuntimeEventType(
  type: string,
): type is KernelRuntimeEventType {
  return getKnownTaxonomyEntry(type) !== undefined
}

export function getKernelRuntimeEventType(
  input: KernelRuntimeEnvelopeBase | KernelEvent | unknown,
): string | undefined {
  const event = isKernelRuntimeEventEnvelopeLike(input)
    ? input.payload
    : isKernelEventLike(input)
      ? input
      : undefined
  return event?.type
}

export function getKernelRuntimeEventCategory(
  input: KernelRuntimeEnvelopeBase | KernelEvent | string | unknown,
): KernelRuntimeEventCategory | undefined {
  const type =
    typeof input === 'string' ? input : getKernelRuntimeEventType(input)
  if (!type) {
    return undefined
  }
  return getKnownTaxonomyEntry(type)?.category ?? inferEventCategory(type)
}

export function getKernelRuntimeEventTaxonomyEntry(
  type: string,
): KernelRuntimeEventTaxonomyEntry | undefined {
  return getKnownTaxonomyEntry(type) ?? createPrefixTaxonomyEntry(type)
}

export function isKernelRuntimeEventOfType<
  TType extends KernelRuntimeEventType,
>(
  envelope: KernelRuntimeEnvelopeBase,
  type: TType,
): envelope is KnownKernelRuntimeEventEnvelope<TType> {
  return (
    isKernelRuntimeEventEnvelope(envelope) && envelope.payload.type === type
  )
}

export function isKernelTurnTerminalEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KnownKernelRuntimeEventEnvelope<
  'turn.completed' | 'turn.failed'
> {
  return (
    isKernelRuntimeEventOfType(envelope, 'turn.completed') ||
    isKernelRuntimeEventOfType(envelope, 'turn.failed')
  )
}

export function isKernelPermissionRequestedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelPermissionRequestedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'permission.requested') &&
    isKernelPermissionRequestPayload(envelope.payload.payload)
  )
}

export function isKernelPermissionResolvedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelPermissionResolvedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'permission.resolved') &&
    isKernelPermissionResolvedPayload(envelope.payload.payload)
  )
}

export function isKernelCommandsExecutedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelCommandsExecutedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'commands.executed') &&
    isKernelCommandExecutionResult(envelope.payload.payload)
  )
}

export function isKernelToolsCalledEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelToolsCalledEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'tools.called') &&
    isKernelToolCallResult(envelope.payload.payload)
  )
}

export function isKernelHooksReloadedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelHooksReloadedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'hooks.reloaded') &&
    isKernelHookRegistrySnapshot(envelope.payload.payload)
  )
}

export function isKernelHooksRanEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelHooksRanEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'hooks.ran') &&
    isKernelHookRunResult(envelope.payload.payload)
  )
}

export function isKernelHooksRegisteredEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelHooksRegisteredEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'hooks.registered') &&
    isKernelHookMutationResult(envelope.payload.payload)
  )
}

export function isKernelSkillsReloadedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelSkillsReloadedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'skills.reloaded') &&
    isKernelSkillCatalogSnapshot(envelope.payload.payload)
  )
}

export function isKernelSkillsContextResolvedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelSkillsContextResolvedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'skills.context_resolved') &&
    isKernelSkillPromptContextResult(envelope.payload.payload)
  )
}

export function isKernelMcpReloadedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelMcpReloadedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'mcp.reloaded') &&
    isKernelMcpRegistrySnapshot(envelope.payload.payload)
  )
}

export function isKernelMcpConnectedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelMcpConnectedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'mcp.connected') &&
    isKernelMcpLifecycleResult(envelope.payload.payload)
  )
}

export function isKernelMcpAuthenticatedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelMcpAuthenticatedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'mcp.authenticated') &&
    isKernelMcpLifecycleResult(envelope.payload.payload)
  )
}

export function isKernelMcpEnabledChangedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelMcpEnabledChangedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'mcp.enabled_changed') &&
    isKernelMcpLifecycleResult(envelope.payload.payload)
  )
}

export function isKernelPluginsReloadedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelPluginsReloadedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'plugins.reloaded') &&
    isKernelPluginCatalogSnapshot(envelope.payload.payload)
  )
}

export function isKernelPluginsEnabledChangedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelPluginsEnabledChangedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'plugins.enabled_changed') &&
    isKernelPluginMutationResult(envelope.payload.payload)
  )
}

export function isKernelPluginsInstalledEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelPluginsInstalledEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'plugins.installed') &&
    isKernelPluginMutationResult(envelope.payload.payload)
  )
}

export function isKernelPluginsUninstalledEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelPluginsUninstalledEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'plugins.uninstalled') &&
    isKernelPluginMutationResult(envelope.payload.payload)
  )
}

export function isKernelPluginsUpdatedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelPluginsUpdatedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'plugins.updated') &&
    isKernelPluginMutationResult(envelope.payload.payload)
  )
}

export function isKernelAgentsSpawnedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelAgentsSpawnedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'agents.spawned') &&
    isKernelAgentSpawnResult(envelope.payload.payload)
  )
}

export function isKernelAgentsRunCancelledEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelAgentsRunCancelledEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'agents.run.cancelled') &&
    isKernelAgentRunCancelResult(envelope.payload.payload)
  )
}

export function isKernelTasksCreatedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelTasksCreatedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'tasks.created') &&
    isKernelTaskMutationResult(envelope.payload.payload)
  )
}

export function isKernelTasksUpdatedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelTasksUpdatedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'tasks.updated') &&
    isKernelTaskMutationResult(envelope.payload.payload)
  )
}

export function isKernelTasksAssignedEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelTasksAssignedEvent {
  return (
    isKernelRuntimeEventOfType(envelope, 'tasks.assigned') &&
    isKernelTaskMutationResult(envelope.payload.payload)
  )
}

export function getKernelPermissionRequest(
  envelope: KernelRuntimeEnvelopeBase,
): KernelPermissionRequest | undefined {
  if (isKernelPermissionRequestedEvent(envelope)) {
    return envelope.payload.payload
  }
  if (isKernelPermissionResolvedEvent(envelope)) {
    const {
      decision: _decision,
      decidedBy: _decidedBy,
      reason: _reason,
      expiresAt: _expiresAt,
      decisionMetadata: _decisionMetadata,
      ...request
    } = envelope.payload.payload
    return request
  }
  return undefined
}

export function getKernelPermissionDecision(
  envelope: KernelRuntimeEnvelopeBase,
): KernelPermissionDecision | undefined {
  if (!isKernelPermissionResolvedEvent(envelope)) {
    return undefined
  }
  return {
    permissionRequestId: envelope.payload.payload.permissionRequestId,
    decision: envelope.payload.payload.decision,
    decidedBy: envelope.payload.payload.decidedBy,
    reason: envelope.payload.payload.reason,
    expiresAt: envelope.payload.payload.expiresAt,
    metadata: envelope.payload.payload.decisionMetadata,
  }
}

export function getKernelCommandExecutionResult(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeCommandExecutionResult | undefined {
  return isKernelCommandsExecutedEvent(envelope)
    ? envelope.payload.payload
    : undefined
}

export function getKernelToolCallResult(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeToolCallResult | undefined {
  return isKernelToolsCalledEvent(envelope) ? envelope.payload.payload : undefined
}

export function getKernelHookRegistrySnapshot(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeHookRegistrySnapshot | undefined {
  return isKernelHooksReloadedEvent(envelope)
    ? envelope.payload.payload
    : undefined
}

export function getKernelHookRunResult(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeHookRunResult | undefined {
  return isKernelHooksRanEvent(envelope) ? envelope.payload.payload : undefined
}

export function getKernelHookMutationResult(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeHookMutationResult | undefined {
  return isKernelHooksRegisteredEvent(envelope)
    ? envelope.payload.payload
    : undefined
}

export function getKernelSkillSnapshot(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeSkillCatalogSnapshot | undefined {
  return isKernelSkillsReloadedEvent(envelope)
    ? envelope.payload.payload
    : undefined
}

export function getKernelSkillPromptContextResult(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeSkillPromptContextResult | undefined {
  return isKernelSkillsContextResolvedEvent(envelope)
    ? envelope.payload.payload
    : undefined
}

export function getKernelMcpSnapshot(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeMcpRegistrySnapshot | undefined {
  return isKernelMcpReloadedEvent(envelope) ? envelope.payload.payload : undefined
}

export function getKernelMcpLifecycleResult(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeMcpLifecycleResult | undefined {
  return isKernelMcpConnectedEvent(envelope) ||
    isKernelMcpAuthenticatedEvent(envelope) ||
    isKernelMcpEnabledChangedEvent(envelope)
    ? envelope.payload.payload
    : undefined
}

export function getKernelPluginSnapshot(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimePluginCatalogSnapshot | undefined {
  return isKernelPluginsReloadedEvent(envelope)
    ? envelope.payload.payload
    : undefined
}

export function getKernelPluginMutationResult(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimePluginMutationResult | undefined {
  return isKernelPluginsEnabledChangedEvent(envelope) ||
    isKernelPluginsInstalledEvent(envelope) ||
    isKernelPluginsUninstalledEvent(envelope) ||
    isKernelPluginsUpdatedEvent(envelope)
    ? envelope.payload.payload
    : undefined
}

export function getKernelAgentSpawnResult(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeAgentSpawnResult | undefined {
  return isKernelAgentsSpawnedEvent(envelope)
    ? envelope.payload.payload
    : undefined
}

export function getKernelAgentRunCancelResult(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeAgentRunCancelResult | undefined {
  return isKernelAgentsRunCancelledEvent(envelope)
    ? envelope.payload.payload
    : undefined
}

export function getKernelTaskMutationResult(
  envelope: KernelRuntimeEnvelopeBase,
): RuntimeTaskMutationResult | undefined {
  return isKernelTasksCreatedEvent(envelope) ||
    isKernelTasksUpdatedEvent(envelope) ||
    isKernelTasksAssignedEvent(envelope)
    ? envelope.payload.payload
    : undefined
}

export function getKernelTurnOutputText(
  envelope: KernelRuntimeEnvelopeBase,
): string | undefined {
  if (!isKernelRuntimeEventOfType(envelope, 'turn.output_delta')) {
    return undefined
  }
  const payload = envelope.payload.payload
  if (!isRecord(payload)) {
    return undefined
  }
  return typeof payload.text === 'string' ? payload.text : undefined
}

export function getKernelTurnTerminalSnapshot(
  envelope: KernelRuntimeEnvelopeBase,
): KernelTurnSnapshot | undefined {
  if (!isKernelTurnTerminalEvent(envelope)) {
    return undefined
  }
  const payload = envelope.payload.payload
  return isKernelTurnSnapshot(payload) ? payload : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getKnownTaxonomyEntry(
  type: string,
): (typeof KERNEL_RUNTIME_EVENT_TAXONOMY)[number] | undefined {
  return KERNEL_RUNTIME_EVENT_TAXONOMY.find(entry => entry.type === type)
}

function isKernelRuntimeEventEnvelopeLike(
  value: unknown,
): value is KernelRuntimeEventEnvelope {
  return (
    isRecord(value) &&
    value.kind === 'event' &&
    isKernelEventLike(value.payload)
  )
}

function isKernelEventLike(value: unknown): value is KernelEvent {
  return isRecord(value) && typeof value.type === 'string'
}

function isKernelPermissionRequestPayload(
  value: unknown,
): value is KernelPermissionRequest {
  return (
    isRecord(value) &&
    typeof value.permissionRequestId === 'string' &&
    typeof value.conversationId === 'string' &&
    typeof value.toolName === 'string' &&
    typeof value.action === 'string'
  )
}

function isKernelPermissionResolvedPayload(
  value: unknown,
): value is KernelPermissionResolvedPayload {
  if (!isKernelPermissionRequestPayload(value)) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.decision === 'string' &&
    typeof candidate.decidedBy === 'string'
  )
}

function isKernelCommandExecutionResult(
  value: unknown,
): value is RuntimeCommandExecutionResult {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    isRecord(value.result) &&
    typeof value.result.type === 'string'
  )
}

function isKernelToolCallResult(value: unknown): value is RuntimeToolCallResult {
  return isRecord(value) && typeof value.toolName === 'string' && 'output' in value
}

function isKernelHookRegistrySnapshot(
  value: unknown,
): value is RuntimeHookRegistrySnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.hooks) &&
    value.hooks.every(isKernelHookDescriptor)
  )
}

function isKernelHookRunResult(value: unknown): value is RuntimeHookRunResult {
  return (
    isRecord(value) &&
    typeof value.event === 'string' &&
    typeof value.handled === 'boolean'
  )
}

function isKernelHookMutationResult(
  value: unknown,
): value is RuntimeHookMutationResult {
  return (
    isRecord(value) &&
    isKernelHookDescriptor(value.hook) &&
    typeof value.registered === 'boolean'
  )
}

function isKernelSkillCatalogSnapshot(
  value: unknown,
): value is RuntimeSkillCatalogSnapshot {
  return isRecord(value) && Array.isArray(value.skills)
}

function isKernelSkillPromptContextResult(
  value: unknown,
): value is RuntimeSkillPromptContextResult {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.context === 'string'
  )
}

function isKernelHookDescriptor(value: unknown): value is RuntimeHookDescriptor {
  return (
    isRecord(value) &&
    typeof value.event === 'string' &&
    typeof value.type === 'string' &&
    typeof value.source === 'string'
  )
}

function isKernelAgentSpawnResult(value: unknown): value is RuntimeAgentSpawnResult {
  return (
    isRecord(value) &&
    typeof value.status === 'string' &&
    typeof value.prompt === 'string'
  )
}

function isKernelMcpRegistrySnapshot(
  value: unknown,
): value is RuntimeMcpRegistrySnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.servers) &&
    Array.isArray(value.resources) &&
    Array.isArray(value.toolBindings)
  )
}

function isKernelMcpLifecycleResult(
  value: unknown,
): value is RuntimeMcpLifecycleResult {
  return (
    isRecord(value) &&
    typeof value.serverName === 'string' &&
    typeof value.state === 'string'
  )
}

function isKernelPluginCatalogSnapshot(
  value: unknown,
): value is RuntimePluginCatalogSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.plugins) &&
    Array.isArray(value.errors)
  )
}

function isKernelPluginMutationResult(
  value: unknown,
): value is RuntimePluginMutationResult {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.enabled === 'boolean' &&
    typeof value.status === 'string'
  )
}

function isKernelAgentRunCancelResult(
  value: unknown,
): value is RuntimeAgentRunCancelResult {
  return (
    isRecord(value) &&
    typeof value.runId === 'string' &&
    typeof value.cancelled === 'boolean'
  )
}

function isKernelTaskMutationResult(
  value: unknown,
): value is RuntimeTaskMutationResult {
  return (
    isRecord(value) &&
    typeof value.taskListId === 'string' &&
    Array.isArray(value.updatedFields)
  )
}

function isKernelTurnSnapshot(value: unknown): value is KernelTurnSnapshot {
  return (
    isRecord(value) &&
    typeof value.conversationId === 'string' &&
    typeof value.turnId === 'string' &&
    typeof value.state === 'string'
  )
}

function inferEventCategory(
  type: string,
): KernelRuntimeEventCategory | undefined {
  const prefix = type.split('.', 1)[0]
  switch (prefix) {
    case 'runtime':
    case 'host':
    case 'conversation':
    case 'turn':
      return prefix
    case 'permission':
      return 'permission'
    case 'capability':
    case 'capabilities':
      return 'capability'
    case 'agents':
    case 'tasks':
      return 'extension'
    case 'headless':
      return 'compatibility'
    default:
      return type.includes('.') ? 'extension' : undefined
  }
}

function inferEventScope(type: string): KernelRuntimeEventScope {
  const category = inferEventCategory(type)
  if (category === 'turn' || category === 'permission') {
    return 'turn'
  }
  if (category === 'conversation' || category === 'capability') {
    return 'conversation'
  }
  return 'runtime'
}

function createPrefixTaxonomyEntry(
  type: string,
): KernelRuntimeEventTaxonomyEntry | undefined {
  const category = inferEventCategory(type)
  if (!category) {
    return undefined
  }
  return {
    type,
    category,
    scope: inferEventScope(type),
  }
}
