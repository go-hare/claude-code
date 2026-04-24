import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { AssistantChatLaunchOptions } from '../assistantChatLauncher.js'

const callOrder: string[] = []
const infoMessage = {
  uuid: 'msg-assistant',
  type: 'system',
  content: 'assistant-attached',
}

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
const mockCreateSystemMessage = mock((_message: string, _variant: string) => {
  callOrder.push('message')
  return infoMessage
})
const mockCreateUserMessage = mock((_options: { content: string }) => ({
  uuid: 'msg-user',
  type: 'user',
  content: _options.content,
}))
const mockCreateRemoteSessionConfig = mock(
  (
    sessionId: string,
    _getAccessToken: () => string,
    orgUuid: string,
    hasInitialPrompt: boolean,
    viewerOnly: boolean,
  ) => {
    callOrder.push('remote-config')
    return {
      sessionId,
      orgUuid,
      hasInitialPrompt,
      viewerOnly,
    }
  },
)
const mockFilterCommandsForRemoteMode = mock((commands: unknown[]) => {
  callOrder.push('filter-commands')
  return commands
})
const mockStatsStore = {
  increment() {},
  set() {},
  observe() {},
  add() {},
  getAll() {
    return {}
  },
} as never

type MockAssistantSession = { id: string }

const mockDiscoverAssistantSessions = mock(
  async (): Promise<MockAssistantSession[]> => [],
)
const mockLaunchAssistantInstallWizard = mock(
  async (_root: unknown): Promise<string | null> => null,
)
const mockLaunchAssistantSessionChooser = mock(
  async (_root: unknown, _props: unknown): Promise<string | null> => null,
)
const mockCheckAndRefreshOAuthTokenIfNeeded = mock(async () => {
  callOrder.push('refresh-auth')
})
const mockGetClaudeAIOAuthTokens = mock(() => ({
  accessToken: 'fresh-token',
}))
const mockPrepareApiRequest = mock(async () => {
  callOrder.push('prepare-auth')
  return {
    accessToken: 'fallback-token',
    orgUUID: 'org-123',
  }
})

mock.module('../../../../replLauncher.js', () => ({
  launchRepl: mockLaunchRepl,
}))

mock.module('../../../../utils/messages.js', () => ({
  createSystemMessage: mockCreateSystemMessage,
  createUserMessage: mockCreateUserMessage,
}))

mock.module('../../../../remote/RemoteSessionManager.js', () => ({
  createRemoteSessionConfig: mockCreateRemoteSessionConfig,
}))

mock.module('../../../../commands.js', () => ({
  filterCommandsForRemoteMode: mockFilterCommandsForRemoteMode,
}))

mock.module('../../../../assistant/sessionDiscovery.js', () => ({
  discoverAssistantSessions: mockDiscoverAssistantSessions,
}))

mock.module('../../../../dialogLaunchers.js', () => ({
  launchAssistantInstallWizard: mockLaunchAssistantInstallWizard,
  launchAssistantSessionChooser: mockLaunchAssistantSessionChooser,
  launchResumeChooser: mock(async () => {}),
  launchTeleportRepoMismatchDialog: mock(async () => null),
  launchTeleportResumeWrapper: mock(async () => null),
}))

mock.module('../../../../utils/auth.js', () => ({
  checkAndRefreshOAuthTokenIfNeeded: mockCheckAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens: mockGetClaudeAIOAuthTokens,
}))

mock.module('../../../../utils/teleport/api.js', () => ({
  prepareApiRequest: mockPrepareApiRequest,
  fetchSession: mock(async (_sessionId: string) => ({})),
}))

const { runAssistantChatLaunch } = await import('../assistantChatLauncher.js')

