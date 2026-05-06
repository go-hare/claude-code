import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { HookEvent } from 'src/types/protocol/index.js'
import type { ModelUsage } from 'src/types/protocol/index.js'
import type { AppState } from 'src/state/AppStateStore.js'
import type { SessionId } from 'src/types/ids.js'
import type { HookCallbackMatcher } from 'src/types/hooks.js'
import type { ModelSetting } from 'src/utils/model/model.js'
import type { ModelStrings } from 'src/utils/model/modelStrings.js'

export type RuntimeSessionIdentity = {
  sessionId: SessionId
  parentSessionId?: SessionId
  sessionProjectDir: string | null
  originalCwd: string
  projectRoot: string
  cwd: string
  isInteractive: boolean
  clientType: string
  sessionSource?: string
}

export type RuntimeUsageSnapshot = {
  totalCostUSD: number
  totalApiDurationMs: number
  totalApiDurationWithoutRetriesMs: number
  totalToolDurationMs: number
  turnHookDurationMs: number
  turnToolDurationMs: number
  turnClassifierDurationMs: number
  turnHookCount: number
  turnToolCount: number
  turnClassifierCount: number
  totalLinesAdded: number
  totalLinesRemoved: number
  hasUnknownModelCost: boolean
  lastInteractionTime: number
  modelUsage: Readonly<Record<string, ModelUsage>>
}

export type RuntimeExecutionBudgetState = {
  turnOutputTokens: number
  currentTurnTokenBudget: number | null
  budgetContinuationCount: number
  strictToolResultPairing: boolean
}

export type RuntimeExecutionPromptState = {
  mainLoopModelOverride: ModelSetting | undefined
  initialMainLoopModel: ModelSetting
  modelStrings: ModelStrings | null
  cachedClaudeMdContent: string | null
  systemPromptSectionCache: ReadonlyMap<string, string | null>
  lastEmittedDate: string | null
  promptCache1hAllowlist: string[] | null
  promptCache1hEligible: boolean | null
  afkModeHeaderLatched: boolean | null
  fastModeHeaderLatched: boolean | null
  cacheEditingHeaderLatched: boolean | null
  thinkingClearLatched: boolean | null
  sdkBetas: string[] | undefined
}

export type RuntimeExecutionPromptStatePatch = {
  mainLoopModelOverride?: ModelSetting | undefined
  initialMainLoopModel?: ModelSetting
  modelStrings?: ModelStrings
  cachedClaudeMdContent?: string | null
  systemPromptSection?: { name: string; value: string | null }
  clearSystemPromptSectionCache?: boolean
  lastEmittedDate?: string | null
  promptCache1hAllowlist?: string[] | null
  promptCache1hEligible?: boolean | null
  afkModeHeaderLatched?: boolean
  fastModeHeaderLatched?: boolean
  cacheEditingHeaderLatched?: boolean
  thinkingClearLatched?: boolean
  clearHeaderLatches?: boolean
  sdkBetas?: string[] | undefined
}

export type RuntimeRequestDebugState = {
  lastApiRequest: Omit<BetaMessageStreamParams, 'messages'> | null
  lastApiRequestMessages: BetaMessageStreamParams['messages'] | null
  lastClassifierRequests: unknown[] | null
  promptId: string | null
  lastMainRequestId: string | undefined
  lastApiCompletionTimestamp: number | null
}

export type RuntimeRequestDebugStatePatch = {
  lastApiRequest?: Omit<BetaMessageStreamParams, 'messages'> | null
  lastApiRequestMessages?: BetaMessageStreamParams['messages'] | null
  lastClassifierRequests?: unknown[] | null
  promptId?: string | null
  lastMainRequestId?: string
  lastApiCompletionTimestamp?: number
}

export type RuntimeTeleportedSessionInfo = {
  isTeleported: boolean
  hasLoggedFirstMessage: boolean
  sessionId: string | null
}

export type RuntimeInvokedSkillInfo = {
  skillName: string
  skillPath: string
  content: string
  invokedAt: number
  agentId: string | null
}

export type RuntimeAllowedChannelEntry =
  | { kind: 'plugin'; name: string; marketplace: string; dev?: boolean }
  | { kind: 'server'; name: string; dev?: boolean }

export type RuntimeHeadlessControlState = {
  initJsonSchema: Record<string, unknown> | undefined
  mainThreadAgentType: string | undefined
  allowedChannels: RuntimeAllowedChannelEntry[]
  isRemoteMode: boolean
  flagSettingsInline: Record<string, unknown> | null
  sdkAgentProgressSummariesEnabled: boolean
}

