import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { HeadlessLaunchOptions } from '../headlessLauncher.js'

const callOrder: string[] = []
const headlessEnvironment = {
  store: { name: 'headless-store' },
  commands: [{ name: 'prompt-ok' }],
  tools: [{ name: 'Bash' }],
  sdkMcpConfigs: { local: { type: 'sdk', name: 'local' } },
  agents: [{ agentType: 'default' }],
}

const mockCreateDefaultKernelHeadlessEnvironment = mock((_options: unknown) => {
  callOrder.push('create')
  return headlessEnvironment
})
const mockConnectDefaultKernelHeadlessMcp = mock(async (_options: unknown) => {
  callOrder.push('connect')
})
const mockPrepareKernelHeadlessStartup = mock(
  async (_options: unknown, _deps: unknown) => {
    callOrder.push('prepare')
  },
)
const mockRunKernelHeadless = mock(
  async (_inputPrompt: unknown, _environment: unknown, _options: unknown) => {
    callOrder.push('run')
  },
)

mock.module('../../../../kernel/index.js', () => ({
  connectDefaultKernelHeadlessMcp: mockConnectDefaultKernelHeadlessMcp,
  createDefaultKernelHeadlessEnvironment:
    mockCreateDefaultKernelHeadlessEnvironment,
  prepareKernelHeadlessStartup: mockPrepareKernelHeadlessStartup,
  runKernelHeadless: mockRunKernelHeadless,
}))

const { runHeadlessLaunch } = await import('../headlessLauncher.js')

function createHeadlessLaunchOptions(): HeadlessLaunchOptions {
  const claudeaiConfigPromise = Promise.resolve({
    remote: { type: 'sdk', name: 'remote', scope: 'local' },
  })

  return {
    inputPrompt: 'hello from launcher',
    environment: {
      commands: [{ name: 'prompt-ok', type: 'prompt', disableNonInteractive: false }],
      tools: [{ name: 'Bash' }],
      sdkMcpConfigs: {
        local: { type: 'sdk', name: 'local', scope: 'local' },
      },
      agents: [{ agentType: 'default', source: 'builtin' }],
      toolPermissionContext: { mode: 'default' },
      disableSlashCommands: false,
    } as never,
    regularMcpConfigs: {
      project: { type: 'stdio', command: 'echo', args: ['ok'], scope: 'local' },
    } as never,
    claudeaiConfigPromise: claudeaiConfigPromise as never,
    startup: {
      sessionPersistenceDisabled: false,
      betas: ['beta-1'],
      bareMode: false,
      userType: 'external',
    },
    startupDeps: {
      startDeferredPrefetches: mock(() => {}),
      logSessionTelemetry: mock(() => {}),
    },
    runOptions: {
      continue: false,
      resume: undefined,
      resumeSessionAt: undefined,
      verbose: false,
      outputFormat: 'text',
      jsonSchema: undefined,
      permissionPromptToolName: undefined,
      allowedTools: ['Bash'],
      thinkingConfig: undefined,
      maxTurns: 2,
      maxBudgetUsd: undefined,
      taskBudget: undefined,
      systemPrompt: undefined,
      appendSystemPrompt: undefined,
      userSpecifiedModel: 'claude-sonnet',
      fallbackModel: undefined,
      teleport: undefined,
      sdkUrl: undefined,
      replayUserMessages: undefined,
      includePartialMessages: undefined,
      forkSession: false,
      rewindFiles: undefined,
      enableAuthStatus: undefined,
      agent: undefined,
      workload: undefined,
      setupTrigger: undefined,
      sessionStartHooksPromise: undefined,
    },
    profileCheckpoint(checkpoint) {
      callOrder.push(`checkpoint:${checkpoint}`)
    },
  }
}

describe('runHeadlessLaunch', () => {
  beforeEach(() => {
    callOrder.length = 0
    mockCreateDefaultKernelHeadlessEnvironment.mockClear()
    mockConnectDefaultKernelHeadlessMcp.mockClear()
    mockPrepareKernelHeadlessStartup.mockClear()
    mockRunKernelHeadless.mockClear()
  })

  test('orchestrates headless kernel startup in the expected order', async () => {
    const options = createHeadlessLaunchOptions()

    await runHeadlessLaunch(options)

    expect(callOrder).toEqual([
      'create',
      'checkpoint:before_connectMcp',
      'connect',
      'checkpoint:after_connectMcp',
      'checkpoint:after_connectMcp_claudeai',
      'prepare',
      'run',
    ])

    expect(mockCreateDefaultKernelHeadlessEnvironment).toHaveBeenCalledWith(
      options.environment,
    )
    expect(mockConnectDefaultKernelHeadlessMcp).toHaveBeenCalledWith({
      store: headlessEnvironment.store,
      regularMcpConfigs: options.regularMcpConfigs,
      claudeaiConfigPromise: options.claudeaiConfigPromise,
    })
    expect(mockPrepareKernelHeadlessStartup).toHaveBeenCalledWith(
      options.startup,
      options.startupDeps,
    )
    expect(mockRunKernelHeadless).toHaveBeenCalledWith(
      options.inputPrompt,
      headlessEnvironment,
      options.runOptions,
    )
  })

  test('returns after kickoff without waiting for the kernel run loop to finish', async () => {
    const options = createHeadlessLaunchOptions()
    let releaseRun: (() => void) | undefined

    mockRunKernelHeadless.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          callOrder.push('run')
          releaseRun = resolve
        }),
    )

    const result = await Promise.race([
      runHeadlessLaunch(options).then(() => 'launch-finished'),
      new Promise<string>(resolve => {
        setTimeout(() => resolve('timed-out'), 50)
      }),
    ])

    expect(result).toBe('launch-finished')

    releaseRun?.()
  })
})
