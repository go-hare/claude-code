import { createInterface } from 'readline'
import type { Readable, Writable } from 'stream'

import { RuntimeCapabilityUnavailableError } from '../runtime/capabilities/RuntimeCapabilityResolver.js'
import type {
  RuntimeCommandExecuteRequest,
  RuntimeCommandGraphEntry,
  RuntimeCommandKind,
} from '../runtime/contracts/command.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../runtime/contracts/events.js'
import type {
  RuntimeHookRegisterRequest,
  RuntimeHookRunRequest,
} from '../runtime/contracts/hook.js'
import type {
  KernelPermissionDecision,
  KernelPermissionDecisionValue,
  KernelPermissionRequest,
} from '../runtime/contracts/permissions.js'
import type { RuntimeProviderSelection } from '../runtime/contracts/provider.js'
import type { RuntimeSkillPromptContextRequest } from '../runtime/contracts/skill.js'
import type { RuntimeToolDescriptor } from '../runtime/contracts/tool.js'
import type { KernelTurnRunRequest } from '../runtime/contracts/turn.js'
import { AgentCoreError, AgentCoreService } from './agentCoreService.js'
import type { KernelCompanionAction } from './companion.js'
import {
  AutonomyCoreService,
  type AutonomyCoreServiceOptions,
} from './autonomyCoreService.js'
import {
  CommandGraphCoreError,
  CommandGraphCoreService,
  type CommandGraphCoreCatalog,
} from './commandGraphCoreService.js'
import type { KernelContextManager } from './context.js'
import { ContextCoreService } from './contextCoreService.js'
import {
  ConversationCoreError,
  ConversationCoreService,
  type ConversationCoreTurnExecutor,
} from './conversationCoreService.js'
import {
  ExtensionCoreError,
  ExtensionCoreService,
  type ExtensionCoreServiceOptions,
} from './extensionCoreService.js'
import type { KernelMemoryManager } from './memory.js'
import {
  RuntimeCoreError,
  RuntimeCoreService,
  type RuntimeCoreServiceOptions,
} from './runtimeCoreService.js'
import type { KernelSessionManager } from './sessions.js'
import {
  McpCoreError,
  McpCoreService,
  type McpCoreRegistry,
} from './mcpCoreService.js'
import { MemoryCoreService } from './memoryCoreService.js'
import type {
  KernelRuntimeAgentRegistry,
  KernelRuntimeTaskRegistry,
} from './runtimeAgentTaskRegistries.js'
import type { KernelKairosExternalEvent } from './kairos.js'
import {
  ToolCoreError,
  ToolCoreService,
  type ToolCoreCatalog,
} from './toolCoreService.js'
import { TaskCoreError, TaskCoreService } from './taskCoreService.js'
import { TeamCoreError, TeamCoreService } from './teamCoreService.js'
import type { KernelRuntimeTeamRegistry } from './runtimeTeamsRegistry.js'

export const KERNEL_RUNTIME_JSON_RPC_LITE_PROTOCOL_VERSION = '2026-05-08'

const JSON_RPC_LITE_ALLOWED_FIELDS = new Set([
  'id',
  'method',
  'params',
  'result',
  'error',
])

type JsonRpcLiteRequestId = string | number
type JsonRpcLiteResponseId = JsonRpcLiteRequestId | null

type JsonRpcLiteRequestMessage = {
  id: JsonRpcLiteRequestId
  method: string
  params?: unknown
}

type JsonRpcLiteNotificationMessage = {
  method: string
  params?: unknown
}

type JsonRpcLiteErrorObject = {
  code: string
  message: string
  data?: Record<string, unknown>
}

type JsonRpcLiteResponseMessage = {
  id: JsonRpcLiteResponseId
  result?: unknown
  error?: JsonRpcLiteErrorObject
}

type JsonRpcLiteOutboundMessage =
  | JsonRpcLiteRequestMessage
  | JsonRpcLiteNotificationMessage
  | JsonRpcLiteResponseMessage

type ParsedInboundMessage =
  | ({ kind: 'request' } & JsonRpcLiteRequestMessage)
  | ({ kind: 'notification' } & JsonRpcLiteNotificationMessage)
  | {
      kind: 'response'
      id: JsonRpcLiteResponseId
      result?: unknown
      error?: unknown
    }

type ProtocolPermissionRisk = {
  level: 'low' | 'medium' | 'high' | 'destructive'
  requiresApproval: boolean
  scopes: readonly string[]
  reason?: string
}

type ProtocolStreamingCapability = {
  supported: boolean
  events: readonly string[]
}

type ProtocolCommandDescription = {
  commandId: string
  aliases: readonly string[]
  summary: string
  inputSchema: Record<string, unknown>
  resultSchema: Record<string, unknown>
  permissionRisk: ProtocolPermissionRisk
  streaming: ProtocolStreamingCapability
  deprecated: boolean
  examples: ReadonlyArray<{ params: unknown }>
  source: string
}

type ProtocolCommandRecord = {
  description: ProtocolCommandDescription
  execute(
    server: KernelRuntimeJsonRpcLiteServer,
    params: unknown,
    requestId: string,
  ): Promise<unknown>
}

type ProtocolSubscription = {
  subscriptionId: string
  cursor?: string
  sessionId?: string
  turnId?: string
  types?: ReadonlySet<string>
}

type PendingServerRequest = {
  method: 'permissions.request'
}

export type KernelRuntimeJsonRpcLiteProtocolOptions =
  RuntimeCoreServiceOptions & {
    commandCatalog?: CommandGraphCoreCatalog
    toolCatalog?: ToolCoreCatalog
    mcpRegistry?: McpCoreRegistry
    contextManager?: KernelContextManager
    memoryManager?: KernelMemoryManager
    agentRegistry?: KernelRuntimeAgentRegistry
    taskRegistry?: KernelRuntimeTaskRegistry
    teamRegistry?: KernelRuntimeTeamRegistry
    hookCatalog?: ExtensionCoreServiceOptions['hookCatalog']
    skillCatalog?: ExtensionCoreServiceOptions['skillCatalog']
    pluginCatalog?: ExtensionCoreServiceOptions['pluginCatalog']
    companionRuntime?: AutonomyCoreServiceOptions['companionRuntime']
    kairosRuntime?: AutonomyCoreServiceOptions['kairosRuntime']
    sessionManager?: KernelSessionManager
    runTurnExecutor?: ConversationCoreTurnExecutor
    conversationJournalPath?: string | false
  }

export type KernelRuntimeJsonRpcLiteRunnerOptions =
  KernelRuntimeJsonRpcLiteProtocolOptions & {
    input?: Readable
    output?: Pick<Writable, 'write'>
  }

export async function runKernelRuntimeJsonRpcLiteProtocol(
  options: KernelRuntimeJsonRpcLiteRunnerOptions = {},
): Promise<void> {
  const server = new KernelRuntimeJsonRpcLiteServer(options)
  await server.run(options.input ?? process.stdin)
}

class KernelRuntimeJsonRpcLiteServer {
  private readonly runtimeCore: RuntimeCoreService
  private readonly conversationCore: ConversationCoreService
  private readonly commandGraphCore: CommandGraphCoreService
  private readonly mcpCore: McpCoreService
  private readonly toolCore: ToolCoreService
  private readonly contextCore: ContextCoreService
  private readonly memoryCore: MemoryCoreService
  private readonly agentCore: AgentCoreService
  private readonly taskCore: TaskCoreService
  private readonly teamCore: TeamCoreService
  private readonly extensionCore: ExtensionCoreService
  private readonly autonomyCore: AutonomyCoreService
  private readonly output: Pick<Writable, 'write'>
  private readonly subscriptions = new Map<string, ProtocolSubscription>()
  private readonly pendingServerRequests = new Map<
    string,
    PendingServerRequest
  >()
  private readonly bufferedOutboundMessages: JsonRpcLiteOutboundMessage[] = []
  private requestQueue: Promise<void> = Promise.resolve()
  private deliveryBarrierCount = 0
  private nextInternalRequestNumber = 1
  private nextSubscriptionNumber = 1

  constructor(options: KernelRuntimeJsonRpcLiteRunnerOptions) {
    this.runtimeCore = new RuntimeCoreService(options)
    this.conversationCore = new ConversationCoreService({
      runtimeId: this.runtimeCore.runtimeId,
      workspacePath: this.runtimeCore.workspacePath,
      eventBus: this.runtimeCore.eventBus,
      permissionBroker: this.runtimeCore.permissionBroker,
      conversationJournalPath: options.conversationJournalPath,
      sessionManager: options.sessionManager,
      runTurnExecutor: options.runTurnExecutor,
    })
    this.commandGraphCore = new CommandGraphCoreService({
      workspacePath: this.runtimeCore.workspacePath,
      eventBus: this.runtimeCore.eventBus,
      commandCatalog: options.commandCatalog,
    })
    this.mcpCore = new McpCoreService({
      workspacePath: this.runtimeCore.workspacePath,
      eventBus: this.runtimeCore.eventBus,
      registry: options.mcpRegistry,
    })
    this.toolCore = new ToolCoreService({
      workspacePath: this.runtimeCore.workspacePath,
      eventBus: this.runtimeCore.eventBus,
      toolCatalog: options.toolCatalog,
      listMcpTools: () => this.mcpCore.listRuntimeTools(),
      listMcpClients: () => this.mcpCore.listClients(),
    })
    this.contextCore = new ContextCoreService({
      workspacePath: this.runtimeCore.workspacePath,
      contextManager: options.contextManager,
    })
    this.memoryCore = new MemoryCoreService({
      workspacePath: this.runtimeCore.workspacePath,
      memoryManager: options.memoryManager,
    })
    this.agentCore = new AgentCoreService({
      workspacePath: this.runtimeCore.workspacePath,
      eventBus: this.runtimeCore.eventBus,
      agentRegistry: options.agentRegistry,
    })
    this.taskCore = new TaskCoreService({
      workspacePath: this.runtimeCore.workspacePath,
      eventBus: this.runtimeCore.eventBus,
      taskRegistry: options.taskRegistry,
    })
    this.teamCore = new TeamCoreService({
      workspacePath: this.runtimeCore.workspacePath,
      eventBus: this.runtimeCore.eventBus,
      teamRegistry: options.teamRegistry,
    })
    this.extensionCore = new ExtensionCoreService({
      workspacePath: this.runtimeCore.workspacePath,
      eventBus: this.runtimeCore.eventBus,
      hookCatalog: options.hookCatalog,
      skillCatalog: options.skillCatalog,
      pluginCatalog: options.pluginCatalog,
    })
    this.autonomyCore = new AutonomyCoreService({
      workspacePath: this.runtimeCore.workspacePath,
      eventBus: this.runtimeCore.eventBus,
      companionRuntime: options.companionRuntime,
      kairosRuntime: options.kairosRuntime,
    })
    this.output = options.output ?? process.stdout
  }

