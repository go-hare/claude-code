import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import type { McpServerStatus } from 'src/types/protocol/index.js'
import type { McpServerConfigForProcessTransport } from 'src/types/protocol/index.js'
import type { ProtocolControlMcpSetServersResponse } from 'src/types/protocol/controlTypes.js'
import type {
  MCPServerConnection,
  McpSdkServerConfig,
} from '../../../services/mcp/types.js'
import { setupSdkMcpClients } from '../../../services/mcp/client.js'
import { getMcpPrefix } from '../../../services/mcp/mcpStringUtils.js'
import { setupVscodeProtocolMcp } from '../../../services/mcp/vscodeProtocolMcp.js'
import type { AppState } from '../../../state/AppStateStore.js'
import type { Tools } from '../../../Tool.js'
import { uniq } from '../../../utils/array.js'
import {
  type DynamicMcpState,
  handleMcpSetServers,
} from '../execution/internal/headlessMcp.js'
import { buildMcpServerStatusesRuntime } from '../execution/internal/headlessMcpRuntime.js'

export type RuntimeHeadlessMcpServiceOptions = {
  sdkMcpConfigs: Record<string, McpSdkServerConfig>
  getAppState(): AppState
  setAppState(updater: (prev: AppState) => AppState): void
  sendMcpMessage(
    serverName: string,
    message: JSONRPCMessage,
  ): Promise<JSONRPCMessage>
}

export type RuntimeHeadlessMcpService = {
  getSdkMcpConfigs(): Record<string, McpSdkServerConfig>
  getSdkClients(): MCPServerConnection[]
  getSdkTools(): Tools
  getDynamicState(): DynamicMcpState
  getAllClients(baseClients?: readonly MCPServerConnection[]): MCPServerConnection[]
  findConfig(
    serverName: string,
    options?: {
      baseClients?: readonly MCPServerConnection[]
      getConfiguredServer?: () => MCPServerConnection['config'] | null
    },
  ): MCPServerConnection['config'] | null
  updateSdk(): Promise<void>
  applyServerChanges(
    servers: Record<string, McpServerConfigForProcessTransport>,
  ): Promise<{
    response: ProtocolControlMcpSetServersResponse
    sdkServersChanged: boolean
  }>
  replaceDynamicConnection(input: {
    serverName: string
    client: MCPServerConnection
    tools: Tools
  }): void
  removeDynamicConnection(serverName: string): void
  buildStatuses(): McpServerStatus[]
}