function createLaunchOptions(): AssistantChatLaunchOptions {
  return {
    root: { id: 'root' } as never,
    appProps: {
      getFpsMetrics: () => undefined,
      stats: mockStatsStore,
      initialState: {
        sessionId: 'session-1',
        isBriefOnly: false,
        kairosEnabled: true,
        replBridgeEnabled: true,
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
    assistant: {
      sessionId: undefined,
      discover: true,
    },
    stateWriter: {
      enableRemoteAssistantMode: mock(() => {
        callOrder.push('enable-remote')
      }),
    },
    onConnectionError: mock(async (_message: string) => {
      callOrder.push('error')
    }),
    onCancelled: mock(async () => {
      callOrder.push('cancelled')
    }),
    onInstalled: mock(async (_installedDir: string) => {
      callOrder.push('installed')
    }),
  }
}

describe('runAssistantChatLaunch', () => {
  beforeEach(() => {
    callOrder.length = 0
    mockLaunchRepl.mockClear()
    mockCreateSystemMessage.mockClear()
    mockCreateRemoteSessionConfig.mockClear()
    mockFilterCommandsForRemoteMode.mockClear()
    mockDiscoverAssistantSessions.mockClear()
    mockLaunchAssistantInstallWizard.mockClear()
    mockLaunchAssistantSessionChooser.mockClear()
    mockCheckAndRefreshOAuthTokenIfNeeded.mockClear()
    mockGetClaudeAIOAuthTokens.mockClear()
    mockPrepareApiRequest.mockClear()
  })

  test('discovers a single session and launches the assistant viewer REPL', async () => {
    const options = createLaunchOptions()

    mockDiscoverAssistantSessions.mockImplementationOnce(async () => [
      {
        id: 'assistant-session-12345678',
      },
    ])

    await runAssistantChatLaunch(options)

    expect(callOrder).toEqual([
      'refresh-auth',
      'prepare-auth',
      'enable-remote',
      'remote-config',
      'message',
      'filter-commands',
      'launch',
    ])
    expect(mockCreateRemoteSessionConfig).toHaveBeenCalledWith(
      'assistant-session-12345678',
      expect.any(Function),
      'org-123',
      false,
      true,
    )
    expect(mockCreateSystemMessage).toHaveBeenCalledWith(
      'Attached to assistant session assistan…',
      'info',
    )
    expect(mockLaunchRepl).toHaveBeenCalledTimes(1)
    expect(options.onConnectionError).toHaveBeenCalledTimes(0)
    expect(options.onCancelled).toHaveBeenCalledTimes(0)
  })

  test('runs the install flow when discovery finds no sessions', async () => {
    const options = createLaunchOptions()

    mockDiscoverAssistantSessions.mockImplementationOnce(async () => [])
    mockLaunchAssistantInstallWizard.mockImplementationOnce(
      async () => '/tmp/assistant-home',
    )

    await runAssistantChatLaunch(options)

    expect(options.onInstalled).toHaveBeenCalledWith('/tmp/assistant-home')
    expect(mockLaunchRepl).toHaveBeenCalledTimes(0)
  })

  test('routes discovery failures through the provided error handler', async () => {
    const options = createLaunchOptions()

    mockDiscoverAssistantSessions.mockImplementationOnce(async () => {
      throw new Error('discovery failed')
    })

    await runAssistantChatLaunch(options)

    expect(options.onConnectionError).toHaveBeenCalledWith(
      'Failed to discover sessions: discovery failed',
    )
    expect(mockLaunchRepl).toHaveBeenCalledTimes(0)
  })

  test('lets the user pick from multiple sessions', async () => {
    const options = createLaunchOptions()

    mockDiscoverAssistantSessions.mockImplementationOnce(async () => [
      { id: 'assistant-session-11111111' },
      { id: 'assistant-session-22222222' },
    ])
    mockLaunchAssistantSessionChooser.mockImplementationOnce(
      async () => 'assistant-session-22222222',
    )

    await runAssistantChatLaunch(options)

    expect(mockLaunchAssistantSessionChooser).toHaveBeenCalledTimes(1)
    expect(mockCreateRemoteSessionConfig).toHaveBeenCalledWith(
      'assistant-session-22222222',
      expect.any(Function),
      'org-123',
      false,
      true,
    )
  })
})