  async run(input: Readable): Promise<void> {
    const unsubscribe = this.runtimeCore.eventBus.subscribe(envelope => {
      this.handleRuntimeEnvelope(envelope)
    })
    const pendingTasks = new Set<Promise<void>>()

    try {
      const lines = createInterface({
        input,
        crlfDelay: Number.POSITIVE_INFINITY,
      })
      for await (const line of lines) {
        if (line.trim().length === 0) {
          continue
        }
        const task = this.handleInboundLine(line)
        pendingTasks.add(task)
        void task.finally(() => {
          pendingTasks.delete(task)
        })
      }
      await Promise.allSettled([...pendingTasks])
      await this.requestQueue
    } finally {
      unsubscribe()
    }
  }

  private async handleInboundLine(line: string): Promise<void> {
    let message: ParsedInboundMessage
    try {
      message = parseJsonRpcLiteMessage(line)
    } catch (error) {
      const response = createProtocolErrorResponse(
        tryExtractRequestId(line),
        normalizeProtocolFailure(error, 'parse_error'),
      )
      this.writeOutboundMessage(response)
      return
    }

    if (message.kind === 'response') {
      await this.handleServerResponse(message)
      return
    }

    const queued = this.requestQueue.then(() =>
      this.processRequestMessage(message),
    )
    this.requestQueue = queued.catch(() => {})
    await queued
  }

  private async processRequestMessage(
    message:
      | ({ kind: 'request' } & JsonRpcLiteRequestMessage)
      | ({ kind: 'notification' } & JsonRpcLiteNotificationMessage),
  ): Promise<void> {
    this.deliveryBarrierCount += 1
    try {
      const result = await this.dispatchRequest(
        message.method,
        message.params,
        {
          requestId: this.toInternalRequestId(message),
        },
      )
      if (message.kind === 'request') {
        this.writeOutboundMessage({
          id: message.id,
          result,
        })
      }
    } catch (error) {
      if (message.kind === 'request') {
        this.writeOutboundMessage(
          createProtocolErrorResponse(
            message.id,
            normalizeProtocolFailure(error, 'internal_error'),
          ),
        )
      }
    } finally {
      this.deliveryBarrierCount -= 1
      if (this.deliveryBarrierCount === 0) {
        queueMicrotask(() => {
          this.flushBufferedOutboundMessages()
        })
      }
    }
  }

  private async dispatchRequest(
    method: string,
    params: unknown,
    context: { requestId: string },
  ): Promise<unknown> {
    switch (method) {
      case 'commands.list':
      case 'list_commands':
        return this.handleCommandsList()
      case 'commands.describe':
        return this.handleCommandsDescribe(params)
      case 'commands.execute':
      case 'execute_command':
        return this.handleCommandsExecute(params, context.requestId)
      default:
        return this.executeGraphCommand(method, params, context.requestId)
    }
  }

  private async handleCommandsList(): Promise<{
    commands: ProtocolCommandDescription[]
    entries: RuntimeCommandGraphEntry[]
  }> {
    await this.requireCapability('commands')
    const graph = await this.buildCommandGraph()
    const commands = [...graph.values()].map(record => record.description)
    return {
      commands,
      entries: commands.map(toRuntimeCommandGraphEntry),
    }
  }

  private async handleCommandsDescribe(
    params: unknown,
  ): Promise<ProtocolCommandDescription> {
    await this.requireCapability('commands')
    const record = await this.findCommandRecordFromDescribeParams(params)
    return record.description
  }

  private async handleCommandsExecute(
    params: unknown,
    requestId: string,
  ): Promise<unknown> {
    await this.requireCapability('commands')
    const payload = expectRecord(params, 'params')
    const commandId = expectString(
      payload.commandId ?? payload.name,
      payload.commandId === undefined ? 'params.name' : 'params.commandId',
    )
    const graph = await this.buildCommandGraph()
    const record = findCommandRecord(graph, commandId)
    if (!record) {
      throw createProtocolFailure(
        'not_found',
        `Unknown command graph node: ${commandId}`,
      )
    }
    const commandArguments = normalizeCommandExecutionArguments(payload)
    return record.execute(this, commandArguments, requestId)
  }

  private async executeGraphCommand(
    commandId: string,
    params: unknown,
    requestId: string,
  ): Promise<unknown> {
    const graph = await this.buildCommandGraph()
    const record = findCommandRecord(graph, commandId)
    if (!record) {
      throw createProtocolFailure(
        'method_not_found',
        `Unsupported method: ${commandId}`,
      )
    }
    return record.execute(this, params, requestId)
  }

  private async buildCommandGraph(): Promise<
    Map<string, ProtocolCommandRecord>
  > {
    const graph = new Map<string, ProtocolCommandRecord>()

    for (const record of this.createProtocolCommandRecords()) {
      graph.set(record.description.commandId, record)
    }

    for (const [commandId, record] of typedCoreCommandEntries()) {
      graph.set(commandId, record)
    }

    const cliEntries = await this.commandGraphCore.listCommands()
    for (const entry of cliEntries) {
      const commandId = entry.descriptor.name
      if (graph.has(commandId)) {
        continue
      }
      graph.set(commandId, this.createCliCommandRecord(entry))
    }

    return graph
  }

  private createProtocolCommandRecords(): readonly ProtocolCommandRecord[] {
    return [
      this.createProtocolCommandRecord(
        'commands.list',
        'List protocol commands',
        (_server, _params) => this.handleCommandsList(),
        { aliases: ['list_commands'] },
      ),
      this.createProtocolCommandRecord(
        'commands.describe',
        'Describe one protocol command',
        (_server, params) => this.handleCommandsDescribe(params),
      ),
      this.createProtocolCommandRecord(
        'commands.execute',
        'Execute one protocol command',
        (_server, params, requestId) =>
          this.handleCommandsExecute(params, requestId),
        { aliases: ['execute_command'] },
      ),
    ]
  }

  private createProtocolCommandRecord(
    commandId: string,
    summary: string,
    execute: ProtocolCommandRecord['execute'],
    overrides: Partial<ProtocolCommandDescription> = {},
  ): ProtocolCommandRecord {
    return {
      ...createTypedCommand(commandId, summary, {
        ...overrides,
        source: 'protocol',
      }),
      execute,
    }
  }

