import { feature } from 'bun:bundle'
import type { Command } from '../commands.js'
import {
  runHeadlessRuntime,
  type HeadlessRuntimeInput,
  type HeadlessRuntimeOptions,
} from '../runtime/capabilities/execution/HeadlessRuntime.js'
import type {
  MCPServerConnection,
  McpSdkServerConfig,
} from '../services/mcp/types.js'
import {
  getDefaultAppState,
  type AppState,
} from '../state/AppStateStore.js'
import { onChangeAppState } from '../state/onChangeAppState.js'
import { createStore } from '../state/store.js'
import {
  type Tool,
  type ToolPermissionContext,
  type Tools,
} from '../Tool.js'
import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { getInitialEffortSetting, parseEffortValue } from '../utils/effort.js'
import {
  getInitialFastModeSetting,
  isFastModeEnabled,
} from '../utils/fastMode.js'
import { verifyAutoModeGateAccess } from '../utils/permissions/permissionSetup.js'

export type KernelHeadlessInput = HeadlessRuntimeInput

export type KernelHeadlessStore = ReturnType<typeof createStore<AppState>>

export type KernelHeadlessEnvironment = {
  store: KernelHeadlessStore
  commands: Command[]
  tools: Tools
  sdkMcpConfigs: Record<string, McpSdkServerConfig>
  agents: AgentDefinition[]
}

export type DefaultKernelHeadlessEnvironmentOptions = {
  commands: Command[]
  disableSlashCommands?: boolean
  tools: Tools
  sdkMcpConfigs: Record<string, McpSdkServerConfig>
  agents: AgentDefinition[]
  mcpClients?: MCPServerConnection[]
  mcpCommands?: Command[]
  mcpTools?: Tool[]
  toolPermissionContext: ToolPermissionContext
  effortArgument?: unknown
  modelForFastMode?: AppState['mainLoopModel']
  advisorModel?: string
  kairosEnabled?: boolean
}

export type KernelHeadlessRunOptions = HeadlessRuntimeOptions

export type KernelHeadlessSession = {
  run(
    inputPrompt: KernelHeadlessInput,
    options: KernelHeadlessRunOptions,
  ): Promise<void>
  getState(): AppState
  setState(updater: (prev: AppState) => AppState): void
}

/**
 * Create a runtime-owned state store for headless sessions.
 *
 * Callers can seed this with an already-composed AppState, then pass the store
 * into createKernelHeadlessSession/runKernelHeadless.
 */
export function createKernelHeadlessStore(
  initialState: AppState,
): KernelHeadlessStore {
  return createStore(initialState, onChangeAppState)
}

function getHeadlessCommands(
  commands: readonly Command[],
  disableSlashCommands: boolean,
): Command[] {
  if (disableSlashCommands) {
    return []
  }

  return commands.filter(
    command =>
      (command.type === 'prompt' && !command.disableNonInteractive) ||
      (command.type === 'local' && command.supportsNonInteractive),
  )
}

export function createDefaultKernelHeadlessEnvironment(
  options: DefaultKernelHeadlessEnvironmentOptions,
): KernelHeadlessEnvironment {
  const {
    commands,
    disableSlashCommands = false,
    tools,
    sdkMcpConfigs,
    agents,
    mcpClients = [],
    mcpCommands = [],
    mcpTools = [],
    toolPermissionContext,
    effortArgument,
    modelForFastMode = null,
    advisorModel,
    kairosEnabled = false,
  } = options

  const defaultState = getDefaultAppState()
  const initialState: AppState = {
    ...defaultState,
    mcp: {
      ...defaultState.mcp,
      clients: mcpClients,
      commands: mcpCommands,
      tools: mcpTools,
    },
    agentDefinitions: {
      allAgents: agents,
      activeAgents: agents,
    },
    toolPermissionContext,
    effortValue: parseEffortValue(effortArgument) ?? getInitialEffortSetting(),
    ...(isFastModeEnabled() && {
      fastMode: getInitialFastModeSetting(modelForFastMode),
    }),
    ...(advisorModel && { advisorModel }),
    ...(feature('KAIROS') ? { kairosEnabled } : {}),
  }

  const store = createKernelHeadlessStore(initialState)

  if (feature('TRANSCRIPT_CLASSIFIER')) {
    void verifyAutoModeGateAccess(
      toolPermissionContext,
      store.getState().fastMode,
    ).then(({ updateContext }) => {
      store.setState(prev => {
        const nextContext = updateContext(prev.toolPermissionContext)
        if (nextContext === prev.toolPermissionContext) {
          return prev
        }
        return { ...prev, toolPermissionContext: nextContext }
      })
    })
  }

  return {
    store,
    commands: getHeadlessCommands(commands, disableSlashCommands),
    tools,
    sdkMcpConfigs,
    agents,
  }
}

/**
 * Stable headless kernel runner.
 *
 * This is a façade over the runtime-owned headless execution entry. It keeps
 * the assembly contract stable for external callers while the underlying
 * implementation can continue to evolve behind the runtime boundary.
 */
export async function runKernelHeadless(
  inputPrompt: KernelHeadlessInput,
  environment: KernelHeadlessEnvironment,
  options: KernelHeadlessRunOptions,
): Promise<void> {
  return runHeadlessRuntime(
    inputPrompt,
    () => environment.store.getState(),
    environment.store.setState,
    environment.commands,
    environment.tools,
    environment.sdkMcpConfigs,
    environment.agents,
    options,
  )
}

export function createKernelHeadlessSession(
  environment: KernelHeadlessEnvironment,
): KernelHeadlessSession {
  return {
    run(inputPrompt, options) {
      return runKernelHeadless(inputPrompt, environment, options)
    },
    getState() {
      return environment.store.getState()
    },
    setState(updater) {
      environment.store.setState(updater)
    },
  }
}
