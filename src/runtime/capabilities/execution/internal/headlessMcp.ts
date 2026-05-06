import type {
  MCPServerConnection,
  McpSdkServerConfig,
  ScopedMcpServerConfig,
} from 'src/services/mcp/types.js'
import type { McpServerConfigForProcessTransport } from 'src/types/protocol/index.js'
import type { ProtocolControlMcpSetServersResponse } from 'src/types/protocol/controlTypes.js'
import type { AppState } from 'src/state/AppStateStore.js'
import type { Tools } from 'src/Tool.js'
import { logError } from 'src/utils/log.js'
import { toError } from '../../../../utils/errors.js'
import {
  areMcpConfigsEqual,
  clearServerCache,
  connectToServer,
  fetchToolsForClient,
} from 'src/services/mcp/client.js'
import { filterMcpServersByPolicy } from 'src/services/mcp/config.js'

export type DynamicMcpState = {
  clients: MCPServerConnection[]
  tools: Tools
  configs: Record<string, ScopedMcpServerConfig>
}

function toScopedConfig(
  config: McpServerConfigForProcessTransport,
): ScopedMcpServerConfig {
  return { ...config, scope: 'dynamic' } as ScopedMcpServerConfig
}

export type SdkMcpState = {
  configs: Record<string, McpSdkServerConfig>
  clients: MCPServerConnection[]
  tools: Tools
}

export type McpSetServersResult = {
  response: ProtocolControlMcpSetServersResponse
  newSdkState: SdkMcpState
  newDynamicState: DynamicMcpState
  sdkServersChanged: boolean
}

export async function handleMcpSetServers(
  servers: Record<string, McpServerConfigForProcessTransport>,
  sdkState: SdkMcpState,
  dynamicState: DynamicMcpState,
  setAppState: (f: (prev: AppState) => AppState) => void,
): Promise<McpSetServersResult> {
  const { allowed: allowedServers, blocked } = filterMcpServersByPolicy(servers)
  const policyErrors: Record<string, string> = {}
  for (const name of blocked) {
    policyErrors[name] =
      'Blocked by enterprise policy (allowedMcpServers/deniedMcpServers)'
  }

  const sdkServers: Record<string, McpSdkServerConfig> = {}
  const processServers: Record<string, McpServerConfigForProcessTransport> = {}

  for (const [name, config] of Object.entries(allowedServers)) {
    if ((config.type as string) === 'sdk') {
      sdkServers[name] = config as unknown as McpSdkServerConfig
    } else {
      processServers[name] = config
    }
  }

  const currentSdkNames = new Set(Object.keys(sdkState.configs))
  const newSdkNames = new Set(Object.keys(sdkServers))
  const sdkAdded: string[] = []
  const sdkRemoved: string[] = []

  const newSdkConfigs = { ...sdkState.configs }
  let newSdkClients = [...sdkState.clients]
  let newSdkTools = [...sdkState.tools]

  for (const name of currentSdkNames) {
    if (!newSdkNames.has(name)) {
      const client = newSdkClients.find(c => c.name === name)
      if (client && client.type === 'connected') {
        await client.cleanup()
      }
      newSdkClients = newSdkClients.filter(c => c.name !== name)
      const prefix = `mcp__${name}__`
      newSdkTools = newSdkTools.filter(t => !t.name.startsWith(prefix))
      delete newSdkConfigs[name]
      sdkRemoved.push(name)
    }
  }

  for (const [name, config] of Object.entries(sdkServers)) {
    if (!currentSdkNames.has(name)) {
      newSdkConfigs[name] = config
      const pendingClient: MCPServerConnection = {
        type: 'pending',
        name,
        config: { ...config, scope: 'dynamic' as const },
      }
      newSdkClients = [...newSdkClients, pendingClient]
      sdkAdded.push(name)
    }
  }

  const processResult = await reconcileMcpServers(
    processServers,
    dynamicState,
    setAppState,
  )

  return {
    response: {
      added: [...sdkAdded, ...processResult.response.added],
      removed: [...sdkRemoved, ...processResult.response.removed],
      errors: { ...policyErrors, ...processResult.response.errors },
    },
    newSdkState: {
      configs: newSdkConfigs,
      clients: newSdkClients,
      tools: newSdkTools,
    },
    newDynamicState: processResult.newState,
    sdkServersChanged: sdkAdded.length > 0 || sdkRemoved.length > 0,
  }
}

