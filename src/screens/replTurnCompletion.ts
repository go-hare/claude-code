export type ReplTurnBudgetInfo = {
  tokens: number
  limit: number
  nudges: number
}

export function captureReplTurnBudgetInfo({
  tokenBudget,
  isAborted,
  getTurnOutputTokens,
  getBudgetContinuationCount,
  clearTurnBudget,
}: {
  tokenBudget: number | null
  isAborted: boolean
  getTurnOutputTokens: () => number
  getBudgetContinuationCount: () => number
  clearTurnBudget: () => void
}): ReplTurnBudgetInfo | undefined {
  const budgetInfo =
    tokenBudget !== null && tokenBudget > 0 && !isAborted
      ? {
          tokens: getTurnOutputTokens(),
          limit: tokenBudget,
          nudges: getBudgetContinuationCount(),
        }
      : undefined

  clearTurnBudget()
  return budgetInfo
}

export function finalizeReplTurnDurationShell({
  turnDurationMs,
  budgetInfo,
  isAborted,
  proactiveActive,
  hasRunningSwarmAgents,
  loadingStartTimeMs,
  recordDeferredSwarmStartTime,
  recordDeferredBudgetInfo,
  appendTurnDurationMessage,
}: {
  turnDurationMs: number
  budgetInfo: ReplTurnBudgetInfo | undefined
  isAborted: boolean
  proactiveActive: boolean
  hasRunningSwarmAgents: boolean
  loadingStartTimeMs: number
  recordDeferredSwarmStartTime: (timeMs: number) => void
  recordDeferredBudgetInfo: (budgetInfo: ReplTurnBudgetInfo) => void
  appendTurnDurationMessage: (
    turnDurationMs: number,
    budgetInfo: ReplTurnBudgetInfo | undefined,
  ) => void
}): void {
  if (
    (turnDurationMs <= 30000 && budgetInfo === undefined) ||
    isAborted ||
    proactiveActive
  ) {
    return
  }

  if (hasRunningSwarmAgents) {
    recordDeferredSwarmStartTime(loadingStartTimeMs)
    if (budgetInfo) {
      recordDeferredBudgetInfo(budgetInfo)
    }
    return
  }

  appendTurnDurationMessage(turnDurationMs, budgetInfo)
}
