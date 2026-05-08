import { createInterface } from 'readline'
import type { Readable, Writable } from 'stream'

import type {
  RuntimeCommandGraphEntry,
  RuntimeCommandKind,
} from '../runtime/contracts/command.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../runtime/contracts/events.js'
import type {
  KernelPermissionDecision,
  KernelPermissionDecisionValue,
  KernelPermissionRequest,
} from '../runtime/contracts/permissions.js'
import type { RuntimeProviderSelection } from '../runtime/contracts/provider.js'
import type { RuntimeToolDescriptor } from '../runtime/contracts/tool.js'
import type { KernelTurnRunRequest } from '../runtime/contracts/turn.js'
import {
  AgentCoreError,
  AgentCoreService,
} from './agentCoreService.js'
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
import type { KernelMemoryManager } from './memory.js'
import {
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
import {
  ToolCoreError,
  ToolCoreService,
  type ToolCoreCatalog,
} from './toolCoreService.js'
import {
  TaskCoreError,
  TaskCoreService,
} from './taskCoreService.js'
import {
  TeamCoreError,
  TeamCoreService,
} from './teamCoreService.js'
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
  | ({
      kind: 'response'
      id: JsonRpcLiteResponseId
      result?: unknown
      error?: unknown
    })

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
      const result = await this.dispatchRequest(message.method, message.params, {
        requestId: this.toInternalRequestId(message),
      })
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
        return this.handleCommandsList()
      case 'commands.describe':
        return this.handleCommandsDescribe(params)
      case 'commands.execute':
        return this.handleCommandsExecute(params, context.requestId)
      default:
        return this.executeGraphCommand(method, params, context.requestId)
    }
  }

  private async handleCommandsList(): Promise<{
    commands: ProtocolCommandDescription[]
  }> {
    const graph = await this.buildCommandGraph()
    return {
      commands: [...graph.values()].map(record => record.description),
    }
  }

  private async handleCommandsDescribe(
    params: unknown,
  ): Promise<ProtocolCommandDescription> {
    const record = await this.findCommandRecordFromDescribeParams(params)
    return record.description
  }

  private async handleCommandsExecute(
    params: unknown,
    requestId: string,
  ): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    const commandId = expectString(payload.commandId, 'params.commandId')
    const graph = await this.buildCommandGraph()
    const record = findCommandRecord(graph, commandId)
    if (!record) {
      throw createProtocolFailure(
        'not_found',
        `Unknown command graph node: ${commandId}`,
      )
    }
    return record.execute(this, payload.arguments, requestId)
  }

  private async executeGraphCommand(
    commandId: string,
    params: unknown,
    requestId: string,
  ): Promise<unknown> {
    const graph = await this.buildCommandGraph()
    const record = graph.get(commandId)
    if (!record) {
      throw createProtocolFailure(
        'method_not_found',
        `Unsupported method: ${commandId}`,
      )
    }
    return record.execute(this, params, requestId)
  }

  private async buildCommandGraph(): Promise<Map<string, ProtocolCommandRecord>> {
    const graph = new Map<string, ProtocolCommandRecord>()

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
        const args = normalizeCliArguments(params)
        return this.commandGraphCore.executeCommand({
          name: commandId,
          args,
          metadata: {
            protocol: 'json-rpc-lite',
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
      case 'context.read':
        return this.handleContextRead(params)
      case 'context.gitStatus':
        return this.handleContextGitStatus(params)
      case 'memory.list':
        return this.handleMemoryList(params)
      case 'memory.read':
        return this.handleMemoryRead(params)
      case 'memory.update':
        return this.handleMemoryUpdate(params)
      case 'agents.list':
        return this.handleAgentsList()
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
      case 'tasks.create':
        return this.handleTasksCreate(params)
      case 'tasks.update':
        return this.handleTasksUpdate(params)
      case 'tasks.assign':
        return this.handleTasksAssign(params)
      case 'teams.list':
        return this.handleTeamsList()
      case 'teams.create':
        return this.handleTeamsCreate(params)
      case 'teams.message':
        return this.handleTeamsMessage(params)
      case 'teams.destroy':
        return this.handleTeamsDestroy(params)
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
      optionalRuntimeObject<RuntimeProviderSelection>(payload.defaultProvider) ??
      optionalRuntimeObject<RuntimeProviderSelection>(payload.provider)
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
        ...typedCoreMethodIds(),
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

  private async handleSessionsList(params: unknown): Promise<unknown> {
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
    const payload = expectRecord(params, 'params')
    const transcriptSessionId = expectString(payload.sessionId, 'params.sessionId')
    const targetSessionId =
      optionalString(payload.targetSessionId) ??
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
    const payload = expectRecord(params, 'params')
    const sessionId = expectString(payload.sessionId, 'params.sessionId')
    return this.conversationCore.disposeSession({
      sessionId,
      reason: optionalString(payload.reason),
    })
  }

  private async handleSessionsTranscript(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    const sessionId = expectString(payload.sessionId, 'params.sessionId')
    return this.conversationCore.getTranscript(sessionId)
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
    const filter = optionalRecord(payload.filter) ?? {}
    const types =
      Array.isArray(filter.types) &&
      filter.types.every(item => typeof item === 'string')
        ? new Set(filter.types as string[])
        : undefined
    const subscriptionId = `sub-${this.nextSubscriptionNumber++}`
    const subscription: ProtocolSubscription = {
      subscriptionId,
      cursor: optionalString(payload.cursor),
      sessionId: optionalString(filter.sessionId),
      turnId: optionalString(filter.turnId),
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

  private async handleMemoryList(params: unknown): Promise<unknown> {
    const payload = optionalRecord(params, 'params') ?? {}
    return this.memoryCore.listMemory({
      cwd: optionalString(payload.cwd),
    })
  }

  private async handleMemoryRead(params: unknown): Promise<unknown> {
    const payload = expectRecord(params, 'params')
    return this.memoryCore.readMemory(
      expectString(payload.id, 'params.id'),
      {
        cwd: optionalString(payload.cwd),
      },
    )
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

    const kernelEvent = optionalRecord(envelope.payload) as KernelEvent | undefined
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
    const sessionId = optionalString(payload.conversationId) ?? envelope.conversationId
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
    if (this.deliveryBarrierCount > 0 || this.bufferedOutboundMessages.length === 0) {
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

const TYPED_CORE_COMMAND_DEFINITIONS: readonly ProtocolCommandRecord[] = [
  createTypedCommand('runtime.ping', 'Check runtime liveness', {
    streaming: { supported: false, events: [] },
    examples: [{ params: {} }],
  }),
  createTypedCommand('runtime.initialize', 'Initialize runtime transport state', {
    streaming: { supported: true, events: ['runtime.ready'] },
    examples: [{ params: { client: { name: 'my-client', version: '0.1.0' } } }],
  }),
  createTypedCommand('runtime.capabilities', 'Describe supported protocol capabilities'),
  createTypedCommand('sessions.list', 'List resumable session transcripts'),
  createTypedCommand('sessions.create', 'Create a runtime session', {
    examples: [{ params: { sessionId: 's1', workspacePath: '/workspace' } }],
  }),
  createTypedCommand('sessions.resume', 'Resume a stored session transcript', {
    examples: [{ params: { sessionId: 'transcript-session-id' } }],
  }),
  createTypedCommand('sessions.dispose', 'Dispose an active runtime session', {
    examples: [{ params: { sessionId: 's1' } }],
  }),
  createTypedCommand('sessions.transcript', 'Read a stored session transcript', {
    examples: [{ params: { sessionId: 'transcript-session-id' } }],
  }),
  createTypedCommand('turn.run', 'Run one conversation turn', {
    aliases: ['conversation.run'],
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
    examples: [{ params: { sessionId: 's1', turnId: 't1' } }],
  }),
  createTypedCommand('events.subscribe', 'Subscribe to runtime events', {
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
  createTypedCommand('tools.list', 'List available tools'),
  createTypedCommand('tools.describe', 'Describe one available tool', {
    examples: [{ params: { toolName: 'Bash' } }],
  }),
  createTypedCommand('tools.call', 'Call one tool', {
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
    permissionRisk: {
      level: 'medium',
      requiresApproval: false,
      scopes: ['once', 'session'],
    },
  }),
  createTypedCommand('mcp.servers.list', 'List MCP servers'),
  createTypedCommand('mcp.tools.list', 'List MCP tool bindings'),
  createTypedCommand('mcp.resources.list', 'List MCP resources'),
  createTypedCommand('mcp.connect', 'Connect an MCP server'),
  createTypedCommand('mcp.authenticate', 'Authenticate an MCP server'),
  createTypedCommand('mcp.setEnabled', 'Enable or disable an MCP server'),
  createTypedCommand('agents.list', 'List available agents'),
  createTypedCommand('agents.spawn', 'Spawn one agent'),
  createTypedCommand('agents.runs.list', 'List agent runs'),
  createTypedCommand('agents.runs.get', 'Read one agent run'),
  createTypedCommand('agents.runs.cancel', 'Cancel one agent run'),
  createTypedCommand('agents.output.get', 'Read agent output'),
  createTypedCommand('tasks.list', 'List tasks'),
  createTypedCommand('tasks.create', 'Create a task'),
  createTypedCommand('tasks.update', 'Update a task'),
  createTypedCommand('tasks.assign', 'Assign a task'),
  createTypedCommand('teams.list', 'List teams'),
  createTypedCommand('teams.create', 'Create a team'),
  createTypedCommand('teams.message', 'Send a team message'),
  createTypedCommand('teams.destroy', 'Destroy a team'),
  createTypedCommand('context.read', 'Read assembled context'),
  createTypedCommand('context.gitStatus', 'Read git status context'),
  createTypedCommand('memory.list', 'List memory documents'),
  createTypedCommand('memory.read', 'Read one memory document'),
  createTypedCommand('memory.update', 'Update memory documents'),
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
      inputSchema:
        overrides.inputSchema ?? {
          type: 'object',
          additionalProperties: true,
        },
      resultSchema:
        overrides.resultSchema ?? {
          type: 'object',
          additionalProperties: true,
        },
      permissionRisk:
        overrides.permissionRisk ?? {
          level: 'low',
          requiresApproval: false,
          scopes: ['session', 'workspace'],
        },
      streaming:
        overrides.streaming ?? {
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

  if (!hasId || hasMethod || (hasResult === hasError)) {
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
  throw createProtocolFailure('invalid_request', `Invalid request id at ${path}`)
}

function parseResponseId(value: unknown): JsonRpcLiteResponseId {
  if (value === null || typeof value === 'string' || typeof value === 'number') {
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
  if (
    error instanceof ConversationCoreError ||
    error instanceof CommandGraphCoreError ||
    error instanceof ToolCoreError ||
    error instanceof McpCoreError ||
    error instanceof AgentCoreError ||
    error instanceof TaskCoreError ||
    error instanceof TeamCoreError
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
  throw createProtocolFailure(
    'invalid_params',
    `Expected object at ${path}`,
  )
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

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
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

function optionalRuntimeObject<T>(
  value: unknown,
): T | undefined {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