export async function reconcileMcpServers(
  desiredConfigs: Record<string, McpServerConfigForProcessTransport>,
  currentState: DynamicMcpState,
  setAppState: (f: (prev: AppState) => AppState) => void,
): Promise<{
  response: ProtocolControlMcpSetServersResponse
  newState: DynamicMcpState
}> {
  const currentNames = new Set(Object.keys(currentState.configs))
  const desiredNames = new Set(Object.keys(desiredConfigs))

  const toRemove = [...currentNames].filter(n => !desiredNames.has(n))
  const toAdd = [...desiredNames].filter(n => !currentNames.has(n))

  const toCheck = [...currentNames].filter(n => desiredNames.has(n))
  const toReplace = toCheck.filter(name => {
    const currentConfig = currentState.configs[name]
    const desiredConfigRaw = desiredConfigs[name]
    if (!currentConfig || !desiredConfigRaw) return true
    const desiredConfig = toScopedConfig(desiredConfigRaw)
    return !areMcpConfigsEqual(currentConfig, desiredConfig)
  })

  const removed: string[] = []
  const added: string[] = []
  const errors: Record<string, string> = {}

  let newClients = [...currentState.clients]
  let newTools = [...currentState.tools]

  for (const name of [...toRemove, ...toReplace]) {
    const client = newClients.find(c => c.name === name)
    const config = currentState.configs[name]
    if (client && config) {
      if (client.type === 'connected') {
        try {
          await client.cleanup()
        } catch (e) {
          logError(e)
        }
      }
      await clearServerCache(name, config)
    }

    const prefix = `mcp__${name}__`
    newTools = newTools.filter(t => !t.name.startsWith(prefix))
    newClients = newClients.filter(c => c.name !== name)

    if (toRemove.includes(name)) {
      removed.push(name)
    }
  }

  for (const name of [...toAdd, ...toReplace]) {
    const config = desiredConfigs[name]
    if (!config) continue
    const scopedConfig = toScopedConfig(config)

    if ((config.type as string) === 'sdk') {
      added.push(name)
      continue
    }

    try {
      const client = await connectToServer(name, scopedConfig)
      newClients.push(client)

      if (client.type === 'connected') {
        const serverTools = await fetchToolsForClient(client)
        newTools.push(...serverTools)
      } else if (client.type === 'failed') {
        errors[name] = client.error || 'Connection failed'
      }

      added.push(name)
    } catch (e) {
      const err = toError(e)
      errors[name] = err.message
      logError(err)
    }
  }

  const newConfigs: Record<string, ScopedMcpServerConfig> = {}
  for (const name of desiredNames) {
    const config = desiredConfigs[name]
    if (config) {
      newConfigs[name] = toScopedConfig(config)
    }
  }

  const newState: DynamicMcpState = {
    clients: newClients,
    tools: newTools,
    configs: newConfigs,
  }

  setAppState(prev => {
    const allDynamicServerNames = new Set([
      ...Object.keys(currentState.configs),
      ...Object.keys(newConfigs),
    ])

    const nonDynamicTools = prev.mcp.tools.filter(t => {
      for (const serverName of allDynamicServerNames) {
        if (t.name.startsWith(`mcp__${serverName}__`)) {
          return false
        }
      }
      return true
    })

    const nonDynamicClients = prev.mcp.clients.filter(c => {
      return !allDynamicServerNames.has(c.name)
    })

    return {
      ...prev,
      mcp: {
        ...prev.mcp,
        tools: [...nonDynamicTools, ...newTools],
        clients: [...nonDynamicClients, ...newClients],
      },
    }
  })

  return {
    response: { added, removed, errors },
    newState,
  }
}
