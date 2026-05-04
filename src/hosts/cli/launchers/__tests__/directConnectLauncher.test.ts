import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { DirectConnectLaunchOptions } from '../directConnectLauncher.js'

const callOrder: string[] = []

const mockConnectDirectHostSession = mock(async (_connect: unknown, _writer: unknown) => {
  callOrder.push('connect')
  return {
    sessionId: 'session_123',
    serverUrl: 'http://127.0.0.1:9000',
    wsUrl: 'ws://127.0.0.1:9000/sessions/session_123/ws',
  }
})
const mockGetDirectConnectErrorMessage = mock((error: unknown) => {
  callOrder.push('format-error')
  return `formatted:${String(error)}`
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

mock.module('../directConnectKernelDeps.js', () => ({
  connectDirectHostSession: mockConnectDirectHostSession,
  getDirectConnectErrorMessage: mockGetDirectConnectErrorMessage,
}))

mock.module('../../../../replLauncher.js', () => ({
  launchRepl: mockLaunchRepl,
}))

const { runDirectConnectLaunch } = await import('../directConnectLauncher.js')

afterAll(() => {
  mock.restore()
})

function createLaunchOptions(): DirectConnectLaunchOptions {
  return {
    root: { id: 'root' } as never,
    appProps: {
      getFpsMetrics: () => undefined,
      stats: mockStatsStore,
      initialState: { sessionId: 'session_123' } as never,
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
    connect: {
      serverUrl: 'http://127.0.0.1:9000',
      authToken: 'token',
      cwd: '/tmp/project',
      dangerouslySkipPermissions: true,
    },
    stateWriter: {
      setOriginalCwd: mock(() => {}),
      setCwdState: mock(() => {}),
      setDirectConnectServerUrl: mock(() => {}),
    },
    onConnectionError: mock(async (_message: string) => {
      callOrder.push('error-handler')
    }),
  }
}

describe('runDirectConnectLaunch', () => {
  beforeEach(() => {
    callOrder.length = 0
    mockConnectDirectHostSession.mockClear()
    mockGetDirectConnectErrorMessage.mockClear()
    mockLaunchRepl.mockClear()
  })

  test('connects, builds the info message, and launches the REPL', async () => {
    const options = createLaunchOptions()

    await runDirectConnectLaunch(options)

    expect(callOrder).toEqual(['connect', 'launch'])
    expect(mockConnectDirectHostSession).toHaveBeenCalledWith(
      options.connect,
      options.stateWriter,
    )
    expect(mockLaunchRepl).toHaveBeenCalledWith(
      options.root,
      options.appProps,
      expect.objectContaining({
        ...options.replProps,
        initialTools: [],
        initialMessages: [
          expect.objectContaining({
            type: 'system',
            content:
              'Connected to server at http://127.0.0.1:9000\nSession: session_123',
            level: 'info',
          }),
        ],
        mcpClients: [],
        directConnectConfig: {
          sessionId: 'session_123',
          serverUrl: 'http://127.0.0.1:9000',
          wsUrl: 'ws://127.0.0.1:9000/sessions/session_123/ws',
        },
      }),
      options.renderAndRun,
    )
    expect(options.onConnectionError).toHaveBeenCalledTimes(0)
  })

  test('maps connection failures through the provided error handler', async () => {
    const options = createLaunchOptions()

    mockConnectDirectHostSession.mockImplementationOnce(async () => {
      callOrder.push('connect')
      throw new Error('boom')
    })

    await runDirectConnectLaunch(options)

    expect(callOrder).toEqual(['connect', 'format-error', 'error-handler'])
    expect(mockGetDirectConnectErrorMessage).toHaveBeenCalledTimes(1)
    expect(options.onConnectionError).toHaveBeenCalledWith(
      'formatted:Error: boom',
    )
    expect(mockLaunchRepl).toHaveBeenCalledTimes(0)
  })
})
