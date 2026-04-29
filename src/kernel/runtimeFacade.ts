import { randomUUID } from 'crypto'

import type {
  KernelCapabilityDescriptor,
  KernelCapabilityReloadScope,
} from '../runtime/contracts/capability.js'
import type { KernelConversationSnapshot } from '../runtime/contracts/conversation.js'
import type {
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../runtime/contracts/events.js'
import type { KernelPermissionDecision } from '../runtime/contracts/permissions.js'
import type {
  KernelRuntimeHostIdentity,
  KernelRuntimeId,
  KernelRuntimeState,
  KernelRuntimeTransportKind,
} from '../runtime/contracts/runtime.js'
import type { KernelRuntimeCommand } from '../runtime/contracts/wire.js'
import type {
  KernelConversation,
  KernelConversationOptions,
  KernelRuntime,
  KernelRuntimeCapabilities,
  KernelRuntimeCommands,
  KernelRuntimeEventReplayOptions,
  KernelRuntimeMcp,
  KernelRuntimeOptions,
  KernelRuntimePermissions,
  KernelRuntimeTools,
} from './runtime.js'
import {
  createKernelRuntimeAsyncContextFacade,
  createKernelRuntimeCompanionFacade,
  createKernelRuntimeKairosFacade,
  createKernelRuntimeMemoryFacade,
  createKernelRuntimeSessionFacade,
} from './runtimeDeveloperFacades.js'
import {
  createDefaultKernelRuntimeWireRouter,
  createKernelRuntimeInProcessWireTransport,
  createKernelRuntimeStdioWireTransport,
  createKernelRuntimeWireClient,
  type KernelRuntimeWireClient,
  type KernelRuntimeWireTransport,
} from './wireProtocol.js'
import { createKernelRuntimeCapabilitiesFacade } from './runtimeCapabilities.js'
import { createKernelRuntimeAgentsFacade } from './runtimeAgents.js'
import { createKernelRuntimeCommandsFacade } from './runtimeCommands.js'
import { createKernelRuntimeCoordinatorFacade } from './runtimeCoordinator.js'
import { createKernelConversationFacade } from './runtimeConversation.js'
import { createKernelRuntimeHooksFacade } from './runtimeHooks.js'
import { createKernelRuntimeMcpFacade } from './runtimeMcp.js'
import { createKernelRuntimePluginsFacade } from './runtimePlugins.js'
import { createKernelRuntimeSkillsFacade } from './runtimeSkills.js'
import { createKernelRuntimeTasksFacade } from './runtimeTasks.js'
import { createKernelRuntimeTeamsFacade } from './runtimeTeams.js'
import { createKernelRuntimeToolsFacade } from './runtimeTools.js'
import {
  collectReplayEvents,
  expectPayload,
  expectSuccess,
  toCapabilityDescriptors,
} from './runtimeEnvelope.js'

export function createKernelRuntimeFacade(
  options: KernelRuntimeOptions,
): KernelRuntime {
  return new KernelRuntimeFacade(options)
}

class KernelRuntimeFacade implements KernelRuntime {
  readonly id: KernelRuntimeId
  readonly workspacePath: string
  readonly host: KernelRuntimeHostIdentity
  readonly transportKind: KernelRuntimeTransportKind
  readonly capabilities: KernelRuntimeCapabilities
  readonly commands: KernelRuntimeCommands
  readonly tools: KernelRuntimeTools
  readonly mcp: KernelRuntimeMcp
  readonly hooks: KernelRuntime['hooks']
  readonly skills: KernelRuntime['skills']
  readonly plugins: KernelRuntime['plugins']
  readonly agents: KernelRuntime['agents']
  readonly tasks: KernelRuntime['tasks']
  readonly teams: KernelRuntime['teams']
  readonly coordinator: KernelRuntime['coordinator']
  readonly companion: KernelRuntime['companion']
  readonly kairos: KernelRuntime['kairos']
  readonly memory: KernelRuntime['memory']
  readonly context: KernelRuntime['context']
  readonly sessions: KernelRuntime['sessions']
  readonly permissions: KernelRuntimePermissions
  private readonly client: KernelRuntimeWireClient
  private currentState: KernelRuntimeState = 'created'
  private cachedCapabilities: readonly KernelCapabilityDescriptor[] = []

  constructor(options: KernelRuntimeOptions) {
    this.id =
      options.id ?? options.runtimeId ?? `kernel-runtime-${randomUUID()}`
    this.workspacePath = options.workspacePath ?? process.cwd()
    const clientAndTransport = createRuntimeClient(options, this)
    this.client = clientAndTransport.client
    this.transportKind = clientAndTransport.transportKind
    this.host = createRuntimeHostIdentity(options.host, this.transportKind)
    this.capabilities = createKernelRuntimeCapabilitiesFacade(this)
    this.commands = createKernelRuntimeCommandsFacade(this.client)
    this.tools = createKernelRuntimeToolsFacade(this.client)
    this.mcp = createKernelRuntimeMcpFacade(this.client)
    this.hooks = createKernelRuntimeHooksFacade(this.client)
    this.skills = createKernelRuntimeSkillsFacade(this.client)
    this.plugins = createKernelRuntimePluginsFacade(this.client)
    this.agents = createKernelRuntimeAgentsFacade(this.client)
    this.tasks = createKernelRuntimeTasksFacade(this.client)
    this.teams = createKernelRuntimeTeamsFacade({
      client: this.client,
      agents: this.agents,
      tasks: this.tasks,
    })
    this.coordinator = createKernelRuntimeCoordinatorFacade({
      agents: this.agents,
      tasks: this.tasks,
    })
    this.companion = createKernelRuntimeCompanionFacade(this.client)
    this.kairos = createKernelRuntimeKairosFacade(this.client)
    this.memory = createKernelRuntimeMemoryFacade(this.client)
    this.context = createKernelRuntimeAsyncContextFacade(this.client)
    this.sessions = createKernelRuntimeSessionFacade(this.client)
    this.permissions = { decide: decision => this.decidePermission(decision) }
  }

  get state(): KernelRuntimeState {
    return this.currentState
  }

  async start(): Promise<void> {
    if (this.currentState === 'ready') {
      return
    }
    this.assertNotDisposed()
    this.currentState = 'starting'
    try {
      expectSuccess(await this.sendInitRuntime())
      expectSuccess(await this.client.connectHost(this.host))
      this.currentState = 'ready'
    } catch (error) {
      this.currentState = 'failed'
      throw error
    }
  }

  async createConversation(
    options: KernelConversationOptions = {},
  ): Promise<KernelConversation> {
    await this.ensureStarted()
    const response = expectPayload<KernelConversationSnapshot>(
      await this.client.createConversation({
        type: 'create_conversation',
        conversationId: options.id ?? randomUUID(),
        workspacePath: options.workspacePath ?? this.workspacePath,
        sessionId: options.sessionId,
        sessionMeta: options.sessionMeta,
        capabilityIntent: options.capabilityIntent,
        metadata: options.metadata,
      }),
    )
    return createKernelConversationFacade({
      client: this.client,
      snapshot: response,
    })
  }

  async reloadCapabilities(
    scope: KernelCapabilityReloadScope = { type: 'runtime' },
  ): Promise<readonly KernelCapabilityDescriptor[]> {
    await this.ensureStarted()
    const payload = expectPayload<{ descriptors?: unknown }>(
      await this.client.reloadCapabilities({
        type: 'reload_capabilities',
        scope,
      }),
    )
    this.cachedCapabilities = toCapabilityDescriptors(payload.descriptors)
    return this.cachedCapabilities
  }

  async decidePermission(
    decision: KernelPermissionDecision,
  ): Promise<KernelPermissionDecision> {
    await this.ensureStarted()
    return expectPayload<KernelPermissionDecision>(
      await this.client.decidePermission({
        type: 'decide_permission',
        ...decision,
      }),
    )
  }

  onEvent(handler: KernelRuntimeEventSink): () => void {
    return this.client.onEvent(handler)
  }

  replayEvents(
    options: KernelRuntimeEventReplayOptions = {},
  ): Promise<KernelRuntimeEnvelopeBase[]> {
    return collectReplayEvents(this.client, options)
  }

  async dispose(reason = 'runtime_disposed'): Promise<void> {
    if (this.currentState === 'disposed') {
      return
    }
    const shouldDisconnect =
      this.currentState === 'ready' || this.currentState === 'failed'
    this.currentState = 'stopping'
    try {
      if (shouldDisconnect) {
        await disconnectHostBestEffort(this.client, this.host.id, reason)
      }
    } finally {
      await this.client.close()
      this.currentState = 'disposed'
    }
  }

  listCapabilities(): readonly KernelCapabilityDescriptor[] {
    return this.cachedCapabilities
  }

  getCapability(name: string): KernelCapabilityDescriptor | undefined {
    return this.cachedCapabilities.find(descriptor => descriptor.name === name)
  }

  private async ensureStarted(): Promise<void> {
    if (this.currentState === 'ready') {
      return
    }
    await this.start()
  }

  private assertNotDisposed(): void {
    if (this.currentState === 'disposed') {
      throw new Error('Kernel runtime has been disposed')
    }
  }

  private sendInitRuntime(): Promise<KernelRuntimeEnvelopeBase> {
    return this.client.request<
      Extract<KernelRuntimeCommand, { type: 'init_runtime' }>
    >({
      type: 'init_runtime',
      workspacePath: this.workspacePath,
    })
  }
}

function createRuntimeClient(
  options: KernelRuntimeOptions,
  runtime: Pick<KernelRuntimeFacade, 'id' | 'workspacePath'>,
): {
  client: KernelRuntimeWireClient
  transportKind: KernelRuntimeTransportKind
} {
  if (options.wireClient) {
    return {
      client: options.wireClient,
      transportKind:
        options.transport?.kind ??
        options.transportConfig?.kind ??
        options.host?.transport ??
        'in-process',
    }
  }
  const transport =
    options.transport ?? createConfiguredTransport(options, runtime)
  return {
    client: createKernelRuntimeWireClient(transport, options.wireClientOptions),
    transportKind: transport.kind,
  }
}

function createConfiguredTransport(
  options: KernelRuntimeOptions,
  runtime: Pick<KernelRuntimeFacade, 'id' | 'workspacePath'>,
): KernelRuntimeWireTransport {
  if (options.transportConfig?.kind === 'stdio') {
    const { kind: _kind, ...stdioOptions } = options.transportConfig
    return createKernelRuntimeStdioWireTransport(stdioOptions)
  }
  return createInProcessTransport(options, runtime)
}

function createInProcessTransport(
  options: KernelRuntimeOptions,
  runtime: Pick<KernelRuntimeFacade, 'id' | 'workspacePath'>,
): KernelRuntimeWireTransport {
  const {
    id: _id,
    host: _host,
    transport: _transport,
    transportConfig: _transportConfig,
    wireClient: _wireClient,
    wireClientOptions: _wireClientOptions,
    autoStart: _autoStart,
    ...protocolOptions
  } = options
  return createKernelRuntimeInProcessWireTransport({
    router: createDefaultKernelRuntimeWireRouter({
      ...protocolOptions,
      runtimeId: runtime.id,
      workspacePath: runtime.workspacePath,
    }),
  })
}

async function disconnectHostBestEffort(
  client: KernelRuntimeWireClient,
  hostId: string,
  reason: string,
): Promise<void> {
  try {
    await client.disconnectHost(hostId, { reason, policy: 'detach' })
  } catch {
    // Dispose must still close the underlying transport if the host was never
    // fully connected or the runtime already failed.
  }
}

function createRuntimeHostIdentity(
  host: Partial<KernelRuntimeHostIdentity> | undefined,
  transport: KernelRuntimeTransportKind,
): KernelRuntimeHostIdentity {
  return {
    kind: host?.kind ?? 'sdk',
    id: host?.id ?? `sdk-host-${randomUUID()}`,
    transport: host?.transport ?? transport,
    trustLevel: host?.trustLevel ?? 'local',
    declaredCapabilities: host?.declaredCapabilities ?? [],
    metadata: host?.metadata,
  }
}
