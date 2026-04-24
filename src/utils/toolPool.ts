import { feature } from 'bun:bundle'
import partition from 'lodash-es/partition.js'
import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { resolveAgentTools } from '@go-hare/builtin-tools/tools/AgentTool/agentToolUtils.js'
import { COORDINATOR_MODE_ALLOWED_TOOLS } from '../constants/tools.js'
import { assembleToolPool } from '../runtime/capabilities/tools/ToolPolicy.js'
import { isMcpTool } from '../services/mcp/utils.js'
import {
  dedupeToolsByName,
  type Tool,
  type ToolPermissionContext,
  type Tools,
} from '../Tool.js'

// MCP tool name suffixes for PR activity subscription. These are lightweight
// orchestration actions the coordinator calls directly rather than delegating
// to workers. Matched by suffix since the MCP server name prefix may vary.
const PR_ACTIVITY_TOOL_SUFFIXES = [
  'subscribe_pr_activity',
  'unsubscribe_pr_activity',
]

export function isPrActivitySubscriptionTool(name: string): boolean {
  return PR_ACTIVITY_TOOL_SUFFIXES.some(suffix => name.endsWith(suffix))
}

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
  return tools.filter(
    t =>
      COORDINATOR_MODE_ALLOWED_TOOLS.has(t.name) ||
      isPrActivitySubscriptionTool(t.name),
  )
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
  // Merge initialTools on top - they take precedence in deduplication.
  // initialTools may include built-in tools (from getTools() in REPL.tsx) which
  // overlap with assembled tools. We allow those exact duplicates but reject
  // conflicting implementations that share the same primary name.
  // Partition-sort for prompt-cache stability (same as assembleToolPool):
  // built-ins must stay a contiguous prefix for the server's cache policy.
  const [mcp, builtIn] = partition(
    dedupeToolsByName([...initialTools, ...assembled]),
    isMcpTool,
  )
  const byName = (a: Tool, b: Tool) => a.name.localeCompare(b.name)
  const tools = [...builtIn.sort(byName), ...mcp.sort(byName)]

  if (feature('COORDINATOR_MODE') && coordinatorModeModule) {
    if (coordinatorModeModule.isCoordinatorMode()) {
      return applyCoordinatorToolFilter(tools)
    }
  }

  return tools
}

export type ResolvedReplToolState = {
  mergedTools: Tools
  tools: Tools
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
  const mergedTools = mergeAndFilterTools(
    initialTools,
    assembleToolPool(toolPermissionContext, mcpTools),
    toolPermissionContext.mode,
  )

  if (!mainThreadAgentDefinition) {
    return {
      mergedTools,
      tools: mergedTools,
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
    allowedAgentTypes: resolved.allowedAgentTypes,
  }
}
