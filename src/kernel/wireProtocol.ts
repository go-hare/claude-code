import { createInterface } from 'readline'
import type { Readable, Writable } from 'stream'

import { createHeadlessConversation } from '../runtime/capabilities/execution/internal/headlessConversationAdapter.js'
import { createDefaultRuntimeCapabilityResolver } from '../runtime/capabilities/defaultRuntimeCapabilities.js'
import { RuntimePermissionBroker } from '../runtime/capabilities/permissions/RuntimePermissionBroker.js'
import { RuntimeConversationSnapshotJournal } from '../runtime/core/conversation/RuntimeConversationSnapshotJournal.js'
import { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import { RuntimeEventFileJournal } from '../runtime/core/events/RuntimeEventJournal.js'
import {
  createKernelRuntimeWireRouter,
  type KernelRuntimeWireAgentRegistry,
  type KernelRuntimeWireCapabilityResolver,
  type KernelRuntimeWireCommandCatalog,
  type KernelRuntimeWireCompanionRuntime,
  type KernelRuntimeWireContextManager,
  type KernelRuntimeWireHookCatalog,
  type KernelRuntimeWireKairosRuntime,
  type KernelRuntimeWireMemoryManager,
  type KernelRuntimeWireMcpRegistry,
  type KernelRuntimeWirePermissionBroker,
  type KernelRuntimeWirePluginCatalog,
  type KernelRuntimeWireRouter,
  type KernelRuntimeWireSessionManager,
  type KernelRuntimeWireSkillCatalog,
  type KernelRuntimeWireTaskRegistry,
  type KernelRuntimeWireTeamRegistry,
  type KernelRuntimeWireToolCatalog,
  type KernelRuntimeWireTurnExecutor,
} from '../runtime/core/wire/KernelRuntimeWireRouter.js'
import {
  createKernelRuntimeHeadlessProcessExecutor,
  readHeadlessProcessExecutorOptionsFromEnv,
  type KernelRuntimeHeadlessProcessExecutorOptions,
} from '../runtime/core/wire/KernelRuntimeHeadlessProcessExecutor.js'
import {
  createKernelRuntimeAgentProcessExecutor,
  readAgentProcessExecutorOptionsFromEnv,
  type KernelRuntimeAgentProcessExecutorOptions,
} from './runtimeAgentProcessExecutor.js'
import {
  createKernelRuntimeInProcessWireTransport,
  createKernelRuntimeStdioWireTransport,
  createKernelRuntimeWireClient,
} from '../runtime/core/wire/KernelRuntimeWireTransport.js'
import { serializeKernelRuntimeEnvelope } from '../runtime/core/wire/KernelRuntimeWireCodec.js'
import type {
  RuntimeCommandExecutionResult,
  RuntimeCommandGraphEntry,
  RuntimeCommandKind,
  RuntimeCommandResult,
} from '../runtime/contracts/command.js'
import type { KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'
import type { KernelRuntimeId } from '../runtime/contracts/runtime.js'
import type { RuntimeToolCallResult } from '../runtime/contracts/tool.js'
import { runWithCwdOverride } from '../utils/cwd.js'
import type { ToolPermissionContext } from '../Tool.js'
import type { Command, LocalCommandResult } from '../types/command.js'
import type { PermissionMode } from '../types/permissions.js'
import { createDefaultKernelRuntimeMcpRegistry } from './runtimeMcpRegistry.js'
import {
  contentBlocksToText,
  createDefaultKernelRuntimeHookCatalog,
  createDefaultKernelRuntimePluginCatalog,
  createDefaultKernelRuntimeSkillCatalog,
  createKernelRuntimeNonInteractiveToolUseContext,
} from './runtimeExtensionCatalogs.js'
import {
  createDefaultKernelRuntimeAgentRegistry,
  createDefaultKernelRuntimeTaskRegistry,
} from './runtimeAgentTaskRegistries.js'
import { createDefaultKernelRuntimeTeamRegistry } from './runtimeTeamsRegistry.js'
import {
  createDefaultKernelRuntimeCompanionRuntime,
  createDefaultKernelRuntimeContextManager,
  createDefaultKernelRuntimeKairosRuntime,
  createDefaultKernelRuntimeMemoryManager,
  createDefaultKernelRuntimeSessionManager,
} from './runtimeDeveloperInterfaces.js'

export type KernelRuntimeWireProtocolOptions = {
  runtimeId?: KernelRuntimeId
  workspacePath?: string
  eventBus?: RuntimeEventBus
  eventJournalPath?: string | false
  conversationJournalPath?: string | false
  maxReplayEvents?: number
  capabilityResolver?: KernelRuntimeWireCapabilityResolver
  commandCatalog?: KernelRuntimeWireCommandCatalog
  toolCatalog?: KernelRuntimeWireToolCatalog
  mcpRegistry?: KernelRuntimeWireMcpRegistry
  hookCatalog?: KernelRuntimeWireHookCatalog
  skillCatalog?: KernelRuntimeWireSkillCatalog
  pluginCatalog?: KernelRuntimeWirePluginCatalog
  agentRegistry?: KernelRuntimeWireAgentRegistry
  taskRegistry?: KernelRuntimeWireTaskRegistry
  teamRegistry?: KernelRuntimeWireTeamRegistry
  companionRuntime?: KernelRuntimeWireCompanionRuntime
  kairosRuntime?: KernelRuntimeWireKairosRuntime
  memoryManager?: KernelRuntimeWireMemoryManager
  contextManager?: KernelRuntimeWireContextManager
  sessionManager?: KernelRuntimeWireSessionManager
  permissionBroker?: KernelRuntimeWirePermissionBroker
  runTurnExecutor?: KernelRuntimeWireTurnExecutor
  headlessExecutor?: false | KernelRuntimeHeadlessProcessExecutorOptions
  agentExecutor?: false | KernelRuntimeAgentProcessExecutorOptions
}

export type KernelRuntimeWireRunnerOptions =
  KernelRuntimeWireProtocolOptions & {
    input?: Readable
    output?: Pick<Writable, 'write'>
  }

export function createDefaultKernelRuntimeWireRouter(
  options: KernelRuntimeWireProtocolOptions = {},
): KernelRuntimeWireRouter {
  const runtimeId = options.runtimeId ?? 'kernel-runtime'
  const eventJournalPath =
    options.eventJournalPath === false
      ? undefined
      : (options.eventJournalPath ??
        process.env.HARE_KERNEL_RUNTIME_EVENT_JOURNAL)
  const eventJournal = eventJournalPath
    ? new RuntimeEventFileJournal(eventJournalPath, options.maxReplayEvents)
    : undefined
  const conversationJournalPath =
    options.conversationJournalPath === false
      ? undefined
      : (options.conversationJournalPath ??
        process.env.HARE_KERNEL_RUNTIME_CONVERSATION_JOURNAL)
  const conversationJournal = conversationJournalPath
    ? new RuntimeConversationSnapshotJournal(conversationJournalPath)
    : undefined
  const eventBus =
    options.eventBus ??
    new RuntimeEventBus({
      runtimeId,
      maxReplayEvents: options.maxReplayEvents,
      initialReplayEnvelopes: eventJournal?.readReplayableEnvelopes(),
    })
  if (eventJournal) {
    eventBus.subscribe(envelope => {
      eventJournal.append(envelope)
    })
  }
  const permissionBroker =
    options.permissionBroker ??
    new RuntimePermissionBroker({
      eventBus,
    })

  const headlessExecutorOptions =
    options.headlessExecutor === false
      ? undefined
      : (options.headlessExecutor ??
        readHeadlessProcessExecutorOptionsFromEnv())
  const runTurnExecutor =
    options.runTurnExecutor ??
    (headlessExecutorOptions
      ? createKernelRuntimeHeadlessProcessExecutor(headlessExecutorOptions)
      : undefined)
  const agentExecutorOptions =
    options.agentExecutor === false
      ? false
      : (options.agentExecutor ??
        readAgentProcessExecutorOptionsFromEnv() ??
        {})

  return createKernelRuntimeWireRouter({
    runtimeId,
    workspacePath: options.workspacePath ?? process.cwd(),
    eventBus,
    conversationSnapshotStore: conversationJournal,
    capabilityResolver:
      options.capabilityResolver ??
      createDefaultRuntimeCapabilityResolver({
        cwd: options.workspacePath ?? process.cwd(),
      }),
    commandCatalog:
      options.commandCatalog ??
      createDefaultKernelRuntimeCommandCatalog(options.workspacePath),
    toolCatalog:
      options.toolCatalog ??
      createDefaultKernelRuntimeToolCatalog(options.workspacePath),
    mcpRegistry:
      options.mcpRegistry ??
      createDefaultKernelRuntimeMcpRegistry(options.workspacePath),
    hookCatalog:
      options.hookCatalog ??
      createDefaultKernelRuntimeHookCatalog(options.workspacePath),
    skillCatalog:
      options.skillCatalog ??
      createDefaultKernelRuntimeSkillCatalog(options.workspacePath),
    pluginCatalog:
      options.pluginCatalog ??
      createDefaultKernelRuntimePluginCatalog(options.workspacePath),
    agentRegistry:
      options.agentRegistry ??
      createDefaultKernelRuntimeAgentRegistry(options.workspacePath, {
        executor:
          agentExecutorOptions === false
            ? false
            : createKernelRuntimeAgentProcessExecutor(agentExecutorOptions),
      }),
    taskRegistry:
      options.taskRegistry ??
      createDefaultKernelRuntimeTaskRegistry(options.workspacePath),
    teamRegistry:
      options.teamRegistry ?? createDefaultKernelRuntimeTeamRegistry(),
    companionRuntime:
      options.companionRuntime ??
      createDefaultKernelRuntimeCompanionRuntime(),
    kairosRuntime:
      options.kairosRuntime ?? createDefaultKernelRuntimeKairosRuntime(),
    memoryManager:
      options.memoryManager ?? createDefaultKernelRuntimeMemoryManager(),
    contextManager:
      options.contextManager ?? createDefaultKernelRuntimeContextManager(),
    sessionManager:
      options.sessionManager ?? createDefaultKernelRuntimeSessionManager(),
    runTurnExecutor,
    permissionBroker,
    createConversation: conversationOptions =>
      createHeadlessConversation(conversationOptions),
  })
}

export async function runKernelRuntimeWireProtocol(
  options: KernelRuntimeWireRunnerOptions = {},
): Promise<void> {
  const router = createDefaultKernelRuntimeWireRouter(options)
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  const bufferedEvents: KernelRuntimeEnvelopeBase[] = []
  let deliveryBarrierCount = 0

  const writeEnvelope = (envelope: KernelRuntimeEnvelopeBase): void => {
    output.write(`${serializeKernelRuntimeEnvelope(envelope)}\n`)
  }

  const flushBufferedEvents = (): void => {
    if (deliveryBarrierCount > 0 || bufferedEvents.length === 0) {
      return
    }
    for (const envelope of bufferedEvents.splice(0)) {
      writeEnvelope(envelope)
    }
  }

  const unsubscribe = router.eventBus.subscribe(envelope => {
    if (envelope.kind === 'event') {
      if (deliveryBarrierCount > 0) {
        bufferedEvents.push(envelope)
        return
      }
      writeEnvelope(envelope)
    }
  })

  try {
    const lines = createInterface({
      input,
      crlfDelay: Number.POSITIVE_INFINITY,
    })
    for await (const line of lines) {
      if (line.trim().length === 0) {
        continue
      }
      deliveryBarrierCount += 1
      try {
        const responses = await router.handleCommandLine(line)
        for (const envelope of responses) {
          writeEnvelope(envelope)
        }
      } finally {
        deliveryBarrierCount -= 1
        if (deliveryBarrierCount === 0) {
          queueMicrotask(() => {
            flushBufferedEvents()
          })
        }
      }
    }
  } finally {
    unsubscribe()
  }
}

export {
  createKernelRuntimeInProcessWireTransport,
  createKernelRuntimeStdioWireTransport,
  createKernelRuntimeWireClient,
}
export { KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION } from '../runtime/contracts/wire.js'
export type {
  KernelRuntimeAssignTaskCommand,
  KernelRuntimeAuthenticateMcpCommand,
  KernelRuntimeAuthenticateMcpResult,
  KernelRuntimeCancelAgentRunCommand,
  KernelRuntimeCancelAgentRunResult,
  KernelRuntimeCallToolCommand,
  KernelRuntimeCallToolResult,
  KernelRuntimeCommand,
  KernelRuntimeCommandType,
  KernelRuntimeConnectHostCommand,
  KernelRuntimeConnectMcpCommand,
  KernelRuntimeConnectMcpResult,
  KernelRuntimeCreateTaskCommand,
  KernelRuntimeCreateTeamCommand,
  KernelRuntimeCreateTeamResult,
  KernelRuntimeDecidePermissionCommand,
  KernelRuntimeDestroyTeamCommand,
  KernelRuntimeDestroyTeamResult,
  KernelRuntimeDisconnectHostCommand,
  KernelRuntimeExecuteCommandCommand,
  KernelRuntimeExecuteCommandResult,
  KernelRuntimeGetAgentOutputCommand,
  KernelRuntimeGetAgentOutputResult,
  KernelRuntimeGetAgentRunCommand,
  KernelRuntimeGetAgentRunResult,
  KernelRuntimeGetTaskCommand,
  KernelRuntimeGetTeamCommand,
  KernelRuntimeGetTeamResult,
  KernelRuntimeHostDisconnectPolicy,
  KernelRuntimeInstallPluginCommand,
  KernelRuntimeInstallPluginResult,
  KernelRuntimeListAgentRunsCommand,
  KernelRuntimeListAgentRunsResult,
  KernelRuntimeListAgentsCommand,
  KernelRuntimeListAgentsResult,
  KernelRuntimeListHooksCommand,
  KernelRuntimeListHooksResult,
  KernelRuntimeListMcpResourcesCommand,
  KernelRuntimeListMcpResourcesResult,
  KernelRuntimeListMcpServersCommand,
  KernelRuntimeListMcpServersResult,
  KernelRuntimeListMcpToolsCommand,
  KernelRuntimeListMcpToolsResult,
  KernelRuntimeListPluginsCommand,
  KernelRuntimeListPluginsResult,
  KernelRuntimeListSkillsCommand,
  KernelRuntimeListSkillsResult,
  KernelRuntimeListTasksCommand,
  KernelRuntimeListTasksResult,
  KernelRuntimeListTeamsCommand,
  KernelRuntimeListTeamsResult,
  KernelRuntimeListToolsCommand,
  KernelRuntimeListToolsResult,
  KernelRuntimeReloadAgentsCommand,
  KernelRuntimeReloadAgentsResult,
  KernelRuntimeReloadHooksCommand,
  KernelRuntimeReloadHooksResult,
  KernelRuntimeReloadMcpCommand,
  KernelRuntimeReloadMcpResult,
  KernelRuntimeReloadPluginsCommand,
  KernelRuntimeReloadPluginsResult,
  KernelRuntimeReloadSkillsCommand,
  KernelRuntimeReloadSkillsResult,
  KernelRuntimeRegisterHookCommand,
  KernelRuntimeRegisterHookResult,
  KernelRuntimeResolveSkillContextCommand,
  KernelRuntimeResolveSkillContextResult,
  KernelRuntimeRunHookCommand,
  KernelRuntimeRunHookResult,
  KernelRuntimeSendTeamMessageCommand,
  KernelRuntimeSendTeamMessageResult,
  KernelRuntimeSetMcpEnabledCommand,
  KernelRuntimeSetMcpEnabledResult,
  KernelRuntimeSetPluginEnabledCommand,
  KernelRuntimeSetPluginEnabledResult,
  KernelRuntimeSpawnAgentCommand,
  KernelRuntimeSpawnAgentResult,
  KernelRuntimeTaskMutationResult,
  KernelRuntimeUninstallPluginCommand,
  KernelRuntimeUninstallPluginResult,
  KernelRuntimeUpdatePluginCommand,
  KernelRuntimeUpdatePluginResult,
  KernelRuntimeUpdateTaskCommand,
} from '../runtime/contracts/wire.js'
export type {
  KernelPermissionDecision,
  KernelPermissionDecisionSource,
  KernelPermissionDecisionValue,
  KernelPermissionRequest,
  KernelPermissionRequestId,
  KernelPermissionRisk,
} from '../runtime/contracts/permissions.js'
export type {
  KernelRuntimeWireAgentRegistry,
  KernelRuntimeWireCapabilityResolver,
  KernelRuntimeWireCommandCatalog,
  KernelRuntimeWireHookCatalog,
  KernelRuntimeWireMcpRegistry,
  KernelRuntimeWirePluginCatalog,
  KernelRuntimeWireRouter,
  KernelRuntimeWireSkillCatalog,
  KernelRuntimeWireTaskRegistry,
  KernelRuntimeWireTeamRegistry,
  KernelRuntimeWireToolCatalog,
} from '../runtime/core/wire/KernelRuntimeWireRouter.js'
export type {
  KernelRuntimeInProcessWireTransportOptions,
  KernelRuntimeStdioWireTransportOptions,
  KernelRuntimeWireClient,
  KernelRuntimeWireClientCommand,
  KernelRuntimeWireClientOptions,
  KernelRuntimeWireTransport,
} from '../runtime/core/wire/KernelRuntimeWireTransport.js'
export type { KernelRuntimeHeadlessProcessExecutorOptions } from '../runtime/core/wire/KernelRuntimeHeadlessProcessExecutor.js'
export type { KernelRuntimeAgentProcessExecutorOptions } from './runtimeAgentProcessExecutor.js'
export type {
  KernelRuntimeWireConversationRecoverySnapshot,
  KernelRuntimeWireConversationSnapshotStore,
  KernelRuntimeWirePermissionBroker,
  KernelRuntimeWireTurnExecutionContext,
  KernelRuntimeWireTurnExecutionEvent,
  KernelRuntimeWireTurnExecutionResult,
  KernelRuntimeWireTurnExecutor,
} from '../runtime/core/wire/KernelRuntimeWireRouter.js'
export type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
  KernelRuntimeErrorCode,
  KernelRuntimeErrorPayload,
} from '../runtime/contracts/events.js'
export type {
  KernelCapabilityDescriptor,
  KernelCapabilityReloadScope,
} from '../runtime/contracts/capability.js'
export type {
  KernelRuntimeHostIdentity,
  KernelRuntimeHostKind,
  KernelRuntimeTransportKind,
  KernelRuntimeTrustLevel,
} from '../runtime/contracts/runtime.js'
export type {
  RuntimeAgentDefinitionError,
  RuntimeAgentDescriptor,
  RuntimeAgentMcpServerRef,
  RuntimeAgentRegistrySnapshot,
  RuntimeAgentRunCancelRequest,
  RuntimeAgentRunCancelResult,
  RuntimeAgentRunDescriptor,
  RuntimeAgentRunListSnapshot,
  RuntimeAgentRunOutput,
  RuntimeAgentRunOutputRequest,
  RuntimeAgentRunQuery,
  RuntimeAgentRunStatus,
  RuntimeAgentSource,
} from '../runtime/contracts/agent.js'
export type {
  RuntimeCommandDescriptor,
  RuntimeCommandGraphEntry,
  RuntimeCommandKind,
} from '../runtime/contracts/command.js'
export type {
  RuntimeHookDescriptor,
  RuntimeHookMutationResult,
  RuntimeHookRegistrySnapshot,
  RuntimeHookRegisterRequest,
  RuntimeHookRunRequest,
  RuntimeHookRunResult,
  RuntimeHookSource,
  RuntimeHookType,
} from '../runtime/contracts/hook.js'
export type {
  RuntimeToolDescriptor,
  RuntimeToolSafety,
  RuntimeToolSource,
} from '../runtime/contracts/tool.js'
export type {
  RuntimeSkillCatalogSnapshot,
  RuntimeSkillContext,
  RuntimeSkillDescriptor,
  RuntimeSkillPromptContextRequest,
  RuntimeSkillPromptContextResult,
  RuntimeSkillSource,
} from '../runtime/contracts/skill.js'
export type {
  RuntimePluginCatalogSnapshot,
  RuntimePluginComponents,
  RuntimePluginDescriptor,
  RuntimePluginErrorDescriptor,
  RuntimePluginInstallRequest,
  RuntimePluginMutationResult,
  RuntimePluginScope,
  RuntimePluginSetEnabledRequest,
  RuntimePluginStatus,
  RuntimePluginUninstallRequest,
  RuntimePluginUpdateRequest,
} from '../runtime/contracts/plugin.js'
export type {
  RuntimeCoordinatorTaskStatus,
  RuntimeTaskDescriptor,
  RuntimeTaskExecutionMetadata,
  RuntimeTaskListSnapshot,
} from '../runtime/contracts/task.js'
export type {
  RuntimeMcpAuthAction,
  RuntimeMcpAuthRequest,
  RuntimeMcpConnectRequest,
  RuntimeMcpConnectionState,
  RuntimeMcpLifecycleResult,
  RuntimeMcpRegistrySnapshot,
  RuntimeMcpResourceRef,
  RuntimeMcpServerRef,
  RuntimeMcpSetEnabledRequest,
  RuntimeMcpToolBinding,
  RuntimeMcpTransport,
} from '../runtime/contracts/mcp.js'

function createDefaultKernelRuntimeCommandCatalog(
  workspacePath: string | undefined,
): KernelRuntimeWireCommandCatalog {
  const commandCache = new Map<string, readonly Command[]>()

  async function loadCommands(cwd: string): Promise<readonly Command[]> {
    const cached = commandCache.get(cwd)
    if (cached) {
      return cached
    }
    await prepareDefaultKernelRuntimeCatalogs()
    const { getCommands } = await import('../commands.js')
    const commands = await getCommands(cwd)
    commandCache.set(cwd, commands)
    return commands
  }

  return {
    async listCommands(context) {
      const { createRuntimeCommandGraph } = await import(
        '../runtime/capabilities/commands/runtimeCommandGraph.js'
      )
      const cwd = resolveDefaultKernelRuntimeCwd(context?.cwd, workspacePath)
      return createRuntimeCommandGraph(await loadCommands(cwd))
    },
    async executeCommand(request, context) {
      const cwd = resolveDefaultKernelRuntimeCwd(context?.cwd, workspacePath)
      return runWithCwdOverride(cwd, async () => {
        const [
          { findCommand },
          { getCommandName },
          { toRuntimeCommandDescriptor },
        ] = await Promise.all([
          import('../commands.js'),
          import('../types/command.js'),
          import(
            '../runtime/capabilities/commands/runtimeCommandGraph.js'
          ),
        ])
        const commands = await loadCommands(cwd)
        const command = findCommand(request.name, [...commands])
        if (!command) {
          return createRuntimeCommandTextResult({
            name: request.name,
            resultText: `Command not found: ${request.name}`,
            metadata: {
              ...request.metadata,
              error: 'not_found',
            },
          })
        }

        const descriptor = toRuntimeCommandDescriptor(command)
        const resultName = getCommandName(command)
        if (command.type === 'local-jsx') {
          return createRuntimeCommandTextResult({
            name: resultName,
            kind: descriptor.kind,
            resultText: `Command ${resultName} requires the interactive terminal UI.`,
            metadata: {
              ...request.metadata,
              unsupported: 'interactive_ui',
            },
          })
        }
        if (command.type === 'prompt') {
          if (command.disableNonInteractive) {
            return createRuntimeCommandTextResult({
              name: resultName,
              kind: descriptor.kind,
              resultText: `Command ${resultName} is disabled for non-interactive execution.`,
              metadata: {
                ...request.metadata,
                unsupported: 'non_interactive',
              },
            })
          }
          const promptBlocks = await command.getPromptForCommand(
            request.args ?? '',
            await createKernelRuntimeNonInteractiveToolUseContext(
              commands,
              cwd,
            ),
          )
          const text = contentBlocksToText(promptBlocks)
          return {
            name: resultName,
            kind: descriptor.kind,
            result: {
              type: 'query',
              prompt: text,
              text,
            },
            metadata: stripUndefinedMetadata({
              ...request.metadata,
              source: command.source,
              loadedFrom: command.loadedFrom,
              allowedTools: command.allowedTools,
              model: command.model,
              effort: command.effort,
              contentBlocks: promptBlocks,
            }),
          }
        }
        if (!command.supportsNonInteractive) {
          return createRuntimeCommandTextResult({
            name: resultName,
            kind: descriptor.kind,
            resultText: `Command ${resultName} is not safe for non-interactive execution.`,
            metadata: {
              ...request.metadata,
              unsupported: 'non_interactive',
            },
          })
        }
        const module = await command.load()
        const commandContext =
          await createKernelRuntimeNonInteractiveToolUseContext(
            commands,
            cwd,
          )
        return {
          name: resultName,
          kind: descriptor.kind,
          result: mapLocalCommandResult(await module.call(
            request.args ?? '',
            commandContext,
          )),
          metadata: request.metadata,
        }
      })
    },
  }
}

function createDefaultKernelRuntimeToolCatalog(
  workspacePath: string | undefined,
): KernelRuntimeWireToolCatalog {
  const commandCache = new Map<string, readonly Command[]>()

  async function loadCommands(cwd: string): Promise<readonly Command[]> {
    const cached = commandCache.get(cwd)
    if (cached) {
      return cached
    }
    await prepareDefaultKernelRuntimeCatalogs()
    const { getCommands } = await import('../commands.js')
    const commands = await getCommands(cwd)
    commandCache.set(cwd, commands)
    return commands
  }

  return {
    async listTools() {
      const [{ getEmptyToolPermissionContext }, { getTools }, descriptors] =
        await Promise.all([
          import('../Tool.js'),
          import('../runtime/capabilities/tools/ToolPolicy.js'),
          import('../runtime/capabilities/tools/runtimeToolDescriptors.js'),
        ])
      void workspacePath
      return descriptors.toRuntimeToolDescriptors(
        getTools(getEmptyToolPermissionContext()),
      )
    },
    async callTool(request, context) {
      const cwd = resolveDefaultKernelRuntimeCwd(context?.cwd, workspacePath)
      return runWithCwdOverride(cwd, async () => {
        await prepareDefaultKernelRuntimeCatalogs()
        const [
          { findToolByName, getEmptyToolPermissionContext },
          { getTools },
          { createAssistantMessage },
        ] = await Promise.all([
          import('../Tool.js'),
          import('../runtime/capabilities/tools/ToolPolicy.js'),
          import('../utils/messages.js'),
        ])
        const permissionMode = toDefaultKernelRuntimePermissionMode(
          request.permissionMode,
          'default',
        )
        const toolPermissionContext = {
          ...getEmptyToolPermissionContext(),
          mode: permissionMode,
          shouldAvoidPermissionPrompts: true,
        } satisfies ToolPermissionContext
        const tools = getTools(toolPermissionContext)
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
            },
          )
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
          const permissionDecision = await tool.checkPermissions(
            permissionInput,
            toolUseContext,
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
          if (permissionDecision.updatedInput) {
            callInput = permissionDecision.updatedInput
          }
        }

        const toolUseID = `kernel_tool_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2)}`
        const progressEvents: unknown[] = []
        const parentMessage = createAssistantMessage({ content: '' })
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
          metadata: stripUndefinedMetadata({
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

function resolveDefaultKernelRuntimeCwd(
  contextCwd: string | undefined,
  workspacePath: string | undefined,
): string {
  return contextCwd ?? workspacePath ?? process.cwd()
}

async function prepareDefaultKernelRuntimeCatalogs(): Promise<void> {
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

function createRuntimeCommandTextResult(input: {
  name: string
  kind?: RuntimeCommandKind
  resultText: string
  metadata?: Record<string, unknown>
}): RuntimeCommandExecutionResult {
  return {
    name: input.name,
    kind: input.kind,
    result: {
      type: 'text',
      text: input.resultText,
      display: 'system',
    },
    metadata: stripUndefinedMetadata(input.metadata),
  }
}

function mapLocalCommandResult(
  result: LocalCommandResult,
): RuntimeCommandResult {
  switch (result.type) {
    case 'text':
      return {
        type: 'text',
        text: result.value,
        display: 'system',
      }
    case 'compact':
      return {
        type: 'compact',
        text: result.displayText,
      }
    case 'skip':
      return { type: 'skip' }
  }
}

function toDefaultKernelRuntimePermissionMode(
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
    metadata: stripUndefinedMetadata(input.metadata),
  }
}

function stripUndefinedMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined
  }
  const entries = Object.entries(metadata).filter(
    (entry): entry is [string, unknown] => entry[1] !== undefined,
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}
