import { runHeadless } from '../../../cli/print.js'
import type { Command } from '../../../commands.js'
import type { SDKStatus } from '../../../entrypoints/agentSdkTypes.js'
import type { McpSdkServerConfig } from '../../../services/mcp/types.js'
import type { AppState } from '../../../state/AppStateStore.js'
import type { Tools } from '../../../Tool.js'
import type { ThinkingConfig } from '../../../utils/thinking.js'
import type { HookResultMessage } from '../../../types/message.js'
import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'

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
  forkSession: boolean | undefined
  rewindFiles: string | undefined
  enableAuthStatus: boolean | undefined
  agent: string | undefined
  workload: string | undefined
  setupTrigger?: 'init' | 'maintenance' | undefined
  sessionStartHooksPromise?: Promise<HookResultMessage[]>
  setSDKStatus?: (status: SDKStatus) => void
}

/**
 * Runtime-owned headless entry point.
 *
 * The current implementation still reuses cli/print.ts underneath, but
 * callers should depend on this runtime boundary instead of importing the CLI
 * module directly.
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
  return runHeadless(
    inputPrompt,
    getAppState,
    setAppState,
    commands,
    tools,
    sdkMcpConfigs,
    agents,
    options,
  )
}
