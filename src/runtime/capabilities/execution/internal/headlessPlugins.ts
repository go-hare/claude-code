import { feature } from 'bun:bundle'
import { cwd } from 'process'
import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { Command } from 'src/commands.js'
import type { McpServerConfigForProcessTransport } from 'src/entrypoints/agentSdkTypes.js'
import { waitForRemoteManagedSettingsToLoad } from 'src/services/remoteManagedSettings/index.js'
import { getAllMcpConfigs } from 'src/services/mcp/config.js'
import type { McpSdkServerConfig } from 'src/services/mcp/types.js'
import { downloadUserSettings } from 'src/services/settingsSync/index.js'
import type { AppState } from 'src/state/AppStateStore.js'
import { logForDebugging } from 'src/utils/debug.js'
import { withDiagnosticsTiming } from 'src/utils/diagLogs.js'
import { logError } from 'src/utils/log.js'
import { getCommands } from '../../../../commands.js'
import { installPluginsForHeadless } from '../../../../utils/plugins/headlessPluginInstall.js'
import { refreshActivePlugins } from '../../../../utils/plugins/refresh.js'

export async function installPluginsAndApplyMcpInBackgroundRuntime({
  isRemoteMode,
  applyPluginMcpDiff,
}: {
  isRemoteMode: boolean
  applyPluginMcpDiff: () => Promise<void>
}): Promise<void> {
  try {
    await Promise.all([
      feature('DOWNLOAD_USER_SETTINGS') && isRemoteMode
        ? withDiagnosticsTiming('headless_user_settings_download', () =>
            downloadUserSettings(),
          )
        : Promise.resolve(),
      withDiagnosticsTiming('headless_managed_settings_wait', () =>
        waitForRemoteManagedSettingsToLoad(),
      ),
    ])

    const pluginsInstalled = await installPluginsForHeadless()
    if (pluginsInstalled) {
      await applyPluginMcpDiff()
    }
  } catch (error) {
    logError(error)
  }
}

export async function refreshPluginStateRuntime({
  setAppState,
  currentAgents,
}: {
  setAppState: (f: (prev: AppState) => AppState) => void
  currentAgents: AgentDefinition[]
}): Promise<{
  currentCommands: Command[]
  currentAgents: AgentDefinition[]
}> {
  const { agentDefinitions: freshAgentDefs } =
    await refreshActivePlugins(setAppState)
  const currentCommands = await getCommands(cwd())
  const sdkAgents = currentAgents.filter(agent => agent.source === 'flagSettings')

  return {
    currentCommands,
    currentAgents: [...freshAgentDefs.allAgents, ...sdkAgents],
  }
}

export async function applyPluginMcpDiffRuntime({
  sdkMcpConfigs,
  applyMcpServerChanges,
  updateSdkMcp,
}: {
  sdkMcpConfigs: Record<string, McpSdkServerConfig>
  applyMcpServerChanges: (
    servers: Record<string, McpServerConfigForProcessTransport>,
  ) => Promise<{
    response: {
      added: string[]
      removed: string[]
      errors: Record<string, string>
    }
    sdkServersChanged: boolean
  }>
  updateSdkMcp: () => Promise<void>
}): Promise<void> {
  const { servers: newConfigs } = await getAllMcpConfigs()
  const supportedConfigs: Record<string, McpServerConfigForProcessTransport> =
    {}

  for (const [name, config] of Object.entries(newConfigs)) {
    const type = config.type
    if (
      type === undefined ||
      type === 'stdio' ||
      type === 'sse' ||
      type === 'http' ||
      type === 'sdk'
    ) {
      supportedConfigs[name] = config as McpServerConfigForProcessTransport
    }
  }

  for (const [name, config] of Object.entries(sdkMcpConfigs)) {
    if (config.type === 'sdk' && !(name in supportedConfigs)) {
      supportedConfigs[name] =
        config as unknown as McpServerConfigForProcessTransport
    }
  }

  const { response, sdkServersChanged } =
    await applyMcpServerChanges(supportedConfigs)
  if (sdkServersChanged) {
    await updateSdkMcp()
  }

  logForDebugging(
    `Headless MCP refresh: added=${response.added.length}, removed=${response.removed.length}`,
  )
}
