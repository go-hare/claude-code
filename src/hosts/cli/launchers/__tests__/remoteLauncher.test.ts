import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { RemoteLaunchOptions } from '../remoteLauncher.js'

const callOrder: string[] = []

const mockGetBranch = mock(async () => 'feature/test-branch')
const mockTeleportToRemoteWithErrorHandling = mock(
  async (
    _root: unknown,
    _description: string | null,
    _signal: AbortSignal,
    _branchName?: string,
  ): Promise<{ id: string; title: string } | null> => {
    callOrder.push('teleport')
    return {
      id: 'remote-session-123',
      title: 'Remote session',
    }
  },
)
const mockPrepareApiRequest = mock(async () => {
  callOrder.push('prepare-auth')
  return {
    accessToken: 'fallback-token',
    orgUUID: 'org-123',
  }
})
const mockGetClaudeAIOAuthTokens = mock(() => ({
  accessToken: 'fresh-token',
}))
const mockCreateRemoteSessionConfig = mock(
  (
    sessionId: string,
    _getAccessToken: () => string,
    orgUuid: string,
    hasInitialPrompt: boolean,
  ) => {
    callOrder.push('remote-config')
    return {
      sessionId,
      orgUuid,
      hasInitialPrompt,
    }
  },
)
const mockFilterCommandsForRemoteMode = mock((commands: unknown[]) => {
  callOrder.push('filter-commands')
  return commands
})
const mockLaunchRepl = mock(
  async (
    _root: unknown,
    _appProps: unknown,
    _replProps: unknown,
    _renderAndRun: unknown,
  ) => {
    callOrder.push('launch')
  },
)
const mockStatsStore = {
  increment() {},
  set() {},
  observe() {},
  add() {},
  getAll() {
    return {}
  },
} as never

const actualCommands = await import('../../../../commands.js')

mock.module('../remoteGitDeps.js', () => ({
  getBranch: mockGetBranch,
}))

mock.module('../../../../utils/teleport.js', () => ({
  teleportToRemoteWithErrorHandling: mockTeleportToRemoteWithErrorHandling,
  checkOutTeleportedSessionBranch: mock(async () => ({
    branchName: 'main',
    branchError: null,
  })),
  processMessagesForTeleportResume: mock((_messages: unknown, _error: unknown) => []),
  validateGitState: mock(async () => {}),
  validateSessionRepository: mock(async () => ({ status: 'match' })),
}))

mock.module('../teleportApiDeps.js', () => ({
  prepareApiRequest: mockPrepareApiRequest,
  fetchSession: mock(async (_sessionId: string) => ({})),
}))

mock.module('../launchAuthDeps.js', () => ({
  checkAndRefreshOAuthTokenIfNeeded: mock(async () => {}),
  getClaudeAIOAuthTokens: mockGetClaudeAIOAuthTokens,
}))

mock.module('../../../../remote/RemoteSessionManager.js', () => ({
  createRemoteSessionConfig: mockCreateRemoteSessionConfig,
}))

mock.module('../../../../commands.js', () => ({
  ...actualCommands,
  filterCommandsForRemoteMode: mockFilterCommandsForRemoteMode,
}))

mock.module('../../../../replLauncher.js', () => ({
  launchRepl: mockLaunchRepl,
}))

const { runRemoteLaunch } = await import('../remoteLauncher.js')

afterAll(() => {
  mock.restore()
})

