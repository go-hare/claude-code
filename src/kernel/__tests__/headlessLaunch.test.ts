import { beforeEach, describe, expect, mock, test } from 'bun:test'

import type {
  KernelHeadlessLaunchDeps,
  KernelHeadlessLaunchOptions,
} from '../headlessLaunch.js'

const callOrder: string[] = []
const materializedEnvironment = {
  commands: [
    { name: 'prompt-ok', type: 'prompt', disableNonInteractive: false },
  ],
  tools: [{ name: 'Bash' }],
  sdkMcpConfigs: { local: { type: 'sdk', name: 'local' } },
  agents: [{ agentType: 'default', source: 'built-in' }],
  toolPermissionContext: { mode: 'default' },
}
const headlessEnvironment = {
  store: { name: 'headless-store' },
  commands: materializedEnvironment.commands,
  tools: materializedEnvironment.tools,
  sdkMcpConfigs: materializedEnvironment.sdkMcpConfigs,
  agents: materializedEnvironment.agents,
}

const mockMaterializeRuntimeHeadlessEnvironment = mock(async (_input: unknown) => {
  callOrder.push('materialize')
  return materializedEnvironment
})
const mockCreateDefaultKernelHeadlessEnvironment = mock((_options: unknown) => {
  callOrder.push('create')
  return headlessEnvironment
})
const mockConnectDefaultKernelHeadlessMcp = mock(async (_options: unknown) => {
  callOrder.push('connect')
  return { claudeaiTimedOut: false }
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

const { runKernelHeadlessLaunch } = await import('../headlessLaunch.js')

function createDeps(): KernelHeadlessLaunchDeps {
  return {
    async materializeRuntimeHeadlessEnvironment(input) {
      return (await mockMaterializeRuntimeHeadlessEnvironment(input)) as never
    },
    createDefaultKernelHeadlessEnvironment(options) {
      return mockCreateDefaultKernelHeadlessEnvironment(options) as never
    },
    async connectDefaultKernelHeadlessMcp(options) {
      return (await mockConnectDefaultKernelHeadlessMcp(options)) as never
    },
    async prepareKernelHeadlessStartup(options, deps) {
      await mockPrepareKernelHeadlessStartup(options, deps)
    },
    async runKernelHeadless(inputPrompt, environment, options) {
      await mockRunKernelHeadless(inputPrompt, environment, options)
    },
  }
}

function createHeadlessLaunchOptions(): KernelHeadlessLaunchOptions {
  const claudeaiConfigPromise = Promise.resolve({
    remote: { type: 'sdk', name: 'remote', scope: 'local' },
  })

  return {
    inputPrompt: 'hello from kernel launch',
    environment: {
      commands: [
        { name: 'prompt-ok', type: 'prompt', disableNonInteractive: false },
      ],
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
      outputFormat: 'text',
      allowedTools: ['Bash'],
      maxTurns: 2,
      userSpecifiedModel: 'claude-sonnet',
    },
    profileCheckpoint(checkpoint) {
      callOrder.push(`checkpoint:${checkpoint}`)
    },
  }
}

describe('runKernelHeadlessLaunch', () => {
  beforeEach(() => {
    callOrder.length = 0
    mockMaterializeRuntimeHeadlessEnvironment.mockClear()
    mockCreateDefaultKernelHeadlessEnvironment.mockClear()
    mockConnectDefaultKernelHeadlessMcp.mockClear()
    mockPrepareKernelHeadlessStartup.mockClear()
    mockRunKernelHeadless.mockClear()
  })

  test('orchestrates the kernel-owned headless launch flow', async () => {
    const options = createHeadlessLaunchOptions()
    const deps = createDeps()

    await runKernelHeadlessLaunch(options, deps)

    expect(callOrder).toEqual([
      'materialize',
      'create',
      'checkpoint:before_connectMcp',
      'connect',
      'checkpoint:after_connectMcp',
      'checkpoint:after_connectMcp_claudeai',
      'prepare',
      'run',
    ])

    expect(mockMaterializeRuntimeHeadlessEnvironment).toHaveBeenCalledWith(
      options.environment,
    )
    expect(mockCreateDefaultKernelHeadlessEnvironment).toHaveBeenCalledWith(
      materializedEnvironment,
    )
    expect(mockConnectDefaultKernelHeadlessMcp).toHaveBeenCalledWith({
      store: headlessEnvironment.store,
      regularMcpConfigs: options.regularMcpConfigs,
      claudeaiConfigPromise: options.claudeaiConfigPromise,
    })
    expect(mockPrepareKernelHeadlessStartup).toHaveBeenCalledWith(
      {
        sessionPersistenceDisabled: false,
        betas: ['beta-1'],
        bareMode: false,
        userType: 'external',
      },
      expect.objectContaining({
        ...options.startupDeps,
        stateWriter: expect.any(Object),
      }),
    )
    expect(mockRunKernelHeadless).toHaveBeenCalledWith(
      options.inputPrompt,
      headlessEnvironment,
      expect.objectContaining({
        continue: false,
        outputFormat: 'text',
        allowedTools: ['Bash'],
        maxTurns: 2,
        userSpecifiedModel: 'claude-sonnet',
        forkSession: false,
        bootstrapStateProvider: expect.any(Object),
      }),
    )
  })

  test('fills default startup and run settings for external hosts', async () => {
    const deps = createDeps()

    await runKernelHeadlessLaunch(
      {
        inputPrompt: 'hello',
        environment: {
          toolPermissionContext: { mode: 'default' },
        } as never,
      },
      deps,
    )

    expect(mockConnectDefaultKernelHeadlessMcp).toHaveBeenCalledWith({
      store: headlessEnvironment.store,
      regularMcpConfigs: {},
      claudeaiConfigPromise: expect.any(Promise),
    })
    expect(mockPrepareKernelHeadlessStartup).toHaveBeenCalledWith(
      {
        sessionPersistenceDisabled: false,
        betas: [],
        bareMode: false,
        userType: process.env.USER_TYPE,
      },
      expect.objectContaining({
        startDeferredPrefetches: expect.any(Function),
        logSessionTelemetry: expect.any(Function),
        stateWriter: expect.any(Object),
      }),
    )
    expect(mockRunKernelHeadless).toHaveBeenCalledWith(
      'hello',
      headlessEnvironment,
      expect.objectContaining({
        continue: false,
        forkSession: false,
        bootstrapStateProvider: expect.any(Object),
      }),
    )
  })
})