  private createCliCommandRecord(
    entry: RuntimeCommandGraphEntry,
  ): ProtocolCommandRecord {
    const commandId = entry.descriptor.name
    return {
      description: {
        commandId,
        aliases: entry.descriptor.aliases ?? [],
        summary: entry.descriptor.description,
        inputSchema: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                args: { type: 'string' },
              },
              additionalProperties: true,
            },
          ],
        },
        resultSchema: {
          type: 'object',
          additionalProperties: true,
        },
        permissionRisk: permissionRiskForCliCommand(entry),
        streaming: {
          supported: false,
          events: [],
        },
        deprecated: false,
        examples:
          entry.descriptor.argumentHint !== undefined
            ? [{ params: { args: entry.descriptor.argumentHint } }]
            : [],
        source: entry.source ?? entry.loadedFrom ?? 'cli-graph',
      },
      execute: async (_server, params) => {
        const execution = normalizeCliExecutionOptions(params)
        return this.commandGraphCore.executeCommand({
          name: commandId,
          args: execution.args,
          source: execution.source,
          metadata: {
            protocol: 'json-rpc-lite',
            ...execution.metadata,
          },
        })
      },
    }
  }

  async runTypedCoreCommand(
    commandId: string,
    params: unknown,
    requestId: string,
  ): Promise<unknown> {
    switch (commandId) {
      case 'runtime.ping':
        return this.handleRuntimePing()
      case 'runtime.initialize':
        return this.handleRuntimeInitialize(params)
      case 'runtime.capabilities':
        return this.handleRuntimeCapabilities()
      case 'runtime.reloadCapabilities':
        return this.handleRuntimeReloadCapabilities(params)
      case 'host.connect':
        return this.handleHostConnect(params)
      case 'host.disconnect':
        return this.handleHostDisconnect(params)
      case 'host.event.publish':
        return this.handleHostEventPublish(params, requestId)
      case 'sessions.list':
        return this.handleSessionsList(params)
      case 'sessions.create':
        return this.handleSessionsCreate(params)
      case 'sessions.resume':
        return this.handleSessionsResume(params)
      case 'sessions.dispose':
        return this.handleSessionsDispose(params)
      case 'sessions.transcript':
        return this.handleSessionsTranscript(params)
      case 'turn.run':
        return this.handleTurnRun(params, requestId)
      case 'turn.abort':
        return this.handleTurnAbort(params)
      case 'events.subscribe':
        return this.handleEventsSubscribe(params)
      case 'events.unsubscribe':
        return this.handleEventsUnsubscribe(params)
      case 'tools.list':
        return this.handleToolsList()
      case 'tools.describe':
        return this.handleToolsDescribe(params)
      case 'tools.call':
        return this.handleToolsCall(params)
      case 'permissions.decide':
        return this.handlePermissionsDecide(params)
      case 'mcp.servers.list':
        return this.handleMcpServersList()
      case 'mcp.tools.list':
        return this.handleMcpToolsList(params)
      case 'mcp.resources.list':
        return this.handleMcpResourcesList(params)
      case 'mcp.connect':
        return this.handleMcpConnect(params)
      case 'mcp.authenticate':
        return this.handleMcpAuthenticate(params)
      case 'mcp.setEnabled':
        return this.handleMcpSetEnabled(params)
      case 'mcp.reload':
        return this.handleMcpReload()
      case 'hooks.list':
        return this.handleHooksList()
      case 'hooks.reload':
        return this.handleHooksReload()
      case 'hooks.run':
        return this.handleHooksRun(params)
      case 'hooks.register':
        return this.handleHooksRegister(params)
      case 'skills.list':
        return this.handleSkillsList()
      case 'skills.reload':
        return this.handleSkillsReload()
      case 'skills.context.resolve':
        return this.handleSkillsContextResolve(params)
      case 'plugins.list':
        return this.handlePluginsList()
      case 'plugins.reload':
        return this.handlePluginsReload()
      case 'plugins.setEnabled':
        return this.handlePluginsSetEnabled(params)
      case 'plugins.install':
        return this.handlePluginsInstall(params)
      case 'plugins.uninstall':
        return this.handlePluginsUninstall(params)
      case 'plugins.update':
        return this.handlePluginsUpdate(params)
      case 'context.read':
        return this.handleContextRead(params)
      case 'context.gitStatus':
        return this.handleContextGitStatus(params)
      case 'context.systemPrompt.get':
        return this.handleContextSystemPromptGet(params)
      case 'context.systemPrompt.set':
        return this.handleContextSystemPromptSet(params)
      case 'memory.list':
        return this.handleMemoryList(params)
      case 'memory.read':
        return this.handleMemoryRead(params)
      case 'memory.update':
        return this.handleMemoryUpdate(params)
      case 'agents.list':
        return this.handleAgentsList()
      case 'agents.reload':
        return this.handleAgentsReload()
      case 'agents.spawn':
        return this.handleAgentsSpawn(params)
      case 'agents.runs.list':
        return this.handleAgentsRunsList()
      case 'agents.runs.get':
        return this.handleAgentsRunsGet(params)
      case 'agents.runs.cancel':
        return this.handleAgentsRunsCancel(params)
      case 'agents.output.get':
        return this.handleAgentsOutputGet(params)
      case 'tasks.list':
        return this.handleTasksList(params)
      case 'tasks.get':
        return this.handleTasksGet(params)
      case 'tasks.create':
        return this.handleTasksCreate(params)
      case 'tasks.update':
        return this.handleTasksUpdate(params)
      case 'tasks.assign':
        return this.handleTasksAssign(params)
      case 'teams.list':
        return this.handleTeamsList()
      case 'teams.get':
        return this.handleTeamsGet(params)
      case 'teams.create':
        return this.handleTeamsCreate(params)
      case 'teams.message':
        return this.handleTeamsMessage(params)
      case 'teams.destroy':
        return this.handleTeamsDestroy(params)
      case 'companion.state.get':
        return this.handleCompanionStateGet()
      case 'companion.action.dispatch':
        return this.handleCompanionActionDispatch(params)
      case 'companion.react':
        return this.handleCompanionReact(params)
      case 'kairos.status.get':
        return this.handleKairosStatusGet()
      case 'kairos.event.enqueue':
        return this.handleKairosEventEnqueue(params)
      case 'kairos.tick':
        return this.handleKairosTick(params)
      case 'kairos.suspend':
        return this.handleKairosSuspend(params)
      case 'kairos.resume':
        return this.handleKairosResume(params)
      default:
        return this.handleUnsupportedTypedCore(commandId)
    }
  }

  private async handleRuntimePing(): Promise<Record<string, unknown>> {
    return this.runtimeCore.ping()
  }

  private async handleRuntimeInitialize(
    params: unknown,
  ): Promise<Record<string, unknown>> {
    const payload = optionalRecord(params, 'params') ?? {}
    const defaultProvider =
      optionalRuntimeObject<RuntimeProviderSelection>(
        payload.defaultProvider,
      ) ?? optionalRuntimeObject<RuntimeProviderSelection>(payload.provider)
    this.conversationCore.setDefaultProviderSelection(defaultProvider)
    const result = this.runtimeCore.initialize({
      workspacePath: optionalString(payload.workspacePath),
      provider: optionalRuntimeObject(payload.provider),
      defaultProvider: optionalRuntimeObject(payload.defaultProvider),
      auth: optionalRecord(payload.auth),
      model: optionalString(payload.model),
      capabilities: optionalRecord(payload.capabilities),
      client: optionalRecord(payload.client),
    })
    return {
      protocolVersion: KERNEL_RUNTIME_JSON_RPC_LITE_PROTOCOL_VERSION,
      ...result,
      capabilities: await this.handleRuntimeCapabilities(),
    }
  }

  private async handleRuntimeCapabilities(): Promise<Record<string, unknown>> {
    const graph = await this.buildCommandGraph()
    return {
      protocolVersion: KERNEL_RUNTIME_JSON_RPC_LITE_PROTOCOL_VERSION,
      typedCore: true,
      commandGraph: true,
      strictTransport: true,
      methods: [
        'commands.list',
        'commands.describe',
        'commands.execute',
        'list_commands',
        'execute_command',
        ...typedCoreAcceptedMethodIds(),
      ],
      notifications: ['event'],
      serverRequests: ['permissions.request'],
      transport: {
        framing: 'jsonl',
        topLevelFields: ['id', 'method', 'params', 'result', 'error'],
      },
      commandCount: graph.size,
    }
  }

  private async handleRuntimeReloadCapabilities(
    params: unknown,
  ): Promise<unknown> {
    const payload = optionalRecord(params, 'params') ?? {}
    return this.runtimeCore.reloadCapabilities({
      scope: optionalRuntimeObject(payload.scope),
      capabilities: optionalStringArray(
        payload.capabilities,
        'params.capabilities',
      ),
      metadata: optionalRecord(payload.metadata),
    })
  }

  private async handleHostConnect(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    const sinceEventId = optionalString(payload.sinceEventId)
    const replay = this.runtimeCore.replayRuntimeScopedEvents(sinceEventId)
    const result = this.runtimeCore.connectHost({
      host:
        optionalRuntimeObject(payload.host) ?? expectHostIdentity(payload.host),
      sinceEventId,
      metadata: optionalRecord(payload.metadata),
    })
    this.emitReplayNotifications(replay)
    return result
  }

  private async handleHostDisconnect(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    const policy = optionalHostDisconnectPolicy(payload.policy)
    const abortedTurnIds =
      policy === 'abort_active_turns'
        ? await this.conversationCore.abortActiveTurns(
            optionalString(payload.reason) ?? 'host_disconnected',
          )
        : []
    return this.runtimeCore.disconnectHost({
      hostId: expectString(payload.hostId, 'params.hostId'),
      reason: optionalString(payload.reason),
      policy,
      abortedTurnIds,
      metadata: optionalRecord(payload.metadata),
    })
  }

  private async handleHostEventPublish(
    params: unknown,
    requestId: string,
  ): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.runtimeCore.publishHostEvent({
      event: optionalRuntimeObject(payload.event) ?? expectEvent(payload.event),
      requestId,
    })
  }

  private async handleSessionsList(params: unknown): Promise<unknown> {
    await this.requireCapability('sessions')
    const payload = optionalRecord(params) ?? {}
    return {
      sessions: await this.conversationCore.listSessions({
        cwd: optionalString(payload.cwd),
        limit: optionalNumber(payload.limit),
        offset: optionalNumber(payload.offset),
        includeWorktrees:
          typeof payload.includeWorktrees === 'boolean'
            ? payload.includeWorktrees
            : undefined,
      }),
    }
  }

  private async handleSessionsCreate(
    params: unknown,
  ): Promise<Record<string, unknown>> {
    await this.requireCapability('sessions')
    const payload = expectRecord(params, 'params')
    const sessionId =
      optionalString(payload.sessionId) ??
      `session-${this.nextInternalRequestNumber++}`
    return this.conversationCore.createSession({
      sessionId,
      workspacePath:
        optionalString(payload.workspacePath) ?? this.runtimeCore.workspacePath,
      sessionMeta: optionalRecord(payload.sessionMeta),
      capabilityIntent: optionalRuntimeObject(payload.capabilityIntent),
      provider: optionalRuntimeObject(payload.provider),
      metadata: {
        protocol: 'json-rpc-lite',
      },
    })
  }

  private async handleSessionsResume(
    params: unknown,
  ): Promise<Record<string, unknown>> {
    await this.requireCapability('sessions')
    const payload = expectRecord(params, 'params')
    const transcriptSessionId = expectString(
      payload.sessionId,
      'params.sessionId',
    )
    const targetSessionId =
      optionalString(payload.targetSessionId) ??
      optionalString(payload.conversationId) ??
      `session-${transcriptSessionId}`
    return this.conversationCore.resumeSession({
      transcriptSessionId,
      targetSessionId,
      workspacePath: optionalString(payload.workspacePath),
      resumeInterruptedTurn:
        typeof payload.resumeInterruptedTurn === 'boolean'
          ? payload.resumeInterruptedTurn
          : undefined,
      resumeSessionAt: optionalString(payload.resumeSessionAt),
      metadata: {
        protocol: 'json-rpc-lite',
      },
    })
  }

  private async handleSessionsDispose(
    params: unknown,
  ): Promise<Record<string, unknown>> {
    await this.requireCapability('sessions')
    const payload = expectRecord(params, 'params')
    const sessionId = expectString(payload.sessionId, 'params.sessionId')
    return this.conversationCore.disposeSession({
      sessionId,
      reason: optionalString(payload.reason),
    })
  }

  private async handleSessionsTranscript(params: unknown): Promise<unknown> {
    await this.requireCapability('sessions')
    const payload = expectRecord(params, 'params')
    const sessionId = expectString(payload.sessionId, 'params.sessionId')
    const transcript = await this.conversationCore.getTranscript(sessionId)
    return {
      ...transcript,
      transcript,
    }
  }

  private async handleTurnRun(
    params: unknown,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const payload = expectRecord(params, 'params')
    const sessionId = expectString(payload.sessionId, 'params.sessionId')
    const prompt = normalizeTurnPrompt(payload.prompt)
    if (prompt === undefined) {
      throw createProtocolFailure('invalid_params', 'Missing params.prompt')
    }
    const turnId =
      optionalString(payload.turnId) ??
      `turn-${this.nextInternalRequestNumber++}`
    return this.conversationCore.runTurn({
      requestId,
      conversationId: sessionId,
      turnId,
      prompt,
      attachments: Array.isArray(payload.attachments)
        ? payload.attachments
        : undefined,
      providerOverride: optionalRuntimeObject(payload.providerOverride),
      executionMode: optionalRuntimeObject(payload.executionMode),
      contextAssembly: optionalRuntimeObject(payload.contextAssembly),
      capabilityPlane: optionalRuntimeObject(payload.capabilityPlane),
      metadata: {
        protocol: 'json-rpc-lite',
      },
    })
  }

  private async handleTurnAbort(
    params: unknown,
  ): Promise<Record<string, unknown>> {
    const payload = expectRecord(params, 'params')
    const sessionId = expectString(payload.sessionId, 'params.sessionId')
    const turnId = expectString(payload.turnId, 'params.turnId')
    return this.conversationCore.abortTurn({
      sessionId,
      turnId,
      reason: optionalString(payload.reason),
    })
  }

  private async handleEventsSubscribe(
    params: unknown,
  ): Promise<Record<string, unknown>> {
    const payload = expectRecord(params, 'params')
    const filter =
      optionalRecord(payload.filter) ?? optionalRecord(payload.filters) ?? {}
    const types =
      Array.isArray(filter.types) &&
      filter.types.every(item => typeof item === 'string')
        ? new Set(filter.types as string[])
        : undefined
    const subscriptionId = `sub-${this.nextSubscriptionNumber++}`
    const subscription: ProtocolSubscription = {
      subscriptionId,
      cursor: optionalString(payload.cursor) ?? optionalString(payload.sinceEventId),
      sessionId:
        optionalString(filter.sessionId) ??
        optionalString(payload.sessionId) ??
        optionalString(payload.conversationId),
      turnId: optionalString(filter.turnId) ?? optionalString(payload.turnId),
      types,
    }
    this.subscriptions.set(subscriptionId, subscription)

    const replay = this.runtimeCore.eventBus.replay({
      conversationId: subscription.sessionId,
      turnId: subscription.turnId,
      sinceEventId: subscription.cursor,
    })
    for (const envelope of replay) {
      const outbound = this.projectEventNotification(envelope, subscription)
      if (outbound) {
        this.emitOutboundMessage(outbound)
      }
    }

    return {
      subscribed: true,
      subscriptionId,
      cursor: subscription.cursor ?? null,
      filter: {
        sessionId: subscription.sessionId ?? null,
        turnId: subscription.turnId ?? null,
        types: subscription.types ? [...subscription.types] : [],
      },
    }
  }

  private async handleEventsUnsubscribe(
    params: unknown,
  ): Promise<Record<string, unknown>> {
    const payload = expectRecord(params, 'params')
    const subscriptionId = expectString(
      payload.subscriptionId,
      'params.subscriptionId',
    )
    return {
      subscriptionId,
      unsubscribed: this.subscriptions.delete(subscriptionId),
    }
  }

  private async handlePermissionsDecide(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    const decision = normalizePermissionDecisionResult(
      expectString(payload.permissionRequestId, 'params.permissionRequestId'),
      {
        result: payload,
      },
    )
    return this.runtimeCore.decidePermission(decision)
  }

  private async handleToolsList(): Promise<unknown> {
    return this.toolCore.listTools()
  }

  private async handleToolsDescribe(
    params: unknown,
  ): Promise<{ tool: RuntimeToolDescriptor }> {
    const payload = expectRecord(params, 'params')
    const toolName = expectString(payload.toolName, 'params.toolName')
    const { tools } = await this.toolCore.listTools()
    const tool = tools.find(item => {
      if (item.name === toolName) {
        return true
      }
      return item.aliases?.includes(toolName) ?? false
    })
    if (!tool) {
      throw createProtocolFailure('not_found', `Unknown tool: ${toolName}`)
    }
    return { tool }
  }

  private async handleToolsCall(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.toolCore.callTool({
      toolName: expectString(payload.toolName, 'params.toolName'),
      input: payload.input,
      permissionMode: optionalString(payload.permissionMode),
      metadata: {
        ...optionalRecord(payload.metadata),
        protocol: 'json-rpc-lite',
      },
    })
  }

  private async handleMcpServersList(): Promise<unknown> {
    return this.mcpCore.listServers()
  }

  private async handleMcpToolsList(params: unknown): Promise<unknown> {
    const payload = optionalRecord(params) ?? {}
    return this.mcpCore.listTools(optionalString(payload.serverName))
  }

  private async handleMcpResourcesList(params: unknown): Promise<unknown> {
    const payload = optionalRecord(params) ?? {}
    return this.mcpCore.listResources(optionalString(payload.serverName))
  }

  private async handleMcpConnect(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.mcpCore.connect({
      serverName: expectString(payload.serverName, 'params.serverName'),
      metadata: {
        ...optionalRecord(payload.metadata),
        protocol: 'json-rpc-lite',
      },
    })
  }

  private async handleMcpAuthenticate(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.mcpCore.authenticate({
      serverName: expectString(payload.serverName, 'params.serverName'),
      action: optionalRuntimeObject(payload.action),
      callbackUrl: optionalString(payload.callbackUrl),
      metadata: {
        ...optionalRecord(payload.metadata),
        protocol: 'json-rpc-lite',
      },
    })
  }

  private async handleMcpSetEnabled(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    if (typeof payload.enabled !== 'boolean') {
      throw createProtocolFailure(
        'invalid_params',
        'Expected boolean at params.enabled',
      )
    }
    return this.mcpCore.setEnabled({
      serverName: expectString(payload.serverName, 'params.serverName'),
      enabled: payload.enabled,
      metadata: {
        ...optionalRecord(payload.metadata),
        protocol: 'json-rpc-lite',
      },
    })
  }

  private async handleMcpReload(): Promise<unknown> {
    return this.mcpCore.reload()
  }

  private async handleHooksList(): Promise<unknown> {
    return this.extensionCore.listHooks()
  }

  private async handleHooksReload(): Promise<unknown> {
    return this.extensionCore.reloadHooks()
  }

  private async handleHooksRun(params: unknown): Promise<unknown> {
    return this.extensionCore.runHook(
      expectRecord(params, 'params') as unknown as RuntimeHookRunRequest,
    )
  }

  private async handleHooksRegister(params: unknown): Promise<unknown> {
    return this.extensionCore.registerHook(
      expectRecord(params, 'params') as unknown as RuntimeHookRegisterRequest,
    )
  }

  private async handleSkillsList(): Promise<unknown> {
    return this.extensionCore.listSkills()
  }

  private async handleSkillsReload(): Promise<unknown> {
    return this.extensionCore.reloadSkills()
  }

  private async handleSkillsContextResolve(params: unknown): Promise<unknown> {
    return this.extensionCore.resolveSkillContext(
      expectRecord(
        params,
        'params',
      ) as unknown as RuntimeSkillPromptContextRequest,
    )
  }

  private async handlePluginsList(): Promise<unknown> {
    return this.extensionCore.listPlugins()
  }

  private async handlePluginsReload(): Promise<unknown> {
    return this.extensionCore.reloadPlugins()
  }

  private async handlePluginsSetEnabled(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    if (typeof payload.enabled !== 'boolean') {
      throw createProtocolFailure(
        'invalid_params',
        'Expected boolean at params.enabled',
      )
    }
    return this.extensionCore.setPluginEnabled({
      name: expectString(payload.name, 'params.name'),
      enabled: payload.enabled,
      scope: optionalRuntimeObject(payload.scope),
      metadata: optionalRecord(payload.metadata),
    })
  }

  private async handlePluginsInstall(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.extensionCore.installPlugin({
      name: expectString(payload.name, 'params.name'),
      scope: optionalRuntimeObject(payload.scope),
      metadata: optionalRecord(payload.metadata),
    })
  }

  private async handlePluginsUninstall(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.extensionCore.uninstallPlugin({
      name: expectString(payload.name, 'params.name'),
      scope: optionalRuntimeObject(payload.scope),
      keepData: optionalBoolean(payload.keepData),
      metadata: optionalRecord(payload.metadata),
    })
  }

  private async handlePluginsUpdate(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.extensionCore.updatePlugin({
      name: expectString(payload.name, 'params.name'),
      scope: optionalRuntimeObject(payload.scope),
      metadata: optionalRecord(payload.metadata),
    })
  }

  private async handleContextRead(params: unknown): Promise<unknown> {
    const payload = optionalRecord(params, 'params') ?? {}
    return this.contextCore.readContext({
      cwd: optionalString(payload.cwd),
    })
  }

  private async handleContextGitStatus(params: unknown): Promise<unknown> {
    const payload = optionalRecord(params, 'params') ?? {}
    return {
      gitStatus: await this.contextCore.getGitStatus({
        cwd: optionalString(payload.cwd),
      }),
    }
  }

  private async handleContextSystemPromptGet(
    params: unknown,
  ): Promise<unknown> {
    const payload = optionalRecord(params, 'params') ?? {}
    return {
      value: await this.contextCore.getSystemPromptInjection({
        cwd: optionalString(payload.cwd),
      }),
    }
  }

  private async handleContextSystemPromptSet(
    params: unknown,
  ): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return {
      value: await this.contextCore.setSystemPromptInjection(
        optionalNullableString(payload.value, 'params.value'),
        {
          cwd: optionalString(payload.cwd),
        },
      ),
    }
  }

  private async handleMemoryList(params: unknown): Promise<unknown> {
    const payload = optionalRecord(params, 'params') ?? {}
    return this.memoryCore.listMemory({
      cwd: optionalString(payload.cwd),
    })
  }

  private async handleMemoryRead(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.memoryCore.readMemory(expectString(payload.id, 'params.id'), {
      cwd: optionalString(payload.cwd),
    })
  }

  private async handleMemoryUpdate(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.memoryCore.updateMemory(
      {
        id: expectString(payload.id, 'params.id'),
        content: expectString(payload.content, 'params.content'),
      },
      {
        cwd: optionalString(payload.cwd),
      },
    )
  }

  private async handleAgentsList(): Promise<unknown> {
    return this.agentCore.listAgents()
  }

  private async handleAgentsReload(): Promise<unknown> {
    return this.agentCore.reloadAgents()
  }

  private async handleAgentsSpawn(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.agentCore.spawnAgent({
      agentType: optionalString(payload.agentType),
      prompt: expectString(payload.prompt, 'params.prompt'),
      description: optionalString(payload.description),
      model: optionalString(payload.model),
      runInBackground: optionalBoolean(payload.runInBackground),
      taskId: optionalString(payload.taskId),
      taskListId: optionalString(payload.taskListId),
      ownedFiles: optionalStringArray(payload.ownedFiles, 'params.ownedFiles'),
      name: optionalString(payload.name),
      teamName: optionalString(payload.teamName),
      mode: optionalString(payload.mode),
      isolation: optionalRuntimeObject(payload.isolation),
      cwd: optionalString(payload.cwd),
      metadata: optionalRecord(payload.metadata),
    })
  }

  private async handleAgentsRunsList(): Promise<unknown> {
    return this.agentCore.listRuns()
  }

  private async handleAgentsRunsGet(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.agentCore.getRun(expectString(payload.runId, 'params.runId'))
  }

  private async handleAgentsRunsCancel(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.agentCore.cancelRun({
      runId: expectString(payload.runId, 'params.runId'),
      reason: optionalString(payload.reason),
    })
  }

  private async handleAgentsOutputGet(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.agentCore.getOutput({
      runId: expectString(payload.runId, 'params.runId'),
      tailBytes: optionalNumber(payload.tailBytes),
    })
  }

  private async handleTasksList(params: unknown): Promise<unknown> {
    const payload = optionalRecord(params, 'params') ?? {}
    return this.taskCore.listTasks(optionalString(payload.taskListId))
  }

  private async handleTasksGet(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.taskCore.getTask(
      expectString(payload.taskId, 'params.taskId'),
      optionalString(payload.taskListId),
    )
  }

  private async handleTasksCreate(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.taskCore.createTask({
      taskListId: optionalString(payload.taskListId),
      subject: expectString(payload.subject, 'params.subject'),
      description: expectString(payload.description, 'params.description'),
      activeForm: optionalString(payload.activeForm),
      owner: optionalString(payload.owner),
      status: optionalRuntimeObject(payload.status),
      blocks: optionalStringArray(payload.blocks, 'params.blocks'),
      blockedBy: optionalStringArray(payload.blockedBy, 'params.blockedBy'),
      ownedFiles: optionalStringArray(payload.ownedFiles, 'params.ownedFiles'),
      metadata: optionalRecord(payload.metadata),
    })
  }

  private async handleTasksUpdate(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.taskCore.updateTask({
      taskId: expectString(payload.taskId, 'params.taskId'),
      taskListId: optionalString(payload.taskListId),
      subject: optionalString(payload.subject),
      description: optionalString(payload.description),
      activeForm: optionalString(payload.activeForm),
      status: optionalRuntimeObject(payload.status),
      owner: optionalString(payload.owner),
      addBlocks: optionalStringArray(payload.addBlocks, 'params.addBlocks'),
      addBlockedBy: optionalStringArray(
        payload.addBlockedBy,
        'params.addBlockedBy',
      ),
      ownedFiles: optionalStringArray(payload.ownedFiles, 'params.ownedFiles'),
      metadata: optionalRecord(payload.metadata),
    })
  }

  private async handleTasksAssign(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.taskCore.assignTask({
      taskId: expectString(payload.taskId, 'params.taskId'),
      owner: expectString(payload.owner, 'params.owner'),
      taskListId: optionalString(payload.taskListId),
      ownedFiles: optionalStringArray(payload.ownedFiles, 'params.ownedFiles'),
      status: optionalRuntimeObject(payload.status),
      metadata: optionalRecord(payload.metadata),
    })
  }

  private async handleTeamsList(): Promise<unknown> {
    return this.teamCore.listTeams()
  }

  private async handleTeamsGet(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.teamCore.getTeam(
      expectString(payload.teamName, 'params.teamName'),
    )
  }

  private async handleTeamsCreate(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.teamCore.createTeam({
      teamName: expectString(payload.teamName, 'params.teamName'),
      description: optionalString(payload.description),
      leadAgentType: optionalString(payload.leadAgentType),
      leadModel: optionalString(payload.leadModel),
      workspacePath: optionalString(payload.workspacePath),
      leadSessionId: optionalString(payload.leadSessionId),
      allowRename: optionalBoolean(payload.allowRename),
    })
  }

  private async handleTeamsMessage(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.teamCore.sendMessage({
      teamName: expectString(payload.teamName, 'params.teamName'),
      recipient: expectString(payload.recipient, 'params.recipient'),
      message: expectString(payload.message, 'params.message'),
      summary: optionalString(payload.summary),
      sender: optionalString(payload.sender),
    })
  }

  private async handleTeamsDestroy(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.teamCore.destroyTeam({
      teamName: expectString(payload.teamName, 'params.teamName'),
      force: optionalBoolean(payload.force),
    })
  }

  private async handleCompanionStateGet(): Promise<unknown> {
    return this.autonomyCore.getCompanionState()
  }

  private async handleCompanionActionDispatch(
    params: unknown,
  ): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.autonomyCore.dispatchCompanionAction(
      (optionalRuntimeObject(payload.action) ??
        expectRecord(payload.action, 'params.action')) as KernelCompanionAction,
    )
  }

  private async handleCompanionReact(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.autonomyCore.reactCompanion({
      messages: Array.isArray(payload.messages) ? payload.messages : [],
    })
  }

  private async handleKairosStatusGet(): Promise<unknown> {
    return this.autonomyCore.getKairosStatus()
  }

  private async handleKairosEventEnqueue(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.autonomyCore.enqueueKairosEvent(
      (optionalRuntimeObject(payload.event) ??
        expectRecord(
          payload.event,
          'params.event',
        )) as KernelKairosExternalEvent,
    )
  }

  private async handleKairosTick(params: unknown): Promise<unknown> {
    const payload = optionalRecord(params, 'params') ?? {}
    return this.autonomyCore.tickKairos({
      reason: optionalString(payload.reason),
      drain: optionalBoolean(payload.drain),
      createAutonomyCommands: optionalBoolean(payload.createAutonomyCommands),
      basePrompt: optionalString(payload.basePrompt),
      rootDir: optionalString(payload.rootDir),
      currentDir: optionalString(payload.currentDir),
      workload: optionalString(payload.workload),
      priority: optionalRuntimeObject(payload.priority),
    })
  }

  private async handleKairosSuspend(params: unknown): Promise<unknown> {
    const payload = optionalRecord(params, 'params') ?? {}
    return this.autonomyCore.suspendKairos(optionalString(payload.reason))
  }

  private async handleKairosResume(params: unknown): Promise<unknown> {
    const payload = optionalRecord(params, 'params') ?? {}
    return this.autonomyCore.resumeKairos(optionalString(payload.reason))
  }

  private handleUnsupportedTypedCore(commandId: string): Promise<unknown> {
    return Promise.reject(
      createProtocolFailure(
        'method_not_found',
        `Unsupported typed core method: ${commandId}`,
        {
          commandId,
          protocol: 'json-rpc-lite',
        },
      ),
    )
  }

  private async handleServerResponse(
    message: Extract<ParsedInboundMessage, { kind: 'response' }>,
  ): Promise<void> {
    if (message.id === null) {
      return
    }
    const pending = this.pendingServerRequests.get(String(message.id))
    if (!pending) {
      return
    }

    this.pendingServerRequests.delete(String(message.id))
    if (pending.method !== 'permissions.request') {
      return
    }

    const decision = normalizePermissionDecisionResult(
      String(message.id),
      message,
    )
    this.runtimeCore.decidePermission(decision)
  }

  private handleRuntimeEnvelope(envelope: KernelRuntimeEnvelopeBase): void {
    if (envelope.kind !== 'event') {
      return
    }

    const kernelEvent = optionalRecord(envelope.payload) as
      | KernelEvent
      | undefined
    if (
      kernelEvent?.type === 'permission.requested' &&
      kernelEvent.payload !== undefined
    ) {
      const permissionRequest = kernelEvent.payload as KernelPermissionRequest
      const requestId = permissionRequest.permissionRequestId
      if (!this.pendingServerRequests.has(requestId)) {
        this.pendingServerRequests.set(requestId, {
          method: 'permissions.request',
        })
        this.emitOutboundMessage(
          {
            id: requestId,
            method: 'permissions.request',
            params: {
              commandId: 'tools.call',
              tool: permissionRequest.toolName,
              input: permissionRequest.argumentsPreview,
              timeoutMs: permissionRequest.timeoutMs ?? 60000,
              defaultDecision: 'deny',
              rememberScopes: ['once', 'session'],
              risk: {
                level: permissionRequest.risk,
                reason: permissionRequest.action,
              },
              sessionId: permissionRequest.conversationId,
              turnId: permissionRequest.turnId ?? null,
            },
          },
          { immediate: true },
        )
      }
    }

    for (const subscription of this.subscriptions.values()) {
      const outbound = this.projectEventNotification(envelope, subscription)
      if (outbound) {
        this.emitOutboundMessage(outbound)
      }
    }
  }

  private projectEventNotification(
    envelope: KernelRuntimeEnvelopeBase,
    subscription: ProtocolSubscription,
  ): JsonRpcLiteNotificationMessage | null {
    const payload = optionalRecord(envelope.payload) as KernelEvent | undefined
    if (!payload || typeof payload.type !== 'string') {
      return null
    }
    const sessionId =
      optionalString(payload.conversationId) ?? envelope.conversationId
    const turnId = optionalString(payload.turnId) ?? envelope.turnId
    if (subscription.sessionId && subscription.sessionId !== sessionId) {
      return null
    }
    if (subscription.turnId && subscription.turnId !== turnId) {
      return null
    }
    if (subscription.types && !subscription.types.has(payload.type)) {
      return null
    }
    return {
      method: 'event',
      params: {
        eventId: envelope.eventId ?? payload.eventId ?? envelope.messageId,
        sequence: envelope.sequence,
        runtimeId: envelope.runtimeId,
        sessionId: sessionId ?? null,
        turnId: turnId ?? null,
        type: payload.type,
        payload: payload.payload ?? {},
        timestamp: envelope.timestamp,
        metadata: payload.metadata ?? envelope.metadata,
      },
    }
  }

  private emitReplayNotifications(
    replay: readonly KernelRuntimeEnvelopeBase[],
  ): void {
    for (const envelope of replay) {
      for (const subscription of this.subscriptions.values()) {
        const outbound = this.projectEventNotification(envelope, subscription)
        if (outbound) {
          this.emitOutboundMessage(outbound)
        }
      }
    }
  }

  private findCommandRecordFromDescribeParams(
    params: unknown,
  ): Promise<ProtocolCommandRecord> {
    const payload = expectRecord(params, 'params')
    const commandId = expectString(payload.commandId, 'params.commandId')
    return this.findCommandRecord(commandId)
  }

  private async findCommandRecord(
    commandId: string,
  ): Promise<ProtocolCommandRecord> {
    const graph = await this.buildCommandGraph()
    const record = findCommandRecord(graph, commandId)
    if (!record) {
      throw createProtocolFailure(
        'not_found',
        `Unknown command graph node: ${commandId}`,
      )
    }
    return record
  }

  private emitOutboundMessage(
    message: JsonRpcLiteOutboundMessage,
    options: { immediate?: boolean } = {},
  ): void {
    if (!options.immediate && this.deliveryBarrierCount > 0) {
      this.bufferedOutboundMessages.push(message)
      return
    }
    this.writeOutboundMessage(message)
  }

  private flushBufferedOutboundMessages(): void {
    if (
      this.deliveryBarrierCount > 0 ||
      this.bufferedOutboundMessages.length === 0
    ) {
      return
    }
    for (const message of this.bufferedOutboundMessages.splice(0)) {
      this.writeOutboundMessage(message)
    }
  }

  private writeOutboundMessage(message: JsonRpcLiteOutboundMessage): void {
    this.output.write(`${JSON.stringify(message)}\n`)
  }

  private createInternalRequestId(scope: string): string {
    return `json-rpc-lite:${scope}:${this.nextInternalRequestNumber++}`
  }

  private toInternalRequestId(
    message:
      | ({ kind: 'request' } & JsonRpcLiteRequestMessage)
      | ({ kind: 'notification' } & JsonRpcLiteNotificationMessage),
  ): string {
    if (message.kind === 'request') {
      return `json-rpc-lite:${String(message.id)}`
    }
    return this.createInternalRequestId(message.method)
  }

  private async requireCapability(
    name: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.runtimeCore.capabilityResolver.requireCapability(name, {
      cwd: this.runtimeCore.workspacePath,
      metadata: {
        protocol: 'json-rpc-lite',
        ...metadata,
      },
    })
  }
}

