import type {
  RuntimeMcpAuthRequest,
  RuntimeMcpConnectRequest,
  RuntimeMcpLifecycleResult,
  RuntimeMcpResourceRef,
  RuntimeMcpServerRef,
  RuntimeMcpSetEnabledRequest,
  RuntimeMcpToolBinding,
} from '../runtime/contracts/mcp.js'
import type { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import type { Tool } from '../Tool.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import { stripUndefined } from './corePayload.js'
import {
  createDefaultKernelRuntimeMcpPlane,
  type KernelRuntimeMcpRegistry,
} from './runtimeMcpRegistry.js'

export type McpCoreRegistry = KernelRuntimeMcpRegistry

export type McpCoreServiceOptions = {
  workspacePath?: string
  eventBus?: RuntimeEventBus
  registry?: McpCoreRegistry
}

export class McpCoreService {
  private readonly registry: McpCoreRegistry
  private readonly listRuntimeToolsImpl?: () => Promise<readonly Tool[]>
  private readonly listClientsImpl?: () => Promise<
    readonly MCPServerConnection[]
  >

  constructor(private readonly options: McpCoreServiceOptions = {}) {
    if (options.registry) {
      this.registry = options.registry
      return
    }

    const plane = createDefaultKernelRuntimeMcpPlane(options.workspacePath)
    this.registry = plane.registry
    this.listRuntimeToolsImpl = plane.listTools
    this.listClientsImpl = plane.listClients
  }

  listServers(): Promise<{ servers: readonly RuntimeMcpServerRef[] }> {
    return Promise.resolve(
      this.registry.listServers({
        cwd: this.options.workspacePath ?? process.cwd(),
        metadata: { protocol: 'json-rpc-lite' },
      }),
    ).then(servers => ({ servers }))
  }

  listTools(
    serverName?: string,
  ): Promise<{ tools: readonly RuntimeMcpToolBinding[] }> {
    return Promise.resolve(
      this.registry.listToolBindings({
        cwd: this.options.workspacePath ?? process.cwd(),
        metadata: { protocol: 'json-rpc-lite' },
      }),
    ).then(tools => ({
      tools: serverName
        ? tools.filter(tool => tool.server === serverName)
        : tools,
    }))
  }

  listResources(
    serverName?: string,
  ): Promise<{ resources: readonly RuntimeMcpResourceRef[] }> {
    return Promise.resolve(
      this.registry.listResources(serverName, {
        cwd: this.options.workspacePath ?? process.cwd(),
        metadata: { protocol: 'json-rpc-lite' },
      }),
    ).then(resources => ({ resources }))
  }

  async connect(
    request: RuntimeMcpConnectRequest,
  ): Promise<RuntimeMcpLifecycleResult> {
    if (!this.registry.connectServer) {
      throw new McpCoreError('unavailable', 'MCP connect is not available')
    }
    const result = await this.registry.connectServer(request, {
      cwd: this.options.workspacePath ?? process.cwd(),
      metadata: request.metadata,
    })
    this.emitLifecycle('mcp.connected', result)
    return result
  }

  async authenticate(
    request: RuntimeMcpAuthRequest,
  ): Promise<RuntimeMcpLifecycleResult> {
    if (!this.registry.authenticateServer) {
      throw new McpCoreError(
        'unavailable',
        'MCP authentication is not available',
      )
    }
    const result = await this.registry.authenticateServer(request, {
      cwd: this.options.workspacePath ?? process.cwd(),
      metadata: request.metadata,
    })
    this.emitLifecycle('mcp.authenticated', result)
    return result
  }

  async setEnabled(
    request: RuntimeMcpSetEnabledRequest,
  ): Promise<RuntimeMcpLifecycleResult> {
    if (!this.registry.setServerEnabled) {
      throw new McpCoreError(
        'unavailable',
        'MCP enable/disable is not available',
      )
    }
    const result = await this.registry.setServerEnabled(request, {
      cwd: this.options.workspacePath ?? process.cwd(),
      metadata: request.metadata,
    })
    this.emitLifecycle('mcp.enabled_changed', result)
    return result
  }

  listRuntimeTools(): Promise<readonly Tool[]> {
    return this.listRuntimeToolsImpl?.() ?? Promise.resolve([])
  }

  listClients(): Promise<readonly MCPServerConnection[]> {
    return this.listClientsImpl?.() ?? Promise.resolve([])
  }

  private emitLifecycle(
    type: string,
    result: RuntimeMcpLifecycleResult,
  ): void {
    this.options.eventBus?.emit({
      type,
      replayable: true,
      payload: stripUndefined(result),
      metadata: result.metadata,
    })
  }
}

export class McpCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'McpCoreError'
  }
}