export type RuntimeHeadlessControlStatePatch = {
  initJsonSchema?: Record<string, unknown> | undefined
  mainThreadAgentType?: string | undefined
  allowedChannels?: RuntimeAllowedChannelEntry[]
  flagSettingsInline?: Record<string, unknown> | null
  sdkAgentProgressSummariesEnabled?: boolean
}

export type RuntimeRegisteredHookCallbacks = Partial<
  Record<HookEvent, HookCallbackMatcher[]>
>

export type RuntimeExecutionAppStateSlice = Pick<
  AppState,
  'toolPermissionContext' | 'fileHistory' | 'attribution' | 'fastMode'
>

export interface RuntimeSessionIdentityStateProvider {
  getSessionIdentity(): RuntimeSessionIdentity
  regenerateSessionId(options?: { setCurrentAsParent?: boolean }): SessionId
  switchSession(sessionId: SessionId, projectDir?: string | null): void
  setCwd(cwd: string): void
  setProjectRoot(projectRoot: string): void
  isSessionPersistenceDisabled(): boolean
}

export interface RuntimeUsageStateProvider {
  getUsageSnapshot(): RuntimeUsageSnapshot
  markInteraction(immediate?: boolean): void
  recordApiDuration(
    durationMs: number,
    durationWithoutRetriesMs: number,
  ): void
  getExecutionBudget(): RuntimeExecutionBudgetState
  snapshotTurnBudget(budget: number | null): void
  incrementBudgetContinuationCount(): void
}

export interface RuntimePromptStateProvider {
  getPromptState(): RuntimeExecutionPromptState
  patchPromptState(patch: RuntimeExecutionPromptStatePatch): void
}

export interface RuntimeRequestDebugStateProvider {
  getRequestDebugState(): RuntimeRequestDebugState
  patchRequestDebugState(patch: RuntimeRequestDebugStatePatch): void
}

export interface RuntimeHeadlessControlStateProvider {
  getHeadlessControlState(): RuntimeHeadlessControlState
  patchHeadlessControlState(patch: RuntimeHeadlessControlStatePatch): void
  registerHookCallbacks(hooks: RuntimeRegisteredHookCallbacks): void
}

export interface RuntimeCompactionStateProvider {
  markPostCompaction(): void
  consumePostCompaction(): boolean
}

export interface RuntimeTeleportStateProvider {
  getTeleportedSessionInfo(): RuntimeTeleportedSessionInfo | null
  markFirstTeleportMessageLogged(): void
}

export interface RuntimeInvokedSkillStateProvider {
  addInvokedSkill(
    skillName: string,
    skillPath: string,
    content: string,
    agentId?: string | null,
  ): void
  getInvokedSkillsForAgent(
    agentId: string | undefined | null,
  ): Map<string, RuntimeInvokedSkillInfo>
}

export interface RuntimeBootstrapStateScope {
  runWithState<T>(fn: () => T): T
}

export interface RuntimeBootstrapStateProvider
  extends RuntimeBootstrapStateScope,
    RuntimeSessionIdentityStateProvider,
    RuntimeUsageStateProvider,
    RuntimePromptStateProvider,
    RuntimeRequestDebugStateProvider,
    RuntimeHeadlessControlStateProvider,
    RuntimeCompactionStateProvider,
    RuntimeTeleportStateProvider,
    RuntimeInvokedSkillStateProvider {}

export interface RuntimeExecutionSessionStateProvider
  extends Pick<
    RuntimeBootstrapStateProvider,
    'getSessionIdentity' | 'isSessionPersistenceDisabled' | 'runWithState'
  > {}

export interface RuntimeAppStateProvider {
  getExecutionState(): RuntimeExecutionAppStateSlice
  getAppState(): AppState
  updateToolPermissionContext(
    updater: (
      prev: RuntimeExecutionAppStateSlice['toolPermissionContext'],
    ) => RuntimeExecutionAppStateSlice['toolPermissionContext'],
  ): void
  updateFileHistory(
    updater: (
      prev: RuntimeExecutionAppStateSlice['fileHistory'],
    ) => RuntimeExecutionAppStateSlice['fileHistory'],
  ): void
  updateAttribution(
    updater: (
      prev: RuntimeExecutionAppStateSlice['attribution'],
    ) => RuntimeExecutionAppStateSlice['attribution'],
  ): void
  setFastMode(value: RuntimeExecutionAppStateSlice['fastMode']): void
}

export interface RuntimeStateProviders {
  bootstrap: RuntimeBootstrapStateProvider
  app: RuntimeAppStateProvider
}

export interface RuntimeExecutionStateProviders {
  bootstrap: RuntimeExecutionSessionStateProvider
  app: RuntimeAppStateProvider
}
