// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { useMemo } from 'react'
import type { Tools, ToolPermissionContext } from '../Tool.js'
import { resolveReplToolState } from '../utils/toolPool.js'

/**
 * React hook that assembles the full tool pool for the REPL.
 *
 * Uses the shared REPL tool assembly path so render-time and execution-time
 * tool resolution stay aligned.
 *
 * @param initialTools - Extra tools to include (built-in + startup MCP from props).
 *   These are merged with the assembled pool and take precedence in deduplication.
 * @param mcpTools - MCP tools discovered dynamically (from mcp state)
 * @param toolPermissionContext - Permission context for filtering
 */
export function useMergedTools(
  initialTools: Tools,
  mcpTools: Tools,
  toolPermissionContext: ToolPermissionContext,
): Tools {
  let replBridgeEnabled = false
  let replBridgeOutboundOnly = false
  return useMemo(() => {
    return resolveReplToolState({
      initialTools,
      mcpTools,
      toolPermissionContext,
    }).mergedTools
  }, [
    initialTools,
    mcpTools,
    toolPermissionContext,
    replBridgeEnabled,
    replBridgeOutboundOnly,
  ])
}