function typedCoreCommandEntries(): Map<string, ProtocolCommandRecord> {
  const entries = new Map<string, ProtocolCommandRecord>()
  for (const definition of TYPED_CORE_COMMAND_DEFINITIONS) {
    entries.set(definition.description.commandId, definition)
  }
  return entries
}

function typedCoreMethodIds(): readonly string[] {
  return TYPED_CORE_COMMAND_DEFINITIONS.map(
    definition => definition.description.commandId,
  )
}

function typedCoreAcceptedMethodIds(): readonly string[] {
  return TYPED_CORE_COMMAND_DEFINITIONS.flatMap(definition => [
    definition.description.commandId,
    ...definition.description.aliases,
  ])
}

const TYPED_CORE_COMMAND_DEFINITIONS: readonly ProtocolCommandRecord[] = [
  createTypedCommand('runtime.ping', 'Check runtime liveness', {
    aliases: ['ping'],
    streaming: { supported: false, events: [] },
    examples: [{ params: {} }],
  }),
  createTypedCommand(
    'runtime.initialize',
    'Initialize runtime transport state',
    {
      aliases: ['init_runtime'],
      streaming: { supported: true, events: ['runtime.ready'] },
      examples: [
        { params: { client: { name: 'my-client', version: '0.1.0' } } },
      ],
    },
  ),
  createTypedCommand(
    'runtime.capabilities',
    'Describe supported protocol capabilities',
  ),
  createTypedCommand(
    'runtime.reloadCapabilities',
    'Reload runtime capabilities',
    {
      aliases: ['reload_capabilities'],
      streaming: { supported: true, events: ['capabilities.reloaded'] },
    },
  ),
  createTypedCommand('host.connect', 'Connect a runtime host', {
    aliases: ['connect_host'],
    streaming: {
      supported: true,
      events: ['host.connected', 'host.reconnected'],
    },
  }),
  createTypedCommand('host.disconnect', 'Disconnect a runtime host', {
    aliases: ['disconnect_host'],
    streaming: { supported: true, events: ['host.disconnected'] },
  }),
  createTypedCommand('host.event.publish', 'Publish a host event', {
    aliases: ['publish_host_event'],
    streaming: { supported: true, events: ['event'] },
  }),
  createTypedCommand('sessions.list', 'List resumable session transcripts', {
    aliases: ['list_sessions'],
  }),
  createTypedCommand('sessions.create', 'Create a runtime session', {
    aliases: ['create_conversation'],
    examples: [{ params: { sessionId: 's1', workspacePath: '/workspace' } }],
  }),
  createTypedCommand('sessions.resume', 'Resume a stored session transcript', {
    aliases: ['resume_session'],
    examples: [{ params: { sessionId: 'transcript-session-id' } }],
  }),
  createTypedCommand('sessions.dispose', 'Dispose an active runtime session', {
    aliases: ['dispose_conversation'],
    examples: [{ params: { sessionId: 's1' } }],
  }),
  createTypedCommand(
    'sessions.transcript',
    'Read a stored session transcript',
    {
      aliases: ['get_session_transcript'],
      examples: [{ params: { sessionId: 'transcript-session-id' } }],
    },
  ),
  createTypedCommand('turn.run', 'Run one conversation turn', {
    aliases: ['conversation.run', 'run_turn'],
    streaming: {
      supported: true,
      events: [
        'turn.started',
        'turn.output_delta',
        'turn.delta',
        'turn.progress',
        'turn.completed',
        'turn.failed',
      ],
    },
    examples: [{ params: { sessionId: 's1', prompt: 'hello' } }],
  }),
  createTypedCommand('turn.abort', 'Abort an active turn', {
    aliases: ['abort_turn'],
    examples: [{ params: { sessionId: 's1', turnId: 't1' } }],
  }),
  createTypedCommand('events.subscribe', 'Subscribe to runtime events', {
    aliases: ['subscribe_events'],
    streaming: { supported: true, events: ['event'] },
    examples: [
      {
        params: {
          cursor: 'evt-1',
          filter: {
            sessionId: 's1',
            turnId: 't1',
            types: ['turn.delta'],
          },
        },
      },
    ],
  }),
  createTypedCommand('events.unsubscribe', 'Cancel an event subscription'),
  createTypedCommand('tools.list', 'List available tools', {
    aliases: ['list_tools'],
  }),
  createTypedCommand('tools.describe', 'Describe one available tool', {
    examples: [{ params: { toolName: 'Bash' } }],
  }),
  createTypedCommand('tools.call', 'Call one tool', {
    aliases: ['call_tool'],
    permissionRisk: {
      level: 'high',
      requiresApproval: true,
      scopes: ['once', 'session'],
      reason: 'May execute external tools with side effects',
    },
    examples: [
      {
        params: {
          toolName: 'Bash',
          input: { command: 'bun test' },
        },
      },
    ],
  }),
  createTypedCommand('permissions.decide', 'Submit a permission decision', {
    aliases: ['decide_permission'],
    permissionRisk: {
      level: 'medium',
      requiresApproval: false,
      scopes: ['once', 'session'],
    },
  }),
  createTypedCommand('mcp.servers.list', 'List MCP servers', {
    aliases: ['list_mcp_servers'],
  }),
  createTypedCommand('mcp.tools.list', 'List MCP tool bindings', {
    aliases: ['list_mcp_tools'],
  }),
  createTypedCommand('mcp.resources.list', 'List MCP resources', {
    aliases: ['list_mcp_resources'],
  }),
  createTypedCommand('mcp.reload', 'Reload MCP registry', {
    aliases: ['reload_mcp'],
    streaming: { supported: true, events: ['mcp.reloaded'] },
  }),
  createTypedCommand('mcp.connect', 'Connect an MCP server', {
    aliases: ['connect_mcp'],
  }),
  createTypedCommand('mcp.authenticate', 'Authenticate an MCP server', {
    aliases: ['authenticate_mcp'],
  }),
  createTypedCommand('mcp.setEnabled', 'Enable or disable an MCP server', {
    aliases: ['set_mcp_enabled'],
  }),
  createTypedCommand('hooks.list', 'List runtime hooks', {
    aliases: ['list_hooks'],
  }),
  createTypedCommand('hooks.reload', 'Reload runtime hooks', {
    aliases: ['reload_hooks'],
    streaming: { supported: true, events: ['hooks.reloaded'] },
  }),
  createTypedCommand('hooks.run', 'Run runtime hooks', {
    aliases: ['run_hook'],
    streaming: { supported: true, events: ['hooks.ran'] },
  }),
  createTypedCommand('hooks.register', 'Register a runtime hook', {
    aliases: ['register_hook'],
    streaming: { supported: true, events: ['hooks.registered'] },
  }),
  createTypedCommand('skills.list', 'List runtime skills', {
    aliases: ['list_skills'],
  }),
  createTypedCommand('skills.reload', 'Reload runtime skills', {
    aliases: ['reload_skills'],
    streaming: { supported: true, events: ['skills.reloaded'] },
  }),
  createTypedCommand('skills.context.resolve', 'Resolve skill prompt context', {
    aliases: ['resolve_skill_context'],
    streaming: { supported: true, events: ['skills.context_resolved'] },
  }),
  createTypedCommand('plugins.list', 'List runtime plugins', {
    aliases: ['list_plugins'],
  }),
  createTypedCommand('plugins.reload', 'Reload runtime plugins', {
    aliases: ['reload_plugins'],
    streaming: { supported: true, events: ['plugins.reloaded'] },
  }),
  createTypedCommand('plugins.setEnabled', 'Enable or disable a plugin', {
    aliases: ['set_plugin_enabled'],
    streaming: { supported: true, events: ['plugins.enabled_changed'] },
  }),
  createTypedCommand('plugins.install', 'Install a plugin', {
    aliases: ['install_plugin'],
    permissionRisk: {
      level: 'high',
      requiresApproval: true,
      scopes: ['workspace'],
      reason: 'May install code into the runtime environment',
    },
    streaming: { supported: true, events: ['plugins.installed'] },
  }),
  createTypedCommand('plugins.uninstall', 'Uninstall a plugin', {
    aliases: ['uninstall_plugin'],
    permissionRisk: {
      level: 'high',
      requiresApproval: true,
      scopes: ['workspace'],
      reason: 'May remove plugin code or metadata',
    },
    streaming: { supported: true, events: ['plugins.uninstalled'] },
  }),
  createTypedCommand('plugins.update', 'Update a plugin', {
    aliases: ['update_plugin'],
    permissionRisk: {
      level: 'high',
      requiresApproval: true,
      scopes: ['workspace'],
      reason: 'May update code in the runtime environment',
    },
    streaming: { supported: true, events: ['plugins.updated'] },
  }),
  createTypedCommand('agents.list', 'List available agents', {
    aliases: ['list_agents'],
  }),
  createTypedCommand('agents.reload', 'Reload available agents', {
    aliases: ['reload_agents'],
    streaming: { supported: true, events: ['agents.reloaded'] },
  }),
  createTypedCommand('agents.spawn', 'Spawn one agent', {
    aliases: ['spawn_agent'],
  }),
  createTypedCommand('agents.runs.list', 'List agent runs', {
    aliases: ['list_agent_runs'],
  }),
  createTypedCommand('agents.runs.get', 'Read one agent run', {
    aliases: ['get_agent_run'],
  }),
  createTypedCommand('agents.runs.cancel', 'Cancel one agent run', {
    aliases: ['cancel_agent_run'],
  }),
  createTypedCommand('agents.output.get', 'Read agent output', {
    aliases: ['get_agent_output'],
  }),
  createTypedCommand('tasks.list', 'List tasks', {
    aliases: ['list_tasks'],
  }),
  createTypedCommand('tasks.get', 'Read one task', {
    aliases: ['get_task'],
  }),
  createTypedCommand('tasks.create', 'Create a task', {
    aliases: ['create_task'],
  }),
  createTypedCommand('tasks.update', 'Update a task', {
    aliases: ['update_task'],
  }),
  createTypedCommand('tasks.assign', 'Assign a task', {
    aliases: ['assign_task'],
  }),
  createTypedCommand('teams.list', 'List teams', {
    aliases: ['list_teams'],
  }),
  createTypedCommand('teams.get', 'Read one team', {
    aliases: ['get_team'],
  }),
  createTypedCommand('teams.create', 'Create a team', {
    aliases: ['create_team'],
  }),
  createTypedCommand('teams.message', 'Send a team message', {
    aliases: ['send_team_message'],
  }),
  createTypedCommand('teams.destroy', 'Destroy a team', {
    aliases: ['destroy_team'],
  }),
  createTypedCommand('companion.state.get', 'Read companion state', {
    aliases: ['get_companion_state'],
  }),
  createTypedCommand(
    'companion.action.dispatch',
    'Dispatch a companion action',
    {
      aliases: ['dispatch_companion_action'],
    },
  ),
  createTypedCommand('companion.react', 'React companion to a turn', {
    aliases: ['react_companion'],
  }),
  createTypedCommand('kairos.status.get', 'Read Kairos status', {
    aliases: ['get_kairos_status'],
  }),
  createTypedCommand(
    'kairos.event.enqueue',
    'Enqueue a Kairos external event',
    {
      aliases: ['enqueue_kairos_event'],
    },
  ),
  createTypedCommand('kairos.tick', 'Tick Kairos runtime', {
    aliases: ['tick_kairos'],
  }),
  createTypedCommand('kairos.suspend', 'Suspend Kairos runtime', {
    aliases: ['suspend_kairos'],
  }),
  createTypedCommand('kairos.resume', 'Resume Kairos runtime', {
    aliases: ['resume_kairos'],
  }),
  createTypedCommand('context.read', 'Read assembled context', {
    aliases: ['read_context'],
  }),
  createTypedCommand('context.gitStatus', 'Read git status context', {
    aliases: ['get_context_git_status'],
  }),
  createTypedCommand(
    'context.systemPrompt.get',
    'Get system prompt injection',
    {
      aliases: ['get_system_prompt_injection'],
    },
  ),
  createTypedCommand(
    'context.systemPrompt.set',
    'Set system prompt injection',
    {
      aliases: ['set_system_prompt_injection'],
    },
  ),
  createTypedCommand('memory.list', 'List memory documents', {
    aliases: ['list_memory'],
  }),
  createTypedCommand('memory.read', 'Read one memory document', {
    aliases: ['read_memory'],
  }),
  createTypedCommand('memory.update', 'Update memory documents', {
    aliases: ['update_memory'],
  }),
].map(definition => ({
  ...definition,
  execute(server, params, requestId) {
    return server.runTypedCoreCommand(
      definition.description.commandId,
      params,
      requestId,
    )
  },
}))

