import {
  dedupeToolsByName,
  type Tool,
  toolMatchesName,
  type ToolPermissionContext,
  type Tools,
} from '../../../Tool.js'
import { ListMcpResourcesTool } from '@go-hare/builtin-tools/tools/ListMcpResourcesTool/ListMcpResourcesTool.js'
import { ReadMcpResourceTool } from '@go-hare/builtin-tools/tools/ReadMcpResourceTool/ReadMcpResourceTool.js'
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '@go-hare/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js'
import {
  REPL_TOOL_NAME,
  REPL_ONLY_TOOLS,
  isReplModeEnabled,
} from '@go-hare/builtin-tools/tools/REPLTool/constants.js'
import { getDenyRuleForTool } from '../../../utils/permissions/permissions.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { getAllBaseTools, getSimpleModeTools } from './ToolCatalog.js'

export { getAllBaseTools } from './ToolCatalog.js'

/**
 * Predefined tool presets that can be used with --tools flag
 */
export const TOOL_PRESETS = ['default'] as const

export type ToolPreset = (typeof TOOL_PRESETS)[number]

export function parseToolPreset(preset: string): ToolPreset | null {
  const presetString = preset.toLowerCase()
  if (!TOOL_PRESETS.includes(presetString as ToolPreset)) {
    return null
  }
  return presetString as ToolPreset
}

/**
 * Get the list of tool names for a given preset
 * Filters out tools that are disabled via isEnabled() check
 */
export function getToolsForDefaultPreset(): string[] {
  const tools = getAllBaseTools()
  const isEnabled = tools.map(tool => tool.isEnabled())
  return tools.filter((_, i) => isEnabled[i]).map(tool => tool.name)
}

/**
 * Filters out tools that are blanket-denied by the permission context.
 * A tool is filtered out if there's a deny rule matching its name with no
 * ruleContent (i.e., a blanket deny for that tool).
 *
 * Uses the same matcher as the runtime permission check (step 1a), so MCP
 * server-prefix rules like `mcp__server` strip all tools from that server
 * before the model sees them — not just at call time.
 */
export function filterToolsByDenyRules<
  T extends {
    name: string
    mcpInfo?: { serverName: string; toolName: string }
  },
>(tools: readonly T[], permissionContext: ToolPermissionContext): T[] {
  return tools.filter(tool => !getDenyRuleForTool(permissionContext, tool))
}

export function getTools(permissionContext: ToolPermissionContext): Tools {
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    return filterToolsByDenyRules(getSimpleModeTools(), permissionContext)
  }

  const specialTools = new Set([
    ListMcpResourcesTool.name,
    ReadMcpResourceTool.name,
    SYNTHETIC_OUTPUT_TOOL_NAME,
  ])
  const tools = getAllBaseTools().filter(tool => !specialTools.has(tool.name))

  let allowedTools = filterToolsByDenyRules(tools, permissionContext)

  if (isReplModeEnabled()) {
    const replEnabled = allowedTools.some(tool =>
      toolMatchesName(tool, REPL_TOOL_NAME),
    )
    if (replEnabled) {
      allowedTools = allowedTools.filter(
        tool => !REPL_ONLY_TOOLS.has(tool.name),
      )
    }
  }

  const isEnabled = allowedTools.map(tool => tool.isEnabled())
  return allowedTools.filter((_, i) => isEnabled[i])
}

/**
 * Assemble the full tool pool for a given permission context and MCP tools.
 *
 * This is the single source of truth for combining built-in tools with MCP tools.
 * Both REPL.tsx (via useMergedTools hook) and runAgent.ts (for coordinator workers)
 * use this function to ensure consistent tool pool assembly.
 */
export function assembleToolPool(
  permissionContext: ToolPermissionContext,
  mcpTools: Tools,
): Tools {
  const builtInTools = getTools(permissionContext)
  const allowedMcpTools = filterToolsByDenyRules(mcpTools, permissionContext)

  const byName = (a: Tool, b: Tool) => a.name.localeCompare(b.name)
  return dedupeToolsByName(
    [...builtInTools].sort(byName).concat(allowedMcpTools.sort(byName)),
  )
}

/**
 * Get all tools including both built-in tools and MCP tools.
 *
 * This is the preferred function when you need the complete tools list for:
 * - Tool search threshold calculations (isToolSearchEnabled)
 * - Token counting that includes MCP tools
 * - Any context where MCP tools should be considered
 */
export function getMergedTools(
  permissionContext: ToolPermissionContext,
  mcpTools: Tools,
): Tools {
  const builtInTools = getTools(permissionContext)
  return [...builtInTools, ...mcpTools]
}
