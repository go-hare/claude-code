/**
 * Stable public kernel API for external consumers.
 *
 * This surface is intentionally narrower than `src/runtime`: callers should
 * use it when they need to start a server, create/connect direct sessions,
 * or consume stable kernel-facing types without depending on internal layout.
 *
 * Semver contract:
 * - `src/kernel/index.ts` is the only source-level public kernel surface.
 * - the package-level `./kernel` entry re-exports this file and shares the
 *   same stability guarantee.
 * - leaf modules under `src/kernel/*` remain host-internal implementation
 *   surfaces and are not covered by the public semver promise.
 */
export {
  createDefaultKernelHeadlessEnvironment,
  createKernelHeadlessSession,
  createKernelHeadlessStore,
  runKernelHeadless,
} from './headless.js'
export { runKernelHeadlessLaunch } from './headlessLaunch.js'
export {
  createKernelHeadlessController,
  normalizeKernelHeadlessEvent,
} from './headlessController.js'
export { createKernelHeadlessInputQueue } from './headlessInputQueue.js'
export { createKernelHeadlessProviderEnv } from './headlessProvider.js'
export type {
  KernelHeadlessAbortRequest,
  KernelHeadlessController,
  KernelHeadlessControllerOptions,
  KernelHeadlessControllerState,
  KernelHeadlessControllerStatus,
  KernelHeadlessEvent,
  KernelHeadlessTurnStarted,
} from './headlessController.js'
export type {
  KernelHeadlessQueuedInterrupt,
  KernelHeadlessQueuedUserTurn,
  KernelHeadlessInputQueue,
} from './headlessInputQueue.js'
export type {
  KernelHeadlessProviderEnvOptions,
  KernelHeadlessProviderEnvResult,
  KernelHeadlessProviderName,
} from './headlessProvider.js'
export { connectDefaultKernelHeadlessMcp } from './headlessMcp.js'
export { prepareKernelHeadlessStartup } from './headlessStartup.js'
export type { KernelHeadlessMcpConnectOptions } from './headlessMcp.js'
export type {
  KernelHeadlessStartupStateWriter,
  PrepareKernelHeadlessStartupDeps,
  PrepareKernelHeadlessStartupOptions,
} from './headlessStartup.js'
export type {
  DefaultKernelHeadlessEnvironmentOptions,
  KernelHeadlessEnvironment,
  KernelHeadlessInput,
  KernelHeadlessRunOptions,
  KernelHeadlessSession,
  KernelHeadlessStore,
} from './headless.js'
export type {
  KernelHeadlessLaunchDeps,
  KernelHeadlessLaunchEnvironmentInput,
  KernelHeadlessLaunchOptions,
  KernelHeadlessLaunchRunOptions,
  KernelHeadlessLaunchStartupDeps,
  KernelHeadlessLaunchStartupOptions,
} from './headlessLaunch.js'
export type { KernelHeadlessRunTurnRequest } from './headlessController.js'
export type {
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEnvelopeKind,
  KernelRuntimeErrorCode,
  KernelRuntimeErrorPayload,
  KernelRuntimeEventSink,
} from '../runtime/contracts/events.js'
export {
  createDirectConnectSession as createKernelSession,
  connectDirectHostSession,
  applyDirectConnectSessionState,
  assembleServerHost,
  getDirectConnectErrorMessage,
  createDirectConnectSession,
  DirectConnectError,
  runConnectHeadless as runKernelHeadlessClient,
  runConnectHeadless,
  startServer as startKernelServer,
  startServer,
} from './serverHost.js'
export {
  connectResponseSchema,
  type DirectConnectConfig,
  type ServerConfig,
  type SessionIndex,
  type SessionIndexEntry,
  type SessionInfo,
  type SessionState,
} from '../server/types.js'
export { runBridgeHeadless } from './bridge.js'
export { runDaemonWorker } from './daemon.js'
export { createKernelCompanionRuntime } from './companion.js'
export { createKernelContextManager } from './context.js'
export { createKernelKairosRuntime } from './kairos.js'
export { createKernelMemoryManager } from './memory.js'
export {
  getCanonicalProjectionFromKernelEvent,
  getKernelRuntimeCoordinatorLifecycleProjection,
  getKernelRuntimeLifecycleProjection,
  getKernelRuntimeTaskNotificationProjection,
  getKernelRuntimeTerminalProjection,
  getTextOutputDeltaFromKernelRuntimeEnvelope,
  hasCanonicalProjection,
  isKernelRuntimeHostTurnTerminalEvent,
  KernelRuntimeOutputDeltaDedupe,
} from './outputProjection.js'
export { createKernelSessionManager } from './sessions.js'
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
  getKernelPermissionDecision,
  getKernelPermissionRequest,
  getKernelPluginMutationResult,
  getKernelPluginSnapshot,
  getKernelSkillPromptContextResult,
  getKernelSkillSnapshot,
  getKernelTaskMutationResult,
  getKernelRuntimeEventCategory,
  getKernelRuntimeEventTaxonomyEntry,
  getKernelRuntimeEventType,
  getKernelToolCallResult,
  getKernelTurnOutputText,
  getKernelTurnTerminalSnapshot,
  isKernelCommandsExecutedEvent,
  isKernelAgentsRunCancelledEvent,
  isKernelAgentsSpawnedEvent,
  isKernelCoordinatorLifecycleEvent,
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
  KernelCompanionAction,
  KernelCompanionEvent,
  KernelCompanionReactionRequest,
  KernelCompanionRuntime,
  KernelCompanionRuntimeOptions,
  KernelCompanionState,
} from './companion.js'
export type {
  KernelContextManager,
  KernelContextManagerOptions,
  KernelContextSnapshot,
} from './context.js'
export type {
  KernelKairosAutonomyCommand,
  KernelKairosEvent,
  KernelKairosExternalEvent,
  KernelKairosProactiveState,
  KernelKairosRuntime,
  KernelKairosRuntimeOptions,
  KernelKairosStatus,
  KernelKairosTickRequest,
} from './kairos.js'
export type {
  KernelMemoryDescriptor,
  KernelMemoryDocument,
  KernelMemoryManager,
  KernelMemoryManagerOptions,
  KernelMemorySource,
  KernelMemoryUpdateRequest,
} from './memory.js'
export type {
  KernelSessionDescriptor,
  KernelSessionListFilter,
  KernelSessionManager,
  KernelSessionManagerOptions,
  KernelSessionResume,
  KernelTranscript,
} from './sessions.js'
export type {
  KernelCapabilityFamily,
  KernelCapabilityFilter,
  KernelCapabilityGroups,
  KernelCapabilityView,
} from './capabilities.js'
export type {
  KernelEventType,
  KernelKnownEvent,
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
  KernelPluginsEnabledChangedEvent,
  KernelPluginsInstalledEvent,
  KernelPluginsReloadedEvent,
  KernelPluginsUninstalledEvent,
  KernelPluginsUpdatedEvent,
  KernelRuntimeEventCategory,
  KernelRuntimeEventScope,
  KernelRuntimeEventTaxonomyEntry,
  KernelRuntimeEventType,
  KernelRuntimeAgentEvent,
  KernelRuntimeCommandEvent,
  KernelRuntimeHookEvent,
  KernelRuntimeMcpEvent,
  KernelRuntimePermissionEvent,
  KernelRuntimePluginEvent,
  KernelRuntimeSkillEvent,
  KernelRuntimeTaskEvent,
  KernelRuntimeToolEvent,
  KernelSkillsContextResolvedEvent,
  KernelSkillsReloadedEvent,
  KernelTasksAssignedEvent,
  KernelTasksCreatedEvent,
  KernelTasksUpdatedEvent,
  KernelRuntimeEventEnvelope,
  KernelRuntimeEventHandler,
  KernelPermissionRequestedEvent,
  KernelPermissionResolvedEvent,
  KernelPermissionResolvedPayload,
  KernelToolsCalledEvent,
  KernelTurnCompletedEvent,
  KernelTurnEventType,
  KernelTurnFailedEvent,
  KernelTurnOutputDeltaEvent,
  KnownKernelRuntimeEventEnvelope,
} from './runtimeEvents.js'
export type {
  KernelCapabilityPlane,
  KernelRuntimeCapabilityIntent,
} from '../runtime/contracts/capability.js'
export type {
  RuntimeProviderAuthRef,
  RuntimeProviderHeaderRef,
  RuntimeProviderScope,
  RuntimeProviderSelection,
} from '../runtime/contracts/provider.js'
export type {
  KernelCapabilityDescriptor,
  KernelCapabilityReloadScope,
} from '../runtime/contracts/capability.js'
export type { KernelEvent } from '../runtime/contracts/events.js'
export type {
  KernelPermissionDecision,
  KernelPermissionDecisionSource,
  KernelPermissionDecisionValue,
  KernelPermissionRequest,
  KernelPermissionRequestId,
  KernelPermissionRisk,
} from '../runtime/contracts/permissions.js'
export type {
  KernelRuntimeHostIdentity,
  KernelRuntimeHostKind,
  KernelRuntimeTransportKind,
  KernelRuntimeTrustLevel,
} from '../runtime/contracts/runtime.js'
export {
  createKernelRuntimeEventFacade,
  consumeKernelRuntimeEventMessage,
  getKernelEventFromEnvelope,
  getKernelRuntimeEnvelopeFromMessage,
  isKernelRuntimeEnvelope,
  KernelRuntimeEventReplayError,
  toKernelRuntimeEventMessage,
} from './events.js'
export type {
  KernelRuntimeEventMessage,
  KernelRuntimeEventFacade,
  KernelRuntimeEventFacadeOptions,
  KernelRuntimeEventInput,
  KernelRuntimeEventReplayRequest,
} from './events.js'
export {
  createKernelPermissionBroker,
  KernelPermissionBrokerDisposedError,
  KernelPermissionDecisionError,
} from './permissions.js'
export type {
  KernelPermissionBroker,
  KernelPermissionBrokerOptions,
  KernelPermissionBrokerSnapshot,
  KernelPermissionDecisionHandler,
  KernelPermissionSessionGrantKeyFactory,
} from './permissions.js'
export {
  KERNEL_RUNTIME_JSON_RPC_LITE_PROTOCOL_VERSION,
  runKernelRuntimeJsonRpcLiteProtocol,
} from './jsonRpcLiteProtocol.js'
export type {
  KernelRuntimeJsonRpcLiteProtocolOptions,
  KernelRuntimeJsonRpcLiteRunnerOptions,
} from './jsonRpcLiteProtocol.js'
