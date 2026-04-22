import pickBy from 'lodash-es/pickBy.js'
import uniqBy from 'lodash-es/uniqBy.js'
import type { Command } from '../commands.js'
import type { ScopedMcpServerConfig } from '../services/mcp/types.js'
import {
  clearServerCache,
  getMcpToolsCommandsAndResources,
} from '../services/mcp/client.js'
import {
  dedupClaudeAiMcpServers,
  getMcpServerSignature,
} from '../services/mcp/config.js'
import {
  excludeCommandsByServer,
  excludeResourcesByServer,
} from '../services/mcp/utils.js'
import { dedupeToolsByName } from '../Tool.js'
import { logForDebugging } from '../utils/debug.js'
import type { KernelHeadlessStore } from './headless.js'

export type KernelHeadlessMcpConnectOptions = {
  store: KernelHeadlessStore
  regularMcpConfigs: Record<string, ScopedMcpServerConfig>
  claudeaiConfigPromise: Promise<Record<string, ScopedMcpServerConfig>>
  claudeAiTimeoutMs?: number
}

function connectHeadlessMcpBatch(
  store: KernelHeadlessStore,
  configs: Record<string, ScopedMcpServerConfig>,
  label: string,
): Promise<void> {
  if (Object.keys(configs).length === 0) {
    return Promise.resolve()
  }

  store.setState(prev => ({
    ...prev,
    mcp: {
      ...prev.mcp,
      clients: [
        ...prev.mcp.clients,
        ...Object.entries(configs).map(([name, config]) => ({
          name,
          type: 'pending' as const,
          config,
        })),
      ],
    },
  }))

  return getMcpToolsCommandsAndResources(
    ({ client, tools, commands }) => {
      store.setState(prev => ({
        ...prev,
        mcp: {
          ...prev.mcp,
          clients: prev.mcp.clients.some(c => c.name === client.name)
            ? prev.mcp.clients.map(c => (c.name === client.name ? client : c))
            : [...prev.mcp.clients, client],
          tools: dedupeToolsByName([...prev.mcp.tools, ...tools]),
          commands: uniqBy([...prev.mcp.commands, ...commands], 'name'),
        },
      }))
    },
    configs,
  ).catch(err => logForDebugging(`[MCP] ${label} connect error: ${err}`))
}

function suppressDuplicatePluginServers(
  store: KernelHeadlessStore,
  regularMcpConfigs: Record<string, ScopedMcpServerConfig>,
  claudeaiConfigs: Record<string, ScopedMcpServerConfig>,
): void {
  if (Object.keys(claudeaiConfigs).length === 0) {
    return
  }

  const claudeaiSigs = new Set<string>()
  for (const config of Object.values(claudeaiConfigs)) {
    const sig = getMcpServerSignature(config)
    if (sig) claudeaiSigs.add(sig)
  }

  const suppressed = new Set<string>()
  for (const [name, config] of Object.entries(regularMcpConfigs)) {
    if (!name.startsWith('plugin:')) continue
    const sig = getMcpServerSignature(config)
    if (sig && claudeaiSigs.has(sig)) suppressed.add(name)
  }

  if (suppressed.size === 0) {
    return
  }

  logForDebugging(
    `[MCP] Lazy dedup: suppressing ${suppressed.size} plugin server(s) that duplicate claude.ai connectors: ${[...suppressed].join(', ')}`,
  )

  for (const client of store.getState().mcp.clients) {
    if (!suppressed.has(client.name) || client.type !== 'connected') {
      continue
    }
    client.client.onclose = undefined
    void clearServerCache(client.name, client.config).catch(() => {})
  }

  store.setState(prev => {
    let { clients, tools, commands, resources } = prev.mcp
    clients = clients.filter(client => !suppressed.has(client.name))
    tools = tools.filter(
      tool => !tool.mcpInfo || !suppressed.has(tool.mcpInfo.serverName),
    )
    for (const name of suppressed) {
      commands = excludeCommandsByServer(commands as Command[], name)
      resources = excludeResourcesByServer(resources, name)
    }
    return {
      ...prev,
      mcp: {
        ...prev.mcp,
        clients,
        tools,
        commands,
        resources,
      },
    }
  })
}

export async function connectDefaultKernelHeadlessMcp(
  options: KernelHeadlessMcpConnectOptions,
): Promise<{ claudeaiTimedOut: boolean }> {
  const {
    store,
    regularMcpConfigs,
    claudeaiConfigPromise,
    claudeAiTimeoutMs = 5_000,
  } = options

  await connectHeadlessMcpBatch(store, regularMcpConfigs, 'regular')

  const claudeaiConnect = claudeaiConfigPromise.then(claudeaiConfigs => {
    suppressDuplicatePluginServers(store, regularMcpConfigs, claudeaiConfigs)
    const nonPluginConfigs = pickBy(
      regularMcpConfigs,
      (_, name) => !name.startsWith('plugin:'),
    )
    const { servers: dedupedClaudeAi } = dedupClaudeAiMcpServers(
      claudeaiConfigs,
      nonPluginConfigs,
    )
    return connectHeadlessMcpBatch(store, dedupedClaudeAi, 'claudeai')
  })

  let claudeaiTimer: ReturnType<typeof setTimeout> | undefined
  const claudeaiTimedOut = await Promise.race([
    claudeaiConnect.then(() => false),
    new Promise<boolean>(resolve => {
      claudeaiTimer = setTimeout(resolve, claudeAiTimeoutMs, true)
    }),
  ])

  if (claudeaiTimer) clearTimeout(claudeaiTimer)
  if (claudeaiTimedOut) {
    logForDebugging(
      `[MCP] claude.ai connectors not ready after ${claudeAiTimeoutMs}ms — proceeding; background connection continues`,
    )
  }

  return { claudeaiTimedOut }
}
