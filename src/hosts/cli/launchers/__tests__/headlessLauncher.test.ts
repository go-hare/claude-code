import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type {
  HeadlessLaunchDeps,
  HeadlessLaunchOptions,
} from '../headlessLauncher.js'

const mockRunKernelHeadlessLaunch = mock(async (_options: unknown) => {})

const { runHeadlessLaunch } = await import('../headlessLauncher.js')

function createDeps(): HeadlessLaunchDeps {
  return {
    async runKernelHeadlessLaunch(options) {
      await mockRunKernelHeadlessLaunch(options)
    },
  }
}

function createHeadlessLaunchOptions(): HeadlessLaunchOptions {
  const claudeaiConfigPromise = Promise.resolve({
    remote: { type: 'sdk', name: 'remote', scope: 'local' },
  })

  return {
    inputPrompt: 'hello from launcher',
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
    profileCheckpoint(_checkpoint) {},
  }
}

describe('runHeadlessLaunch', () => {
  beforeEach(() => {
    mockRunKernelHeadlessLaunch.mockClear()
  })

  test('delegates to the kernel public headless launch API', async () => {
    const options = createHeadlessLaunchOptions()
    const deps = createDeps()

    await runHeadlessLaunch(options, deps)

    expect(mockRunKernelHeadlessLaunch).toHaveBeenCalledTimes(1)
    expect(mockRunKernelHeadlessLaunch).toHaveBeenCalledWith(options)
  })

  test('resolves only after the delegated launch promise resolves', async () => {
    const options = createHeadlessLaunchOptions()
    const deps = createDeps()
    let releaseLaunch: (() => void) | undefined

    mockRunKernelHeadlessLaunch.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          releaseLaunch = resolve
        }),
    )

    const launchPromise = runHeadlessLaunch(options, deps).then(
      () => 'launch-finished',
    )
    const result = await Promise.race([
      launchPromise,
      new Promise<string>(resolve => {
        setTimeout(() => resolve('timed-out'), 50)
      }),
    ])

    expect(result).toBe('timed-out')

    releaseLaunch?.()
    await expect(launchPromise).resolves.toBe('launch-finished')
  })
})