function createTypedCommand(
  commandId: string,
  summary: string,
  overrides: Partial<ProtocolCommandDescription> = {},
): ProtocolCommandRecord {
  return {
    description: {
      commandId,
      aliases: overrides.aliases ?? [],
      summary,
      inputSchema: overrides.inputSchema ?? {
        type: 'object',
        additionalProperties: true,
      },
      resultSchema: overrides.resultSchema ?? {
        type: 'object',
        additionalProperties: true,
      },
      permissionRisk: overrides.permissionRisk ?? {
        level: 'low',
        requiresApproval: false,
        scopes: ['session', 'workspace'],
      },
      streaming: overrides.streaming ?? {
        supported: false,
        events: [],
      },
      deprecated: overrides.deprecated ?? false,
      examples: overrides.examples ?? [],
      source: overrides.source ?? 'typed-core',
    },
    async execute() {
      return {}
    },
  }
}

function findCommandRecord(
  graph: ReadonlyMap<string, ProtocolCommandRecord>,
  commandId: string,
): ProtocolCommandRecord | undefined {
  const direct = graph.get(commandId)
  if (direct) {
    return direct
  }
  for (const record of graph.values()) {
    if (record.description.aliases.includes(commandId)) {
      return record
    }
  }
  return undefined
}

function permissionRiskForCliCommand(
  entry: RuntimeCommandGraphEntry,
): ProtocolPermissionRisk {
  const descriptor = entry.descriptor
  const requiresApproval = Boolean(
    descriptor.sensitive || descriptor.terminalOnly,
  )
  return {
    level: commandKindRiskLevel(descriptor.kind, descriptor.sensitive),
    requiresApproval,
    scopes: ['session', 'workspace'],
    reason: descriptor.whenToUse,
  }
}

