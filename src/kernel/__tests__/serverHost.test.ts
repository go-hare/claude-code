import { describe, expect, mock, test } from 'bun:test'

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

class MockDirectConnectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DirectConnectError'
  }
}

mock.module('../../server/createDirectConnectSession.js', () => ({
  createDirectConnectSession: mockCreateDirectConnectSession,
  DirectConnectError: MockDirectConnectError,
}))

mock.module('../../server/connectHeadless.js', () => ({
  runConnectHeadless: mockRunConnectHeadless,
}))

mock.module('../../server/server.js', () => ({
  startServer: mockStartServer,
}))

const {
  createKernelDirectConnectSession,
  createDirectConnectSession,
  DirectConnectError,
  runKernelHeadlessClient,
  runConnectHeadless,
  startKernelServer,
  startServer,
} = await import('../serverHost.js')

describe('kernel server host surface', () => {
  test('exposes alias exports for the stable server host surface', () => {
    expect(createKernelDirectConnectSession).toBe(createDirectConnectSession)
    expect(runKernelHeadlessClient).toBe(runConnectHeadless)
    expect(startKernelServer).toBe(startServer)
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
    })
    expect(DirectConnectError).toBe(MockDirectConnectError)
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
})
