import { randomUUID } from 'crypto'
import { getAgentDefinitionsWithOverrides } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { getCommands } from '../src/commands.js'
import {
  createDefaultKernelHeadlessEnvironment,
  runKernelHeadless,
} from '../src/runtime/capabilities/execution/HeadlessHost.js'
import { initBuiltinPlugins } from '../src/plugins/bundled/index.js'
import { initBundledSkills } from '../src/skills/bundled/index.js'
import {
  setClientType,
  setCwdState,
  setIsInteractive,
  setOriginalCwd,
  setProjectRoot,
  setSessionSource,
  switchSession,
} from '../src/bootstrap/state.js'
import { asSessionId } from '../src/types/ids.js'
import { getTools } from '../src/tools.js'
import { enableConfigs } from '../src/utils/config.js'
import { initializeToolPermissionContext } from '../src/utils/permissions/permissionSetup.js'

const cwd = process.cwd()
const prompt =
  process.argv.slice(2).join(' ').trim() ||
  'Reply with exactly: kernel-embed-ok'

if (typeof globalThis.MACRO === 'undefined') {
  ;(globalThis as typeof globalThis & { MACRO: Record<string, string> }).MACRO =
    {
      VERSION: process.env.CLAUDE_CODE_VERSION || 'dev',
      BUILD_TIME: new Date().toISOString(),
      FEEDBACK_CHANNEL: '',
      ISSUES_EXPLAINER: '',
      NATIVE_PACKAGE_URL: '',
      PACKAGE_URL: '',
      VERSION_CHANGELOG: '',
    }
}

async function main(): Promise<void> {
  // Minimal bootstrap context that main.tsx normally establishes.
  enableConfigs()
  setOriginalCwd(cwd)
  setProjectRoot(cwd)
  setCwdState(cwd)
  setIsInteractive(false)
  setClientType('kernel-example')
  setSessionSource('kernel-example')
  switchSession(asSessionId(randomUUID()))

  // Ensure built-in skill/plugin command sources are registered before getCommands().
  initBundledSkills()
  initBuiltinPlugins()

  const { toolPermissionContext } = await initializeToolPermissionContext({
    allowedToolsCli: [],
    disallowedToolsCli: [],
    baseToolsCli: undefined,
    permissionMode: 'default',
    allowDangerouslySkipPermissions: false,
    addDirs: [],
  })

  const [commands, agentDefinitions] = await Promise.all([
    getCommands(cwd),
    getAgentDefinitionsWithOverrides(cwd),
  ])

  const environment = createDefaultKernelHeadlessEnvironment({
    commands,
    tools: getTools(toolPermissionContext),
    sdkMcpConfigs: {},
    agents: agentDefinitions.activeAgents,
    toolPermissionContext,
  })

  await runKernelHeadless(prompt, environment, {
    continue: undefined,
    resume: undefined,
    resumeSessionAt: undefined,
    verbose: false,
    outputFormat: 'text',
    jsonSchema: undefined,
    permissionPromptToolName: undefined,
    allowedTools: undefined,
    thinkingConfig: undefined,
    maxTurns: 1,
    maxBudgetUsd: undefined,
    taskBudget: undefined,
    systemPrompt: undefined,
    appendSystemPrompt: undefined,
    userSpecifiedModel: process.env.KERNEL_EXAMPLE_MODEL || undefined,
    fallbackModel: undefined,
    teleport: undefined,
    sdkUrl: undefined,
    replayUserMessages: undefined,
    includePartialMessages: undefined,
    forkSession: false,
    rewindFiles: undefined,
    enableAuthStatus: false,
    agent: undefined,
    workload: undefined,
    setupTrigger: undefined,
    sessionStartHooksPromise: undefined,
    setSDKStatus: undefined,
  })
}

await main()