export function createRuntimeHeadlessMcpService(
  options: RuntimeHeadlessMcpServiceOptions,
): RuntimeHeadlessMcpService {
  let sdkClients: MCPServerConnection[] = []
  let sdkTools: Tools = []
  let dynamicMcpState: DynamicMcpState = {
    clients: [],
    tools: [],
    configs: {},
  }
  let mcpChangesPromise: Promise<{
    response: ProtocolControlMcpSetServersResponse
    sdkServersChanged: boolean
  }> = Promise.resolve({
    response: {
      added: [],
      removed: [],
      errors: {},
    },
    sdkServersChanged: false,
  })

  async function updateSdk(): Promise<void> {
    const currentServerNames = new Set(Object.keys(options.sdkMcpConfigs))
    const connectedServerNames = new Set(sdkClients.map(c => c.name))
    const hasNewServers = [...currentServerNames].some(
      name => !connectedServerNames.has(name),
    )
    const hasRemovedServers = [...connectedServerNames].some(
      name => !currentServerNames.has(name),
    )
    const hasPendingSdkClients = sdkClients.some(c => c.type === 'pending')
    const hasFailedSdkClients = sdkClients.some(c => c.type === 'failed')

    if (
      !hasNewServers &&
      !hasRemovedServers &&
      !hasPendingSdkClients &&
      !hasFailedSdkClients
    ) {
      return
    }

    for (const client of sdkClients) {
      if (!currentServerNames.has(client.name) && client.type === 'connected') {
        await client.cleanup()
      }
    }

    const sdkSetup = await setupSdkMcpClients(
      options.sdkMcpConfigs,
      options.sendMcpMessage,
    )
    sdkClients = sdkSetup.clients
    sdkTools = sdkSetup.tools

    const allSdkNames = uniq([...connectedServerNames, ...currentServerNames])
    options.setAppState(prev => ({
      ...prev,
      mcp: {
        ...prev.mcp,
        tools: [
          ...prev.mcp.tools.filter(
            tool =>
              !allSdkNames.some(name =>
                tool.name.startsWith(getMcpPrefix(name)),
              ),
          ),
          ...sdkTools,
        ],
      },
    }))

    setupVscodeProtocolMcp(sdkClients)
  }

  function applyServerChanges(
    servers: Record<string, McpServerConfigForProcessTransport>,
  ): Promise<{
    response: ProtocolControlMcpSetServersResponse
    sdkServersChanged: boolean
  }> {
    const doWork = async (): Promise<{
      response: ProtocolControlMcpSetServersResponse
      sdkServersChanged: boolean
    }> => {
      const oldSdkClientNames = new Set(sdkClients.map(c => c.name))
      const result = await handleMcpSetServers(
        servers,
        {
          configs: options.sdkMcpConfigs,
          clients: sdkClients,
          tools: sdkTools,
        },
        dynamicMcpState,
        options.setAppState,
      )

      for (const key of Object.keys(options.sdkMcpConfigs)) {
        delete options.sdkMcpConfigs[key]
      }
      Object.assign(options.sdkMcpConfigs, result.newSdkState.configs)
      sdkClients = result.newSdkState.clients
      sdkTools = result.newSdkState.tools
      dynamicMcpState = result.newDynamicState

      if (result.sdkServersChanged) {
        const newSdkClientNames = new Set(sdkClients.map(c => c.name))
        const allSdkNames = uniq([...oldSdkClientNames, ...newSdkClientNames])
        options.setAppState(prev => ({
          ...prev,
          mcp: {
            ...prev.mcp,
            tools: [
              ...prev.mcp.tools.filter(
                tool =>
                  !allSdkNames.some(name =>
                    tool.name.startsWith(getMcpPrefix(name)),
                  ),
              ),
              ...sdkTools,
            ],
          },
        }))
      }

      return {
        response: result.response,
        sdkServersChanged: result.sdkServersChanged,
      }
    }

    mcpChangesPromise = mcpChangesPromise.then(doWork, doWork)
    return mcpChangesPromise
  }

  function replaceDynamicConnection(input: {
    serverName: string
    client: MCPServerConnection
    tools: Tools
  }): void {
    const prefix = getMcpPrefix(input.serverName)
    dynamicMcpState = {
      ...dynamicMcpState,
      clients: [
        ...dynamicMcpState.clients.filter(
          client => client.name !== input.serverName,
        ),
        input.client,
      ],
      tools: [
        ...dynamicMcpState.tools.filter(
          tool => !tool.name?.startsWith(prefix),
        ),
        ...input.tools,
      ],
    }
  }

  function removeDynamicConnection(serverName: string): void {
    const prefix = getMcpPrefix(serverName)
    const configs = { ...dynamicMcpState.configs }
    delete configs[serverName]
    dynamicMcpState = {
      configs,
      clients: dynamicMcpState.clients.filter(
        client => client.name !== serverName,
      ),
      tools: dynamicMcpState.tools.filter(
        tool => !tool.name?.startsWith(prefix),
      ),
    }
  }

  function getAllClients(
    baseClients: readonly MCPServerConnection[] = [],
  ): MCPServerConnection[] {
    return [...baseClients, ...sdkClients, ...dynamicMcpState.clients]
  }

  function findConfig(
    serverName: string,
    findOptions: {
      baseClients?: readonly MCPServerConnection[]
      getConfiguredServer?: () => MCPServerConnection['config'] | null
    } = {},
  ): MCPServerConnection['config'] | null {
    return (
      findOptions.getConfiguredServer?.() ??
      findOptions.baseClients?.find(client => client.name === serverName)
        ?.config ??
      sdkClients.find(client => client.name === serverName)?.config ??
      dynamicMcpState.clients.find(client => client.name === serverName)
        ?.config ??
      options.getAppState().mcp.clients.find(client => client.name === serverName)
        ?.config ??
      null
    )
  }

  return {
    getSdkMcpConfigs: () => options.sdkMcpConfigs,
    getSdkClients: () => sdkClients,
    getSdkTools: () => sdkTools,
    getDynamicState: () => dynamicMcpState,
    getAllClients,
    findConfig,
    updateSdk,
    applyServerChanges,
    replaceDynamicConnection,
    removeDynamicConnection,
    buildStatuses: () =>
      buildMcpServerStatusesRuntime({
        appState: options.getAppState(),
        sdkClients,
        dynamicMcpState,
      }),
  }
}