function commandKindRiskLevel(
  kind: RuntimeCommandKind,
  sensitive: boolean | undefined,
): ProtocolPermissionRisk['level'] {
  if (sensitive) {
    return 'high'
  }
  if (kind === 'local') {
    return 'medium'
  }
  if (kind === 'workflow') {
    return 'medium'
  }
  return 'low'
}

function toRuntimeCommandGraphEntry(
  description: ProtocolCommandDescription,
): RuntimeCommandGraphEntry {
  return {
    descriptor: {
      name: description.commandId,
      description: description.summary,
      kind: 'workflow',
      aliases: description.aliases,
      sensitive: description.permissionRisk.requiresApproval,
      disableModelInvocation: description.deprecated,
    },
    source: description.source,
    supportsNonInteractive: true,
    modelInvocable: !description.deprecated,
  }
}

function normalizeCliArguments(params: unknown): string | undefined {
  if (params === undefined || params === null) {
    return undefined
  }
  if (typeof params === 'string') {
    return params
  }
  const record = expectRecord(params, 'params.arguments')
  if (typeof record.args === 'string') {
    return record.args
  }
  throw createProtocolFailure(
    'invalid_params',
    'CLI graph commands require arguments as a string or { args: string }',
  )
}

function normalizeCommandExecutionArguments(
  payload: Record<string, unknown>,
): string | undefined {
  if (Object.hasOwn(payload, 'arguments')) {
    return normalizeCliArguments(payload.arguments)
  }
  if (Object.hasOwn(payload, 'args')) {
    return normalizeCliArguments(payload.args)
  }
  return undefined
}

