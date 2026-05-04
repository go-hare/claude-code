import type {
  KernelCapabilityDescriptor,
  KernelCapabilityName,
  KernelRuntimeCapabilityIntent,
  KernelCapabilityReloadScope,
} from '../runtime/contracts/capability.js'
import type {
  KernelCapabilityFamily,
  KernelCapabilityFilter,
  KernelCapabilityGroups,
  KernelCapabilityView,
} from './capabilities.js'
import type {
  KernelConversationId,
  KernelConversationSnapshot,
} from '../runtime/contracts/conversation.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../runtime/contracts/events.js'
import type { KernelPermissionDecision } from '../runtime/contracts/permissions.js'
import type {
  RuntimeProviderAuthRef,
  RuntimeProviderHeaderRef,
  RuntimeProviderScope,
  RuntimeProviderSelection,
} from '../runtime/contracts/provider.js'
import type {
  KernelRuntimeHostIdentity,
  KernelRuntimeId,
  KernelRuntimeState,
  KernelRuntimeTransportKind,
} from '../runtime/contracts/runtime.js'
import type {
  KernelTurnId,
  KernelTurnRunRequest,
  KernelTurnSnapshot,
} from '../runtime/contracts/turn.js'
import type {
  KernelRuntimeWireClient,
  KernelRuntimeWireClientOptions,
  KernelRuntimeWireProtocolOptions,
  KernelRuntimeStdioWireTransportOptions,
  KernelRuntimeWireTransport,
} from './wireProtocol.js'
import {
  collectKernelRuntimeEventEnvelopes,
  getKernelCommandExecutionResult,
  getKernelAgentRunCancelResult,
  getKernelAgentSpawnResult,
  getKernelHookMutationResult,
  getKernelHookRegistrySnapshot,
  getKernelHookRunResult,
  getKernelMcpLifecycleResult,
  getKernelMcpSnapshot,
  getKernelPluginMutationResult,
  getKernelPluginSnapshot,
  getKernelSkillPromptContextResult,
  getKernelSkillSnapshot,
  getKernelTaskMutationResult,
  getKernelPermissionDecision,
  getKernelPermissionRequest,
  getKernelToolCallResult,
  getKernelTurnOutputText,
  getKernelTurnTerminalSnapshot,
  isKernelCommandsExecutedEvent,
  isKernelCoordinatorLifecycleEvent,
  isKernelAgentsRunCancelledEvent,
  isKernelAgentsSpawnedEvent,
  isKernelHooksRanEvent,
  isKernelHooksRegisteredEvent,
  isKernelHooksReloadedEvent,
  isKernelMcpAuthenticatedEvent,
  isKernelMcpConnectedEvent,
  isKernelMcpEnabledChangedEvent,
  isKernelMcpReloadedEvent,
  isKernelPermissionRequestedEvent,
  isKernelPermissionResolvedEvent,
  isKernelPluginsEnabledChangedEvent,
  isKernelPluginsInstalledEvent,
  isKernelPluginsReloadedEvent,
  isKernelPluginsUninstalledEvent,
  isKernelPluginsUpdatedEvent,
  isKernelSkillsContextResolvedEvent,
  isKernelSkillsReloadedEvent,
  isKernelTasksAssignedEvent,
  isKernelTasksCreatedEvent,
  isKernelTasksNotificationEvent,
  isKernelTasksUpdatedEvent,
  isKernelToolsCalledEvent,
} from './runtimeEvents.js'
import type {
  KernelCommandsExecutedEvent,
  KernelAgentsRunCancelledEvent,
  KernelAgentsSpawnedEvent,
  KernelHooksRanEvent,
  KernelHooksRegisteredEvent,
  KernelHooksReloadedEvent,
  KernelMcpAuthenticatedEvent,
  KernelMcpConnectedEvent,
  KernelMcpEnabledChangedEvent,
  KernelMcpReloadedEvent,
  KernelPermissionRequestedEvent,
  KernelPermissionResolvedEvent,
  KernelPermissionResolvedPayload,
  KernelEventType,
  KernelKnownEvent,
  KernelRuntimeAgentEvent,
  KernelRuntimeCommandEvent,
  KernelRuntimeEventCategory,
  KernelRuntimeEventEnvelope,
  KernelRuntimeEventHandler,
  KernelRuntimeHookEvent,
  KernelRuntimeMcpEvent,
  KernelRuntimePermissionEvent,
  KernelRuntimePluginEvent,
  KernelRuntimeSkillEvent,
  KernelRuntimeEventScope,
  KernelRuntimeTaskEvent,
  KernelRuntimeToolEvent,
  KernelPluginsEnabledChangedEvent,
  KernelPluginsInstalledEvent,
  KernelPluginsReloadedEvent,
  KernelPluginsUninstalledEvent,
  KernelPluginsUpdatedEvent,
  KernelRuntimeEventTaxonomyEntry,
  KernelRuntimeEventType,
  KernelSkillsContextResolvedEvent,
  KernelSkillsReloadedEvent,
  KernelTasksAssignedEvent,
  KernelTasksCreatedEvent,
  KernelTasksUpdatedEvent,
  KernelToolsCalledEvent,
  KernelTurnCompletedEvent,
  KernelTurnEventType,
  KernelTurnFailedEvent,
  KernelTurnOutputDeltaEvent,
  KnownKernelRuntimeEventEnvelope,
} from './runtimeEvents.js'
import type {
  KernelCommandDescriptor,
  KernelCommandEntry,
  KernelCommandExecuteRequest,
  KernelCommandExecutionResult,
  KernelCommandFilter,
  KernelCommandResult,
  KernelRuntimeCommandDescriptor,
  KernelRuntimeCommandKind,
  KernelRuntimeCommands,
} from './runtimeCommands.js'
import type {
  KernelRuntimeTools,
  KernelRuntimeToolSafety,
  KernelRuntimeToolSource,
  KernelToolCallRequest,
  KernelToolCallResult,
  KernelToolDescriptor,
  KernelToolFilter,
} from './runtimeTools.js'
import type {
  KernelMcpAuthAction,
  KernelMcpAuthRequest,
  KernelMcpConnectRequest,
  KernelMcpConnectionState,
  KernelMcpLifecycleResult,
  KernelMcpResourceRef,
  KernelMcpServerRef,
  KernelMcpSetEnabledRequest,
  KernelMcpSnapshot,
  KernelMcpToolBinding,
  KernelMcpTransport,
  KernelRuntimeMcp,
} from './runtimeMcp.js'
import type {
  KernelHookDescriptor,
  KernelHookFilter,
  KernelHookMutationResult,
  KernelHookRegisterRequest,
  KernelHookRunRequest,
  KernelHookRunResult,
  KernelHookSource,
  KernelHookType,
  KernelRuntimeHooks,
} from './runtimeHooks.js'
import type {
  KernelRuntimeSkills,
  KernelSkillContext,
  KernelSkillDescriptor,
  KernelSkillFilter,
  KernelSkillPromptContextRequest,
  KernelSkillPromptContextResult,
  KernelSkillSource,
} from './runtimeSkills.js'
import type {
  KernelPluginComponents,
  KernelPluginDescriptor,
  KernelPluginErrorDescriptor,
  KernelPluginFilter,
  KernelPluginInstallRequest,
  KernelPluginMutationResult,
  KernelPluginSnapshot,
  KernelPluginScope,
  KernelPluginSetEnabledRequest,
  KernelPluginStatus,
  KernelPluginUninstallRequest,
  KernelPluginUpdateRequest,
  KernelRuntimePlugins,
} from './runtimePlugins.js'
import type {
  KernelAgentDefinitionError,
  KernelAgentDescriptor,
  KernelAgentFilter,
  KernelAgentMcpServerRef,
  KernelAgentCancelOptions,
  KernelAgentCancelResult,
  KernelAgentOutput,
  KernelAgentOutputOptions,
  KernelAgentRunDescriptor,
  KernelAgentRunFilter,
  KernelAgentRunStatus,
  KernelAgentSnapshot,
  KernelAgentSource,
  KernelAgentSpawnRequest,
  KernelAgentSpawnResult,
  KernelRuntimeAgents,
} from './runtimeAgents.js'
import type {
  KernelCoordinatorTaskStatus,
  KernelRuntimeTasks,
  KernelTaskAssignRequest,
  KernelTaskCreateRequest,
  KernelTaskDescriptor,
  KernelTaskExecutionMetadata,
  KernelTaskFilter,
  KernelTaskListOptions,
  KernelTaskMutationResult,
  KernelTaskSnapshot,
  KernelTaskUpdateRequest,
} from './runtimeTasks.js'
import type {
  KernelCoordinatorAssignmentFilter,
  KernelCoordinatorInvokeRequest,
  KernelCoordinatorInvokeResult,
  KernelRuntimeCoordinator,
} from './runtimeCoordinator.js'
import type {
  KernelRuntimeTeams,
  KernelTeamCreateRequest,
  KernelTeamCreateResult,
  KernelTeamDescriptor,
  KernelTeamDetail,
  KernelTeamDestroyRequest,
  KernelTeamDestroyResult,
  KernelTeamMessageRequest,
  KernelTeamMessageResult,
  KernelTeamSnapshot,
} from './runtimeTeams.js'
import type { KernelCompanionRuntime } from './companion.js'
import type { KernelContextSnapshot } from './context.js'
import type { KernelKairosRuntime } from './kairos.js'
import type { KernelMemoryManager } from './memory.js'
import type {
  KernelSessionDescriptor,
  KernelTranscript,
} from './sessions.js'
import { KernelRuntimeRequestError } from './runtimeErrors.js'
import { createKernelRuntimeFacade } from './runtimeFacade.js'

