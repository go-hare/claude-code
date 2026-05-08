import type {
  RuntimeToolCallRequest,
  RuntimeToolCallResult,
  RuntimeToolDescriptor,
} from '../runtime/contracts/tool.js'
import type { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import type { Tool, ToolPermissionContext } from '../Tool.js'
import type { Command } from '../types/command.js'
import type { PermissionMode } from '../types/permissions.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import { runWithCwdOverride } from '../utils/cwd.js'
import {
  createKernelRuntimeNonInteractiveToolUseContext,
} from './nonInteractiveToolUseContext.js'
import { stripUndefined } from './corePayload.js'

type Awaitable<T> = T | Promise<T>

export type ToolCoreCatalog = {
  listTools(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Awaitable<readonly RuntimeToolDescriptor[]>
  callTool?(
    request: RuntimeToolCallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Awaitable<RuntimeToolCallResult>
}

export type ToolCoreServiceOptions = {
  workspacePath?: string
  eventBus?: RuntimeEventBus
  toolCatalog?: ToolCoreCatalog
  listMcpTools?: () => Promise<readonly Tool[]>
  listMcpClients?: () => Promise<readonly MCPServerConnection[]>
}

export class ToolCoreService {
  private readonly toolCatalog: ToolCoreCatalog

  constructor(private readonly options: ToolCoreServiceOptions = {}) {
    this.toolCatalog =
      options.toolCatalog ??
      createDefaultToolCoreCatalog(options.workspacePath, {
        listMcpTools: options.listMcpTools,
        listMcpClients: options.listMcpClients,
      })
  }

  listTools(): Promise<{ tools: readonly RuntimeToolDescriptor[] }> {
    return Promise.resolve(
      this.toolCatalog.listTools({
        cwd: this.options.workspacePath ?? process.cwd(),
        metadata: { protocol: 'json-rpc-lite' },
      }),
    ).then(tools => ({ tools }))
  }

  async callTool(
    request: RuntimeToolCallRequest,
  ): Promise<RuntimeToolCallResult> {
    const callTool = this.toolCatalog.callTool
    if (!callTool) {
      throw new ToolCoreError('unavailable', 'Tool execution is not available')
    }
    const result = await callTool(request, {
      cwd: this.options.workspacePath ?? process.cwd(),
      metadata: request.metadata,
    })
    this.options.eventBus?.emit({
      type: 'tools.called',
      replayable: true,
      payload: stripUndefined(result),
      metadata: request.metadata,
    })
    return result
  }
}

export class ToolCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ToolCoreError'
  }
}

function createDefaultToolCoreCatalog(
  workspacePath: string | undefined,
  options: {
    listMcpTools?: () => Promise<readonly Tool[]>
    listMcpClients?: () => Promise<readonly MCPServerConnection[]>
  } = {},
): ToolCoreCatalog {
  const commandCache = new Map<string, readonly Command[]>()

  async function loadCommands(cwd: string): Promise<readonly Command[]> {
    const cached = commandCache.get(cwd)
    if (cached) {
      return cached
    }
    await prepareDefaultToolCatalogs()
    const { getCommands } = await import('../commands.js')
    const commands = await getCommands(cwd)
    commandCache.set(cwd, commands)
    return commands
  }

  async function loadMcpTools(): Promise<readonly Tool[]> {
    if (!options.listMcpTools) {
      return []
    }
    try {
      return await options.listMcpTools()
    } catch {
      return []
    }
  }

  async function loadMcpClients(): Promise<readonly MCPServerConnection[]> {
    if (!options.listMcpClients) {
      return []
    }
    try {
      return await options.listMcpClients()
    } catch {
      return []
    }
  }

  return {
    async listTools() {
      const [{ getEmptyToolPermissionContext }, toolPolicy, descriptors] =
        await Promise.all([
          import('../Tool.js'),
          import('../runtime/capabilities/tools/ToolPolicy.js'),
          import('../runtime/capabilities/tools/runtimeToolDescriptors.js'),
        ])
      const mcpTools = await loadMcpTools()
      return descriptors.toRuntimeToolDescriptors(
        toolPolicy.assembleToolPool(getEmptyToolPermissionContext(), [
          ...mcpTools,
        ]),
      )
    },
    async callTool(request, context) {
      const cwd = context?.cwd ?? workspacePath ?? process.cwd()
      return runWithCwdOverride(cwd, async () => {
        await prepareDefaultToolCatalogs()
        const [
          { findToolByName, getEmptyToolPermissionContext },
          toolPolicy,
          { createAssistantMessage },
          { hasPermissionsToUseTool },
        ] = await Promise.all([
          import('../Tool.js'),
          import('../runtime/capabilities/tools/ToolPolicy.js'),
          import('../utils/messages.js'),
          import('../utils/permissions/permissions.js'),
        ])
        const permissionMode = toPermissionMode(
          request.permissionMode,
          'default',
        )
        const toolPermissionContext = {
          ...getEmptyToolPermissionContext(),
          mode: permissionMode,
          shouldAvoidPermissionPrompts: true,
        } satisfies ToolPermissionContext
        const tools = toolPolicy.assembleToolPool(toolPermissionContext, [
          ...(await loadMcpTools()),
        ])
        const tool = findToolByName(tools, request.toolName)
        if (!tool) {
          return createRuntimeToolErrorResult({
            toolName: request.toolName,
            message: `Tool not found: ${request.toolName}`,
            metadata: {
              ...request.metadata,
              error: 'not_found',
            },
          })
        }

        const parsedInput = tool.inputSchema.safeParse(request.input ?? {})
        if (!parsedInput.success) {
          return createRuntimeToolErrorResult({
            toolName: tool.name,
            message: `InputValidationError: ${parsedInput.error.message}`,
            metadata: {
              ...request.metadata,
              error: 'invalid_input',
            },
          })
        }

        const toolUseContext =
          await createKernelRuntimeNonInteractiveToolUseContext(
            await loadCommands(cwd),
            cwd,
            {
              permissionMode,
              tools,
              mcpClients: await loadMcpClients(),
            },
          )
        const toolUseID = `kernel_tool_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2)}`
        const parentMessage = createAssistantMessage({ content: '' })
        const isValidCall = await tool.validateInput?.(
          parsedInput.data,
          toolUseContext,
        )
        if (isValidCall?.result === false) {
          return createRuntimeToolErrorResult({
            toolName: tool.name,
            message: isValidCall.message,
            metadata: {
              ...request.metadata,
              error: 'validation_failed',
              errorCode: isValidCall.errorCode,
            },
          })
        }

        let permissionInput = parsedInput.data
        let callInput = parsedInput.data
        if (
          tool.backfillObservableInput &&
          permissionInput &&
          typeof permissionInput === 'object'
        ) {
          permissionInput = { ...permissionInput }
          tool.backfillObservableInput(permissionInput)
        }

        if (permissionMode !== 'bypassPermissions') {
          const permissionDecision = await hasPermissionsToUseTool(
            tool,
            permissionInput,
            toolUseContext,
            parentMessage,
            toolUseID,
          )
          if (permissionDecision.behavior !== 'allow') {
            return createRuntimeToolErrorResult({
              toolName: tool.name,
              message:
                permissionDecision.message ??
                `Tool ${tool.name} requires permission before execution.`,
              metadata: {
                ...request.metadata,
                error: 'permission_required',
                permissionBehavior: permissionDecision.behavior,
              },
            })
          }
          if (
            'updatedInput' in permissionDecision &&
            permissionDecision.updatedInput
          ) {
            callInput = permissionDecision.updatedInput
          }
        }

        const progressEvents: unknown[] = []
        const result = await tool.call(
          callInput,
          {
            ...toolUseContext,
            toolUseId: toolUseID,
          },
          async (_tool, input) => ({
            behavior: 'allow',
            updatedInput: input,
          }),
          parentMessage,
          progress => {
            progressEvents.push(progress)
          },
        )
        return {
          toolName: tool.name,
          output: result.data,
          metadata: stripUndefined({
            ...request.metadata,
            toolUseID,
            newMessages: result.newMessages?.length,
            mcpMeta: result.mcpMeta,
            progress:
              progressEvents.length > 0 ? progressEvents : undefined,
          }),
        }
      })
    },
  }
}

async function prepareDefaultToolCatalogs(): Promise<void> {
  ensureDefaultKernelMacroFallback()
  if (process.env.NODE_ENV === 'test') {
    return
  }
  const { enableConfigs } = await import('../utils/config.js')
  enableConfigs()
}

type DefaultKernelRuntimeMacro = {
  VERSION: string
  BUILD_TIME: string
  FEEDBACK_CHANNEL: string
  ISSUES_EXPLAINER: string
  NATIVE_PACKAGE_URL: string
  PACKAGE_URL: string
  VERSION_CHANGELOG: string
}

function ensureDefaultKernelMacroFallback(): void {
  const globalWithMacro = globalThis as typeof globalThis & {
    MACRO?: Partial<DefaultKernelRuntimeMacro>
  }
  globalWithMacro.MACRO = {
    VERSION: process.env.CLAUDE_CODE_VERSION ?? '0.0.0-kernel',
    BUILD_TIME: '',
    FEEDBACK_CHANNEL: '',
    ISSUES_EXPLAINER: '',
    NATIVE_PACKAGE_URL: '',
    PACKAGE_URL: '',
    VERSION_CHANGELOG: '',
    ...globalWithMacro.MACRO,
  }
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

function createRuntimeToolErrorResult(input: {
  toolName: string
  message: string
  metadata?: Record<string, unknown>
}): RuntimeToolCallResult {
  return {
    toolName: input.toolName,
    output: {
      error: input.message,
    },
    isError: true,
    metadata: stripUndefined(input.metadata),
  }
}
