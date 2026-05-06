import {
  addInvokedSkill,
  addToTotalDurationState,
  clearBetaHeaderLatches,
  clearInvokedSkills,
  clearSystemPromptSectionState,
  consumePostCompaction,
  getAdditionalDirectoriesForClaudeMd,
  getAfkModeHeaderLatched,
  getAllowedChannels,
  getCacheEditingHeaderLatched,
  getCachedClaudeMdContent,
  getClientType,
  getCodeEditToolDecisionCounter,
  getCurrentTurnTokenBudget,
  getCwdState,
  getFastModeHeaderLatched,
  getFlagSettingsInline,
  getIsScrollDraining,
  getInitialMainLoopModel,
  getIsInteractive,
  getIsRemoteMode,
  getKairosActive,
  getLastAPIRequest,
  getLastAPIRequestMessages,
  getLastApiCompletionTimestamp,
  getLastClassifierRequests,
  getLastEmittedDate,
  getLastInteractionTime,
  getLastMainRequestId,
  getMainLoopModelOverride,
  getMainThreadAgentType,
  getModelStrings,
  getModelUsage,
  getOriginalCwd,
  getParentSessionId,
  getProjectRoot,
  getPromptCache1hAllowlist,
  getPromptCache1hEligible,
  getPromptId,
  getProtocolBetas,
  getSdkAgentProgressSummariesEnabled,
  getSessionId,
  getSessionProjectDir,
  getSessionSource,
  getSlowOperations,
  getStrictToolResultPairing,
  getSystemPromptSectionCache,
  getTeleportedSessionInfo,
  getThinkingClearLatched,
  handlePlanModeTransition,
  hasShownLspRecommendationThisSession,
  getInitJsonSchema,
  getTotalAPIDuration,
  getTotalAPIDurationWithoutRetries,
  getTotalCostUSD,
  getTotalInputTokens,
  getTotalLinesAdded,
  getTotalLinesRemoved,
  getTotalToolDuration,
  getTurnClassifierCount,
  getTurnClassifierDurationMs,
  getTurnHookCount,
  getTurnHookDurationMs,
  getTurnOutputTokens,
  getTurnToolCount,
  getTurnToolDurationMs,
  getBudgetContinuationCount,
  getInvokedSkillsForAgent,
  hasUnknownModelCost,
  incrementBudgetContinuationCount,
  isSessionPersistenceDisabled,
  markPostCompaction,
  markFirstTeleportMessageLogged,
  regenerateSessionId,
  resetCostState,
  resetTurnClassifierDuration,
  resetTurnHookDuration,
  resetTurnToolDuration,
  setAfkModeHeaderLatched,
  setAdditionalDirectoriesForClaudeMd,
  setCacheEditingHeaderLatched,
  setCachedClaudeMdContent,
  setCwdState,
  setFastModeHeaderLatched,
  setAllowedChannels,
  setHasExitedPlanMode,
  setInitialMainLoopModel,
  setLastAPIRequest,
  setLastAPIRequestMessages,
  setLastApiCompletionTimestamp,
  setLastClassifierRequests,
  setLastEmittedDate,
  setLastMainRequestId,
  setMainLoopModelOverride,
  setMainThreadAgentType,
  setModelStrings,
  setLspRecommendationShownThisSession,
  setNeedsAutoModeExitAttachment,
  setNeedsPlanModeExitAttachment,
  setOriginalCwd,
  setProjectRoot,
  setPromptCache1hAllowlist,
  setPromptCache1hEligible,
  setPromptId,
  setCostStateForRestore,
  setSessionTrustAccepted,
  setProtocolBetas,
  setSdkAgentProgressSummariesEnabled,
  setSessionPersistenceDisabled,
  setTeleportedSessionInfo,
  setFlagSettingsInline,
  setInitJsonSchema,
  setKairosActive,
  registerHookCallbacks,
  setSystemPromptSectionCacheEntry,
  setThinkingClearLatched,
  setUserMsgOptIn,
  snapshotOutputTokensForTurn,
  switchSession,
  updateLastInteractionTime,
  getUserMsgOptIn,
  cloneBootstrapState,
  runWithBootstrapState,
} from 'src/bootstrap/state.js'
import type {
  RuntimeBootstrapStateProvider,
  RuntimeCompactionStateProvider,
  RuntimeExecutionPromptStatePatch,
  RuntimeHeadlessControlStateProvider,
  RuntimeInvokedSkillStateProvider,
  RuntimePromptStateProvider,
  RuntimeRequestDebugStatePatch,
  RuntimeRequestDebugStateProvider,
  RuntimeSessionIdentityStateProvider,
  RuntimeTeleportStateProvider,
  RuntimeUsageStateProvider,
} from './providers.js'