function normalizeCliExecutionOptions(params: unknown): {
  args?: string
  source?: RuntimeCommandExecuteRequest['source']
  metadata?: Record<string, unknown>
} {
  if (typeof params === 'string') {
    return { args: params }
  }
  const payload = expectRecord(params, 'params')
  return {
    args: normalizeCommandExecutionArguments(payload),
    source: optionalCommandSource(payload.source),
    metadata: optionalRecord(payload.metadata),
  }
}

function optionalCommandSource(
  value: unknown,
): RuntimeCommandExecuteRequest['source'] | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  switch (value) {
    case 'cli':
    case 'repl':
    case 'bridge':
    case 'daemon':
    case 'sdk':
    case 'test':
      return value
    default:
      throw createProtocolFailure(
        'invalid_params',
        `Unsupported command execution source: ${value}`,
      )
  }
}

function normalizePermissionDecisionResult(
  permissionRequestId: string,
  message: {
    result?: unknown
    error?: unknown
  },
): KernelPermissionDecision {
  if (message.error !== undefined) {
    return {
      permissionRequestId,
      decision: 'deny',
      decidedBy: 'host',
      reason: extractErrorMessage(message.error),
    }
  }

  const payload = expectRecord(message.result, 'result')
  const decisionValue = expectString(payload.decision, 'result.decision')
  const rememberScope = optionalString(payload.rememberScope)
  const decision = mapPermissionDecisionValue(decisionValue, rememberScope)
  const normalized: KernelPermissionDecision = {
    permissionRequestId,
    decision,
    decidedBy: 'host',
  }
  const reason = optionalString(payload.reason)
  if (reason !== undefined) {
    normalized.reason = reason
  }
  const expiresAt = optionalString(payload.expiresAt)
  if (expiresAt !== undefined) {
    normalized.expiresAt = expiresAt
  }
  const metadata = optionalRecord(payload.metadata)
  if (metadata !== undefined || rememberScope !== undefined) {
    normalized.metadata = {
      ...(metadata ?? {}),
      rememberScope,
    }
  }
  return normalized
}