export {
  KERNEL_CAPABILITY_FAMILIES,
  filterKernelCapabilities,
  getKernelCapabilityFamily,
  groupKernelCapabilities,
  isKernelCapabilityReady,
  isKernelCapabilityUnavailable,
  toKernelCapabilityView,
  toKernelCapabilityViews,
} from './capabilities.js'
export {
  reloadKernelRuntimeCapabilities,
  resolveKernelRuntimeCapabilities,
} from './runtimeCapabilities.js'
export type {
  KernelCapabilityFamily,
  KernelCapabilityFilter,
  KernelCapabilityGroups,
  KernelCapabilityView,
} from './capabilities.js'
export {
  KERNEL_RUNTIME_EVENT_TAXONOMY,
  KERNEL_RUNTIME_EVENT_TYPES,
  collectKernelRuntimeEventEnvelopes,
  getKernelCommandExecutionResult,
  getKernelAgentRunCancelResult,
  getKernelAgentSpawnResult,
  getKernelHookMutationResult,
  getKernelHookRegistrySnapshot,
  getKernelHookRunResult,
  getKernelMcpLifecycleResult,
  getKernelMcpSnapshot,
  getKernelPluginMutationResult,
  getKernelPluginSnapshot,
  getKernelSkillPromptContextResult,
  getKernelSkillSnapshot,
  getKernelTaskMutationResult,
  getKernelPermissionDecision,
  getKernelPermissionRequest,
  getKernelToolCallResult,
  getKernelRuntimeEventCategory,
  getKernelRuntimeEventTaxonomyEntry,
  getKernelRuntimeEventType,
  getKernelTurnOutputText,
  getKernelTurnTerminalSnapshot,
  isKernelCommandsExecutedEvent,
  isKernelCoordinatorLifecycleEvent,
  isKernelAgentsRunCancelledEvent,
  isKernelAgentsSpawnedEvent,
  isKernelHooksRanEvent,
  isKernelHooksRegisteredEvent,
  isKernelHooksReloadedEvent,
  isKernelMcpAuthenticatedEvent,
  isKernelMcpConnectedEvent,
  isKernelMcpEnabledChangedEvent,
  isKernelMcpReloadedEvent,
  isKernelPermissionRequestedEvent,
  isKernelPermissionResolvedEvent,
  isKernelPluginsEnabledChangedEvent,
  isKernelPluginsInstalledEvent,
  isKernelPluginsReloadedEvent,
  isKernelPluginsUninstalledEvent,
  isKernelPluginsUpdatedEvent,
  isKernelRuntimeEventEnvelope,
  isKernelRuntimeEventOfType,
  isKernelSkillsContextResolvedEvent,
  isKernelSkillsReloadedEvent,
  isKernelTasksAssignedEvent,
  isKernelTasksCreatedEvent,
  isKernelTasksNotificationEvent,
  isKernelTasksUpdatedEvent,
  isKernelToolsCalledEvent,
  isKernelTurnTerminalEvent,
  isKnownKernelRuntimeEventType,
} from './runtimeEvents.js'
export type {
  KernelCommandDescriptor,
  KernelCommandEntry,
  KernelCommandExecuteRequest,
  KernelCommandExecutionResult,
  KernelCommandFilter,
  KernelCommandResult,
  KernelRuntimeCommandDescriptor,
  KernelRuntimeCommandKind,
  KernelRuntimeCommands,
} from './runtimeCommands.js'
export type {
  KernelRuntimeTools,
  KernelRuntimeToolSafety,
  KernelRuntimeToolSource,
  KernelToolCallRequest,
  KernelToolCallResult,
  KernelToolDescriptor,
  KernelToolFilter,
} from './runtimeTools.js'
export type {
  KernelMcpConnectionState,
  KernelMcpAuthAction,
  KernelMcpAuthRequest,
  KernelMcpConnectRequest,
  KernelMcpLifecycleResult,
  KernelMcpResourceRef,
  KernelMcpServerRef,
  KernelMcpSetEnabledRequest,
  KernelMcpSnapshot,
  KernelMcpToolBinding,
  KernelMcpTransport,
  KernelRuntimeMcp,
} from './runtimeMcp.js'
export type {
  KernelHookDescriptor,
  KernelHookFilter,
  KernelHookMutationResult,
  KernelHookRegisterRequest,
  KernelHookRunRequest,
  KernelHookRunResult,
  KernelHookSource,
  KernelHookType,
  KernelRuntimeHooks,
} from './runtimeHooks.js'
export type {
  KernelRuntimeSkills,
  KernelSkillContext,
  KernelSkillDescriptor,
  KernelSkillFilter,
  KernelSkillPromptContextRequest,
  KernelSkillPromptContextResult,
  KernelSkillSource,
} from './runtimeSkills.js'
export type {
  KernelPluginComponents,
  KernelPluginDescriptor,
  KernelPluginErrorDescriptor,
  KernelPluginFilter,
  KernelPluginInstallRequest,
  KernelPluginMutationResult,
  KernelPluginSnapshot,
  KernelPluginScope,
  KernelPluginSetEnabledRequest,
  KernelPluginStatus,
  KernelPluginUninstallRequest,
  KernelPluginUpdateRequest,
  KernelRuntimePlugins,
} from './runtimePlugins.js'
export type {
  KernelAgentCancelOptions,
  KernelAgentCancelResult,
  KernelAgentDefinitionError,
  KernelAgentDescriptor,
  KernelAgentFilter,
  KernelAgentMcpServerRef,
  KernelAgentOutput,
  KernelAgentOutputOptions,
  KernelAgentRunDescriptor,
  KernelAgentRunFilter,
  KernelAgentRunStatus,
  KernelAgentSnapshot,
  KernelAgentSource,
  KernelAgentSpawnRequest,
  KernelAgentSpawnResult,
  KernelRuntimeAgents,
} from './runtimeAgents.js'
export type {
  KernelCoordinatorTaskStatus,
  KernelRuntimeTasks,
  KernelTaskAssignRequest,
  KernelTaskCreateRequest,
  KernelTaskDescriptor,
  KernelTaskExecutionMetadata,
  KernelTaskFilter,
  KernelTaskListOptions,
  KernelTaskMutationResult,
  KernelTaskSnapshot,
  KernelTaskUpdateRequest,
} from './runtimeTasks.js'
export type {
  KernelCoordinatorAssignmentFilter,
  KernelCoordinatorInvokeRequest,
  KernelCoordinatorInvokeResult,
  KernelRuntimeCoordinator,
} from './runtimeCoordinator.js'
export type {
  KernelRuntimeTeams,
  KernelTeamCreateRequest,
  KernelTeamCreateResult,
  KernelTeamDescriptor,
  KernelTeamDetail,
  KernelTeamDestroyRequest,
  KernelTeamDestroyResult,
  KernelTeamMessageRequest,
  KernelTeamMessageResult,
  KernelTeamSnapshot,
} from './runtimeTeams.js'
export type { KernelRuntimeCapabilityIntent } from '../runtime/contracts/capability.js'
export type {
  RuntimeProviderAuthRef,
  RuntimeProviderHeaderRef,
  RuntimeProviderScope,
  RuntimeProviderSelection,
} from '../runtime/contracts/provider.js'
export type {
  KernelCommandsExecutedEvent,
  KernelAgentsRunCancelledEvent,
  KernelAgentsSpawnedEvent,
  KernelHooksRanEvent,
  KernelHooksRegisteredEvent,
  KernelHooksReloadedEvent,
  KernelMcpAuthenticatedEvent,
  KernelMcpConnectedEvent,
  KernelMcpEnabledChangedEvent,
  KernelMcpReloadedEvent,
  KernelPermissionRequestedEvent,
  KernelPermissionResolvedEvent,
  KernelPermissionResolvedPayload,
  KernelEventType,
  KernelKnownEvent,
  KernelRuntimeAgentEvent,
  KernelRuntimeCommandEvent,
  KernelRuntimeEventCategory,
  KernelRuntimeEventEnvelope,
  KernelRuntimeEventHandler,
  KernelRuntimeHookEvent,
  KernelRuntimeMcpEvent,
  KernelRuntimePermissionEvent,
  KernelRuntimePluginEvent,
  KernelRuntimeSkillEvent,
  KernelRuntimeEventScope,
  KernelRuntimeTaskEvent,
  KernelRuntimeToolEvent,
  KernelPluginsEnabledChangedEvent,
  KernelPluginsInstalledEvent,
  KernelPluginsReloadedEvent,
  KernelPluginsUninstalledEvent,
  KernelPluginsUpdatedEvent,
  KernelRuntimeEventTaxonomyEntry,
  KernelRuntimeEventType,
  KernelSkillsContextResolvedEvent,
  KernelSkillsReloadedEvent,
  KernelTasksAssignedEvent,
  KernelTasksCreatedEvent,
  KernelTasksUpdatedEvent,
  KernelToolsCalledEvent,
  KernelTurnCompletedEvent,
  KernelTurnEventType,
  KernelTurnFailedEvent,
  KernelTurnOutputDeltaEvent,
  KnownKernelRuntimeEventEnvelope,
} from './runtimeEvents.js'