type RuntimeBootstrapStateRunner = <T>(fn: () => T) => T

const runWithoutBootstrapOverride: RuntimeBootstrapStateRunner = fn => fn()

function bindBootstrapState<TArgs extends unknown[], TResult>(
  runWithState: RuntimeBootstrapStateRunner,
  fn: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  return (...args) => runWithState(() => fn(...args))
}

export type RuntimePathStateWriter = {
  setOriginalCwd(cwd: string): void
  setCwd(cwd: string): void
}

export function createRuntimePathStateWriter(): RuntimePathStateWriter {
  return {
    setOriginalCwd(cwd) {
      setOriginalCwd(cwd)
    },
    setCwd(cwd) {
      setCwdState(cwd)
    },
  }
}

export type RuntimeHeadlessStartupStateWriter = {
  setSessionPersistenceDisabled(disabled: boolean): void
  setProtocolBetas(betas: string[] | undefined): void
}

export function createRuntimeHeadlessStartupStateWriter(
  runWithState: RuntimeBootstrapStateRunner = runWithoutBootstrapOverride,
): RuntimeHeadlessStartupStateWriter {
  return {
    setSessionPersistenceDisabled: bindBootstrapState(
      runWithState,
      setSessionPersistenceDisabled,
    ),
    setProtocolBetas: bindBootstrapState(runWithState, setProtocolBetas),
  }
}

export function createRuntimeSessionIdentityStateProvider(
  runWithState: RuntimeBootstrapStateRunner = runWithoutBootstrapOverride,
): RuntimeSessionIdentityStateProvider {
  return {
    getSessionIdentity() {
      return runWithState(() => ({
        sessionId: getSessionId(),
        parentSessionId: getParentSessionId(),
        sessionProjectDir: getSessionProjectDir(),
        originalCwd: getOriginalCwd(),
        projectRoot: getProjectRoot(),
        cwd: getCwdState(),
        isInteractive: getIsInteractive(),
        clientType: getClientType(),
        sessionSource: getSessionSource(),
      }))
    },
    regenerateSessionId: bindBootstrapState(runWithState, regenerateSessionId),
    switchSession: bindBootstrapState(runWithState, switchSession),
    setCwd: bindBootstrapState(runWithState, setCwdState),
    setProjectRoot: bindBootstrapState(runWithState, setProjectRoot),
    isSessionPersistenceDisabled: bindBootstrapState(
      runWithState,
      isSessionPersistenceDisabled,
    ),
  }
}

export function createRuntimeUsageStateProvider(
  runWithState: RuntimeBootstrapStateRunner = runWithoutBootstrapOverride,
): RuntimeUsageStateProvider {
  return {
    getUsageSnapshot() {
      return runWithState(() => ({
        totalCostUSD: getTotalCostUSD(),
        totalApiDurationMs: getTotalAPIDuration(),
        totalApiDurationWithoutRetriesMs: getTotalAPIDurationWithoutRetries(),
        totalToolDurationMs: getTotalToolDuration(),
        turnHookDurationMs: getTurnHookDurationMs(),
        turnToolDurationMs: getTurnToolDurationMs(),
        turnClassifierDurationMs: getTurnClassifierDurationMs(),
        turnHookCount: getTurnHookCount(),
        turnToolCount: getTurnToolCount(),
        turnClassifierCount: getTurnClassifierCount(),
        totalLinesAdded: getTotalLinesAdded(),
        totalLinesRemoved: getTotalLinesRemoved(),
        hasUnknownModelCost: hasUnknownModelCost(),
        lastInteractionTime: getLastInteractionTime(),
        modelUsage: getModelUsage(),
      }))
    },
    markInteraction: bindBootstrapState(runWithState, updateLastInteractionTime),
    recordApiDuration: bindBootstrapState(
      runWithState,
      addToTotalDurationState,
    ),
    getExecutionBudget() {
      return runWithState(() => ({
        turnOutputTokens: getTurnOutputTokens(),
        currentTurnTokenBudget: getCurrentTurnTokenBudget(),
        budgetContinuationCount: getBudgetContinuationCount(),
        strictToolResultPairing: getStrictToolResultPairing(),
      }))
    },
    snapshotTurnBudget: bindBootstrapState(
      runWithState,
      snapshotOutputTokensForTurn,
    ),
    incrementBudgetContinuationCount: bindBootstrapState(
      runWithState,
      incrementBudgetContinuationCount,
    ),
  }
}

