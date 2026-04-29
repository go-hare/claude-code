export type KernelJsonSchema = Record<string, unknown>

export type KernelHeadlessState = Record<string, unknown>

export type KernelCommand = {
  name: string
  [key: string]: unknown
}

export type KernelTool = {
  name?: string
  [key: string]: unknown
}

export type KernelAgentDefinition = {
  agentType: string
  [key: string]: unknown
}

export type KernelMcpServerConfig = {
  type?: string
  scope?: string
  [key: string]: unknown
}

export type KernelMcpServerConnection = {
  name: string
  type: string
  config: KernelMcpServerConfig
  [key: string]: unknown
}

export type KernelToolPermissionContext = {
  mode: string
  [key: string]: unknown
}

export type KernelThinkingConfig = Record<string, unknown>

export type KernelHeadlessInput = string | AsyncIterable<string>

export type KernelRuntimeEnvelopeKind = 'ack' | 'event' | 'error' | 'pong'

export type KernelRuntimeErrorCode =
  | 'invalid_request'
  | 'schema_mismatch'
  | 'not_found'
  | 'busy'
  | 'permission_denied'
  | 'aborted'
  | 'unavailable'
  | 'internal_error'

export type KernelRuntimeErrorPayload = {
  code: KernelRuntimeErrorCode
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export type KernelRuntimeEnvelopeBase<TPayload = unknown> = {
  schemaVersion: 'kernel.runtime.v1'
  messageId: string
  requestId?: string
  eventId?: string
  sequence: number
  timestamp: string
  source: 'kernel_runtime'
  kind: KernelRuntimeEnvelopeKind
  runtimeId?: string
  conversationId?: string
  turnId?: string
  payload?: TPayload
  error?: KernelRuntimeErrorPayload
  metadata?: Record<string, unknown>
}

export type KernelRuntimeEventSink = (
  envelope: KernelRuntimeEnvelopeBase,
) => void

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

export type KernelRuntimeEventType =
  | 'runtime.ready'
  | 'host.connected'
  | 'host.reconnected'
  | 'host.disconnected'
  | 'host.focus_changed'
  | 'conversation.ready'
  | 'conversation.recovered'
  | 'conversation.disposed'
  | 'conversation.snapshot_failed'
  | 'turn.started'
  | 'turn.abort_requested'
  | 'turn.output_delta'
  | 'turn.delta'
  | 'turn.progress'
  | 'turn.completed'
  | 'turn.failed'
  | 'permission.requested'
  | 'permission.resolved'
  | 'capabilities.required'
  | 'capabilities.reloaded'
  | 'commands.executed'
  | 'tools.called'
  | 'mcp.reloaded'
  | 'mcp.connected'
  | 'mcp.authenticated'
  | 'mcp.enabled_changed'
  | 'hooks.reloaded'
  | 'hooks.ran'
  | 'hooks.registered'
  | 'skills.reloaded'
  | 'skills.context_resolved'
  | 'plugins.reloaded'
  | 'plugins.enabled_changed'
  | 'plugins.installed'
  | 'plugins.uninstalled'
  | 'plugins.updated'
  | 'agents.reloaded'
  | 'agents.spawned'
  | 'agents.run.cancelled'
  | 'tasks.created'
  | 'tasks.updated'
  | 'tasks.assigned'
  | 'headless.sdk_message'

export type KernelEventType = KernelRuntimeEventType | (string & {})

export type KernelTurnEventType =
  | 'turn.started'
  | 'turn.abort_requested'
  | 'turn.output_delta'
  | 'turn.delta'
  | 'turn.progress'
  | 'turn.completed'
  | 'turn.failed'

export declare const KERNEL_RUNTIME_EVENT_TAXONOMY: readonly KernelRuntimeEventTaxonomyEntry[]

export declare const KERNEL_RUNTIME_EVENT_TYPES: readonly KernelRuntimeEventType[]

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

export type KernelKnownEvent = KnownKernelRuntimeEventEnvelope

export type KernelRuntimeEventHandler = (
  envelope: KernelRuntimeEventEnvelope,
) => void

export declare function isKnownKernelRuntimeEventType(
  type: string,
): type is KernelRuntimeEventType

export declare function getKernelRuntimeEventType(
  input: KernelRuntimeEnvelopeBase | KernelEvent | unknown,
): string | undefined

export declare function getKernelRuntimeEventCategory(
  input: KernelRuntimeEnvelopeBase | KernelEvent | string | unknown,
): KernelRuntimeEventCategory | undefined

export declare function getKernelRuntimeEventTaxonomyEntry(
  type: string,
): KernelRuntimeEventTaxonomyEntry | undefined

export declare function isKernelRuntimeEventEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelRuntimeEventEnvelope

export declare function isKernelRuntimeEventOfType<
  TType extends KernelRuntimeEventType,
>(
  envelope: KernelRuntimeEnvelopeBase,
  type: TType,
): envelope is KnownKernelRuntimeEventEnvelope<TType>

export declare function isKernelTurnTerminalEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KnownKernelRuntimeEventEnvelope<'turn.completed' | 'turn.failed'>

export type KernelRuntimeEventMessage = {
  type: 'kernel_runtime_event'
  envelope: KernelRuntimeEnvelopeBase
  uuid: string
  session_id: string
}

export type KernelEvent = {
  runtimeId?: string
  conversationId?: string
  turnId?: string
  type: string
  eventId?: string
  replayable: boolean
  payload?: unknown
  metadata?: Record<string, unknown>
}

export type KernelRuntimeEventInput = Omit<
  KernelEvent,
  'runtimeId' | 'eventId'
> &
  Partial<Pick<KernelEvent, 'runtimeId' | 'eventId'>>

export type KernelRuntimeEventReplayRequest = {
  sinceEventId?: string
  conversationId?: string
  turnId?: string
}

export type KernelRuntimeEventFacadeOptions = {
  runtimeId: string
  maxReplayEvents?: number
  initialReplayEnvelopes?: readonly KernelRuntimeEnvelopeBase<KernelEvent>[]
  onEvent?: KernelRuntimeEventSink
  now?: () => string
  createMessageId?: () => string
}

export type KernelRuntimeEventFacade = {
  emit(event: KernelRuntimeEventInput): KernelRuntimeEnvelopeBase<KernelEvent>
  ingestEnvelope(envelope: KernelRuntimeEnvelopeBase): boolean
  ingestMessage(message: unknown): KernelRuntimeEnvelopeBase | undefined
  subscribe(handler: KernelRuntimeEventSink): () => void
  replay(
    request?: KernelRuntimeEventReplayRequest,
  ): Array<KernelRuntimeEnvelopeBase<KernelEvent>>
}

export type KernelRuntimeEventReplayErrorCode = 'expired' | 'not_found'

export declare class KernelRuntimeEventReplayError extends Error {
  readonly code: KernelRuntimeEventReplayErrorCode
  readonly eventId: string
  constructor(code: KernelRuntimeEventReplayErrorCode, eventId: string)
}

export declare function createKernelRuntimeEventFacade(
  options: KernelRuntimeEventFacadeOptions,
): KernelRuntimeEventFacade

export declare function getKernelRuntimeEnvelopeFromMessage(
  message: unknown,
): KernelRuntimeEnvelopeBase | undefined

export declare function toKernelRuntimeEventMessage(
  envelope: KernelRuntimeEnvelopeBase,
  sessionId: string,
): KernelRuntimeEventMessage

export declare function consumeKernelRuntimeEventMessage(
  message: unknown,
  sink?: KernelRuntimeEventSink,
): boolean

export declare function isKernelRuntimeEnvelope(
  value: unknown,
): value is KernelRuntimeEnvelopeBase

export declare function getKernelEventFromEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): KernelEvent | undefined

export type KernelRuntimeHostKind =
  | 'cli'
  | 'desktop'
  | 'daemon'
  | 'remote'
  | 'worker'
  | 'sdk'
  | 'robot'
  | 'test'

export type KernelRuntimeTransportKind =
  | 'in-process'
  | 'stdio'
  | 'ipc'
  | 'websocket'
  | 'http'
  | 'unix-socket'

export type KernelRuntimeTrustLevel =
  | 'first-party'
  | 'workspace'
  | 'local'
  | 'remote'
  | 'untrusted'

export type KernelRuntimeState =
  | 'created'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'disposed'

export type KernelRuntimeHostIdentity = {
  kind: KernelRuntimeHostKind
  id: string
  transport: KernelRuntimeTransportKind
  trustLevel: KernelRuntimeTrustLevel
  declaredCapabilities: readonly string[]
  metadata?: Record<string, unknown>
}

export type KernelCapabilityName = string

export type KernelCapabilityStatus =
  | 'declared'
  | 'loading'
  | 'ready'
  | 'degraded'
  | 'failed'
  | 'disabled'

