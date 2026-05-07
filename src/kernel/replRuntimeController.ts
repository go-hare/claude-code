import type { AgentDefinitionsResult } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'

import {
  materializeRuntimeToolSet,
  refreshRuntimeAgentDefinitions,
  type RuntimeToolSetInput,
} from '../runtime/capabilities/execution/headlessCapabilityMaterializer.js'
import {
  prepareReplRuntimeQuery,
  runReplRuntimeQuery,
  type PreparedReplRuntimeQuery,
  type ReplQueryRuntimeEvent,
} from '../runtime/capabilities/execution/internal/replQueryRuntime.js'
import {
  createRuntimePermissionService,
  type RuntimePermissionService,
  type RuntimePermissionServiceOptions,
} from '../runtime/capabilities/permissions/RuntimePermissionService.js'
import type { KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'
import type {
  RuntimeExecutionBudgetState,
  RuntimeSessionIdentity,
  RuntimeSessionIdentityStateProvider,
  RuntimeUsageSnapshot,
  RuntimeUsageStateProvider,
} from '../runtime/contracts/state.js'
import { createKernelRuntimeEventFacade } from '../runtime/core/events/KernelRuntimeEventFacade.js'
import { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import {
  createRuntimeCostRestoreStateWriter,
  createRuntimeInputTokenStateProvider,
  createRuntimeSessionIdentityStateProvider,
  createRuntimeUsageStateProvider,
  type RuntimeCostRestoreStateWriter,
  type RuntimeInputTokenStateProvider,
} from '../runtime/core/state/bootstrapProvider.js'

export type {
  KernelRuntimeEnvelopeBase,
  PreparedReplRuntimeQuery as KernelPreparedReplRuntimeQuery,
  ReplQueryRuntimeEvent as KernelReplQueryRuntimeEvent,
}

export {
  createKernelRuntimeEventFacade,
  prepareReplRuntimeQuery as prepareKernelReplRuntimeQuery,
  runReplRuntimeQuery as runKernelReplRuntimeQuery,
}

export type KernelReplRuntimeState = {
  getSessionIdentity(): RuntimeSessionIdentity
  switchSession: RuntimeSessionIdentityStateProvider['switchSession']
  setCostStateForRestore: RuntimeCostRestoreStateWriter['setCostStateForRestore']
  snapshotTurnBudget: RuntimeUsageStateProvider['snapshotTurnBudget']
  getCurrentTurnTokenBudget(): RuntimeExecutionBudgetState['currentTurnTokenBudget']
  getTurnOutputTokens(): RuntimeExecutionBudgetState['turnOutputTokens']
  getBudgetContinuationCount(): RuntimeExecutionBudgetState['budgetContinuationCount']
  getTotalInputTokens(): ReturnType<
    RuntimeInputTokenStateProvider['getTotalInputTokens']
  >
  markInteraction: RuntimeUsageStateProvider['markInteraction']
  getLastInteractionTime(): RuntimeUsageSnapshot['lastInteractionTime']
}

export function createKernelReplRuntimeState(): KernelReplRuntimeState {
  const costRestoreState = createRuntimeCostRestoreStateWriter()
  const inputTokenState = createRuntimeInputTokenStateProvider()
  const sessionIdentityState = createRuntimeSessionIdentityStateProvider()
  const usageState = createRuntimeUsageStateProvider()

  return {
    getSessionIdentity() {
      return sessionIdentityState.getSessionIdentity()
    },
    switchSession(sessionId, projectDir) {
      sessionIdentityState.switchSession(sessionId, projectDir)
    },
    setCostStateForRestore(state) {
      costRestoreState.setCostStateForRestore(state)
    },
    snapshotTurnBudget(budget) {
      usageState.snapshotTurnBudget(budget)
    },
    getCurrentTurnTokenBudget() {
      return usageState.getExecutionBudget().currentTurnTokenBudget
    },
    getTurnOutputTokens() {
      return usageState.getExecutionBudget().turnOutputTokens
    },
    getBudgetContinuationCount() {
      return usageState.getExecutionBudget().budgetContinuationCount
    },
    getTotalInputTokens() {
      return inputTokenState.getTotalInputTokens()
    },
    markInteraction(immediate) {
      usageState.markInteraction(immediate)
    },
    getLastInteractionTime() {
      return usageState.getUsageSnapshot().lastInteractionTime
    },
  }
}

export function createKernelReplRuntimeEventBus(options: {
  runtimeId: string
}): RuntimeEventBus {
  return new RuntimeEventBus(options)
}

export function createKernelReplPermissionService(
  options: RuntimePermissionServiceOptions,
): RuntimePermissionService {
  return createRuntimePermissionService(options)
}

export function materializeKernelReplRuntimeToolSet(
  input: RuntimeToolSetInput,
) {
  return materializeRuntimeToolSet(input)
}

export function refreshKernelReplRuntimeAgentDefinitions(options: {
  cwd: string
  activeFromAll?: boolean
}): Promise<AgentDefinitionsResult> {
  return refreshRuntimeAgentDefinitions(options)
}
