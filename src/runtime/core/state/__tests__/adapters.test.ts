import { describe, expect, test } from 'bun:test'
import type { AppState } from 'src/state/AppStateStore.js'
import type { RuntimeBootstrapStateProvider } from '../../../contracts/state.js'
import { createExecutionStateProviders } from '../adapters.js'

function createBootstrapStateProviderStub(): RuntimeBootstrapStateProvider {
  return {
    getSessionIdentity() {
      return {
        sessionId: 'session-test' as never,
        sessionProjectDir: null,
        originalCwd: '/tmp',
        projectRoot: '/tmp',
        cwd: '/tmp',
        isInteractive: false,
        clientType: 'test',
      }
    },
    regenerateSessionId() {
      return 'session-next' as never
    },
    switchSession() {},
    setCwd() {},
    setProjectRoot() {},
    getUsageSnapshot() {
      return {
        totalCostUSD: 0,
        totalApiDurationMs: 0,
        totalApiDurationWithoutRetriesMs: 0,
        totalToolDurationMs: 0,
        turnHookDurationMs: 0,
        turnToolDurationMs: 0,
        turnClassifierDurationMs: 0,
        turnHookCount: 0,
        turnToolCount: 0,
        turnClassifierCount: 0,
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
        hasUnknownModelCost: false,
        lastInteractionTime: 0,
        modelUsage: {},
      }
    },
    markInteraction() {},
    getExecutionBudget() {
      return {
        turnOutputTokens: 0,
        currentTurnTokenBudget: null,
        budgetContinuationCount: 0,
        strictToolResultPairing: false,
      }
    },
    snapshotTurnBudget() {},
    incrementBudgetContinuationCount() {},
    getPromptState() {
      return {
        mainLoopModelOverride: undefined,
        initialMainLoopModel: null as never,
        modelStrings: null,
        cachedClaudeMdContent: null,
        systemPromptSectionCache: new Map(),
        lastEmittedDate: null,
        promptCache1hAllowlist: null,
        promptCache1hEligible: null,
        afkModeHeaderLatched: null,
        fastModeHeaderLatched: null,
        cacheEditingHeaderLatched: null,
        thinkingClearLatched: null,
        sdkBetas: undefined,
      }
    },
    patchPromptState() {},
    getRequestDebugState() {
      return {
        lastApiRequest: null,
        lastApiRequestMessages: null,
        lastClassifierRequests: null,
        promptId: null,
        lastMainRequestId: undefined,
        lastApiCompletionTimestamp: null,
      }
    },
    patchRequestDebugState() {},
    getHeadlessControlState() {
      return {
        initJsonSchema: undefined,
        mainThreadAgentType: undefined,
        allowedChannels: [],
        isRemoteMode: false,
        flagSettingsInline: null,
        sdkAgentProgressSummariesEnabled: false,
      }
    },
    patchHeadlessControlState() {},
    registerHookCallbacks() {},
    markPostCompaction() {},
    consumePostCompaction() {
      return false
    },
    isSessionPersistenceDisabled() {
      return false
    },
  }
}

describe('createExecutionStateProviders', () => {
  test('reuses an injected bootstrap state provider', () => {
    const bootstrapStateProvider = createBootstrapStateProviderStub()

    const providers = createExecutionStateProviders({
      getAppState: () => ({}) as AppState,
      setAppState: () => {},
      bootstrapStateProvider,
    })

    expect(providers.bootstrap).toBe(bootstrapStateProvider)
  })
})