export type KernelCapabilityError = {
  code: string
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export type KernelCapabilityDescriptor = {
  name: KernelCapabilityName
  status: KernelCapabilityStatus
  lazy: boolean
  dependencies: readonly KernelCapabilityName[]
  reloadable: boolean
  error?: KernelCapabilityError
  metadata?: Record<string, unknown>
}

export type KernelCapabilityFamily =
  | 'core'
  | 'execution'
  | 'model'
  | 'extension'
  | 'security'
  | 'host'
  | 'autonomy'
  | 'observability'

export declare const KERNEL_CAPABILITY_FAMILIES: readonly KernelCapabilityFamily[]

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

export declare function getKernelCapabilityFamily(
  capability: KernelCapabilityDescriptor | KernelCapabilityName,
): KernelCapabilityFamily

export declare function toKernelCapabilityView(
  descriptor: KernelCapabilityDescriptor,
): KernelCapabilityView

export declare function toKernelCapabilityViews(
  descriptors: readonly KernelCapabilityDescriptor[],
): readonly KernelCapabilityView[]

export declare function filterKernelCapabilities(
  descriptors: readonly KernelCapabilityDescriptor[],
  filter?: KernelCapabilityFilter,
): readonly KernelCapabilityView[]

export declare function groupKernelCapabilities(
  descriptors: readonly KernelCapabilityDescriptor[],
): KernelCapabilityGroups

export declare function isKernelCapabilityReady(
  descriptor: KernelCapabilityDescriptor,
): boolean

export declare function isKernelCapabilityUnavailable(
  descriptor: KernelCapabilityDescriptor,
): boolean

export type KernelCapabilityReloadScope =
  | { type: 'capability'; name: KernelCapabilityName }
  | { type: 'dependency-closure'; name: KernelCapabilityName }
  | { type: 'workspace' }
  | { type: 'runtime' }

export type KernelRuntimeCommandKind =
  | 'prompt'
  | 'local'
  | 'local-jsx'
  | 'workflow'

export type KernelRuntimeCommandDescriptor = {
  name: string
  description: string
  kind: KernelRuntimeCommandKind
  aliases?: readonly string[]
  availability?: readonly string[]
  argumentHint?: string
  bridgeSafe?: boolean
  disableModelInvocation?: boolean
  hidden?: boolean
  immediate?: boolean
  sensitive?: boolean
  terminalOnly?: boolean
  whenToUse?: string
}

export type KernelCommandDescriptor = KernelRuntimeCommandDescriptor

export type KernelCommandEntry = {
  descriptor: KernelCommandDescriptor
  source?: string
  loadedFrom?: string
  supportsNonInteractive: boolean
  modelInvocable: boolean
}

export type KernelCommandFilter = {
  names?: readonly string[]
  kind?: KernelRuntimeCommandKind | readonly KernelRuntimeCommandKind[]
  source?: string | readonly string[]
  loadedFrom?: string | readonly string[]
  supportsNonInteractive?: boolean
  modelInvocable?: boolean
  hidden?: boolean
  terminalOnly?: boolean
}

export type KernelCommandExecuteRequest = {
  name: string
  args?: string
  source?: 'cli' | 'repl' | 'bridge' | 'daemon' | 'sdk' | 'test'
  metadata?: Record<string, unknown>
}

export type KernelCommandResult =
  | { type: 'skip' }
  | { type: 'text'; text: string; display?: 'skip' | 'system' | 'user' }
  | {
      type: 'query'
      prompt?: string
      text?: string
      metaMessages?: readonly string[]
      nextInput?: string
      submitNextInput?: boolean
    }
  | { type: 'compact'; text?: string; metaMessages?: readonly string[] }

export type KernelCommandExecutionResult = {
  name: string
  kind?: KernelRuntimeCommandKind
  result: KernelCommandResult
  metadata?: Record<string, unknown>
}

export type KernelRuntimeToolSafety = 'read' | 'write' | 'destructive'

export type KernelRuntimeToolSource =
  | 'builtin'
  | 'mcp'
  | 'plugin'
  | 'skill'
  | 'host'

export type KernelToolDescriptor = {
  name: string
  description: string
  source: KernelRuntimeToolSource
  provenance?: {
    source: KernelRuntimeToolSource
    label?: string
    serverName?: string
    toolName?: string
  }
  aliases?: readonly string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  safety: KernelRuntimeToolSafety
  isConcurrencySafe?: boolean
  isDeferred?: boolean
  isMcp?: boolean
  isOpenWorld?: boolean
  requiresUserInteraction?: boolean
}

export type KernelToolFilter = {
  names?: readonly string[]
  source?: KernelRuntimeToolSource | readonly KernelRuntimeToolSource[]
  safety?: KernelRuntimeToolSafety | readonly KernelRuntimeToolSafety[]
  aliases?: readonly string[]
  mcp?: boolean
  deferred?: boolean
  concurrencySafe?: boolean
  openWorld?: boolean
  requiresUserInteraction?: boolean
}

export type KernelToolCallRequest = {
  toolName: string
  input: unknown
  permissionMode?: string
  metadata?: Record<string, unknown>
}

export type KernelToolCallResult = {
  toolName: string
  output: unknown
  isError?: boolean
  metadata?: Record<string, unknown>
}

export type KernelMcpTransport =
  | 'stdio'
  | 'sse'
  | 'sse-ide'
  | 'http'
  | 'ws'
  | 'ws-ide'
  | 'sdk'
  | 'claudeai-proxy'
  | 'unknown'

export type KernelMcpConnectionState =
  | 'pending'
  | 'connected'
  | 'needs-auth'
  | 'failed'
  | 'disabled'

export type KernelMcpServerRef = {
  name: string
  transport: KernelMcpTransport
  state: KernelMcpConnectionState
  scope?: string
  capabilities?: Record<string, unknown>
  error?: string
}

export type KernelMcpResourceRef = {
  server: string
  uri: string
  name?: string
  mimeType?: string
}

export type KernelMcpToolBinding = {
  server: string
  serverToolName: string
  runtimeToolName: string
}

export type KernelMcpSnapshot = {
  servers: readonly KernelMcpServerRef[]
  resources: readonly KernelMcpResourceRef[]
  toolBindings: readonly KernelMcpToolBinding[]
}

export type KernelMcpConnectRequest = {
  serverName: string
  metadata?: Record<string, unknown>
}

export type KernelMcpAuthAction = 'authenticate' | 'clear'

export type KernelMcpAuthRequest = {
  serverName: string
  action?: KernelMcpAuthAction
  callbackUrl?: string
  metadata?: Record<string, unknown>
}

export type KernelMcpSetEnabledRequest = {
  serverName: string
  enabled: boolean
  metadata?: Record<string, unknown>
}

export type KernelMcpLifecycleResult = {
  serverName: string
  state: KernelMcpConnectionState
  server?: KernelMcpServerRef
  snapshot?: Partial<KernelMcpSnapshot>
  authorizationUrl?: string
  message?: string
  metadata?: Record<string, unknown>
}

export type KernelHookType =
  | 'command'
  | 'prompt'
  | 'agent'
  | 'http'
  | 'callback'
  | 'function'
  | 'unknown'

export type KernelHookSource =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'policySettings'
  | 'pluginHook'
  | 'sessionHook'
  | 'builtinHook'
  | 'unknown'

export type KernelHookDescriptor = {
  event: string
  type: KernelHookType
  source: KernelHookSource
  matcher?: string
  pluginName?: string
  displayName?: string
  timeoutSeconds?: number
  async?: boolean
  once?: boolean
}

export type KernelHookRunRequest = {
  event: string
  input?: unknown
  matcher?: string
  metadata?: Record<string, unknown>
}

export type KernelHookRunError = {
  message: string
  hook?: KernelHookDescriptor
  code?: string
}

export type KernelHookRunResult = {
  event: string
  handled: boolean
  outputs?: readonly unknown[]
  errors?: readonly KernelHookRunError[]
  metadata?: Record<string, unknown>
}

export type KernelHookRegisterRequest = {
  hook: KernelHookDescriptor
  handlerRef?: string
  metadata?: Record<string, unknown>
}

export type KernelHookMutationResult = {
  hook: KernelHookDescriptor
  registered: boolean
  handlerRef?: string
  metadata?: Record<string, unknown>
}

export type KernelSkillSource =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'policySettings'
  | 'builtin'
  | 'bundled'
  | 'plugin'
  | 'mcp'
  | 'managed'
  | 'unknown'

export type KernelSkillContext = 'inline' | 'fork' | 'unknown'

export type KernelSkillDescriptor = {
  name: string
  description: string
  source: KernelSkillSource
  loadedFrom?: string
  aliases?: readonly string[]
  whenToUse?: string
  version?: string
  userInvocable?: boolean
  modelInvocable: boolean
  context?: KernelSkillContext
  agent?: string
  allowedTools?: readonly string[]
  paths?: readonly string[]
  contentLength?: number
  plugin?: {
    name?: string
    repository?: string
  }
}

export type KernelSkillPromptContextRequest = {
  name: string
  args?: string
  input?: unknown
  metadata?: Record<string, unknown>
}

export type KernelSkillPromptContextResult = {
  name: string
  descriptor?: KernelSkillDescriptor
  context: KernelSkillContext
  content?: string
  messages?: readonly unknown[]
  allowedTools?: readonly string[]
  metadata?: Record<string, unknown>
}

export type KernelPluginStatus = 'enabled' | 'disabled'

export type KernelPluginComponents = {
  commands: boolean
  agents: boolean
  skills: boolean
  hooks: boolean
  mcp: boolean
  lsp: boolean
  outputStyles: boolean
  settings: boolean
}

export type KernelPluginDescriptor = {
  name: string
  source: string
  path: string
  repository: string
  status: KernelPluginStatus
  enabled: boolean
  builtin?: boolean
  version?: string
  sha?: string
  description?: string
  components: KernelPluginComponents
}

export type KernelPluginErrorDescriptor = {
  type: string
  source: string
  plugin?: string
  message?: string
}

export type KernelPluginSnapshot = {
  plugins: readonly KernelPluginDescriptor[]
  errors: readonly KernelPluginErrorDescriptor[]
}

export type KernelPluginScope = 'user' | 'project' | 'local'

export type KernelPluginSetEnabledRequest = {
  name: string
  enabled: boolean
  scope?: KernelPluginScope
  metadata?: Record<string, unknown>
}

export type KernelPluginInstallRequest = {
  name: string
  scope?: KernelPluginScope
  metadata?: Record<string, unknown>
}

export type KernelPluginUninstallRequest = {
  name: string
  scope?: KernelPluginScope
  keepData?: boolean
  metadata?: Record<string, unknown>
}

export type KernelPluginUpdateRequest = {
  name: string
  scope?: KernelPluginScope
  metadata?: Record<string, unknown>
}

export type KernelPluginMutationResult = {
  name: string
  action?: 'set_enabled' | 'install' | 'uninstall' | 'update'
  success?: boolean
  enabled: boolean
  status: KernelPluginStatus
  plugin?: KernelPluginDescriptor
  snapshot?: Partial<KernelPluginSnapshot>
  message?: string
  oldVersion?: string
  newVersion?: string
  alreadyUpToDate?: boolean
  metadata?: Record<string, unknown>
}

export type KernelAgentSource =
  | 'built-in'
  | 'plugin'
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'flagSettings'
  | 'policySettings'
  | 'unknown'

export type KernelAgentMcpServerRef = {
  name: string
  inline: boolean
}

export type KernelAgentDefinitionError = {
  path: string
  error: string
}

export type KernelAgentDescriptor = {
  agentType: string
  whenToUse: string
  source: KernelAgentSource
  active: boolean
  filename?: string
  baseDir?: string
  plugin?: string
  color?: string
  model?: string
  effort?: string | number
  permissionMode?: string
  maxTurns?: number
  background?: boolean
  hasInitialPrompt?: boolean
  hasHooks?: boolean
  tools?: readonly string[]
  disallowedTools?: readonly string[]
  skills?: readonly string[]
  mcpServers?: readonly KernelAgentMcpServerRef[]
  memory?: 'user' | 'project' | 'local'
  isolation?: 'worktree' | 'remote'
  pendingSnapshotUpdate?: {
    snapshotTimestamp: string
  }
}

export type KernelAgentSnapshot = {
  activeAgents: readonly KernelAgentDescriptor[]
  allAgents: readonly KernelAgentDescriptor[]
  failedFiles?: readonly KernelAgentDefinitionError[]
  allowedAgentTypes?: readonly string[]
}

export type KernelAgentSpawnRequest = {
  agentType?: string
  prompt: string
  description?: string
  model?: string
  runInBackground?: boolean
  taskId?: string
  taskListId?: string
  ownedFiles?: readonly string[]
  name?: string
  teamName?: string
  mode?: string
  isolation?: 'worktree' | 'remote'
  cwd?: string
  metadata?: Record<string, unknown>
}

export type KernelAgentSpawnResult = {
  status:
    | 'accepted'
    | 'async_launched'
    | 'completed'
    | 'teammate_spawned'
    | 'remote_launched'
  prompt: string
  runId?: string
  agentType?: string
  agentId?: string
  taskId?: string
  taskListId?: string
  backgroundTaskId?: string
  outputFile?: string
  description?: string
  isAsync?: boolean
  canReadOutputFile?: boolean
  taskLinkingWarning?: string
  message?: string
  run?: KernelAgentRunDescriptor
  metadata?: Record<string, unknown>
}

export type KernelAgentRunStatus =
  | 'accepted'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type KernelAgentRunError = {
  message: string
  code?: string
  details?: Record<string, unknown>
}

export type KernelAgentRunDescriptor = {
  runId: string
  status: KernelAgentRunStatus
  prompt: string
  createdAt: string
  updatedAt: string
  agentType?: string
  agentId?: string
  description?: string
  model?: string
  taskId?: string
  taskListId?: string
  backgroundTaskId?: string
  outputFile?: string
  outputAvailable?: boolean
  result?: unknown
  error?: KernelAgentRunError
  startedAt?: string
  completedAt?: string
  cancelledAt?: string
  cancelReason?: string
  runInBackground?: boolean
  canReadOutputFile?: boolean
  ownedFiles?: readonly string[]
  name?: string
  teamName?: string
  mode?: string
  isolation?: 'worktree' | 'remote'
  cwd?: string
  metadata?: Record<string, unknown>
}

export type KernelAgentOutput = {
  runId: string
  available: boolean
  status?: KernelAgentRunStatus
  output?: string
  outputFile?: string
  truncated?: boolean
}

export type KernelAgentCancelResult = {
  runId: string
  cancelled: boolean
  status?: KernelAgentRunStatus
  reason?: string
  message?: string
  run?: KernelAgentRunDescriptor | null
}

export type KernelAgentRunFilter = {
  runIds?: readonly string[]
  agentTypes?: readonly string[]
  statuses?: readonly KernelAgentRunStatus[]
  taskId?: string
  taskListId?: string
  background?: boolean
}

export type KernelAgentOutputOptions = {
  tailBytes?: number
}

export type KernelAgentCancelOptions = {
  reason?: string
}

export type KernelCoordinatorTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'

export type KernelTaskExecutionMetadata = {
  linkedBackgroundTaskId?: string
  linkedBackgroundTaskType?: string
  linkedAgentId?: string
  completionSuggestedAt?: string
  completionSuggestedByBackgroundTaskId?: string
}

export type KernelTaskDescriptor = {
  id: string
  subject: string
  description: string
  status: KernelCoordinatorTaskStatus
  taskListId: string
  activeForm?: string
  owner?: string
  blocks: readonly string[]
  blockedBy: readonly string[]
  ownedFiles?: readonly string[]
  execution?: KernelTaskExecutionMetadata
}

export type KernelTaskSnapshot = {
  taskListId: string
  tasks: readonly KernelTaskDescriptor[]
}

export type KernelTaskMetadataPatch = Record<string, unknown | null>

export type KernelTaskCreateRequest = {
  taskListId?: string
  subject: string
  description: string
  activeForm?: string
  owner?: string
  status?: KernelCoordinatorTaskStatus
  blocks?: readonly string[]
  blockedBy?: readonly string[]
  ownedFiles?: readonly string[]
  metadata?: KernelTaskMetadataPatch
}

export type KernelTaskUpdateRequest = {
  taskId: string
  taskListId?: string
  subject?: string
  description?: string
  activeForm?: string
  status?: KernelCoordinatorTaskStatus
  owner?: string
  addBlocks?: readonly string[]
  addBlockedBy?: readonly string[]
  ownedFiles?: readonly string[]
  metadata?: KernelTaskMetadataPatch
}

export type KernelTaskAssignRequest = {
  taskId: string
  owner: string
  taskListId?: string
  ownedFiles?: readonly string[]
  status?: KernelCoordinatorTaskStatus
  metadata?: KernelTaskMetadataPatch
}

export type KernelTaskMutationResult = {
  task: KernelTaskDescriptor | null
  taskListId: string
  taskId?: string
  updatedFields: readonly string[]
  created?: boolean
  assigned?: boolean
}

export type KernelTeamMemberDescriptor = {
  agentId: string
  name: string
  agentType?: string
  model?: string
  color?: string
  joinedAt: number
  cwd: string
  tmuxPaneId?: string
  worktreePath?: string
  sessionId?: string
  backendType?: string
  isActive?: boolean
  mode?: string
}

export type KernelTeamDescriptor = {
  teamName: string
  description?: string
  taskListId: string
  teamFilePath: string
  createdAt: number
  leadAgentId: string
  leadSessionId?: string
  memberCount: number
  activeMemberCount: number
  members: readonly KernelTeamMemberDescriptor[]
}

export type KernelTeamSnapshot = {
  teams: readonly KernelTeamDescriptor[]
}

export type KernelTeamCreateRequest = {
  teamName: string
  description?: string
  leadAgentType?: string
  leadModel?: string
  workspacePath?: string
  leadSessionId?: string
  allowRename?: boolean
}

export type KernelTeamCreateResult = {
  created: boolean
  team: KernelTeamDescriptor
  requestedTeamName?: string
  message?: string
}

export type KernelTeamMessageRequest = {
  teamName: string
  recipient: string | '*'
  message: string
  summary?: string
  sender?: string
}

export type KernelTeamMessageResult = {
  success: boolean
  teamName: string
  recipients: readonly string[]
  message: string
}

export type KernelTeamDestroyRequest = {
  teamName: string
  force?: boolean
}

export type KernelTeamDestroyResult = {
  success: boolean
  teamName: string
  message: string
  blockedMembers?: readonly string[]
}

export declare const KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION: 'kernel.runtime.command.v1'

export type KernelRuntimeCommandType =
  | 'init_runtime'
  | 'connect_host'
  | 'disconnect_host'
  | 'create_conversation'
  | 'run_turn'
  | 'abort_turn'
  | 'decide_permission'
  | 'dispose_conversation'
  | 'reload_capabilities'
  | 'list_commands'
  | 'execute_command'
  | 'list_tools'
  | 'call_tool'
  | 'list_mcp_servers'
  | 'list_mcp_tools'
  | 'list_mcp_resources'
  | 'reload_mcp'
  | 'connect_mcp'
  | 'authenticate_mcp'
  | 'set_mcp_enabled'
  | 'list_hooks'
  | 'reload_hooks'
  | 'run_hook'
  | 'register_hook'
  | 'list_skills'
  | 'reload_skills'
  | 'resolve_skill_context'
  | 'list_plugins'
  | 'reload_plugins'
  | 'set_plugin_enabled'
  | 'install_plugin'
  | 'uninstall_plugin'
  | 'update_plugin'
  | 'list_agents'
  | 'reload_agents'
  | 'spawn_agent'
  | 'list_agent_runs'
  | 'get_agent_run'
  | 'get_agent_output'
  | 'cancel_agent_run'
  | 'list_tasks'
  | 'get_task'
  | 'create_task'
  | 'update_task'
  | 'assign_task'
  | 'list_teams'
  | 'get_team'
  | 'create_team'
  | 'send_team_message'
  | 'destroy_team'
  | 'publish_host_event'
  | 'subscribe_events'
  | 'ping'

export type KernelRuntimeCommandBase<TType extends KernelRuntimeCommandType> = {
  schemaVersion: typeof KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION
  type: TType
  requestId: string
  metadata?: Record<string, unknown>
}

export type KernelRuntimeInitCommand =
  KernelRuntimeCommandBase<'init_runtime'> & {
    host?: KernelRuntimeHostIdentity
    workspacePath?: string
    provider?: Record<string, unknown>
    auth?: Record<string, unknown>
    model?: string
    capabilities?: Record<string, unknown>
  }

export type KernelRuntimeHostDisconnectPolicy =
  | 'detach'
  | 'continue'
  | 'abort_active_turns'

export type KernelRuntimeConnectHostCommand =
  KernelRuntimeCommandBase<'connect_host'> & {
    host: KernelRuntimeHostIdentity
    sinceEventId?: string
  }

export type KernelRuntimeDisconnectHostCommand =
  KernelRuntimeCommandBase<'disconnect_host'> & {
    hostId: string
    reason?: string
    policy?: KernelRuntimeHostDisconnectPolicy
  }

export type KernelRuntimeCreateConversationCommand =
  KernelRuntimeCommandBase<'create_conversation'> & {
    conversationId: string
    workspacePath: string
    sessionId?: string
    sessionMeta?: Record<string, unknown>
    capabilityIntent?: Record<string, unknown>
  }

export type KernelRuntimeRunTurnCommand =
  KernelRuntimeCommandBase<'run_turn'> & {
    conversationId: string
    turnId: string
    prompt: string | readonly unknown[]
    attachments?: readonly unknown[]
  }

export type KernelRuntimeAbortTurnCommand =
  KernelRuntimeCommandBase<'abort_turn'> & {
    conversationId: string
    turnId: string
    reason?: string
  }

export type KernelPermissionDecisionValue =
  | 'allow'
  | 'deny'
  | 'allow_once'
  | 'allow_session'
  | 'abort'

export type KernelPermissionDecisionSource =
  | 'host'
  | 'policy'
  | 'timeout'
  | 'runtime'

export type KernelPermissionRequestId = string

export type KernelPermissionRisk = 'low' | 'medium' | 'high' | 'destructive'

export type KernelPermissionRequest = {
  permissionRequestId: KernelPermissionRequestId
  conversationId: string
  turnId?: string
  toolName: string
  action: string
  argumentsPreview: unknown
  risk: KernelPermissionRisk
  policySnapshot: Record<string, unknown>
  timeoutMs?: number
  metadata?: Record<string, unknown>
}

export type KernelPermissionDecision = {
  permissionRequestId: KernelPermissionRequestId
  decision: KernelPermissionDecisionValue
  decidedBy: KernelPermissionDecisionSource
  reason?: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export type KernelPermissionDecisionHandler = (
  request: KernelPermissionRequest,
  signal: KernelRuntimeWireAbortSignal,
) => Promise<KernelPermissionDecision> | KernelPermissionDecision

export type KernelPermissionSessionGrantKeyFactory = (
  request: KernelPermissionRequest,
) => string

export type KernelPermissionBrokerSnapshot = {
  pendingRequestIds: string[]
  finalizedRequestIds: string[]
  sessionGrantCount: number
  disposed: boolean
}

export type KernelPermissionBroker = {
  requestPermission(
    request: KernelPermissionRequest,
  ): Promise<KernelPermissionDecision>
  decide(decision: KernelPermissionDecision): KernelPermissionDecision
  dispose(reason?: string): void
  snapshot(): KernelPermissionBrokerSnapshot
}

export type KernelPermissionBrokerOptions = {
  runtimeId?: string
  maxReplayEvents?: number
  eventSink?: KernelRuntimeEventSink
  decide?: KernelPermissionDecisionHandler
  defaultTimeoutMs?: number
  timeoutDecision?: Extract<KernelPermissionDecisionValue, 'deny' | 'abort'>
  now?: () => string
  createMessageId?: () => string
  createSessionGrantKey?: KernelPermissionSessionGrantKeyFactory
}

export declare class KernelPermissionBrokerDisposedError extends Error {}

export declare class KernelPermissionDecisionError extends Error {
  readonly permissionRequestId: string
  constructor(permissionRequestId: string)
}

export declare function createKernelPermissionBroker(
  options?: KernelPermissionBrokerOptions,
): KernelPermissionBroker

export type KernelRuntimeDecidePermissionCommand =
  KernelRuntimeCommandBase<'decide_permission'> & KernelPermissionDecision

export type KernelRuntimeDisposeConversationCommand =
  KernelRuntimeCommandBase<'dispose_conversation'> & {
    conversationId: string
    reason?: string
  }

export type KernelRuntimeReloadCapabilitiesCommand =
  KernelRuntimeCommandBase<'reload_capabilities'> & {
    scope: KernelCapabilityReloadScope
    capabilities?: readonly string[]
  }

export type KernelRuntimeListCommandsCommand =
  KernelRuntimeCommandBase<'list_commands'>

export type KernelRuntimeListCommandsResult = {
  entries: readonly KernelCommandEntry[]
}

export type KernelRuntimeExecuteCommandCommand =
  KernelRuntimeCommandBase<'execute_command'> & KernelCommandExecuteRequest

export type KernelRuntimeExecuteCommandResult = KernelCommandExecutionResult

export type KernelRuntimeListToolsCommand =
  KernelRuntimeCommandBase<'list_tools'>

export type KernelRuntimeListToolsResult = {
  tools: readonly KernelToolDescriptor[]
}

export type KernelRuntimeCallToolCommand =
  KernelRuntimeCommandBase<'call_tool'> & KernelToolCallRequest

export type KernelRuntimeCallToolResult = KernelToolCallResult

export type KernelRuntimeListMcpServersCommand =
  KernelRuntimeCommandBase<'list_mcp_servers'>

export type KernelRuntimeListMcpServersResult = {
  servers: readonly KernelMcpServerRef[]
}

export type KernelRuntimeListMcpToolsCommand =
  KernelRuntimeCommandBase<'list_mcp_tools'> & {
    serverName?: string
  }

export type KernelRuntimeListMcpToolsResult = {
  tools: readonly KernelMcpToolBinding[]
}

export type KernelRuntimeListMcpResourcesCommand =
  KernelRuntimeCommandBase<'list_mcp_resources'> & {
    serverName?: string
  }

export type KernelRuntimeListMcpResourcesResult = {
  resources: readonly KernelMcpResourceRef[]
}

export type KernelRuntimeReloadMcpCommand =
  KernelRuntimeCommandBase<'reload_mcp'>

export type KernelRuntimeReloadMcpResult = KernelMcpSnapshot

export type KernelRuntimeConnectMcpCommand =
  KernelRuntimeCommandBase<'connect_mcp'> & KernelMcpConnectRequest

export type KernelRuntimeConnectMcpResult = KernelMcpLifecycleResult

export type KernelRuntimeAuthenticateMcpCommand =
  KernelRuntimeCommandBase<'authenticate_mcp'> & KernelMcpAuthRequest

export type KernelRuntimeAuthenticateMcpResult = KernelMcpLifecycleResult

export type KernelRuntimeSetMcpEnabledCommand =
  KernelRuntimeCommandBase<'set_mcp_enabled'> & KernelMcpSetEnabledRequest

export type KernelRuntimeSetMcpEnabledResult = KernelMcpLifecycleResult

export type KernelRuntimeListHooksCommand =
  KernelRuntimeCommandBase<'list_hooks'>

export type KernelRuntimeListHooksResult = {
  hooks: readonly KernelHookDescriptor[]
}

export type KernelRuntimeReloadHooksCommand =
  KernelRuntimeCommandBase<'reload_hooks'>

export type KernelRuntimeReloadHooksResult = {
  hooks: readonly KernelHookDescriptor[]
}

export type KernelRuntimeRunHookCommand = KernelRuntimeCommandBase<'run_hook'> &
  KernelHookRunRequest

export type KernelRuntimeRunHookResult = KernelHookRunResult

export type KernelRuntimeRegisterHookCommand =
  KernelRuntimeCommandBase<'register_hook'> & KernelHookRegisterRequest

export type KernelRuntimeRegisterHookResult = KernelHookMutationResult

export type KernelRuntimeListSkillsCommand =
  KernelRuntimeCommandBase<'list_skills'>

export type KernelRuntimeListSkillsResult = {
  skills: readonly KernelSkillDescriptor[]
}

export type KernelRuntimeReloadSkillsCommand =
  KernelRuntimeCommandBase<'reload_skills'>

export type KernelRuntimeReloadSkillsResult = {
  skills: readonly KernelSkillDescriptor[]
}

export type KernelRuntimeResolveSkillContextCommand =
  KernelRuntimeCommandBase<'resolve_skill_context'> &
    KernelSkillPromptContextRequest

export type KernelRuntimeResolveSkillContextResult =
  KernelSkillPromptContextResult

export type KernelRuntimeListPluginsCommand =
  KernelRuntimeCommandBase<'list_plugins'>

export type KernelRuntimeListPluginsResult = {
  plugins: readonly KernelPluginDescriptor[]
  errors: readonly KernelPluginErrorDescriptor[]
}

export type KernelRuntimeReloadPluginsCommand =
  KernelRuntimeCommandBase<'reload_plugins'>

export type KernelRuntimeReloadPluginsResult = KernelPluginSnapshot

export type KernelRuntimeSetPluginEnabledCommand =
  KernelRuntimeCommandBase<'set_plugin_enabled'> & KernelPluginSetEnabledRequest

export type KernelRuntimeSetPluginEnabledResult = KernelPluginMutationResult

export type KernelRuntimeInstallPluginCommand =
  KernelRuntimeCommandBase<'install_plugin'> & KernelPluginInstallRequest

export type KernelRuntimeInstallPluginResult = KernelPluginMutationResult

export type KernelRuntimeUninstallPluginCommand =
  KernelRuntimeCommandBase<'uninstall_plugin'> & KernelPluginUninstallRequest

export type KernelRuntimeUninstallPluginResult = KernelPluginMutationResult

export type KernelRuntimeUpdatePluginCommand =
  KernelRuntimeCommandBase<'update_plugin'> & KernelPluginUpdateRequest

export type KernelRuntimeUpdatePluginResult = KernelPluginMutationResult

export type KernelRuntimeListAgentsCommand =
  KernelRuntimeCommandBase<'list_agents'>

export type KernelRuntimeListAgentsResult = KernelAgentSnapshot

export type KernelRuntimeReloadAgentsCommand =
  KernelRuntimeCommandBase<'reload_agents'>

export type KernelRuntimeReloadAgentsResult = KernelAgentSnapshot

export type KernelRuntimeSpawnAgentCommand =
  KernelRuntimeCommandBase<'spawn_agent'> & KernelAgentSpawnRequest

export type KernelRuntimeSpawnAgentResult = KernelAgentSpawnResult

export type KernelRuntimeListAgentRunsCommand =
  KernelRuntimeCommandBase<'list_agent_runs'>

export type KernelRuntimeListAgentRunsResult = {
  runs: readonly KernelAgentRunDescriptor[]
}

export type KernelRuntimeGetAgentRunCommand =
  KernelRuntimeCommandBase<'get_agent_run'> & {
    runId: string
  }

export type KernelRuntimeGetAgentRunResult = {
  run: KernelAgentRunDescriptor | null
}

export type KernelRuntimeGetAgentOutputCommand =
  KernelRuntimeCommandBase<'get_agent_output'> & {
    runId: string
    tailBytes?: number
  }

export type KernelRuntimeGetAgentOutputResult = KernelAgentOutput

export type KernelRuntimeCancelAgentRunCommand =
  KernelRuntimeCommandBase<'cancel_agent_run'> & {
    runId: string
    reason?: string
  }

export type KernelRuntimeCancelAgentRunResult = KernelAgentCancelResult

export type KernelRuntimeListTasksCommand =
  KernelRuntimeCommandBase<'list_tasks'> & {
    taskListId?: string
  }

export type KernelRuntimeListTasksResult = KernelTaskSnapshot

export type KernelRuntimeGetTaskCommand =
  KernelRuntimeCommandBase<'get_task'> & {
    taskId: string
    taskListId?: string
  }

export type KernelRuntimeGetTaskResult = {
  task: KernelTaskDescriptor | null
}

export type KernelRuntimeCreateTaskCommand =
  KernelRuntimeCommandBase<'create_task'> & KernelTaskCreateRequest

export type KernelRuntimeUpdateTaskCommand =
  KernelRuntimeCommandBase<'update_task'> & KernelTaskUpdateRequest

export type KernelRuntimeAssignTaskCommand =
  KernelRuntimeCommandBase<'assign_task'> & KernelTaskAssignRequest

export type KernelRuntimeTaskMutationResult = KernelTaskMutationResult

export type KernelRuntimeListTeamsCommand =
  KernelRuntimeCommandBase<'list_teams'>

export type KernelRuntimeListTeamsResult = KernelTeamSnapshot

export type KernelRuntimeGetTeamCommand =
  KernelRuntimeCommandBase<'get_team'> & {
    teamName: string
  }

export type KernelRuntimeGetTeamResult = {
  team: KernelTeamDescriptor | null
}

export type KernelRuntimeCreateTeamCommand =
  KernelRuntimeCommandBase<'create_team'> & KernelTeamCreateRequest

export type KernelRuntimeCreateTeamResult = KernelTeamCreateResult

export type KernelRuntimeSendTeamMessageCommand =
  KernelRuntimeCommandBase<'send_team_message'> & KernelTeamMessageRequest

export type KernelRuntimeSendTeamMessageResult = KernelTeamMessageResult

export type KernelRuntimeDestroyTeamCommand =
  KernelRuntimeCommandBase<'destroy_team'> & KernelTeamDestroyRequest

export type KernelRuntimeDestroyTeamResult = KernelTeamDestroyResult

export type KernelRuntimePublishHostEventCommand =
  KernelRuntimeCommandBase<'publish_host_event'> & {
    event: KernelEvent
  }

export type KernelRuntimeSubscribeEventsCommand =
  KernelRuntimeCommandBase<'subscribe_events'> & {
    conversationId?: string
    turnId?: string
    sinceEventId?: string
    filters?: Record<string, unknown>
  }

export type KernelRuntimePingCommand = KernelRuntimeCommandBase<'ping'>

export type KernelRuntimeCommand =
  | KernelRuntimeInitCommand
  | KernelRuntimeConnectHostCommand
  | KernelRuntimeDisconnectHostCommand
  | KernelRuntimeCreateConversationCommand
  | KernelRuntimeRunTurnCommand
  | KernelRuntimeAbortTurnCommand
  | KernelRuntimeDecidePermissionCommand
  | KernelRuntimeDisposeConversationCommand
  | KernelRuntimeReloadCapabilitiesCommand
  | KernelRuntimeListCommandsCommand
  | KernelRuntimeExecuteCommandCommand
  | KernelRuntimeListToolsCommand
  | KernelRuntimeCallToolCommand
  | KernelRuntimeListMcpServersCommand
  | KernelRuntimeListMcpToolsCommand
  | KernelRuntimeListMcpResourcesCommand
  | KernelRuntimeReloadMcpCommand
  | KernelRuntimeConnectMcpCommand
  | KernelRuntimeAuthenticateMcpCommand
  | KernelRuntimeSetMcpEnabledCommand
  | KernelRuntimeListHooksCommand
  | KernelRuntimeReloadHooksCommand
  | KernelRuntimeRunHookCommand
  | KernelRuntimeRegisterHookCommand
  | KernelRuntimeListSkillsCommand
  | KernelRuntimeReloadSkillsCommand
  | KernelRuntimeResolveSkillContextCommand
  | KernelRuntimeListPluginsCommand
  | KernelRuntimeReloadPluginsCommand
  | KernelRuntimeSetPluginEnabledCommand
  | KernelRuntimeInstallPluginCommand
  | KernelRuntimeUninstallPluginCommand
  | KernelRuntimeUpdatePluginCommand
  | KernelRuntimeListAgentsCommand
  | KernelRuntimeReloadAgentsCommand
  | KernelRuntimeSpawnAgentCommand
  | KernelRuntimeListAgentRunsCommand
  | KernelRuntimeGetAgentRunCommand
  | KernelRuntimeGetAgentOutputCommand
  | KernelRuntimeCancelAgentRunCommand
  | KernelRuntimeListTasksCommand
  | KernelRuntimeGetTaskCommand
  | KernelRuntimeCreateTaskCommand
  | KernelRuntimeUpdateTaskCommand
  | KernelRuntimeAssignTaskCommand
  | KernelRuntimeListTeamsCommand
  | KernelRuntimeGetTeamCommand
  | KernelRuntimeCreateTeamCommand
  | KernelRuntimeSendTeamMessageCommand
  | KernelRuntimeDestroyTeamCommand
  | KernelRuntimePublishHostEventCommand
  | KernelRuntimeSubscribeEventsCommand
  | KernelRuntimePingCommand

export type KernelConversationSnapshot = {
  runtimeId: string
  conversationId: string
  workspacePath: string
  sessionId?: string
  metadata?: Record<string, unknown>
  state:
    | 'created'
    | 'ready'
    | 'running'
    | 'aborting'
    | 'detached'
    | 'disposed'
    | 'failed'
  activeTurnId?: string
  createdAt: string
  updatedAt: string
}

export type KernelTurnSnapshot = {
  conversationId: string
  turnId: string
  state:
    | 'idle'
    | 'starting'
    | 'running'
    | 'aborting'
    | 'completed'
    | 'failed'
    | 'disposed'
  startedAt?: string
  completedAt?: string
  stopReason?: string | null
  error?: unknown
}

export type KernelRuntimeWireTurnExecutionEvent =
  | {
      type: 'output'
      payload: unknown
      replayable?: boolean
      metadata?: Record<string, unknown>
    }
  | {
      type: 'event'
      event: KernelEvent
    }
  | {
      type: 'completed'
      stopReason?: string | null
      metadata?: Record<string, unknown>
    }
  | {
      type: 'failed'
      error: unknown
      metadata?: Record<string, unknown>
    }

export type KernelRuntimeWireTurnExecutionResult =
  | void
  | Promise<void>
  | AsyncIterable<KernelRuntimeWireTurnExecutionEvent>

export type KernelRuntimeWireAbortSignal = {
  readonly aborted: boolean
  readonly reason?: unknown
  addEventListener(
    type: 'abort',
    listener: () => void,
    options?: { once?: boolean },
  ): void
  removeEventListener(type: 'abort', listener: () => void): void
}

export type KernelRuntimeWireRouter = {
  readonly eventBus: {
    subscribe(handler: KernelRuntimeEventSink): () => void
  }
  handleCommand(
    command: KernelRuntimeCommand,
  ): Promise<KernelRuntimeEnvelopeBase[]>
  handleMessage(message: unknown): Promise<KernelRuntimeEnvelopeBase[]>
  handleCommandLine(line: string): Promise<KernelRuntimeEnvelopeBase[]>
}

export type KernelRuntimeWireTransport = {
  readonly kind: KernelRuntimeTransportKind
  send(command: KernelRuntimeCommand): Promise<KernelRuntimeEnvelopeBase>
  subscribe(handler: KernelRuntimeEventSink): () => void
  close(): Promise<void> | void
}

export type KernelRuntimeWireClientCommand<
  TCommand extends KernelRuntimeCommand,
> = Omit<TCommand, 'schemaVersion' | 'requestId'> & {
  requestId?: string
  schemaVersion?: typeof KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION
}

export type KernelRuntimeWireClientOptions = {
  createRequestId?: (command: KernelRuntimeCommand['type']) => string
}

export type KernelRuntimeWireClient = {
  request<TCommand extends KernelRuntimeCommand>(
    command: KernelRuntimeWireClientCommand<TCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  onEvent(handler: KernelRuntimeEventSink): () => void
  ping(): Promise<KernelRuntimeEnvelopeBase>
  connectHost(
    host: KernelRuntimeHostIdentity,
    options?: {
      requestId?: string
      sinceEventId?: string
      metadata?: Record<string, unknown>
    },
  ): Promise<KernelRuntimeEnvelopeBase>
  disconnectHost(
    hostId: string,
    options?: {
      requestId?: string
      reason?: string
      policy?: KernelRuntimeHostDisconnectPolicy
      metadata?: Record<string, unknown>
    },
  ): Promise<KernelRuntimeEnvelopeBase>
  createConversation(
    command: KernelRuntimeWireClientCommand<KernelRuntimeCreateConversationCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  runTurn(
    command: KernelRuntimeWireClientCommand<KernelRuntimeRunTurnCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  abortTurn(
    command: KernelRuntimeWireClientCommand<KernelRuntimeAbortTurnCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  decidePermission(
    command: KernelRuntimeWireClientCommand<KernelRuntimeDecidePermissionCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  subscribeEvents(
    command: KernelRuntimeWireClientCommand<KernelRuntimeSubscribeEventsCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadCapabilities(
    command: KernelRuntimeWireClientCommand<KernelRuntimeReloadCapabilitiesCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  listCommands(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListCommandsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  executeCommand(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeExecuteCommandCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listTools(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListToolsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  callTool(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeCallToolCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listMcpServers(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListMcpServersCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listMcpTools(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListMcpToolsCommand>,
      'requestId' | 'metadata' | 'serverName'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listMcpResources(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListMcpResourcesCommand>,
      'requestId' | 'metadata' | 'serverName'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadMcp(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeReloadMcpCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  connectMcp(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeConnectMcpCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  authenticateMcp(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeAuthenticateMcpCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  setMcpEnabled(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeSetMcpEnabledCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listHooks(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListHooksCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadHooks(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeReloadHooksCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  runHook(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeRunHookCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  registerHook(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeRegisterHookCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listSkills(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListSkillsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadSkills(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeReloadSkillsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  resolveSkillContext(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeResolveSkillContextCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listPlugins(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListPluginsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadPlugins(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeReloadPluginsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  setPluginEnabled(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeSetPluginEnabledCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  installPlugin(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeInstallPluginCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  uninstallPlugin(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeUninstallPluginCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  updatePlugin(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeUpdatePluginCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listAgents(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListAgentsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadAgents(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeReloadAgentsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  spawnAgent(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeSpawnAgentCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listAgentRuns(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListAgentRunsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getAgentRun(
    options: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetAgentRunCommand>,
      'runId' | 'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getAgentOutput(
    options: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetAgentOutputCommand>,
      'runId' | 'tailBytes' | 'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  cancelAgentRun(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeCancelAgentRunCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listTasks(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListTasksCommand>,
      'requestId' | 'metadata' | 'taskListId'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getTask(
    options: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetTaskCommand>,
      'taskId' | 'requestId' | 'metadata' | 'taskListId'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  createTask(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeCreateTaskCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  updateTask(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeUpdateTaskCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  assignTask(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeAssignTaskCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  listTeams(
    options?: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeListTeamsCommand>,
      'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  getTeam(
    options: Pick<
      KernelRuntimeWireClientCommand<KernelRuntimeGetTeamCommand>,
      'teamName' | 'requestId' | 'metadata'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  createTeam(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeCreateTeamCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  sendTeamMessage(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeSendTeamMessageCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  destroyTeam(
    command: Omit<
      KernelRuntimeWireClientCommand<KernelRuntimeDestroyTeamCommand>,
      'type'
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  publishHostEvent(
    event: KernelEvent,
    options?: { requestId?: string; metadata?: Record<string, unknown> },
  ): Promise<KernelRuntimeEnvelopeBase>
  close(): Promise<void> | void
}

export type KernelRuntimeInProcessWireTransportOptions = {
  router: KernelRuntimeWireRouter
}

export type KernelRuntimeStdioWireTransportOptions = {
  command: string
  args?: readonly string[]
  cwd?: string
  env?: Record<string, string | undefined>
  closeTimeoutMs?: number
  stderr?: (chunk: string) => void
}

export type KernelRuntimeTransportConfig =
  | { kind?: 'in-process' }
  | ({ kind: 'stdio' } & KernelRuntimeStdioWireTransportOptions)

export type KernelRuntimeWireConversation = {
  readonly id: string
  readonly activeTurnId: string | undefined
  snapshot(): KernelConversationSnapshot
}

export type KernelRuntimeWireConversationRecoverySnapshot = {
  conversation: KernelConversationSnapshot
  activeTurn?: KernelTurnSnapshot
  activeExecution?: KernelRuntimeRunTurnCommand
}

export type KernelRuntimeWireConversationSnapshotStore = {
  readLatest(
    conversationId: string,
  ):
    | KernelRuntimeWireConversationRecoverySnapshot
    | Promise<KernelRuntimeWireConversationRecoverySnapshot | undefined>
    | undefined
  append(
    snapshot: KernelRuntimeWireConversationRecoverySnapshot,
  ): void | Promise<void>
}

export type KernelRuntimeWirePermissionBroker = {
  requestPermission(
    request: KernelPermissionRequest,
  ): Promise<KernelPermissionDecision>
  decide(decision: KernelPermissionDecision): KernelPermissionDecision
  snapshot?(): {
    pendingRequestIds: string[]
    finalizedRequestIds: string[]
  }
}

export type KernelRuntimeWireTurnExecutionContext = {
  command: KernelRuntimeRunTurnCommand
  conversation: KernelRuntimeWireConversation
  eventBus: KernelRuntimeWireRouter['eventBus']
  permissionBroker?: KernelRuntimeWirePermissionBroker
  signal: KernelRuntimeWireAbortSignal
}

export type KernelRuntimeWireTurnExecutor = (
  context: KernelRuntimeWireTurnExecutionContext,
) => KernelRuntimeWireTurnExecutionResult

export type KernelRuntimeHeadlessProcessExecutorOptions = {
  command?: string
  args?: readonly string[]
  cwd?: string
  env?: Record<string, string | undefined>
  killTimeoutMs?: number
}

export type KernelRuntimeAgentProcessExecutorOptions = {
  command?: string
  args?: readonly string[]
  cwd?: string
  env?: Record<string, string | undefined>
  killTimeoutMs?: number
}

export type KernelRuntimeWireCapabilityResolver = {
  listDescriptors(): readonly KernelCapabilityDescriptor[]
  requireCapability?(
    name: KernelCapabilityName,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<unknown>
  reloadCapabilities(
    scope: KernelCapabilityReloadScope,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<readonly KernelCapabilityDescriptor[]>
}

export type KernelRuntimeWireCommandCatalog = {
  listCommands(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): readonly KernelCommandEntry[] | Promise<readonly KernelCommandEntry[]>
  executeCommand?(
    request: KernelCommandExecuteRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelCommandExecutionResult | Promise<KernelCommandExecutionResult>
}

export type KernelRuntimeWireToolCatalog = {
  listTools(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): readonly KernelToolDescriptor[] | Promise<readonly KernelToolDescriptor[]>
  callTool?(
    request: KernelToolCallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelToolCallResult | Promise<KernelToolCallResult>
}

export type KernelRuntimeWireMcpRegistry = {
  listServers(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): readonly KernelMcpServerRef[] | Promise<readonly KernelMcpServerRef[]>
  listResources(
    serverName?: string,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): readonly KernelMcpResourceRef[] | Promise<readonly KernelMcpResourceRef[]>
  listToolBindings(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): readonly KernelMcpToolBinding[] | Promise<readonly KernelMcpToolBinding[]>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): void | Promise<void | Partial<KernelMcpSnapshot>>
  connectServer?(
    request: KernelMcpConnectRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelMcpLifecycleResult | Promise<KernelMcpLifecycleResult>
  authenticateServer?(
    request: KernelMcpAuthRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelMcpLifecycleResult | Promise<KernelMcpLifecycleResult>
  setServerEnabled?(
    request: KernelMcpSetEnabledRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelMcpLifecycleResult | Promise<KernelMcpLifecycleResult>
}

export type KernelRuntimeWireHookCatalog = {
  listHooks(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): readonly KernelHookDescriptor[] | Promise<readonly KernelHookDescriptor[]>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): void | Promise<void | { hooks?: readonly KernelHookDescriptor[] }>
  runHook?(
    request: KernelHookRunRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelHookRunResult | Promise<KernelHookRunResult>
  registerHook?(
    request: KernelHookRegisterRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelHookMutationResult | Promise<KernelHookMutationResult>
}

export type KernelRuntimeWireSkillCatalog = {
  listSkills(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }):
    | readonly KernelSkillDescriptor[]
    | Promise<readonly KernelSkillDescriptor[]>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): void | Promise<void | { skills?: readonly KernelSkillDescriptor[] }>
  resolvePromptContext?(
    request: KernelSkillPromptContextRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelSkillPromptContextResult | Promise<KernelSkillPromptContextResult>
}

export type KernelRuntimeWirePluginCatalog = {
  listPlugins(context?: { cwd?: string; metadata?: Record<string, unknown> }):
    | {
        plugins: readonly KernelPluginDescriptor[]
        errors?: readonly KernelPluginErrorDescriptor[]
      }
    | Promise<{
        plugins: readonly KernelPluginDescriptor[]
        errors?: readonly KernelPluginErrorDescriptor[]
      }>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): void | Promise<void | Partial<KernelPluginSnapshot>>
  setPluginEnabled?(
    request: KernelPluginSetEnabledRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelPluginMutationResult | Promise<KernelPluginMutationResult>
  installPlugin?(
    request: KernelPluginInstallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelPluginMutationResult | Promise<KernelPluginMutationResult>
  uninstallPlugin?(
    request: KernelPluginUninstallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelPluginMutationResult | Promise<KernelPluginMutationResult>
  updatePlugin?(
    request: KernelPluginUpdateRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelPluginMutationResult | Promise<KernelPluginMutationResult>
}

export type KernelRuntimeWireAgentRegistry = {
  listAgents(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): KernelAgentSnapshot | Promise<KernelAgentSnapshot>
  reload?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): void | Promise<void | Partial<KernelAgentSnapshot>>
  spawnAgent?(
    request: KernelAgentSpawnRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelAgentSpawnResult | Promise<KernelAgentSpawnResult>
  listAgentRuns?(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }):
    | { runs: readonly KernelAgentRunDescriptor[] }
    | Promise<{ runs: readonly KernelAgentRunDescriptor[] }>
  getAgentRun?(
    runId: string,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelAgentRunDescriptor | null | Promise<KernelAgentRunDescriptor | null>
  getAgentOutput?(
    request: { runId: string; tailBytes?: number },
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelAgentOutput | Promise<KernelAgentOutput>
  cancelAgentRun?(
    request: { runId: string; reason?: string },
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelAgentCancelResult | Promise<KernelAgentCancelResult>
}

export type KernelRuntimeWireTaskRegistry = {
  listTasks(
    taskListId?: string,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelTaskSnapshot | Promise<KernelTaskSnapshot>
  getTask(
    taskId: string,
    taskListId?: string,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelTaskDescriptor | null | Promise<KernelTaskDescriptor | null>
  createTask?(
    request: KernelTaskCreateRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelTaskMutationResult | Promise<KernelTaskMutationResult>
  updateTask?(
    request: KernelTaskUpdateRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelTaskMutationResult | Promise<KernelTaskMutationResult>
  assignTask?(
    request: KernelTaskAssignRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelTaskMutationResult | Promise<KernelTaskMutationResult>
}

export type KernelRuntimeWireTeamRegistry = {
  listTeams(
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelTeamSnapshot | Promise<KernelTeamSnapshot>
  getTeam(
    teamName: string,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelTeamDescriptor | null | Promise<KernelTeamDescriptor | null>
  createTeam?(
    request: KernelTeamCreateRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelTeamCreateResult | Promise<KernelTeamCreateResult>
  sendMessage?(
    request: KernelTeamMessageRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelTeamMessageResult | Promise<KernelTeamMessageResult>
  destroyTeam?(
    request: KernelTeamDestroyRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): KernelTeamDestroyResult | Promise<KernelTeamDestroyResult>
}

export type KernelRuntimeWireProtocolOptions = {
  runtimeId?: string
  workspacePath?: string
  eventJournalPath?: string | false
  conversationJournalPath?: string | false
  maxReplayEvents?: number
  capabilityResolver?: KernelRuntimeWireCapabilityResolver
  commandCatalog?: KernelRuntimeWireCommandCatalog
  toolCatalog?: KernelRuntimeWireToolCatalog
  mcpRegistry?: KernelRuntimeWireMcpRegistry
  hookCatalog?: KernelRuntimeWireHookCatalog
  skillCatalog?: KernelRuntimeWireSkillCatalog
  pluginCatalog?: KernelRuntimeWirePluginCatalog
  agentRegistry?: KernelRuntimeWireAgentRegistry
  taskRegistry?: KernelRuntimeWireTaskRegistry
  teamRegistry?: KernelRuntimeWireTeamRegistry
  companionRuntime?: {
    getState(
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): KernelCompanionState | null | Promise<KernelCompanionState | null>
    dispatch(
      action: KernelCompanionAction,
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): KernelCompanionState | null | Promise<KernelCompanionState | null>
    reactToTurn(
      request: KernelCompanionReactionRequest,
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): void | Promise<void>
    onEvent?(handler: (event: KernelCompanionEvent) => void): (() => void) | void
  }
  kairosRuntime?: {
    getStatus(
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): KernelKairosStatus | Promise<KernelKairosStatus>
    enqueueEvent(
      event: KernelKairosExternalEvent,
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): void | Promise<void>
    tick(
      request?: KernelKairosTickRequest,
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): void | Promise<void>
    suspend(
      reason?: string,
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): void | Promise<void>
    resume(
      reason?: string,
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): void | Promise<void>
    onEvent?(handler: (event: KernelKairosEvent) => void): (() => void) | void
  }
  memoryManager?: {
    listMemory(
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): readonly KernelMemoryDescriptor[] | Promise<readonly KernelMemoryDescriptor[]>
    readMemory(
      id: string,
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): KernelMemoryDocument | Promise<KernelMemoryDocument>
    updateMemory(
      request: { id: string; content: string },
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): KernelMemoryDocument | Promise<KernelMemoryDocument>
  }
  contextManager?: {
    readContext(
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): KernelContextSnapshot | Promise<KernelContextSnapshot>
    getGitStatus(
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): string | null | Promise<string | null>
    getSystemPromptInjection(
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): string | null | Promise<string | null>
    setSystemPromptInjection(
      value: string | null,
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): string | null | Promise<string | null>
  }
  sessionManager?: {
    listSessions(
      filter?: {
        cwd?: string
        limit?: number
        offset?: number
        includeWorktrees?: boolean
      },
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): readonly KernelSessionDescriptor[] | Promise<readonly KernelSessionDescriptor[]>
    resumeSession(
      sessionId: string,
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): KernelTranscript | Promise<KernelTranscript>
    getSessionTranscript(
      sessionId: string,
      context?: { cwd?: string; metadata?: Record<string, unknown> },
    ): KernelTranscript | Promise<KernelTranscript>
  }
  permissionBroker?: KernelRuntimeWirePermissionBroker
  runTurnExecutor?: KernelRuntimeWireTurnExecutor
  headlessExecutor?: false | KernelRuntimeHeadlessProcessExecutorOptions
  agentExecutor?: false | KernelRuntimeAgentProcessExecutorOptions
}

export type KernelRuntimeOptions = KernelRuntimeWireProtocolOptions & {
  id?: string
  host?: Partial<KernelRuntimeHostIdentity>
  transport?: KernelRuntimeWireTransport
  transportConfig?: KernelRuntimeTransportConfig
  wireClient?: KernelRuntimeWireClient
  wireClientOptions?: KernelRuntimeWireClientOptions
  autoStart?: boolean
}

export type KernelConversationOptions = {
  id?: string
  workspacePath?: string
  sessionId?: string
  sessionMeta?: Record<string, unknown>
  capabilityIntent?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type KernelRunTurnOptions = {
  turnId?: string
  attachments?: readonly unknown[]
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
  conversationId?: string
  turnId?: string
  sinceEventId?: string
  filters?: Record<string, unknown>
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
}

export type KernelRuntimeTools = {
  list(filter?: KernelToolFilter): Promise<readonly KernelToolDescriptor[]>
  get(name: string): Promise<KernelToolDescriptor | undefined>
  call(
    nameOrRequest: string | KernelToolCallRequest,
    input?: unknown,
    options?: Omit<KernelToolCallRequest, 'toolName' | 'input'>,
  ): Promise<KernelToolCallResult>
}

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
}

export type KernelHookFilter = {
  events?: readonly string[]
  source?: KernelHookSource | readonly KernelHookSource[]
  type?: KernelHookType | readonly KernelHookType[]
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
}

export type KernelSkillFilter = {
  names?: readonly string[]
  source?: KernelSkillSource | readonly KernelSkillSource[]
  loadedFrom?: string | readonly string[]
  context?: KernelSkillContext | readonly KernelSkillContext[]
  userInvocable?: boolean
  modelInvocable?: boolean
}

export type KernelRuntimeSkills = {
  list(filter?: KernelSkillFilter): Promise<readonly KernelSkillDescriptor[]>
  get(name: string): Promise<KernelSkillDescriptor | undefined>
  reload(): Promise<readonly KernelSkillDescriptor[]>
  resolveContext(
    nameOrRequest: string | KernelSkillPromptContextRequest,
    options?: Omit<KernelSkillPromptContextRequest, 'name'>,
  ): Promise<KernelSkillPromptContextResult>
}

export type KernelPluginFilter = {
  names?: readonly string[]
  source?: string | readonly string[]
  status?: KernelPluginStatus | readonly KernelPluginStatus[]
  enabled?: boolean
  builtin?: boolean
  hasComponent?: keyof KernelPluginComponents
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
}

export type KernelAgentFilter = {
  agentTypes?: readonly string[]
  source?: KernelAgentSource | readonly KernelAgentSource[]
  active?: boolean
  background?: boolean
  model?: string | readonly string[]
  tool?: string
  skill?: string
  mcpServer?: string
}

export type KernelRuntimeAgents = {
  list(filter?: KernelAgentFilter): Promise<readonly KernelAgentDescriptor[]>
  all(filter?: KernelAgentFilter): Promise<readonly KernelAgentDescriptor[]>
  get(
    agentType: string,
    options?: { includeInactive?: boolean },
  ): Promise<KernelAgentDescriptor | undefined>
  snapshot(): Promise<KernelAgentSnapshot>
  reload(): Promise<KernelAgentSnapshot>
  spawn(request: KernelAgentSpawnRequest): Promise<KernelAgentSpawnResult>
  runs(
    filter?: KernelAgentRunFilter,
  ): Promise<readonly KernelAgentRunDescriptor[]>
  getRun(runId: string): Promise<KernelAgentRunDescriptor | undefined>
  status(runId: string): Promise<KernelAgentRunDescriptor | undefined>
  output(
    runId: string,
    options?: KernelAgentOutputOptions,
  ): Promise<KernelAgentOutput>
  result(runId: string): Promise<unknown>
  cancel(
    runId: string,
    options?: KernelAgentCancelOptions,
  ): Promise<KernelAgentCancelResult>
}

export type KernelTaskListOptions = {
  taskListId?: string
}

export type KernelTaskFilter = {
  ids?: readonly string[]
  status?: KernelCoordinatorTaskStatus | readonly KernelCoordinatorTaskStatus[]
  owner?: string | readonly string[]
  blocked?: boolean
  hasOwnedFiles?: boolean
  linkedBackgroundTaskId?: string
  linkedAgentId?: string
}

export type KernelRuntimeTasks = {
  list(
    filter?: KernelTaskFilter,
    options?: KernelTaskListOptions,
  ): Promise<readonly KernelTaskDescriptor[]>
  get(
    taskId: string,
    options?: KernelTaskListOptions,
  ): Promise<KernelTaskDescriptor | undefined>
  snapshot(options?: KernelTaskListOptions): Promise<KernelTaskSnapshot>
  create(request: KernelTaskCreateRequest): Promise<KernelTaskMutationResult>
  update(request: KernelTaskUpdateRequest): Promise<KernelTaskMutationResult>
  assign(request: KernelTaskAssignRequest): Promise<KernelTaskMutationResult>
}

export type KernelTeamDetail = KernelTeamDescriptor & {
  tasks: readonly KernelTaskDescriptor[]
  runs: readonly KernelAgentRunDescriptor[]
}

export type KernelRuntimeTeams = {
  list(): Promise<readonly KernelTeamDescriptor[]>
  get(teamName: string): Promise<KernelTeamDetail | undefined>
  create(request: KernelTeamCreateRequest): Promise<KernelTeamCreateResult>
  send(request: KernelTeamMessageRequest): Promise<KernelTeamMessageResult>
  destroy(request: KernelTeamDestroyRequest): Promise<KernelTeamDestroyResult>
}

export type KernelCoordinatorAssignmentFilter = {
  taskListId?: string
  owner?: string | readonly string[]
  status?: KernelCoordinatorTaskStatus | readonly KernelCoordinatorTaskStatus[]
  blocked?: boolean
  hasOwnedFiles?: boolean
  linkedBackgroundTaskId?: string
  linkedAgentId?: string
}

export type KernelRuntimeCoordinator = {
  assignTask(request: KernelTaskAssignRequest): Promise<KernelTaskMutationResult>
  spawnWorker(request: KernelAgentSpawnRequest): Promise<KernelAgentSpawnResult>
  listAssignments(
    filter?: KernelCoordinatorAssignmentFilter,
  ): Promise<readonly KernelTaskDescriptor[]>
  getWorkerRun(runId: string): Promise<KernelAgentRunDescriptor | undefined>
  getWorkerOutput(
    runId: string,
    options?: KernelAgentOutputOptions,
  ): Promise<KernelAgentOutput>
  cancelWorker(
    runId: string,
    options?: KernelAgentCancelOptions,
  ): Promise<KernelAgentCancelResult>
}

export type KernelRuntimePermissions = {
  decide(decision: KernelPermissionDecision): Promise<KernelPermissionDecision>
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
  conversationId?: string
  workspacePath?: string
  metadata?: Record<string, unknown>
}

export type KernelRuntimeSessionManager = {
  list(
    filter?: KernelSessionListFilter,
  ): Promise<readonly KernelSessionDescriptor[]>
  resume(
    sessionId: string,
    options?: KernelRuntimeSessionResumeOptions,
  ): Promise<KernelConversation>
  getTranscript(sessionId: string): Promise<KernelTranscript>
}

export type KernelTurn = {
  readonly id: string
  readonly conversationId: string
  snapshot(): KernelTurnSnapshot
  wait(options?: KernelWaitForTurnOptions): Promise<KernelTurnSnapshot>
  abort(options?: KernelAbortTurnOptions): Promise<KernelTurnSnapshot>
  onEvent(handler: KernelRuntimeEventHandler): () => void
  replayEvents(
    options?: KernelTurnEventReplayOptions,
  ): Promise<KernelRuntimeEventEnvelope[]>
}

export type KernelConversation = {
  readonly id: string
  readonly workspacePath: string
  readonly sessionId: string | undefined
  snapshot(): KernelConversationSnapshot
  startTurn(
    prompt: string | readonly unknown[],
    options?: KernelRunTurnOptions,
  ): Promise<KernelTurn>
  runTurn(
    prompt: string | readonly unknown[],
    options?: KernelRunTurnOptions,
  ): Promise<KernelTurnSnapshot>
  waitForTurn(
    turnId: string,
    options?: KernelWaitForTurnOptions,
  ): Promise<KernelTurnSnapshot>
  runTurnAndWait(
    prompt: string | readonly unknown[],
    options?: KernelRunTurnAndWaitOptions,
  ): Promise<KernelTurnSnapshot>
  abortTurn(
    turnId: string,
    options?: KernelAbortTurnOptions,
  ): Promise<KernelTurnSnapshot>
  onEvent(handler: KernelRuntimeEventSink): () => void
  replayEvents(
    options?: Omit<KernelRuntimeEventReplayOptions, 'conversationId'>,
  ): Promise<KernelRuntimeEnvelopeBase[]>
  dispose(reason?: string): Promise<void>
}

export type KernelRuntime = {
  readonly id: string
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
  onEvent(handler: KernelRuntimeEventSink): () => void
  replayEvents(
    options?: KernelRuntimeEventReplayOptions,
  ): Promise<KernelRuntimeEnvelopeBase[]>
  dispose(reason?: string): Promise<void>
}

export declare class KernelRuntimeRequestError extends Error {
  readonly envelope: KernelRuntimeEnvelopeBase
  readonly code: KernelRuntimeErrorCode | undefined
  constructor(envelope: KernelRuntimeEnvelopeBase)
}

export declare function createKernelRuntime(
  options?: KernelRuntimeOptions,
): Promise<KernelRuntime>

export type KernelRuntimeWireInput = AsyncIterable<string | Uint8Array>

export type KernelRuntimeWireOutput = {
  write(chunk: string): unknown
}

export type KernelRuntimeWireRunnerOptions =
  KernelRuntimeWireProtocolOptions & {
    input?: KernelRuntimeWireInput
    output?: KernelRuntimeWireOutput
  }

export type KernelHeadlessStore = {
  getState(): KernelHeadlessState
  setState(updater: (prev: KernelHeadlessState) => KernelHeadlessState): void
}

export type KernelHeadlessEnvironment = {
  store: KernelHeadlessStore
  commands: KernelCommand[]
  tools: KernelTool[]
  sdkMcpConfigs: Record<string, KernelMcpServerConfig>
  agents: KernelAgentDefinition[]
}

export type DefaultKernelHeadlessEnvironmentOptions = {
  commands: KernelCommand[]
  disableSlashCommands?: boolean
  tools: KernelTool[]
  sdkMcpConfigs: Record<string, KernelMcpServerConfig>
  agents: KernelAgentDefinition[]
  mcpClients?: KernelMcpServerConnection[]
  mcpCommands?: KernelCommand[]
  mcpTools?: KernelTool[]
  toolPermissionContext: KernelToolPermissionContext
  effortArgument?: unknown
  modelForFastMode?: string | null
  advisorModel?: string
  kairosEnabled?: boolean
}

export type KernelHeadlessRunOptions = {
  continue: boolean | undefined
  resume: string | boolean | undefined
  resumeSessionAt: string | undefined
  verbose: boolean | undefined
  outputFormat: string | undefined
  jsonSchema: KernelJsonSchema | undefined
  permissionPromptToolName: string | undefined
  allowedTools: string[] | undefined
  thinkingConfig: KernelThinkingConfig | undefined
  maxTurns: number | undefined
  maxBudgetUsd: number | undefined
  taskBudget: { total: number } | undefined
  systemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  userSpecifiedModel: string | undefined
  fallbackModel: string | undefined
  teleport: string | true | null | undefined
  sdkUrl: string | undefined
  replayUserMessages: boolean | undefined
  includePartialMessages: boolean | undefined
  forkSession: boolean | undefined
  rewindFiles: string | undefined
  enableAuthStatus: boolean | undefined
  agent: string | undefined
  workload: string | undefined
  setupTrigger?: 'init' | 'maintenance' | undefined
  sessionStartHooksPromise?: Promise<unknown[]>
  setSDKStatus?: (status: unknown) => void
  runtimeEventSink?: KernelRuntimeEventSink
}

type KernelHeadlessDeps = {
  runHeadlessRuntime: (...args: unknown[]) => Promise<void>
}

export type KernelHeadlessSession = {
  run(
    inputPrompt: KernelHeadlessInput,
    options: KernelHeadlessRunOptions,
  ): Promise<void>
  getState(): KernelHeadlessState
  setState(updater: (prev: KernelHeadlessState) => KernelHeadlessState): void
}

export type KernelHeadlessMcpConnectOptions = {
  store: KernelHeadlessStore
  regularMcpConfigs: Record<string, KernelMcpServerConfig>
  claudeaiConfigPromise: Promise<Record<string, KernelMcpServerConfig>>
  claudeAiTimeoutMs?: number
}

export type PrepareKernelHeadlessStartupOptions = {
  sessionPersistenceDisabled: boolean
  betas: string[]
  bareMode: boolean
  userType?: string
}

export type PrepareKernelHeadlessStartupDeps = {
  startDeferredPrefetches(): void
  logSessionTelemetry(): void
}

type KernelDirectConnectSessionOptions = {
  serverUrl: string
  authToken?: string
  cwd: string
  dangerouslySkipPermissions?: boolean
  unixSocket?: string
}

type KernelDirectConnectSessionState = {
  serverUrl: string
  workDir?: string
}

type KernelDirectConnectSessionResult = {
  config: DirectConnectConfig
  workDir?: string
  state: KernelDirectConnectSessionState
}

type KernelDirectConnectStateWriter = {
  setOriginalCwd(cwd: string): void
  setCwdState(cwd: string): void
  setDirectConnectServerUrl(url: string): void
}

type KernelServerHostConfigInput = {
  port: string | number | undefined
  host?: string
  authToken?: string
  unix?: string
  workspace?: string
  idleTimeoutMs?: string | number | undefined
  maxSessions?: string | number | undefined
  createAuthToken?: () => string
}

type KernelServerHandle = {
  port: number
  stop(closeActiveConnections: boolean): void | Promise<void>
  [key: string]: unknown
}

type KernelServerHostAssembly = {
  authToken: string
  config: ServerConfig
  sessionManager: unknown
  logger: unknown
  server: KernelServerHandle
}

type KernelSchemaLike<T> = {
  parse(input: unknown): T
  safeParse(
    input: unknown,
  ): { success: true; data: T } | { success: false; error: unknown }
}

type KernelAbortSignalLike = {
  readonly aborted: boolean
}

export type ServerConfig = {
  port: number
  host: string
  authToken: string
  unix?: string
  idleTimeoutMs?: number
  maxSessions?: number
  workspace?: string
}

export type SessionState =
  | 'starting'
  | 'running'
  | 'detached'
  | 'stopping'
  | 'stopped'

export type DirectConnectConfig = {
  serverUrl: string
  sessionId: string
  wsUrl: string
  authToken?: string
  unixSocket?: string
}

export type SessionInfo = {
  id: string
  status: SessionState
  createdAt: number
  workDir: string
  process: unknown | null
  sessionKey?: string
}

export type SessionIndexEntry = {
  sessionId: string
  transcriptSessionId: string
  cwd: string
  permissionMode?: string
  createdAt: number
  lastActiveAt: number
}

export type SessionIndex = Record<string, SessionIndexEntry>

export declare function createDefaultKernelHeadlessEnvironment(
  options: DefaultKernelHeadlessEnvironmentOptions,
): KernelHeadlessEnvironment

export declare function createKernelHeadlessSession(
  environment: KernelHeadlessEnvironment,
  deps?: KernelHeadlessDeps,
): KernelHeadlessSession

export declare function createKernelHeadlessStore(
  initialState: KernelHeadlessState,
): KernelHeadlessStore

export declare function runKernelHeadless(
  inputPrompt: KernelHeadlessInput,
  environment: KernelHeadlessEnvironment,
  options: KernelHeadlessRunOptions,
  deps?: KernelHeadlessDeps,
): Promise<void>

export declare function connectDefaultKernelHeadlessMcp(
  options: KernelHeadlessMcpConnectOptions,
): Promise<{ claudeaiTimedOut: boolean }>

export declare function prepareKernelHeadlessStartup(
  options: PrepareKernelHeadlessStartupOptions,
  deps: PrepareKernelHeadlessStartupDeps,
): Promise<void>

export declare function createKernelSession(
  options: KernelDirectConnectSessionOptions,
): Promise<KernelDirectConnectSessionResult>

export declare function connectDirectHostSession(
  options: KernelDirectConnectSessionOptions,
  writer: KernelDirectConnectStateWriter,
): Promise<DirectConnectConfig>

export declare function applyDirectConnectSessionState(
  state: KernelDirectConnectSessionState,
  writer: KernelDirectConnectStateWriter,
): void

export declare function assembleServerHost(
  input: KernelServerHostConfigInput,
): KernelServerHostAssembly

export declare function getDirectConnectErrorMessage(error: unknown): string

export declare function createDirectConnectSession(
  options: KernelDirectConnectSessionOptions,
): Promise<KernelDirectConnectSessionResult>

export declare class DirectConnectError extends Error {}

export declare function runKernelHeadlessClient(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat?: string,
  interactive?: boolean,
): Promise<void>

export declare function runConnectHeadless(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat?: string,
  interactive?: boolean,
): Promise<void>

export declare function startKernelServer(
  config: ServerConfig,
  sessionManager: unknown,
  logger: unknown,
): KernelServerHandle

export declare function startServer(
  config: ServerConfig,
  sessionManager: unknown,
  logger: unknown,
): KernelServerHandle

export declare const connectResponseSchema: () => KernelSchemaLike<{
  session_id: string
  ws_url: string
  work_dir?: string
}>

export declare function runBridgeHeadless(
  opts: Record<string, unknown>,
  signal: KernelAbortSignalLike,
  runBridgeLoop?: (...args: unknown[]) => Promise<void>,
): Promise<void>

export declare function runDaemonWorker(kind?: string): Promise<void>

export declare function createDefaultKernelRuntimeWireRouter(
  options?: KernelRuntimeWireProtocolOptions,
): KernelRuntimeWireRouter

export declare function createKernelRuntimeInProcessWireTransport(
  options: KernelRuntimeInProcessWireTransportOptions,
): KernelRuntimeWireTransport

export declare function createKernelRuntimeStdioWireTransport(
  options: KernelRuntimeStdioWireTransportOptions,
): KernelRuntimeWireTransport

export declare function createKernelRuntimeWireClient(
  transport: KernelRuntimeWireTransport,
  options?: KernelRuntimeWireClientOptions,
): KernelRuntimeWireClient

export declare function runKernelRuntimeWireProtocol(
  options?: KernelRuntimeWireRunnerOptions,
): Promise<void>

export type KernelCompanionState = {
  seed: string
  muted: boolean
  hasStoredCompanion: boolean
  profile: Record<string, unknown> | null
  companion: Record<string, unknown> | null
}

export type KernelCompanionAction =
  | { type: 'hatch'; seed?: string }
  | { type: 'rehatch'; seed?: string }
  | { type: 'mute' }
  | { type: 'unmute' }
  | { type: 'pet'; note?: string }
  | { type: 'clear'; seed?: string }

export type KernelCompanionReactionRequest = {
  messages: readonly unknown[]
}

export type KernelCompanionEvent =
  | {
      type: 'state_changed'
      action: KernelCompanionAction['type']
      state: KernelCompanionState | null
    }
  | {
      type: 'petted'
      note?: string
      state: KernelCompanionState | null
    }
  | {
      type: 'reaction'
      reaction: string
      state: KernelCompanionState | null
    }
  | {
      type: 'reaction_skipped'
      reason: string
      state: KernelCompanionState | null
    }

export type KernelCompanionRuntime = {
  getState(): Promise<KernelCompanionState | null>
  dispatch(
    action: KernelCompanionAction,
  ): Promise<KernelCompanionState | null>
  reactToTurn(request: KernelCompanionReactionRequest): Promise<void>
  onEvent(handler: (event: KernelCompanionEvent) => void): () => void
}

export type KernelCompanionRuntimeOptions = {
  signal?: AbortSignal
  generateStoredCompanion?: (
    seed: string,
    signal: AbortSignal,
  ) => Promise<Record<string, unknown>>
  triggerReaction?: (
    messages: readonly unknown[],
    setReaction: (reaction: string | undefined) => void,
  ) => void
}

export declare function createKernelCompanionRuntime(
  options?: KernelCompanionRuntimeOptions,
): KernelCompanionRuntime

export type KernelKairosProactiveState = {
  active: boolean
  paused: boolean
  contextBlocked: boolean
  shouldTick: boolean
  nextTickAt: number | null
  activationSource?: string
}

export type KernelKairosAutonomyCommand = {
  value: unknown
  mode: string
  priority?: 'now' | 'next' | 'later'
  workload?: string
  isMeta?: boolean
  origin?: unknown
  autonomy?: unknown
}

export type KernelKairosStatus = {
  enabled: boolean
  runtimeEnabled: boolean
  proactive?: KernelKairosProactiveState
  suspended: boolean
  pendingEvents: number
  lastTickAt?: string
  suspendedReason?: string
}

export type KernelKairosExternalEvent = {
  type: string
  payload?: unknown
  metadata?: Record<string, unknown>
}

export type KernelKairosTickRequest = {
  reason?: string
  drain?: boolean
  createAutonomyCommands?: boolean
  basePrompt?: string
  rootDir?: string
  currentDir?: string
  workload?: string
  priority?: 'now' | 'next' | 'later'
}

export type KernelKairosEvent =
  | {
      type: 'event_enqueued'
      event: KernelKairosExternalEvent
      status: KernelKairosStatus
    }
  | {
      type: 'tick'
      request?: KernelKairosTickRequest
      drainedEvents: readonly KernelKairosExternalEvent[]
      autonomyCommands?: readonly KernelKairosAutonomyCommand[]
      status: KernelKairosStatus
    }
  | { type: 'suspended'; reason?: string; status: KernelKairosStatus }
  | { type: 'resumed'; reason?: string; status: KernelKairosStatus }

export type KernelKairosRuntime = {
  getStatus(): Promise<KernelKairosStatus>
  enqueueEvent(event: KernelKairosExternalEvent): Promise<void>
  tick(request?: KernelKairosTickRequest): Promise<void>
  suspend(reason?: string): Promise<void>
  resume(reason?: string): Promise<void>
  onEvent(handler: (event: KernelKairosEvent) => void): () => void
}

export type KernelKairosRuntimeOptions = {
  isEnabled?: () => boolean
  isRuntimeEnabled?: () => Promise<boolean>
  getProactiveState?: () => KernelKairosProactiveState
  pauseProactive?: () => void
  resumeProactive?: () => void
  createAutonomyCommands?: (
    request: KernelKairosTickRequest,
  ) => Promise<readonly KernelKairosAutonomyCommand[]>
  now?: () => string
}

export declare function createKernelKairosRuntime(
  options?: KernelKairosRuntimeOptions,
): KernelKairosRuntime

export type KernelMemorySource =
  | 'managed'
  | 'user'
  | 'project'
  | 'local'
  | 'auto'
  | 'team'
  | 'unknown'

export type KernelMemoryDescriptor = {
  id: string
  path: string
  source: KernelMemorySource
  bytes: number
  parent?: string
  globs?: readonly string[]
}

export type KernelMemoryDocument = KernelMemoryDescriptor & {
  content: string
}

export type KernelMemoryUpdateRequest = {
  id: string
  content: string
}

export type KernelMemoryManager = {
  list(): Promise<readonly KernelMemoryDescriptor[]>
  read(id: string): Promise<KernelMemoryDocument>
  update(request: KernelMemoryUpdateRequest): Promise<KernelMemoryDocument>
}

export type KernelMemoryManagerOptions = {
  loadFiles?: () => Promise<
    Array<{
      path: string
      type: string
      content: string
      parent?: string
      globs?: string[]
    }>
  >
  readFile?: (path: string) => Promise<string>
  writeFile?: (path: string, content: string) => Promise<void>
  invalidateCaches?: () => void
}

export declare function createKernelMemoryManager(
  options?: KernelMemoryManagerOptions,
): KernelMemoryManager

export type KernelContextSnapshot = {
  system: Record<string, string>
  user: Record<string, string>
}

export type KernelContextManager = {
  read(): Promise<KernelContextSnapshot>
  getSystem(): Promise<Record<string, string>>
  getUser(): Promise<Record<string, string>>
  getGitStatus(): Promise<string | null>
  getSystemPromptInjection(): string | null
  setSystemPromptInjection(value: string | null): void
}

export type KernelContextManagerOptions = {
  getSystem?: () => Promise<Record<string, string>>
  getUser?: () => Promise<Record<string, string>>
  getGitStatus?: () => Promise<string | null>
  getSystemPromptInjection?: () => string | null
  setSystemPromptInjection?: (value: string | null) => void
}

export declare function createKernelContextManager(
  options?: KernelContextManagerOptions,
): KernelContextManager

export type KernelSessionDescriptor = {
  sessionId: string
  summary: string
  lastModified: number
  fileSize?: number
  customTitle?: string
  firstPrompt?: string
  gitBranch?: string
  cwd?: string
  tag?: string
  createdAt?: number
}

export type KernelSessionListFilter = {
  cwd?: string
  limit?: number
  offset?: number
  includeWorktrees?: boolean
}

export type KernelTranscript = {
  sessionId?: string
  fullPath?: string
  messages: readonly unknown[]
  customTitle?: string
  summary?: string
  tag?: string
  mode?: 'coordinator' | 'normal'
  turnInterruptionState: 'none' | 'interrupted_prompt'
}

export type KernelSessionResume = KernelTranscript

export type KernelSessionManager = {
  list(
    filter?: KernelSessionListFilter,
  ): Promise<readonly KernelSessionDescriptor[]>
  resume(sessionId: string): Promise<KernelSessionResume>
  getTranscript(sessionId: string): Promise<KernelTranscript>
}

export type KernelSessionManagerOptions = {
  listSessions?: (
    options?: {
      dir?: string
      limit?: number
      offset?: number
      includeWorktrees?: boolean
    },
  ) => Promise<readonly KernelSessionDescriptor[]>
  loadTranscript?: (sessionId: string) => Promise<KernelTranscript>
}

export declare function createKernelSessionManager(
  options?: KernelSessionManagerOptions,
): KernelSessionManager
