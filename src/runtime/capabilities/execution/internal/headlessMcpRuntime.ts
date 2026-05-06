import { feature } from 'bun:bundle'
import uniqBy from 'lodash-es/uniqBy.js'
import type { McpServerStatus } from 'src/types/protocol/index.js'
import {
  isChannelAllowlisted,
  isChannelsEnabled,
} from 'src/services/mcp/channelAllowlist.js'
import type { MCPServerConnection } from 'src/services/mcp/types.js'
import { filterToolsByServer } from 'src/services/mcp/utils.js'
import type { AppState } from 'src/state/AppStateStore.js'
import type { DynamicMcpState } from './headlessMcp.js'

export function buildMcpServerStatusesRuntime({
  appState,
  sdkClients,
  dynamicMcpState,
}: {
  appState: AppState
  sdkClients: MCPServerConnection[]
  dynamicMcpState: DynamicMcpState
}): McpServerStatus[] {
  const currentMcpClients = appState.mcp.clients
  const allMcpTools = uniqBy(
    [...appState.mcp.tools, ...dynamicMcpState.tools],
    'name',
  )
  const existingNames = new Set([
    ...currentMcpClients.map(client => client.name),
    ...sdkClients.map(client => client.name),
  ])

  return [
    ...currentMcpClients,
    ...sdkClients,
    ...dynamicMcpState.clients.filter(client => !existingNames.has(client.name)),
  ].map(connection => {
    let config
    if (
      connection.config.type === 'sse' ||
      connection.config.type === 'http'
    ) {
      config = {
        type: connection.config.type,
        url: connection.config.url,
        headers: connection.config.headers,
        oauth: connection.config.oauth,
      }
    } else if (connection.config.type === 'claudeai-proxy') {
      config = {
        type: 'claudeai-proxy' as const,
        url: connection.config.url,
        id: connection.config.id,
      }
    } else if (
      connection.config.type === 'stdio' ||
      connection.config.type === undefined
    ) {
      const stdioConfig = connection.config as {
        command: string
        args: string[]
      }
      config = {
        type: 'stdio' as const,
        command: stdioConfig.command,
        args: stdioConfig.args,
      }
    }

    const serverTools =
      connection.type === 'connected'
        ? filterToolsByServer(allMcpTools, connection.name).map(tool => ({
            name: tool.mcpInfo?.toolName ?? tool.name,
            annotations: {
              readOnly: tool.isReadOnly({}) || undefined,
              destructive: tool.isDestructive?.({}) || undefined,
              openWorld: tool.isOpenWorld?.({}) || undefined,
            },
          }))
        : undefined

    let capabilities: { experimental?: Record<string, unknown> } | undefined
    if (
      (feature('KAIROS') || feature('KAIROS_CHANNELS')) &&
      connection.type === 'connected' &&
      connection.capabilities.experimental
    ) {
      const experimental = { ...connection.capabilities.experimental }
      if (
        experimental['claude/channel'] &&
        (!isChannelsEnabled() ||
          !isChannelAllowlisted(connection.config.pluginSource))
      ) {
        delete experimental['claude/channel']
      }
      if (Object.keys(experimental).length > 0) {
        capabilities = { experimental }
      }
    }

    return {
      name: connection.name,
      status: connection.type as McpServerStatus['status'],
      serverInfo:
        connection.type === 'connected' ? connection.serverInfo : undefined,
      error: connection.type === 'failed' ? connection.error : undefined,
      config,
      scope: connection.config.scope,
      tools: serverTools,
      capabilities,
    }
  }) as McpServerStatus[]
}
