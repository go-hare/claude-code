import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import {
  type Command,
  formatDescriptionWithSource,
  getCommandName,
} from '../../../../commands.js'
import type { ProtocolControlReloadPluginsResponse } from 'src/types/protocol/controlTypes.js'
import type { AppState } from '../../../../state/AppStateStore.js'
import { getCommands } from '../../../../commands.js'
import { logError } from '../../../../utils/log.js'
import { setupPluginHookHotReload } from '../../../../utils/plugins/loadPluginHooks.js'
import { loadAllPluginsCacheOnly } from '../../../../utils/plugins/pluginLoader.js'
import { refreshActivePlugins } from '../../../../utils/plugins/refresh.js'
import type { RuntimeHeadlessMcpService } from '../../mcp/RuntimeHeadlessMcpService.js'
import { applyPluginMcpDiffRuntime } from './headlessPlugins.js'

export type HeadlessRuntimeCapabilityBundle = {
  getCommands(): Command[]
  getAgents(): AgentDefinition[]
  setCommands(commands: Command[]): void
  refreshCommands(): Promise<Command[]>
  refresh(): Promise<ProtocolControlReloadPluginsResponse>
  refreshPlugins(): Promise<ProtocolControlReloadPluginsResponse>
  applyPluginMcpDiff(): Promise<void>
}

export type HeadlessRuntimeCapabilityBundleDeps = {
  getCommands(cwd: string): Promise<Command[]>
  refreshActivePlugins(
    setAppState: (updater: (prev: AppState) => AppState) => void,
  ): ReturnType<typeof refreshActivePlugins>
  loadAllPluginsCacheOnly(): ReturnType<typeof loadAllPluginsCacheOnly>
  applyPluginMcpDiffRuntime: typeof applyPluginMcpDiffRuntime
  setupPluginHookHotReload(): void
  logError(error: unknown): void
}

const defaultDeps: HeadlessRuntimeCapabilityBundleDeps = {
  getCommands,
  refreshActivePlugins,
  loadAllPluginsCacheOnly,
  applyPluginMcpDiffRuntime,
  setupPluginHookHotReload,
  logError,
}

export function createHeadlessRuntimeCapabilityBundle(options: {
  initialCommands: Command[]
  initialAgents: AgentDefinition[]
  getCwd(): string
  setAppState(updater: (prev: AppState) => AppState): void
  mcpService: RuntimeHeadlessMcpService
}, deps: HeadlessRuntimeCapabilityBundleDeps = defaultDeps): HeadlessRuntimeCapabilityBundle {
  let currentCommands = options.initialCommands
  let currentAgents = options.initialAgents

  async function refreshCommands(): Promise<Command[]> {
    currentCommands = await deps.getCommands(options.getCwd())
    return currentCommands
  }

  async function applyPluginMcpDiff(): Promise<void> {
    return deps.applyPluginMcpDiffRuntime({
      sdkMcpConfigs: options.mcpService.getSdkMcpConfigs(),
      applyMcpServerChanges: options.mcpService.applyServerChanges,
      updateSdkMcp: options.mcpService.updateSdk,
    })
  }

  async function refresh(): Promise<ProtocolControlReloadPluginsResponse> {
    const refreshed = await deps.refreshActivePlugins(options.setAppState)
    const sdkAgents = currentAgents.filter(
      agent => agent.source === 'flagSettings',
    )
    currentAgents = [...refreshed.agentDefinitions.allAgents, ...sdkAgents]

    let plugins: ProtocolControlReloadPluginsResponse['plugins'] = []
    const [commandsResult, mcpResult, pluginsResult] =
      await Promise.allSettled([
        deps.getCommands(options.getCwd()),
        applyPluginMcpDiff(),
        deps.loadAllPluginsCacheOnly(),
      ])

    if (commandsResult.status === 'fulfilled') {
      currentCommands = commandsResult.value
    } else {
      deps.logError(commandsResult.reason)
    }
    if (mcpResult.status === 'rejected') {
      deps.logError(mcpResult.reason)
    }
    if (pluginsResult.status === 'fulfilled') {
      plugins = pluginsResult.value.enabled.map(plugin => ({
        name: plugin.name,
        path: plugin.path,
        source: plugin.source,
      }))
    } else {
      deps.logError(pluginsResult.reason)
    }
    deps.setupPluginHookHotReload()

    return {
      commands: currentCommands
        .filter(command => command.userInvocable !== false)
        .map(command => ({
          name: getCommandName(command),
          description: formatDescriptionWithSource(command),
          argumentHint: command.argumentHint || '',
        })),
      agents: currentAgents.map(agent => ({
        name: agent.agentType,
        description: agent.whenToUse,
        model: agent.model === 'inherit' ? undefined : agent.model,
      })),
      plugins,
      mcpServers:
        options.mcpService.buildStatuses() as ProtocolControlReloadPluginsResponse['mcpServers'],
      error_count: refreshed.error_count,
    }
  }

  return {
    getCommands: () => currentCommands,
    getAgents: () => currentAgents,
    setCommands(commands) {
      currentCommands = commands
    },
    refreshCommands,
    refresh,
    refreshPlugins: refresh,
    applyPluginMcpDiff,
  }
}