export type KernelRuntimeTransportConfig =
  | { kind?: 'in-process' }
  | ({ kind: 'stdio' } & KernelRuntimeStdioWireTransportOptions)

export type KernelRuntimeOptions = KernelRuntimeWireProtocolOptions & {
  id?: KernelRuntimeId
  host?: Partial<KernelRuntimeHostIdentity>
  provider?: RuntimeProviderSelection
  defaultProvider?: RuntimeProviderSelection
  auth?: Record<string, unknown>
  model?: string
  capabilities?: Record<string, unknown>
  transport?: KernelRuntimeWireTransport
  transportConfig?: KernelRuntimeTransportConfig
  wireClient?: KernelRuntimeWireClient
  wireClientOptions?: KernelRuntimeWireClientOptions
  autoStart?: boolean
}

export type KernelConversationOptions = {
  id?: KernelConversationId
  workspacePath?: string
  sessionId?: string
  sessionMeta?: Record<string, unknown>
  capabilityIntent?: KernelRuntimeCapabilityIntent
  provider?: RuntimeProviderSelection
  metadata?: Record<string, unknown>
}

export type KernelRunTurnOptions = {
  turnId?: KernelTurnId
  attachments?: KernelTurnRunRequest['attachments']
  providerOverride?: RuntimeProviderSelection
  executionMode?: KernelTurnRunRequest['executionMode']
  contextAssembly?: KernelTurnRunRequest['contextAssembly']
  capabilityPlane?: KernelTurnRunRequest['capabilityPlane']
  metadata?: Record<string, unknown>
}

