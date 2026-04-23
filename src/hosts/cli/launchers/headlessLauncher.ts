import {
  connectDefaultKernelHeadlessMcp,
  createDefaultKernelHeadlessEnvironment,
  prepareKernelHeadlessStartup,
  runKernelHeadless,
  type DefaultKernelHeadlessEnvironmentOptions,
  type KernelHeadlessInput,
  type KernelHeadlessRunOptions,
  type PrepareKernelHeadlessStartupDeps,
  type PrepareKernelHeadlessStartupOptions,
} from '../../../kernel/index.js'
import type { ScopedMcpServerConfig } from '../../../services/mcp/types.js'

export type HeadlessLaunchOptions = {
  inputPrompt: KernelHeadlessInput
  environment: DefaultKernelHeadlessEnvironmentOptions
  regularMcpConfigs: Record<string, ScopedMcpServerConfig>
  claudeaiConfigPromise: Promise<Record<string, ScopedMcpServerConfig>>
  startup: PrepareKernelHeadlessStartupOptions
  startupDeps: PrepareKernelHeadlessStartupDeps
  runOptions: KernelHeadlessRunOptions
  profileCheckpoint(checkpoint: string): void
}

export async function runHeadlessLaunch(
  options: HeadlessLaunchOptions,
): Promise<void> {
  const headlessEnvironment = createDefaultKernelHeadlessEnvironment(
    options.environment,
  )

  options.profileCheckpoint('before_connectMcp')
  await connectDefaultKernelHeadlessMcp({
    store: headlessEnvironment.store,
    regularMcpConfigs: options.regularMcpConfigs,
    claudeaiConfigPromise: options.claudeaiConfigPromise,
  })
  options.profileCheckpoint('after_connectMcp')
  options.profileCheckpoint('after_connectMcp_claudeai')

  await prepareKernelHeadlessStartup(options.startup, options.startupDeps)

  void runKernelHeadless(
    options.inputPrompt,
    headlessEnvironment,
    options.runOptions,
  )
}
