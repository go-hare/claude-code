import {
  clearBetaHeaderLatches,
  clearSystemPromptSectionState,
  consumePostCompaction,
  getAfkModeHeaderLatched,
  getAllowedChannels,
  getCacheEditingHeaderLatched,
  getCachedClaudeMdContent,
  getClientType,
  getCurrentTurnTokenBudget,
  getCwdState,
  getFastModeHeaderLatched,
  getFlagSettingsInline,
  getInitialMainLoopModel,
  getIsInteractive,
  getIsRemoteMode,
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
  getSdkBetas,
  getSdkAgentProgressSummariesEnabled,
  getSessionId,
  getSessionProjectDir,
  getSessionSource,
  getStrictToolResultPairing,
  getSystemPromptSectionCache,
  getThinkingClearLatched,
  getInitJsonSchema,
  getTotalAPIDuration,
  getTotalAPIDurationWithoutRetries,
  getTotalCostUSD,
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
  hasUnknownModelCost,
  incrementBudgetContinuationCount,
  isSessionPersistenceDisabled,
  markPostCompaction,
  regenerateSessionId,
  setAfkModeHeaderLatched,
  setCacheEditingHeaderLatched,
  setCachedClaudeMdContent,
  setCwdState,
  setFastModeHeaderLatched,
  setAllowedChannels,
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
  setProjectRoot,
  setPromptCache1hAllowlist,
  setPromptCache1hEligible,
  setPromptId,
  setSdkBetas,
  setSdkAgentProgressSummariesEnabled,
  setFlagSettingsInline,
  setInitJsonSchema,
  registerHookCallbacks,
  setSystemPromptSectionCacheEntry,
  setThinkingClearLatched,
  snapshotOutputTokensForTurn,
  switchSession,
  updateLastInteractionTime,
} from 'src/bootstrap/state.js'
import type {
  RuntimeBootstrapStateProvider,
  RuntimeExecutionPromptStatePatch,
  RuntimeRequestDebugStatePatch,
} from './providers.js'

export function createBootstrapStateProvider(): RuntimeBootstrapStateProvider {
  return {
    getSessionIdentity() {
      return {
        sessionId: getSessionId(),
        parentSessionId: getParentSessionId(),
        sessionProjectDir: getSessionProjectDir(),
        originalCwd: getOriginalCwd(),
        projectRoot: getProjectRoot(),
        cwd: getCwdState(),
        isInteractive: getIsInteractive(),
        clientType: getClientType(),
        sessionSource: getSessionSource(),
      }
    },
    regenerateSessionId(options) {
      return regenerateSessionId(options)
    },
    switchSession(sessionId, projectDir = null) {
      switchSession(sessionId, projectDir)
    },
    setCwd(cwd) {
      setCwdState(cwd)
    },
    setProjectRoot(projectRoot) {
      setProjectRoot(projectRoot)
    },
    getUsageSnapshot() {
      return {
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
      }
    },
    markInteraction(immediate) {
      updateLastInteractionTime(immediate)
    },
    getExecutionBudget() {
      return {
        turnOutputTokens: getTurnOutputTokens(),
        currentTurnTokenBudget: getCurrentTurnTokenBudget(),
        budgetContinuationCount: getBudgetContinuationCount(),
        strictToolResultPairing: getStrictToolResultPairing(),
      }
    },
    snapshotTurnBudget(budget) {
      snapshotOutputTokensForTurn(budget)
    },
    incrementBudgetContinuationCount() {
      incrementBudgetContinuationCount()
    },
    getPromptState() {
      return {
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
        sdkBetas: getSdkBetas(),
      }
    },
    patchPromptState(patch: RuntimeExecutionPromptStatePatch) {
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
        setSdkBetas(patch.sdkBetas)
      }
    },
    getRequestDebugState() {
      return {
        lastApiRequest: getLastAPIRequest(),
        lastApiRequestMessages: getLastAPIRequestMessages(),
        lastClassifierRequests: getLastClassifierRequests(),
        promptId: getPromptId(),
        lastMainRequestId: getLastMainRequestId(),
        lastApiCompletionTimestamp: getLastApiCompletionTimestamp(),
      }
    },
    patchRequestDebugState(patch: RuntimeRequestDebugStatePatch) {
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
    },
    getHeadlessControlState() {
      return {
        initJsonSchema: getInitJsonSchema() ?? undefined,
        mainThreadAgentType: getMainThreadAgentType(),
        allowedChannels: [...getAllowedChannels()],
        isRemoteMode: getIsRemoteMode(),
        flagSettingsInline: getFlagSettingsInline(),
        sdkAgentProgressSummariesEnabled:
          getSdkAgentProgressSummariesEnabled(),
      }
    },
    patchHeadlessControlState(patch) {
      if (
        'initJsonSchema' in patch &&
        patch.initJsonSchema !== undefined
      ) {
        setInitJsonSchema(patch.initJsonSchema)
      }
      if ('mainThreadAgentType' in patch) {
        setMainThreadAgentType(patch.mainThreadAgentType)
      }
      if ('allowedChannels' in patch && patch.allowedChannels !== undefined) {
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
    },
    registerHookCallbacks(hooks) {
      registerHookCallbacks(hooks)
    },
    markPostCompaction() {
      markPostCompaction()
    },
    consumePostCompaction() {
      return consumePostCompaction()
    },
    isSessionPersistenceDisabled() {
      return isSessionPersistenceDisabled()
    },
  }
}