export type KernelWaitForTurnOptions = {
  sinceEventId?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export type KernelRunTurnAndWaitOptions = KernelRunTurnOptions &
  KernelWaitForTurnOptions

export type KernelAbortTurnOptions = {
  reason?: string
  metadata?: Record<string, unknown>
}

export type KernelRuntimeEventReplayOptions = {
  conversationId?: KernelConversationId
  turnId?: KernelTurnId
  sinceEventId?: string
  filters?: Record<string, unknown>
}

export type KernelRuntimeHostEventPublishOptions = {
  requestId?: string
  metadata?: Record<string, unknown>
}

export type KernelRuntimeHostEventPublishResult = {
  published: boolean
  eventId?: string
}

export type KernelTurnEventReplayOptions = Omit<
  KernelRuntimeEventReplayOptions,
  'conversationId' | 'turnId'
>

export type KernelRuntimeCapabilities = {
  list(): readonly KernelCapabilityDescriptor[]
  views(): readonly KernelCapabilityView[]
  get(name: KernelCapabilityName): KernelCapabilityDescriptor | undefined
  getView(name: KernelCapabilityName): KernelCapabilityView | undefined
  filter(filter?: KernelCapabilityFilter): readonly KernelCapabilityView[]
  groupByFamily(): KernelCapabilityGroups
  listByFamily(family: KernelCapabilityFamily): readonly KernelCapabilityView[]
  reload(
    scope?: KernelCapabilityReloadScope,
  ): Promise<readonly KernelCapabilityDescriptor[]>
}

export type KernelRuntimePermissions = {
  decide(decision: KernelPermissionDecision): Promise<KernelPermissionDecision>
  onEvent(handler: (event: KernelRuntimePermissionEvent) => void): () => void
  replay(
    options?: KernelRuntimeEventReplayOptions,
  ): Promise<readonly KernelRuntimePermissionEvent[]>
}

export type KernelRuntimeContextManager = {
  read(): Promise<KernelContextSnapshot>
  getSystem(): Promise<Record<string, string>>
  getUser(): Promise<Record<string, string>>
  getGitStatus(): Promise<string | null>
  getSystemPromptInjection(): Promise<string | null>
  setSystemPromptInjection(value: string | null): Promise<string | null>
}

export type KernelRuntimeSessionResumeOptions = {
  conversationId?: KernelConversationId
  workspacePath?: string
  resumeInterruptedTurn?: boolean
  resumeSessionAt?: string
  metadata?: Record<string, unknown>
}

export type KernelRuntimeSessionManager = {
  list(
    filter?: {
      cwd?: string
      limit?: number
      offset?: number
      includeWorktrees?: boolean
    },
  ): Promise<readonly KernelSessionDescriptor[]>
  resume(
    sessionId: string,
    options?: KernelRuntimeSessionResumeOptions,
  ): Promise<KernelConversation>
  getTranscript(sessionId: string): Promise<KernelTranscript>
}

export type KernelTurn = {
  readonly id: KernelTurnId
  readonly conversationId: KernelConversationId
  snapshot(): KernelTurnSnapshot
  wait(options?: KernelWaitForTurnOptions): Promise<KernelTurnSnapshot>
  abort(options?: KernelAbortTurnOptions): Promise<KernelTurnSnapshot>
  onEvent(handler: KernelRuntimeEventHandler): () => void
  replayEvents(
    options?: KernelTurnEventReplayOptions,
  ): Promise<KernelRuntimeEventEnvelope[]>
}

export type KernelConversation = {
  readonly id: KernelConversationId
  readonly workspacePath: string
  readonly sessionId: string | undefined
  snapshot(): KernelConversationSnapshot
  startTurn(
    prompt: KernelTurnRunRequest['prompt'],
    options?: KernelRunTurnOptions,
  ): Promise<KernelTurn>
  runTurn(
    prompt: KernelTurnRunRequest['prompt'],
    options?: KernelRunTurnOptions,
  ): Promise<KernelTurnSnapshot>
  waitForTurn(
    turnId: KernelTurnId,
    options?: KernelWaitForTurnOptions,
  ): Promise<KernelTurnSnapshot>
  runTurnAndWait(
    prompt: KernelTurnRunRequest['prompt'],
    options?: KernelRunTurnAndWaitOptions,
  ): Promise<KernelTurnSnapshot>
  abortTurn(
    turnId: KernelTurnId,
    options?: KernelAbortTurnOptions,
  ): Promise<KernelTurnSnapshot>
  onEvent(handler: KernelRuntimeEventSink): () => void
  replayEvents(
    options?: Omit<KernelRuntimeEventReplayOptions, 'conversationId'>,
  ): Promise<KernelRuntimeEnvelopeBase[]>
  dispose(reason?: string): Promise<void>
}

export type KernelRuntime = {
  readonly id: KernelRuntimeId
  readonly workspacePath: string
  readonly host: KernelRuntimeHostIdentity
  readonly transportKind: KernelRuntimeTransportKind
  readonly capabilities: KernelRuntimeCapabilities
  readonly commands: KernelRuntimeCommands
  readonly tools: KernelRuntimeTools
  readonly mcp: KernelRuntimeMcp
  readonly hooks: KernelRuntimeHooks
  readonly skills: KernelRuntimeSkills
  readonly plugins: KernelRuntimePlugins
  readonly agents: KernelRuntimeAgents
  readonly tasks: KernelRuntimeTasks
  readonly teams: KernelRuntimeTeams
  readonly coordinator: KernelRuntimeCoordinator
  readonly companion: KernelCompanionRuntime
  readonly kairos: KernelKairosRuntime
  readonly memory: KernelMemoryManager
  readonly context: KernelRuntimeContextManager
  readonly sessions: KernelRuntimeSessionManager
  readonly permissions: KernelRuntimePermissions
  readonly state: KernelRuntimeState
  start(): Promise<void>
  createConversation(
    options?: KernelConversationOptions,
  ): Promise<KernelConversation>
  reloadCapabilities(
    scope?: KernelCapabilityReloadScope,
  ): Promise<readonly KernelCapabilityDescriptor[]>
  decidePermission(
    decision: KernelPermissionDecision,
  ): Promise<KernelPermissionDecision>
  publishHostEvent(
    event: KernelEvent,
    options?: KernelRuntimeHostEventPublishOptions,
  ): Promise<KernelRuntimeHostEventPublishResult>
  onEvent(handler: KernelRuntimeEventSink): () => void
  replayEvents(
    options?: KernelRuntimeEventReplayOptions,
  ): Promise<KernelRuntimeEnvelopeBase[]>
  dispose(reason?: string): Promise<void>
}

export { KernelRuntimeRequestError }

export async function createKernelRuntime(
  options: KernelRuntimeOptions = {},
): Promise<KernelRuntime> {
  const runtime = createKernelRuntimeFacade(options)
  if (options.autoStart) {
    await runtime.start()
  }
  return runtime
}
