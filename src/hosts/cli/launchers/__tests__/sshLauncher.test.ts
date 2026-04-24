import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SSHLaunchOptions } from '../sshLauncher.js'

const callOrder: string[] = []
const sshInfoMessage = {
  uuid: 'msg-ssh',
  type: 'system',
  content: 'ssh-connected',
}

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
const mockCreateSystemMessage = mock((_message: string, _variant: string) => {
  callOrder.push('message')
  return sshInfoMessage
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

mock.module('../../../../ssh/createSSHSession.js', () => ({
  createSSHSession: mockCreateSSHSession,
  createLocalSSHSession: mockCreateLocalSSHSession,
  SSHSessionError: MockSSHSessionError,
}))

mock.module('../../../../replLauncher.js', () => ({
  launchRepl: mockLaunchRepl,
}))

mock.module('../../../../utils/messages.js', () => ({
  createSystemMessage: mockCreateSystemMessage,
}))

const { runSshRemoteLaunch } = await import('../sshLauncher.js')

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
    mockCreateSystemMessage.mockClear()
  })

  test('creates a remote SSH session and launches the REPL', async () => {
    const options = createLaunchOptions()

    await runSshRemoteLaunch(options)

    expect(mockCreateSSHSession).toHaveBeenCalledTimes(1)
    expect(options.stateWriter.setOriginalCwd).toHaveBeenCalledWith(
      '/tmp/remote-cwd',
    )
    expect(options.stateWriter.setCwdState).toHaveBeenCalledWith(
      '/tmp/remote-cwd',
    )
    expect(options.stateWriter.setDirectConnectServerUrl).toHaveBeenCalledWith(
      'example-host',
    )
    expect(mockCreateSystemMessage).toHaveBeenCalledWith(
      'SSH session to example-host\nRemote cwd: /tmp/remote-cwd\nAuth: unix socket -R -> local proxy',
      'info',
    )
    expect(mockLaunchRepl).toHaveBeenCalledTimes(1)
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
    expect(mockCreateSystemMessage).toHaveBeenCalledWith(
      'Local ssh-proxy test session\ncwd: /tmp/local-cwd\nAuth: unix socket -> local proxy',
      'info',
    )
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
