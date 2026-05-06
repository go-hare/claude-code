import type { Command } from '../../../commands.js'
import type { ProtocolStatus } from 'src/types/protocol/index.js'
import type { McpSdkServerConfig } from '../../../services/mcp/types.js'
import type { AppState } from '../../../state/AppStateStore.js'
import type { Tools } from '../../../Tool.js'
import type { ThinkingConfig } from '../../../utils/thinking.js'
import type { HookResultMessage } from '../../../types/message.js'
import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { createBootstrapStateProvider } from '../../core/state/bootstrapProvider.js'
import type { KernelRuntimeEventSink } from '../../contracts/events.js'
import type { HeadlessSessionStateProvider } from './internal/headlessSessionControl.js'

export type HeadlessRuntimeInput = string | AsyncIterable<string>

export type HeadlessRuntimeOptions = {
  continue: boolean | undefined
  resume: string | boolean | undefined
  resumeSessionAt: string | undefined
  verbose: boolean | undefined
  outputFormat: string | undefined
  jsonSchema: Record<string, unknown> | undefined
  permissionPromptToolName: string | undefined
  allowedTools: string[] | undefined
  thinkingConfig: ThinkingConfig | undefined
  maxTurns: number | undefined
  maxBudgetUsd: number | undefined
  taskBudget: { total: number } | undefined
  systemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  userSpecifiedModel: string | undefined
  fallbackModel: string | undefined
  teleport: string | true | null | undefined
  sdkUrl: string | undefined
  replayUserMessages: boolean | undefined
  includePartialMessages: boolean | undefined
  resumeInterruptedTurn?: boolean | undefined
  forkSession: boolean | undefined
  rewindFiles: string | undefined
  enableAuthStatus: boolean | undefined
  agent: string | undefined
  workload: string | undefined
  setupTrigger?: 'init' | 'maintenance' | undefined
  sessionStartHooksPromise?: Promise<HookResultMessage[]>
  setProtocolStatus?: (status: ProtocolStatus) => void
  runtimeEventSink?: KernelRuntimeEventSink
  bootstrapStateProvider?: HeadlessSessionStateProvider
}

/**
 * Runtime-owned headless entry point.
 *
 * The headless execution stack now lives under runtime-owned modules so
 * callers can depend on this boundary without reaching into CLI internals.
 */
export async function runHeadlessRuntime(
  inputPrompt: HeadlessRuntimeInput,
  getAppState: () => AppState,
  setAppState: (f: (prev: AppState) => AppState) => void,
  commands: Command[],
  tools: Tools,
  sdkMcpConfigs: Record<string, McpSdkServerConfig>,
  agents: AgentDefinition[],
  options: HeadlessRuntimeOptions,
): Promise<void> {
  const { runHeadless } = await import('./internal/headlessSession.js')
  const bootstrapStateProvider =
    options.bootstrapStateProvider ?? createBootstrapStateProvider()
  return runHeadless(
    inputPrompt,
    getAppState,
    setAppState,
    commands,
    tools,
    sdkMcpConfigs,
    agents,
    options,
    bootstrapStateProvider,
  )
}