function createLaunchOptions(): RemoteLaunchOptions {
  return {
    root: { id: 'root' } as never,
    appProps: {
      getFpsMetrics: () => undefined,
      stats: mockStatsStore,
      initialState: {
        sessionId: 'session-1',
      } as never,
    },
    replProps: {
      debug: true,
      commands: [{ name: 'help' }] as never,
      autoConnectIdeFlag: false,
      mainThreadAgentDefinition: undefined,
      disableSlashCommands: false,
      thinkingConfig: { type: 'adaptive' },
    },
    renderAndRun: mock(async () => {}) as never,
    remotePrompt: 'remote prompt',
    isRemoteTuiEnabled: true,
    onSessionCreated: mock((_session: { id: string; title: string }) => {
      callOrder.push('created')
    }),
    stateWriter: {
      enableRemoteMode: mock((_sessionId: string) => {
        callOrder.push('enable-remote')
      }),
    },
    onConnectionError: mock(async (_message: string) => {
      callOrder.push('error')
    }),
    onCreatedWithoutTui: mock(async (_session: { id: string; title: string }) => {
      callOrder.push('created-without-tui')
    }),
  }
}

describe('runRemoteLaunch', () => {
  beforeEach(() => {
    callOrder.length = 0
    mockGetBranch.mockClear()
    mockTeleportToRemoteWithErrorHandling.mockClear()
    mockPrepareApiRequest.mockClear()
    mockGetClaudeAIOAuthTokens.mockClear()
    mockCreateRemoteSessionConfig.mockClear()
    mockFilterCommandsForRemoteMode.mockClear()
    mockLaunchRepl.mockClear()
  })

  test('creates a remote session and launches the REPL in remote TUI mode', async () => {
    const options = createLaunchOptions()

    await runRemoteLaunch(options)

    expect(callOrder).toEqual([
      'teleport',
      'created',
      'enable-remote',
      'prepare-auth',
      'remote-config',
      'filter-commands',
      'launch',
    ])
    expect(mockGetBranch).toHaveBeenCalledTimes(1)
    expect(mockCreateRemoteSessionConfig).toHaveBeenCalledWith(
      'remote-session-123',
      expect.any(Function),
      'org-123',
      true,
    )
    expect(options.onConnectionError).toHaveBeenCalledTimes(0)
    expect(options.onCreatedWithoutTui).toHaveBeenCalledTimes(0)
    const launchArgs = mockLaunchRepl.mock.calls[0] as unknown as
      | [unknown, unknown, { initialMessages?: unknown[] }, unknown]
      | undefined
    expect(launchArgs?.[2].initialMessages?.[0]).toMatchObject({
      type: 'system',
      content: expect.stringContaining('/remote-session-123?m=0'),
      level: 'info',
    })
    expect(launchArgs?.[2].initialMessages?.[1]).toMatchObject({
      type: 'user',
      message: { content: 'remote prompt' },
    })
  })

  test('hands off to the non-TUI callback when remote TUI is disabled', async () => {
    const options = createLaunchOptions()
    options.isRemoteTuiEnabled = false

    await runRemoteLaunch(options)

    expect(options.onSessionCreated).toHaveBeenCalledWith({
      id: 'remote-session-123',
      title: 'Remote session',
    })
    expect(options.onCreatedWithoutTui).toHaveBeenCalledWith({
      id: 'remote-session-123',
      title: 'Remote session',
    })
    expect(mockLaunchRepl).toHaveBeenCalledTimes(0)
  })

  test('reports missing descriptions when remote TUI is disabled', async () => {
    const options = createLaunchOptions()
    options.isRemoteTuiEnabled = false
    options.remotePrompt = ''

    await runRemoteLaunch(options)

    expect(options.onConnectionError).toHaveBeenCalledWith(
      'Error: --remote requires a description.\nUsage: hare --remote "your task description"',
    )
    expect(mockTeleportToRemoteWithErrorHandling).toHaveBeenCalledTimes(0)
  })

  test('reports remote session creation failures', async () => {
    const options = createLaunchOptions()

    mockTeleportToRemoteWithErrorHandling.mockImplementationOnce(async () => {
      callOrder.push('teleport')
      return null
    })

    await runRemoteLaunch(options)

    expect(options.onConnectionError).toHaveBeenCalledWith(
      'Error: Unable to create remote session',
    )
    expect(mockLaunchRepl).toHaveBeenCalledTimes(0)
  })
})