export function createRuntimePromptStateProvider(
  runWithState: RuntimeBootstrapStateRunner = runWithoutBootstrapOverride,
): RuntimePromptStateProvider {
  return {
    getPromptState() {
      return runWithState(() => ({
        mainLoopModelOverride: getMainLoopModelOverride(),
        initialMainLoopModel: getInitialMainLoopModel(),
        modelStrings: getModelStrings(),
        cachedClaudeMdContent: getCachedClaudeMdContent(),
        systemPromptSectionCache: getSystemPromptSectionCache(),
        lastEmittedDate: getLastEmittedDate(),
        promptCache1hAllowlist: getPromptCache1hAllowlist(),
        promptCache1hEligible: getPromptCache1hEligible(),
        afkModeHeaderLatched: getAfkModeHeaderLatched(),
        fastModeHeaderLatched: getFastModeHeaderLatched(),
        cacheEditingHeaderLatched: getCacheEditingHeaderLatched(),
        thinkingClearLatched: getThinkingClearLatched(),
        sdkBetas: getProtocolBetas(),
      }))
    },
    patchPromptState(patch: RuntimeExecutionPromptStatePatch) {
      runWithState(() => {
        if ('mainLoopModelOverride' in patch) {
          setMainLoopModelOverride(patch.mainLoopModelOverride)
        }
        if (
          'initialMainLoopModel' in patch &&
          patch.initialMainLoopModel !== undefined
        ) {
          setInitialMainLoopModel(patch.initialMainLoopModel)
        }
        if ('modelStrings' in patch && patch.modelStrings !== undefined) {
          setModelStrings(patch.modelStrings)
        }
        if ('cachedClaudeMdContent' in patch) {
          setCachedClaudeMdContent(patch.cachedClaudeMdContent ?? null)
        }
        if (patch.clearSystemPromptSectionCache) {
          clearSystemPromptSectionState()
        }
        if (patch.systemPromptSection) {
          setSystemPromptSectionCacheEntry(
            patch.systemPromptSection.name,
            patch.systemPromptSection.value,
          )
        }
        if ('lastEmittedDate' in patch) {
          setLastEmittedDate(patch.lastEmittedDate ?? null)
        }
        if ('promptCache1hAllowlist' in patch) {
          setPromptCache1hAllowlist(patch.promptCache1hAllowlist ?? null)
        }
        if ('promptCache1hEligible' in patch) {
          setPromptCache1hEligible(patch.promptCache1hEligible ?? null)
        }
        if (patch.clearHeaderLatches) {
          clearBetaHeaderLatches()
        }
        if (
          'afkModeHeaderLatched' in patch &&
          patch.afkModeHeaderLatched !== undefined
        ) {
          setAfkModeHeaderLatched(patch.afkModeHeaderLatched)
        }
        if (
          'fastModeHeaderLatched' in patch &&
          patch.fastModeHeaderLatched !== undefined
        ) {
          setFastModeHeaderLatched(patch.fastModeHeaderLatched)
        }
        if (
          'cacheEditingHeaderLatched' in patch &&
          patch.cacheEditingHeaderLatched !== undefined
        ) {
          setCacheEditingHeaderLatched(patch.cacheEditingHeaderLatched)
        }
        if (
          'thinkingClearLatched' in patch &&
          patch.thinkingClearLatched !== undefined
        ) {
          setThinkingClearLatched(patch.thinkingClearLatched)
        }
        if ('sdkBetas' in patch) {
          setProtocolBetas(patch.sdkBetas)
        }
      })
    },
  }
}

