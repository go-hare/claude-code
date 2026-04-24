import { beforeEach, describe, expect, mock, test } from 'bun:test'

const mockCreateDirectConnectSession = mock(async () => ({
  config: {
    sessionId: 'session_123',
    serverUrl: 'http://127.0.0.1:9000',
    wsUrl: 'ws://127.0.0.1:9000/sessions/session_123/ws',
  },
  workDir: '/tmp/workdir',
}))
const mockRunConnectHeadless = mock(async () => {})
const mockStartServer = mock(() => ({
  port: 0,
  stop: mock((_closeActiveConnections: boolean) => {}),
}))
const mockCreateServerLogger = mock(() => ({
  warn: mock(() => {}),
}))
const mockDangerousBackendInstance = { kind: 'backend' }

const MockSessionManager = mock(function MockSessionManager(
  this: Record<string, unknown>,
  backend: unknown,
  options: unknown,
) {
  this.backend = backend
  this.options = options
  this.destroyAll = mock(async () => {})
})

const MockDangerousBackend = mock(() => mockDangerousBackendInstance)

class MockDirectConnectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DirectConnectError'
  }
}

mock.module('../../runtime/capabilities/server/DirectConnectSessionApi.js', () => ({
  createDirectConnectSessionRuntime: mockCreateDirectConnectSession,
  DirectConnectError: MockDirectConnectError,
}))

mock.module('../../runtime/capabilities/server/HostRuntime.js', () => ({
  runConnectHeadlessRuntime: mockRunConnectHeadless,
  startServerRuntimeHost: mockStartServer,
}))

mock.module('../../runtime/capabilities/server/SessionManager.js', () => ({
  SessionManager: MockSessionManager,
}))

mock.module('../../server/backends/dangerousBackend.js', () => ({
  DangerousBackend: MockDangerousBackend,
}))

mock.module('../../server/serverLog.js', () => ({
  createServerLogger: mockCreateServerLogger,
}))

const {
  applyDirectConnectSessionState,
  assembleServerHost,
  createKernelDirectConnectSession,
  createDirectConnectSession,
  DirectConnectError,
  getDirectConnectErrorMessage,
  runKernelHeadlessClient,
  runConnectHeadless,
  startKernelServer,
  startServer,
} = await import('../serverHost.js')

describe('kernel server host surface', () => {
  beforeEach(() => {
    mockCreateDirectConnectSession.mockClear()
    mockRunConnectHeadless.mockClear()
    mockStartServer.mockClear()
    mockCreateServerLogger.mockClear()
    MockSessionManager.mockClear()
    MockDangerousBackend.mockClear()
  })

  test('exposes alias exports for the stable server host surface', () => {
    expect(typeof createKernelDirectConnectSession).toBe('function')
    expect(typeof createDirectConnectSession).toBe('function')
    expect(typeof runKernelHeadlessClient).toBe('function')
    expect(typeof runConnectHeadless).toBe('function')
    expect(typeof startKernelServer).toBe('function')
    expect(typeof startServer).toBe('function')
  })

  test('delegates direct-connect session creation through the kernel surface', async () => {
    const options = {
      serverUrl: 'http://127.0.0.1:9000',
      authToken: 'token',
      cwd: '/tmp/project',
      dangerouslySkipPermissions: false,
    }

    const result = await createDirectConnectSession(options)

    expect(mockCreateDirectConnectSession).toHaveBeenCalledTimes(1)
    expect(mockCreateDirectConnectSession).toHaveBeenCalledWith(options)
    expect(result).toEqual({
      config: {
        sessionId: 'session_123',
        serverUrl: 'http://127.0.0.1:9000',
        wsUrl: 'ws://127.0.0.1:9000/sessions/session_123/ws',
      },
      workDir: '/tmp/workdir',
      state: {
        serverUrl: 'http://127.0.0.1:9000',
        workDir: '/tmp/workdir',
      },
    })
    expect(DirectConnectError).toBe(MockDirectConnectError)
  })

  test('applies normalized direct-connect state through the kernel surface', () => {
    const setOriginalCwd = mock(() => {})
    const setCwdState = mock(() => {})
    const setDirectConnectServerUrl = mock(() => {})

    applyDirectConnectSessionState(
      {
        serverUrl: 'http://127.0.0.1:9000',
        workDir: '/tmp/workdir',
      },
      {
        setOriginalCwd,
        setCwdState,
        setDirectConnectServerUrl,
      },
    )

    expect(setOriginalCwd).toHaveBeenCalledWith('/tmp/workdir')
    expect(setCwdState).toHaveBeenCalledWith('/tmp/workdir')
    expect(setDirectConnectServerUrl).toHaveBeenCalledWith(
      'http://127.0.0.1:9000',
    )
  })

  test('formats direct-connect errors for hosts', () => {
    expect(getDirectConnectErrorMessage(new MockDirectConnectError('boom'))).toBe(
      'boom',
    )
    expect(getDirectConnectErrorMessage('plain')).toBe('plain')
  })

  test('delegates headless direct-connect execution through the kernel surface', async () => {
    await runConnectHeadless(
      { sessionId: 'session_123' } as never,
      'hello',
      'json',
      false,
    )

    expect(mockRunConnectHeadless).toHaveBeenCalledTimes(1)
    expect(mockRunConnectHeadless).toHaveBeenCalledWith(
      { sessionId: 'session_123' },
      'hello',
      'json',
      false,
    )
  })

  test('delegates server startup through the kernel surface', () => {
    const config = { port: 0, host: '127.0.0.1' }
    const sessionManager = { createSession: mock(async () => null) }
    const logger = { warn: mock(() => {}) }

    const server = startServer(
      config as never,
      sessionManager as never,
      logger as never,
    )

    expect(mockStartServer).toHaveBeenCalledTimes(1)
    expect(mockStartServer).toHaveBeenCalledWith(
      config,
      sessionManager,
      logger,
    )
    expect(server.port).toBe(0)
  })

  test('assembles server host dependencies through the kernel surface', () => {
    const assembly = assembleServerHost({
      port: '0',
      host: '127.0.0.1',
      idleTimeoutMs: '123',
      maxSessions: '9',
      createAuthToken: () => 'generated-token',
    })

    expect(MockDangerousBackend).toHaveBeenCalledTimes(1)
    expect(MockSessionManager).toHaveBeenCalledTimes(1)
    expect(MockSessionManager).toHaveBeenCalledWith(
      mockDangerousBackendInstance,
      {
        idleTimeoutMs: 123,
        maxSessions: 9,
      },
    )
    expect(mockCreateServerLogger).toHaveBeenCalledTimes(1)
    expect(mockStartServer).toHaveBeenCalledTimes(1)
    const startServerCall = mockStartServer.mock.calls[0] as unknown as
      | [
          {
            port: number
            host: string
            authToken: string
            unix?: string
            workspace?: string
            idleTimeoutMs?: number
            maxSessions?: number
          },
          unknown,
          { warn: (...args: unknown[]) => void },
        ]
      | undefined
    expect(startServerCall?.[0]).toEqual({
      port: 0,
      host: '127.0.0.1',
      authToken: 'generated-token',
      unix: undefined,
      workspace: undefined,
      idleTimeoutMs: 123,
      maxSessions: 9,
    })
    expect(startServerCall?.[2]).toEqual({
      warn: expect.any(Function),
    })
    expect(assembly.authToken).toBe('generated-token')
    expect(assembly.config.port).toBe(0)
  })
})
