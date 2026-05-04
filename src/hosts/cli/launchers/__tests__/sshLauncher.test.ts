import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SSHLaunchOptions } from '../sshLauncher.js'

const callOrder: string[] = []

const mockCreateSSHSession = mock(async (_options: unknown, _hooks?: unknown) => {
  callOrder.push('create-remote')
  return {
    remoteCwd: '/tmp/remote-cwd',
  }
})
const mockCreateLocalSSHSession = mock(async (_options: unknown) => {
  callOrder.push('create-local')
  return {
    remoteCwd: '/tmp/local-cwd',
  }
})
class MockSSHSessionError extends Error {}

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

mock.module('../../../../ssh/createSSHSession.js', () => ({
  createSSHSession: mockCreateSSHSession,
  createLocalSSHSession: mockCreateLocalSSHSession,
  SSHSessionError: MockSSHSessionError,
}))

mock.module('../../../../replLauncher.js', () => ({
  launchRepl: mockLaunchRepl,
}))

const { runSshRemoteLaunch } = await import('../sshLauncher.js')

afterAll(() => {
  mock.restore()
})

function createLaunchOptions(): SSHLaunchOptions {
  return {
    root: { id: 'root' } as never,
    appProps: {
      getFpsMetrics: () => undefined,
      stats: mockStatsStore,
      initialState: { sessionId: 'session-1' } as never,
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
    ssh: {
      host: 'example-host',
      cwd: '/tmp/project',
      local: false,
      permissionMode: 'default',
      dangerouslySkipPermissions: true,
      remoteBin: 'bun /tmp/project/dist/cli.js',
      extraCliArgs: ['--debug'],
    },
    localVersion: '1.2.3',
    stateWriter: {
      setOriginalCwd: mock(() => {}),
      setCwdState: mock(() => {}),
      setDirectConnectServerUrl: mock(() => {}),
    },
    onConnectionError: mock(async (_message: string) => {
      callOrder.push('error')
    }),
    stderr: {
      write: mock((_message: string) => {
        callOrder.push('stderr')
      }),
      isTTY: false,
    },
  }
}

describe('runSshRemoteLaunch', () => {
  beforeEach(() => {
    callOrder.length = 0
    mockCreateSSHSession.mockClear()
    mockCreateLocalSSHSession.mockClear()
    mockLaunchRepl.mockClear()
  })

  test('creates a remote SSH session and launches the REPL', async () => {
    const options = createLaunchOptions()

    await runSshRemoteLaunch(options)

    expect(mockCreateSSHSession).toHaveBeenCalledTimes(1)
    expect(mockCreateSSHSession).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteBin: 'bun /tmp/project/dist/cli.js',
      }),
      expect.any(Object),
    )
    expect(options.stateWriter.setOriginalCwd).toHaveBeenCalledWith(
      '/tmp/remote-cwd',
    )
    expect(options.stateWriter.setCwdState).toHaveBeenCalledWith(
      '/tmp/remote-cwd',
    )
    expect(options.stateWriter.setDirectConnectServerUrl).toHaveBeenCalledWith(
      'example-host',
    )
    expect(mockLaunchRepl).toHaveBeenCalledTimes(1)
    const launchArgs = mockLaunchRepl.mock.calls[0] as unknown as
      | [unknown, unknown, { initialMessages?: unknown[] }, unknown]
      | undefined
    expect(launchArgs?.[2].initialMessages?.[0]).toMatchObject({
      type: 'system',
      content:
        'SSH session to example-host\nRemote cwd: /tmp/remote-cwd\nAuth: unix socket -R -> local proxy',
      level: 'info',
    })
    expect(options.onConnectionError).toHaveBeenCalledTimes(0)
  })

  test('creates a local SSH test session when local mode is enabled', async () => {
    const options = createLaunchOptions()
    options.ssh.local = true

    await runSshRemoteLaunch(options)

    expect(mockCreateLocalSSHSession).toHaveBeenCalledTimes(1)
    expect(options.stateWriter.setDirectConnectServerUrl).toHaveBeenCalledWith(
      'local',
    )
    const launchArgs = mockLaunchRepl.mock.calls[0] as unknown as
      | [unknown, unknown, { initialMessages?: unknown[] }, unknown]
      | undefined
    expect(launchArgs?.[2].initialMessages?.[0]).toMatchObject({
      type: 'system',
      content:
        'Local ssh-proxy test session\ncwd: /tmp/local-cwd\nAuth: unix socket -> local proxy',
      level: 'info',
    })
  })

  test('routes SSH setup failures through the provided error handler', async () => {
    const options = createLaunchOptions()

    mockCreateSSHSession.mockImplementationOnce(async () => {
      callOrder.push('create-remote')
      throw new MockSSHSessionError('ssh failed')
    })

    await runSshRemoteLaunch(options)

    expect(options.onConnectionError).toHaveBeenCalledWith('ssh failed')
    expect(mockLaunchRepl).toHaveBeenCalledTimes(0)
  })
})