export function createRuntimeRequestDebugStateProvider(
  runWithState: RuntimeBootstrapStateRunner = runWithoutBootstrapOverride,
): RuntimeRequestDebugStateProvider {
  return {
    getRequestDebugState() {
      return runWithState(() => ({
        lastApiRequest: getLastAPIRequest(),
        lastApiRequestMessages: getLastAPIRequestMessages(),
        lastClassifierRequests: getLastClassifierRequests(),
        promptId: getPromptId(),
        lastMainRequestId: getLastMainRequestId(),
        lastApiCompletionTimestamp: getLastApiCompletionTimestamp(),
      }))
    },
    patchRequestDebugState(patch: RuntimeRequestDebugStatePatch) {
      runWithState(() => {
        if ('lastApiRequest' in patch) {
          setLastAPIRequest(patch.lastApiRequest ?? null)
        }
        if ('lastApiRequestMessages' in patch) {
          setLastAPIRequestMessages(patch.lastApiRequestMessages ?? null)
        }
        if ('lastClassifierRequests' in patch) {
          setLastClassifierRequests(patch.lastClassifierRequests ?? null)
        }
        if ('promptId' in patch) {
          setPromptId(patch.promptId ?? null)
        }
        if (
          'lastMainRequestId' in patch &&
          patch.lastMainRequestId !== undefined
        ) {
          setLastMainRequestId(patch.lastMainRequestId)
        }
        if (
          'lastApiCompletionTimestamp' in patch &&
          patch.lastApiCompletionTimestamp !== undefined
        ) {
          setLastApiCompletionTimestamp(patch.lastApiCompletionTimestamp)
        }
      })
    },
  }
}

export function createRuntimeHeadlessControlStateProvider(
  runWithState: RuntimeBootstrapStateRunner = runWithoutBootstrapOverride,
): RuntimeHeadlessControlStateProvider {
  return {
    getHeadlessControlState() {
      return runWithState(() => ({
        initJsonSchema: getInitJsonSchema() ?? undefined,
        mainThreadAgentType: getMainThreadAgentType(),
        allowedChannels: [...getAllowedChannels()],
        isRemoteMode: getIsRemoteMode(),
        flagSettingsInline: getFlagSettingsInline(),
        sdkAgentProgressSummariesEnabled:
          getSdkAgentProgressSummariesEnabled(),
      }))
    },
    patchHeadlessControlState(patch) {
      runWithState(() => {
        if (
          'initJsonSchema' in patch &&
          patch.initJsonSchema !== undefined
        ) {
          setInitJsonSchema(patch.initJsonSchema)
        }
        if ('mainThreadAgentType' in patch) {
          setMainThreadAgentType(patch.mainThreadAgentType)
        }
        if (
          'allowedChannels' in patch &&
          patch.allowedChannels !== undefined
        ) {
          setAllowedChannels([...patch.allowedChannels])
        }
        if ('flagSettingsInline' in patch) {
          setFlagSettingsInline(patch.flagSettingsInline ?? null)
        }
        if (
          'sdkAgentProgressSummariesEnabled' in patch &&
          patch.sdkAgentProgressSummariesEnabled !== undefined
        ) {
          setSdkAgentProgressSummariesEnabled(
            patch.sdkAgentProgressSummariesEnabled,
          )
        }
      })
    },
    registerHookCallbacks: bindBootstrapState(
      runWithState,
      registerHookCallbacks,
    ),
  }
}

export type RuntimeKairosStateProvider = {
  getKairosActive(): boolean
  setKairosActive(value: boolean): void
}

export function createRuntimeKairosStateProvider(): RuntimeKairosStateProvider {
  return {
    getKairosActive() {
      return getKairosActive()
    },
    setKairosActive(value) {
      setKairosActive(value)
    },
  }
}

