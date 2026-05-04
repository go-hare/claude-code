import { feature } from 'bun:bundle'
import partition from 'lodash-es/partition.js'
import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { resolveAgentTools } from '@go-hare/builtin-tools/tools/AgentTool/agentToolUtils.js'
import type { KernelCapabilityPlane } from '../runtime/contracts/capability.js'
import type { KernelExecutionMode } from '../runtime/contracts/turn.js'
import {
  createRuntimeCoordinatorToolCapabilityPlane,
  filterToolsByRuntimeCoordinatorCapabilityPlane,
  stripRuntimeCoordinatorToolCapabilityPlane,
} from '../runtime/capabilities/coordinator/CoordinatorCapabilityPlane.js'
import { assembleToolPool } from '../runtime/capabilities/tools/ToolPolicy.js'
import { isMcpTool } from '../services/mcp/utils.js'
import {
  dedupeToolsByName,
  type Tool,
  type ToolPermissionContext,
  type Tools,
} from '../Tool.js'

export { isPrActivitySubscriptionTool } from '../runtime/capabilities/coordinator/CoordinatorCapabilityPlane.js'

// Dead code elimination: conditional imports for feature-gated modules
/* eslint-disable @typescript-eslint/no-require-imports */
const coordinatorModeModule = feature('COORDINATOR_MODE')
  ? (require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Filters a tool array to the set allowed in coordinator mode.
 * Shared between the REPL path (mergeAndFilterTools) and the headless
 * path (main.tsx) so both stay in sync.
 *
 * PR activity subscription tools are always allowed since subscription
 * management is orchestration.
 */
export function applyCoordinatorToolFilter(tools: Tools): Tools {
  return filterToolsByRuntimeCoordinatorCapabilityPlane(
    tools,
    createRuntimeCoordinatorToolCapabilityPlane(tools),
  )
}

function isCoordinatorModeActive(): boolean {
  if (feature('COORDINATOR_MODE') && coordinatorModeModule) {
    return coordinatorModeModule.isCoordinatorMode()
  }
  return false
}

export type ResolvedMergedToolState = {
  rawTools: Tools
  tools: Tools
  capabilityPlane?: KernelCapabilityPlane
  executionMode?: KernelExecutionMode
}

export function resolveMergedToolState({
  initialTools,
  assembled,
}: {
  initialTools: Tools
  assembled: Tools
  mode: ToolPermissionContext['mode']
}): ResolvedMergedToolState {
  const [mcp, builtIn] = partition(
    dedupeToolsByName([...initialTools, ...assembled]),
    isMcpTool,
  )
  const byName = (a: Tool, b: Tool) => a.name.localeCompare(b.name)
  const rawTools = [...builtIn.sort(byName), ...mcp.sort(byName)]

  if (!isCoordinatorModeActive()) {
    return { rawTools, tools: rawTools }
  }

  const coordinatorPlane = createRuntimeCoordinatorToolCapabilityPlane(rawTools)
  return {
    rawTools,
    tools: filterToolsByRuntimeCoordinatorCapabilityPlane(
      rawTools,
      coordinatorPlane,
    ),
    capabilityPlane: stripRuntimeCoordinatorToolCapabilityPlane(
      coordinatorPlane,
    ),
    executionMode: 'coordinator',
  }
}

/**
 * Pure function that merges tool pools and applies coordinator mode filtering.
 *
 * Lives in a React-free file so print.ts can import it without pulling
 * react/ink into the SDK module graph. The useMergedTools hook delegates
 * to this function inside useMemo.
 *
 * @param initialTools - Extra tools to include (built-in + startup MCP from props).
 * @param assembled - Tools from assembleToolPool (built-in + MCP, deduped).
 * @param mode - The permission context mode.
 * @returns Merged, deduplicated, and coordinator-filtered tool array.
 */
export function mergeAndFilterTools(
  initialTools: Tools,
  assembled: Tools,
  mode: ToolPermissionContext['mode'],
): Tools {
  return resolveMergedToolState({ initialTools, assembled, mode }).tools
}

export type ResolvedReplToolState = {
  mergedTools: Tools
  tools: Tools
  capabilityPlane?: KernelCapabilityPlane
  executionMode?: KernelExecutionMode
  allowedAgentTypes?: string[]
}

export function resolveReplToolState({
  initialTools,
  mcpTools,
  toolPermissionContext,
  mainThreadAgentDefinition,
}: {
  initialTools: Tools
  mcpTools: Tools
  toolPermissionContext: ToolPermissionContext
  mainThreadAgentDefinition?: Pick<
    AgentDefinition,
    'tools' | 'disallowedTools' | 'source' | 'permissionMode'
  >
}): ResolvedReplToolState {
  const mergedState = resolveMergedToolState({
    initialTools,
    assembled: assembleToolPool(toolPermissionContext, mcpTools),
    mode: toolPermissionContext.mode,
  })
  const mergedTools = mergedState.tools

  if (!mainThreadAgentDefinition) {
    return {
      mergedTools,
      tools: mergedTools,
      capabilityPlane: mergedState.capabilityPlane,
      executionMode: mergedState.executionMode,
    }
  }

  const resolved = resolveAgentTools(
    mainThreadAgentDefinition,
    mergedTools,
    false,
    true,
  )

  return {
    mergedTools,
    tools: resolved.resolvedTools,
    capabilityPlane: mergedState.capabilityPlane ?? resolved.capabilityPlane,
    executionMode: mergedState.executionMode,
    allowedAgentTypes: resolved.allowedAgentTypes,
  }
}
