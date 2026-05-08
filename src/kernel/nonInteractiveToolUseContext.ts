import type {
  Command,
  LocalJSXCommandContext,
} from '../types/command.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import type {
  ToolPermissionContext,
  ToolUseContext,
  Tools,
} from '../Tool.js'
import type { Message } from '../types/message.js'
import type { PermissionMode } from '../types/permissions.js'

export type KernelRuntimeNonInteractiveToolUseContextOptions = {
  permissionMode?: string
  tools?: Tools
  messages?: readonly Message[]
  mcpClients?: readonly MCPServerConnection[]
}

export async function createKernelRuntimeNonInteractiveToolUseContext(
  commands: readonly Command[],
  _cwd: string,
  options: KernelRuntimeNonInteractiveToolUseContextOptions = {},
): Promise<ToolUseContext & LocalJSXCommandContext> {
  const [
    { getEmptyToolPermissionContext },
    { getDefaultAppState },
    { createFileStateCacheWithSizeLimit },
    { getTools },
  ] = await Promise.all([
    import('../Tool.js'),
    import('../state/AppStateStore.js'),
    import('../utils/fileStateCache.js'),
    import('../runtime/capabilities/tools/ToolPolicy.js'),
  ])
  const toolPermissionContext = {
    ...getEmptyToolPermissionContext(),
    mode: toPermissionMode(options.permissionMode, 'default'),
    shouldAvoidPermissionPrompts: true,
  } satisfies ToolPermissionContext
  let appState = getDefaultAppState()
  appState.toolPermissionContext = toolPermissionContext
  let messages = [...(options.messages ?? [])]
  const tools = options.tools ?? getTools(toolPermissionContext)
  return {
    abortController: new AbortController(),
    options: {
      commands: [...commands],
      debug: false,
      mainLoopModel: process.env.OPENAI_MODEL ?? 'kernel-runtime',
      tools,
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [...(options.mcpClients ?? [])],
      mcpResources: {},
      isNonInteractiveSession: true,
      ideInstallationStatus: null,
      theme: 'dark',
      agentDefinitions: {
        activeAgents: [],
        allAgents: [],
        allowedAgentTypes: undefined,
      },
    },
    readFileState: createFileStateCacheWithSizeLimit(100),
    getAppState: () => appState,
    setAppState: updater => {
      appState = updater(appState)
    },
    messages,
    setMessages: updater => {
      messages = updater(messages)
    },
    onChangeAPIKey: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
  }
}

export function contentBlocksToText(
  blocks: readonly unknown[],
): string | undefined {
  const text = blocks
    .map(block => {
      if (typeof block === 'string') {
        return block
      }
      if (
        block &&
        typeof block === 'object' &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string'
      ) {
        return (block as { text: string }).text
      }
      return undefined
    })
    .filter((item): item is string => !!item)
    .join('\n')
  return text.length > 0 ? text : undefined
}

function toPermissionMode(
  value: string | undefined,
  fallback: PermissionMode,
): PermissionMode {
  switch (value) {
    case 'acceptEdits':
    case 'auto':
    case 'bubble':
    case 'bypassPermissions':
    case 'default':
    case 'dontAsk':
    case 'plan':
      return value
    default:
      return fallback
  }
}
