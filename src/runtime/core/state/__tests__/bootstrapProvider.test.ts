import { beforeEach, describe, expect, test } from 'bun:test'

import {
  getAllowedChannels,
  getBudgetContinuationCount,
  getCurrentTurnTokenBudget,
  getPromptId,
  getRegisteredHooks,
  getSdkBetas,
  getSessionId,
  getTeleportedSessionInfo,
  incrementBudgetContinuationCount,
  registerHookCallbacks,
  resetStateForTests,
  setAllowedChannels,
  setPromptId,
  setSdkBetas,
  setTeleportedSessionInfo,
  snapshotOutputTokensForTurn,
} from 'src/bootstrap/state.js'
import { createBootstrapStateProvider } from '../bootstrapProvider.js'

describe('createBootstrapStateProvider', () => {
  beforeEach(() => {
    resetStateForTests()
  })

  test('keeps session-scoped bootstrap state isolated per provider', () => {
    const providerA = createBootstrapStateProvider()
    const providerB = createBootstrapStateProvider()
    const globalSessionId = getSessionId()

    providerA.switchSession('session-provider-a' as never, null)
    providerA.patchHeadlessControlState({
      allowedChannels: [{ kind: 'server', name: 'alpha' }],
    })
    providerA.patchPromptState({
      sdkBetas: ['beta-a'],
    })
    providerA.patchRequestDebugState({
      promptId: 'prompt-a',
    })
    providerA.runWithState(() => {
      setTeleportedSessionInfo({
        sessionId: 'teleport-a',
      })
    })

    expect(
      providerA.getSessionIdentity().sessionId as unknown as string,
    ).toBe('session-provider-a')
    expect(providerB.getSessionIdentity().sessionId).toBe(globalSessionId)
    expect(getSessionId()).toBe(globalSessionId)
    expect(providerA.getHeadlessControlState().allowedChannels).toEqual([
      { kind: 'server', name: 'alpha' },
    ])
    expect(providerB.getHeadlessControlState().allowedChannels).toEqual([])
    expect(providerA.getPromptState().sdkBetas).toEqual(['beta-a'])
    expect(providerB.getPromptState().sdkBetas).toBeUndefined()
    expect(providerA.getRequestDebugState().promptId).toBe('prompt-a')
    expect(providerB.getRequestDebugState().promptId).toBeNull()
    expect(providerA.getTeleportedSessionInfo()).toEqual({
      isTeleported: true,
      hasLoggedFirstMessage: false,
      sessionId: 'teleport-a',
    })
    expect(providerB.getTeleportedSessionInfo()).toBeNull()
    expect(getAllowedChannels()).toEqual([])
    expect(getSdkBetas()).toBeUndefined()
    expect(getPromptId()).toBeNull()
    expect(getTeleportedSessionInfo()).toBeNull()
  })

  test('re-routes direct bootstrap access through the active provider state', () => {
    const provider = createBootstrapStateProvider()

    provider.runWithState(() => {
      setAllowedChannels([{ kind: 'server', name: 'local-only' }])
      setSdkBetas(['beta-local'])
      setPromptId('prompt-local')

      expect(getAllowedChannels()).toEqual([
        { kind: 'server', name: 'local-only' },
      ])
      expect(getSdkBetas()).toEqual(['beta-local'])
      expect(getPromptId()).toBe('prompt-local')
    })

    expect(getAllowedChannels()).toEqual([])
    expect(getSdkBetas()).toBeUndefined()
    expect(getPromptId()).toBeNull()
  })

  test('isolates turn-budget bookkeeping inside the active provider state', () => {
    const provider = createBootstrapStateProvider()

    provider.runWithState(() => {
      snapshotOutputTokensForTurn(4096)
      incrementBudgetContinuationCount()

      expect(getCurrentTurnTokenBudget()).toBe(4096)
      expect(getBudgetContinuationCount()).toBe(1)
    })

    expect(getCurrentTurnTokenBudget()).toBeNull()
    expect(getBudgetContinuationCount()).toBe(0)
  })

  test('isolates registered hooks inside the active provider state', () => {
    const provider = createBootstrapStateProvider()

    provider.runWithState(() => {
      registerHookCallbacks({
        Notification: [
          {
            matcher: 'runtime',
            hooks: [
              {
                type: 'callback',
                timeout: 1,
                callback: async () => ({
                  systemMessage: 'scoped-hook',
                }),
              },
            ],
          },
        ],
      })

      expect(getRegisteredHooks()?.Notification).toHaveLength(1)
    })

    expect(getRegisteredHooks()).toBeNull()
  })
})