export type RuntimeUserMessageOptInStateProvider = {
  getUserMsgOptIn(): boolean
  setUserMsgOptIn(value: boolean): void
}

export function createRuntimeUserMessageOptInStateProvider(): RuntimeUserMessageOptInStateProvider {
  return {
    getUserMsgOptIn() {
      return getUserMsgOptIn()
    },
    setUserMsgOptIn(value) {
      setUserMsgOptIn(value)
    },
  }
}

export type RuntimeClaudeMdDirectoryStateProvider = {
  getAdditionalDirectoriesForClaudeMd(): string[]
  setAdditionalDirectoriesForClaudeMd(directories: string[]): void
}

export function createRuntimeClaudeMdDirectoryStateProvider(): RuntimeClaudeMdDirectoryStateProvider {
  return {
    getAdditionalDirectoriesForClaudeMd() {
      return getAdditionalDirectoriesForClaudeMd()
    },
    setAdditionalDirectoriesForClaudeMd(directories) {
      setAdditionalDirectoriesForClaudeMd(directories)
    },
  }
}

export function createRuntimeCompactionStateProvider(
  runWithState: RuntimeBootstrapStateRunner = runWithoutBootstrapOverride,
): RuntimeCompactionStateProvider {
  return {
    markPostCompaction: bindBootstrapState(runWithState, markPostCompaction),
    consumePostCompaction: bindBootstrapState(
      runWithState,
      consumePostCompaction,
    ),
  }
}

export function createRuntimeTeleportStateProvider(
  runWithState: RuntimeBootstrapStateRunner = runWithoutBootstrapOverride,
): RuntimeTeleportStateProvider {
  return {
    getTeleportedSessionInfo: bindBootstrapState(
      runWithState,
      getTeleportedSessionInfo,
    ),
    markFirstTeleportMessageLogged: bindBootstrapState(
      runWithState,
      markFirstTeleportMessageLogged,
    ),
  }
}

export type RuntimeTeleportStateWriter = {
  setTeleportedSessionInfo(info: { sessionId: string | null }): void
}

export function createRuntimeTeleportStateWriter(): RuntimeTeleportStateWriter {
  return {
    setTeleportedSessionInfo(info) {
      setTeleportedSessionInfo(info)
    },
  }
}

export type RuntimeSessionPolicyStateWriter = {
  setSessionTrustAccepted(accepted: boolean): void
}

export function createRuntimeSessionPolicyStateWriter(): RuntimeSessionPolicyStateWriter {
  return {
    setSessionTrustAccepted(accepted) {
      setSessionTrustAccepted(accepted)
    },
  }
}

export type RuntimeUsageResetWriter = {
  resetCostState(): void
}

export function createRuntimeUsageResetWriter(): RuntimeUsageResetWriter {
  return {
    resetCostState() {
      resetCostState()
    },
  }
}

export type RuntimeTurnMetricsStateProvider = {
  getTurnMetrics(): {
    hookDurationMs: number
    hookCount: number
    toolDurationMs: number
    toolCount: number
    classifierDurationMs: number
    classifierCount: number
  }
  resetTurnMetrics(): void
}

export function createRuntimeTurnMetricsStateProvider(): RuntimeTurnMetricsStateProvider {
  return {
    getTurnMetrics() {
      return {
        hookDurationMs: getTurnHookDurationMs(),
        hookCount: getTurnHookCount(),
        toolDurationMs: getTurnToolDurationMs(),
        toolCount: getTurnToolCount(),
        classifierDurationMs: getTurnClassifierDurationMs(),
        classifierCount: getTurnClassifierCount(),
      }
    },
    resetTurnMetrics() {
      resetTurnHookDuration()
      resetTurnToolDuration()
      resetTurnClassifierDuration()
    },
  }
}

export type RuntimeInputTokenStateProvider = {
  getTotalInputTokens(): number
}

export function createRuntimeInputTokenStateProvider(): RuntimeInputTokenStateProvider {
  return {
    getTotalInputTokens() {
      return getTotalInputTokens()
    },
  }
}

export type RuntimeCostRestoreStateWriter = {
  setCostStateForRestore(
    state: Parameters<typeof setCostStateForRestore>[0],
  ): void
}

