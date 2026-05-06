import type { ScopedMcpServerConfig } from '../services/mcp/types.js'
import {
  materializeRuntimeHeadlessEnvironment,
  type RuntimeHeadlessEnvironmentInput,
} from '../runtime/capabilities/execution/headlessCapabilityMaterializer.js'
import {
  createBootstrapStateProvider,
  createRuntimeHeadlessStartupStateWriter,
} from '../runtime/core/state/bootstrapProvider.js'
import {
  createDefaultKernelHeadlessEnvironment,
  runKernelHeadless,
  type DefaultKernelHeadlessEnvironmentOptions,
  type KernelHeadlessInput,
  type KernelHeadlessRunOptions,
} from './headless.js'
import { connectDefaultKernelHeadlessMcp } from './headlessMcp.js'
import {
  prepareKernelHeadlessStartup,
  type PrepareKernelHeadlessStartupDeps,
  type PrepareKernelHeadlessStartupOptions,
} from './headlessStartup.js'

export type KernelHeadlessLaunchEnvironmentInput =
  RuntimeHeadlessEnvironmentInput

export type KernelHeadlessLaunchRunOptions = Partial<
  Omit<KernelHeadlessRunOptions, 'bootstrapStateProvider'>
>

export type KernelHeadlessLaunchStartupOptions =
  Partial<PrepareKernelHeadlessStartupOptions>

export type KernelHeadlessLaunchStartupDeps =
  Partial<PrepareKernelHeadlessStartupDeps>

export type KernelHeadlessLaunchOptions = {
  inputPrompt: KernelHeadlessInput
  environment: KernelHeadlessLaunchEnvironmentInput
  regularMcpConfigs?: Record<string, ScopedMcpServerConfig>
  claudeaiConfigPromise?: Promise<Record<string, ScopedMcpServerConfig>>
  startup?: KernelHeadlessLaunchStartupOptions
  startupDeps?: KernelHeadlessLaunchStartupDeps
  runOptions?: KernelHeadlessLaunchRunOptions
  profileCheckpoint?: (checkpoint: string) => void
}

export type KernelHeadlessLaunchDeps = {
  materializeRuntimeHeadlessEnvironment: (
    input: KernelHeadlessLaunchEnvironmentInput,
  ) => Promise<DefaultKernelHeadlessEnvironmentOptions>
  createDefaultKernelHeadlessEnvironment: typeof createDefaultKernelHeadlessEnvironment
  connectDefaultKernelHeadlessMcp: typeof connectDefaultKernelHeadlessMcp
  prepareKernelHeadlessStartup: typeof prepareKernelHeadlessStartup
  runKernelHeadless: typeof runKernelHeadless
}

const defaultDeps: KernelHeadlessLaunchDeps = {
  materializeRuntimeHeadlessEnvironment,
  createDefaultKernelHeadlessEnvironment,
  connectDefaultKernelHeadlessMcp,
  prepareKernelHeadlessStartup,
  runKernelHeadless,
}

const EMPTY_MCP_CONFIGS: Record<string, ScopedMcpServerConfig> = {}

function noop(): void {}

function normalizeHeadlessStartupOptions(
  options: KernelHeadlessLaunchStartupOptions = {},
): PrepareKernelHeadlessStartupOptions {
  return {
    sessionPersistenceDisabled: options.sessionPersistenceDisabled ?? false,
    betas: options.betas ?? [],
    bareMode: options.bareMode ?? false,
    userType: options.userType ?? process.env.USER_TYPE,
  }
}

function normalizeHeadlessStartupDeps(
  stateWriter: NonNullable<PrepareKernelHeadlessStartupDeps['stateWriter']>,
  deps: KernelHeadlessLaunchStartupDeps = {},
): PrepareKernelHeadlessStartupDeps {
  return {
    stateWriter: deps.stateWriter ?? stateWriter,
    startDeferredPrefetches: deps.startDeferredPrefetches ?? noop,
    logSessionTelemetry: deps.logSessionTelemetry ?? noop,
    startBackgroundHousekeeping: deps.startBackgroundHousekeeping,
    startProtocolMemoryMonitor: deps.startProtocolMemoryMonitor,
  }
}

function normalizeHeadlessRunOptions(
  options: KernelHeadlessLaunchRunOptions = {},
): KernelHeadlessRunOptions {
  return {
    continue: options.continue ?? false,
    resume: options.resume,
    resumeSessionAt: options.resumeSessionAt,
    verbose: options.verbose,
    outputFormat: options.outputFormat,
    jsonSchema: options.jsonSchema,
    permissionPromptToolName: options.permissionPromptToolName,
    allowedTools: options.allowedTools,
    thinkingConfig: options.thinkingConfig,
    maxTurns: options.maxTurns,
    maxBudgetUsd: options.maxBudgetUsd,
    taskBudget: options.taskBudget,
    systemPrompt: options.systemPrompt,
    appendSystemPrompt: options.appendSystemPrompt,
    userSpecifiedModel: options.userSpecifiedModel,
    fallbackModel: options.fallbackModel,
    teleport: options.teleport,
    sdkUrl: options.sdkUrl,
    replayUserMessages: options.replayUserMessages,
    includePartialMessages: options.includePartialMessages,
    resumeInterruptedTurn: options.resumeInterruptedTurn,
    forkSession: options.forkSession ?? false,
    rewindFiles: options.rewindFiles,
    enableAuthStatus: options.enableAuthStatus,
    agent: options.agent,
    workload: options.workload,
    setupTrigger: options.setupTrigger,
    sessionStartHooksPromise: options.sessionStartHooksPromise,
    setProtocolStatus: options.setProtocolStatus,
    runtimeEventSink: options.runtimeEventSink,
  }
}

/**
 * Stable public headless launch entry.
 *
 * This is the kernel-owned equivalent of the CLI headless launch chain:
 * materialize runtime capabilities, connect MCP, prepare startup state, then
 * enter the runtime headless loop.
 */
export async function runKernelHeadlessLaunch(
  options: KernelHeadlessLaunchOptions,
  deps: KernelHeadlessLaunchDeps = defaultDeps,
): Promise<void> {
  const bootstrapStateProvider = createBootstrapStateProvider()
  const profileCheckpoint = options.profileCheckpoint ?? noop
  const materializedEnvironment =
    await deps.materializeRuntimeHeadlessEnvironment(options.environment)
  const headlessEnvironment =
    deps.createDefaultKernelHeadlessEnvironment(materializedEnvironment)

  profileCheckpoint('before_connectMcp')
  await deps.connectDefaultKernelHeadlessMcp({
    store: headlessEnvironment.store,
    regularMcpConfigs: options.regularMcpConfigs ?? EMPTY_MCP_CONFIGS,
    claudeaiConfigPromise:
      options.claudeaiConfigPromise ?? Promise.resolve(EMPTY_MCP_CONFIGS),
  })
  profileCheckpoint('after_connectMcp')
  profileCheckpoint('after_connectMcp_claudeai')

  await deps.prepareKernelHeadlessStartup(
    normalizeHeadlessStartupOptions(options.startup),
    normalizeHeadlessStartupDeps(
      createRuntimeHeadlessStartupStateWriter(
        bootstrapStateProvider.runWithState,
      ),
      options.startupDeps,
    ),
  )

  await deps.runKernelHeadless(options.inputPrompt, headlessEnvironment, {
    ...normalizeHeadlessRunOptions(options.runOptions),
    bootstrapStateProvider,
  })
}
