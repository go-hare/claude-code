import { describe, expect, mock, test } from 'bun:test'

import {
  captureReplTurnBudgetInfo,
  finalizeReplTurnDurationShell,
} from '../replTurnCompletion.js'

describe('replTurnCompletion', () => {
  test('captures turn budget info and clears the snapshot', () => {
    const clearTurnBudget = mock(() => {})

    const budgetInfo = captureReplTurnBudgetInfo({
      tokenBudget: 128,
      isAborted: false,
      getTurnOutputTokens: () => 64,
      getBudgetContinuationCount: () => 2,
      clearTurnBudget,
    })

    expect(budgetInfo).toEqual({
      tokens: 64,
      limit: 128,
      nudges: 2,
    })
    expect(clearTurnBudget).toHaveBeenCalledTimes(1)
  })

  test('defers long turns while swarm agents are still running', () => {
    const recordDeferredSwarmStartTime = mock((_timeMs: number) => {})
    const recordDeferredBudgetInfo = mock((_budgetInfo: unknown) => {})
    const appendTurnDurationMessage = mock(
      (_turnDurationMs: number, _budgetInfo: unknown) => {},
    )

    finalizeReplTurnDurationShell({
      turnDurationMs: 40_000,
      budgetInfo: { tokens: 64, limit: 128, nudges: 2 },
      isAborted: false,
      proactiveActive: false,
      hasRunningSwarmAgents: true,
      loadingStartTimeMs: 12_345,
      recordDeferredSwarmStartTime,
      recordDeferredBudgetInfo,
      appendTurnDurationMessage,
    })

    expect(recordDeferredSwarmStartTime).toHaveBeenCalledWith(12_345)
    expect(recordDeferredBudgetInfo).toHaveBeenCalledWith({
      tokens: 64,
      limit: 128,
      nudges: 2,
    })
    expect(appendTurnDurationMessage).not.toHaveBeenCalled()
  })

  test('appends a turn-duration message when the turn completes locally', () => {
    const appendTurnDurationMessage = mock(
      (_turnDurationMs: number, _budgetInfo: unknown) => {},
    )

    finalizeReplTurnDurationShell({
      turnDurationMs: 40_000,
      budgetInfo: undefined,
      isAborted: false,
      proactiveActive: false,
      hasRunningSwarmAgents: false,
      loadingStartTimeMs: 12_345,
      recordDeferredSwarmStartTime: () => {},
      recordDeferredBudgetInfo: () => {},
      appendTurnDurationMessage,
    })

    expect(appendTurnDurationMessage).toHaveBeenCalledWith(40_000, undefined)
  })
})