export function createRuntimeCostRestoreStateWriter(): RuntimeCostRestoreStateWriter {
  return {
    setCostStateForRestore(state) {
      setCostStateForRestore(state)
    },
  }
}

export type RuntimeSessionCacheStateWriter = {
  clearInvokedSkills(preservedAgentIds?: ReadonlySet<string>): void
}

export function createRuntimeSessionCacheStateWriter(): RuntimeSessionCacheStateWriter {
  return {
    clearInvokedSkills(preservedAgentIds) {
      clearInvokedSkills(preservedAgentIds)
    },
  }
}

export type RuntimePlanModeStateWriter = {
  handlePlanModeTransition(fromMode: string, toMode: string): void
  setHasExitedPlanMode(value: boolean): void
  setNeedsPlanModeExitAttachment(value: boolean): void
  setNeedsAutoModeExitAttachment(value: boolean): void
}

export function createRuntimePlanModeStateWriter(): RuntimePlanModeStateWriter {
  return {
    handlePlanModeTransition(fromMode, toMode) {
      handlePlanModeTransition(fromMode, toMode)
    },
    setHasExitedPlanMode(value) {
      setHasExitedPlanMode(value)
    },
    setNeedsPlanModeExitAttachment(value) {
      setNeedsPlanModeExitAttachment(value)
    },
    setNeedsAutoModeExitAttachment(value) {
      setNeedsAutoModeExitAttachment(value)
    },
  }
}

export type RuntimeHostRenderLoopStateProvider = {
  getIsScrollDraining(): boolean
}

export function createRuntimeHostRenderLoopStateProvider(): RuntimeHostRenderLoopStateProvider {
  return {
    getIsScrollDraining() {
      return getIsScrollDraining()
    },
  }
}

export type RuntimeObservabilityStateProvider = {
  getSlowOperations(): ReadonlyArray<{
    operation: string
    durationMs: number
    timestamp: number
  }>
  getCodeEditToolDecisionCounter(): {
    add(
      value: number,
      attributes?: Record<string, string>,
    ): void
  } | null
}

export function createRuntimeObservabilityStateProvider(): RuntimeObservabilityStateProvider {
  return {
    getSlowOperations() {
      return getSlowOperations()
    },
    getCodeEditToolDecisionCounter() {
      return getCodeEditToolDecisionCounter()
    },
  }
}

export type RuntimeLspRecommendationStateProvider = {
  hasShownLspRecommendationThisSession(): boolean
  setLspRecommendationShownThisSession(value: boolean): void
}

export function createRuntimeLspRecommendationStateProvider(): RuntimeLspRecommendationStateProvider {
  return {
    hasShownLspRecommendationThisSession() {
      return hasShownLspRecommendationThisSession()
    },
    setLspRecommendationShownThisSession(value) {
      setLspRecommendationShownThisSession(value)
    },
  }
}

export function createRuntimeInvokedSkillStateProvider(
  runWithState: RuntimeBootstrapStateRunner = runWithoutBootstrapOverride,
): RuntimeInvokedSkillStateProvider {
  return {
    addInvokedSkill: bindBootstrapState(runWithState, addInvokedSkill),
    getInvokedSkillsForAgent: bindBootstrapState(
      runWithState,
      getInvokedSkillsForAgent,
    ),
  }
}

export function createBootstrapStateProvider(): RuntimeBootstrapStateProvider {
  const state = cloneBootstrapState()
  const runWithState: RuntimeBootstrapStateRunner = fn =>
    runWithBootstrapState(state, fn)
  return {
    runWithState,
    ...createRuntimeSessionIdentityStateProvider(runWithState),
    ...createRuntimeUsageStateProvider(runWithState),
    ...createRuntimePromptStateProvider(runWithState),
    ...createRuntimeRequestDebugStateProvider(runWithState),
    ...createRuntimeHeadlessControlStateProvider(runWithState),
    ...createRuntimeCompactionStateProvider(runWithState),
    ...createRuntimeTeleportStateProvider(runWithState),
    ...createRuntimeInvokedSkillStateProvider(runWithState),
  }
}