function mapPermissionDecisionValue(
  decision: string,
  rememberScope: string | undefined,
): KernelPermissionDecisionValue {
  switch (decision) {
    case 'allow':
      return rememberScope === 'session' ? 'allow_session' : 'allow_once'
    case 'deny':
      return 'deny'
    case 'abort':
      return 'abort'
    default:
      throw createProtocolFailure(
        'invalid_params',
        `Unsupported permission decision: ${decision}`,
      )
  }
}

function parseJsonRpcLiteMessage(line: string): ParsedInboundMessage {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    throw createProtocolFailure('parse_error', 'Invalid JSON')
  }

  const payload = expectRecord(parsed, 'message')
  const keys = Object.keys(payload)
  for (const key of keys) {
    if (!JSON_RPC_LITE_ALLOWED_FIELDS.has(key)) {
      throw createProtocolFailure(
        'invalid_request',
        `Unsupported top-level field: ${key}`,
      )
    }
  }

  const hasMethod = Object.hasOwn(payload, 'method')
  const hasId = Object.hasOwn(payload, 'id')
  const hasResult = Object.hasOwn(payload, 'result')
  const hasError = Object.hasOwn(payload, 'error')

  if (hasMethod) {
    const method = expectString(payload.method, 'message.method')
    if (hasResult || hasError) {
      throw createProtocolFailure(
        'invalid_request',
        'Requests and notifications cannot include result or error',
      )
    }
    if (!hasId) {
      return {
        kind: 'notification',
        method,
        params: payload.params,
      }
    }
    const id = parseRequestId(payload.id, 'message.id')
    return {
      kind: 'request',
      id,
      method,
      params: payload.params,
    }
  }

  if (!hasId || hasMethod || hasResult === hasError) {
    throw createProtocolFailure(
      'invalid_request',
      'Invalid JSON-RPC-lite message shape',
    )
  }

  return {
    kind: 'response',
    id: parseResponseId(payload.id),
    result: payload.result,
    error: payload.error,
  }
}

function tryExtractRequestId(line: string): JsonRpcLiteResponseId {
  try {
    const parsed = JSON.parse(line)
    if (!isRecord(parsed)) {
      return null
    }
    const id = parsed.id
    return id === null || typeof id === 'string' || typeof id === 'number'
      ? id
      : null
  } catch {
    return null
  }
}

function parseRequestId(value: unknown, path: string): JsonRpcLiteRequestId {
  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }
  throw createProtocolFailure(
    'invalid_request',
    `Invalid request id at ${path}`,
  )
}

function parseResponseId(value: unknown): JsonRpcLiteResponseId {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return value
  }
  throw createProtocolFailure('invalid_request', 'Invalid response id')
}

function createProtocolErrorResponse(
  id: JsonRpcLiteResponseId,
  error: ProtocolFailure,
): JsonRpcLiteResponseMessage {
  return {
    id,
    error: {
      code: error.code,
      message: error.message,
      data: error.data,
    },
  }
}

type ProtocolFailure = {
  code: string
  message: string
  data?: Record<string, unknown>
}

function createProtocolFailure(
  code: string,
  message: string,
  data?: Record<string, unknown>,
): ProtocolFailure {
  return { code, message, data }
}

function normalizeProtocolFailure(
  error: unknown,
  fallbackCode: string,
): ProtocolFailure {
  if (isProtocolFailure(error)) {
    return error
  }
  if (error instanceof RuntimeCapabilityUnavailableError) {
    return createProtocolFailure('unavailable', error.message, {
      capabilityName: error.capabilityName,
      code: error.code,
    })
  }
  if (
    error instanceof ConversationCoreError ||
    error instanceof CommandGraphCoreError ||
    error instanceof ToolCoreError ||
    error instanceof McpCoreError ||
    error instanceof AgentCoreError ||
    error instanceof TaskCoreError ||
    error instanceof TeamCoreError ||
    error instanceof ExtensionCoreError ||
    error instanceof RuntimeCoreError
  ) {
    return createProtocolFailure(error.code, error.message, error.data)
  }
  if (error instanceof Error) {
    return createProtocolFailure(fallbackCode, error.message)
  }
  return createProtocolFailure(fallbackCode, String(error))
}

function isProtocolFailure(error: unknown): error is ProtocolFailure {
  return (
    isRecord(error) &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  )
}

function extractErrorMessage(error: unknown): string {
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (isRecord(value)) {
    return value
  }
  throw createProtocolFailure('invalid_params', `Expected object at ${path}`)
}

function optionalRecord(
  value: unknown,
  path?: string,
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined
  }
  if (isRecord(value)) {
    return value
  }
  if (path) {
    throw createProtocolFailure('invalid_params', `Expected object at ${path}`)
  }
  return undefined
}

function expectString(value: unknown, path: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  throw createProtocolFailure(
    'invalid_params',
    `Expected non-empty string at ${path}`,
  )
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null
  }
  if (typeof value === 'string') {
    return value
  }
  throw createProtocolFailure(
    'invalid_params',
    `Expected string or null at ${path}`,
  )
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function optionalHostDisconnectPolicy(
  value: unknown,
): 'detach' | 'continue' | 'abort_active_turns' | undefined {
  if (value === undefined) {
    return undefined
  }
  if (
    value === 'detach' ||
    value === 'continue' ||
    value === 'abort_active_turns'
  ) {
    return value
  }
  throw createProtocolFailure(
    'invalid_params',
    'Unsupported host disconnect policy',
  )
}

function optionalStringArray(
  value: unknown,
  path: string,
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    return value
  }
  throw createProtocolFailure(
    'invalid_params',
    `Expected string array at ${path}`,
  )
}

function optionalRuntimeObject<T>(value: unknown): T | undefined {
  return value as T | undefined
}

function normalizeTurnPrompt(
  value: unknown,
): KernelTurnRunRequest['prompt'] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value
  }
  throw createProtocolFailure(
    'invalid_params',
    'params.prompt must be a string or an array of content blocks',
  )
}

function expectHostIdentity(value: unknown): never {
  expectRecord(value, 'params.host')
  throw createProtocolFailure('invalid_params', 'Invalid runtime host identity')
}

function expectEvent(value: unknown): never {
  expectRecord(value, 'params.event')
  throw createProtocolFailure('invalid_params', 'Invalid runtime event')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
