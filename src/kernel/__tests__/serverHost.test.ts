import { afterEach, describe, expect, mock, test } from 'bun:test'

import {
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
} from '../serverHost.js'

type StoppableServer = {
  port?: number
  stop: (closeActiveConnections: boolean) => void
}

type FakeEvent = { data?: string }
type FakeListener = (event: FakeEvent) => void

class FakeWebSocket {
  static readonly OPEN = 1
  static messagesToEmit: unknown[] = []

  readyState = FakeWebSocket.OPEN
  readonly sent: string[] = []
  private readonly listeners = new Map<string, FakeListener[]>()

  constructor(_url: string, _options?: unknown) {
    setTimeout(() => this.dispatch('open'), 0)
  }

  addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatch(type: string, event: FakeEvent = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }

  send(data: string): void {
    this.sent.push(data)
    const messages = FakeWebSocket.messagesToEmit.splice(0)
    setTimeout(() => {
      for (const message of messages) {
        this.dispatch('message', { data: `${JSON.stringify(message)}\n` })
      }
    }, 0)
  }

  close(): void {
    this.readyState = 3
    this.dispatch('close')
  }
}

const servers: StoppableServer[] = []
const originalWebSocket = globalThis.WebSocket
const originalStdoutWrite = process.stdout.write

function trackServer<T extends StoppableServer>(server: T): T {
  servers.push(server)
  return server
}

function getServerUrl(server: { port?: number }): string {
  if (typeof server.port !== 'number') {
    throw new Error('Expected test server port')
  }
  return `http://127.0.0.1:${server.port}`
}

function createRuntimeEvent(
  sequence: number,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: 'kernel_runtime_event',
    uuid: `runtime-message-${sequence}`,
    session_id: 'session_123',
    envelope: {
      schemaVersion: 'kernel.runtime.v1',
      messageId: `runtime-message-${sequence}`,
      eventId: `runtime-event-${sequence}`,
      sequence,
      timestamp: '2026-05-04T00:00:00.000Z',
      source: 'kernel_runtime',
      kind: 'event',
      runtimeId: 'runtime-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      payload,
    },
  }
}

afterEach(() => {
  while (servers.length > 0) {
    servers.pop()?.stop(true)
  }
  FakeWebSocket.messagesToEmit = []
  globalThis.WebSocket = originalWebSocket
  process.stdout.write = originalStdoutWrite
})

describe('kernel server host surface', () => {
  test('exposes alias exports for the stable server host surface', () => {
    expect(typeof createKernelDirectConnectSession).toBe('function')
    expect(typeof createDirectConnectSession).toBe('function')
    expect(typeof runKernelHeadlessClient).toBe('function')
    expect(typeof runConnectHeadless).toBe('function')
    expect(typeof startKernelServer).toBe('function')
    expect(typeof startServer).toBe('function')
  })

  test('creates direct-connect sessions through the real kernel surface', async () => {
    const requests: Array<{
      authorization: string | null
      body: unknown
      method: string
      pathname: string
    }> = []
    const server = trackServer(
      Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(req): Promise<Response> {
          const url = new URL(req.url)
          requests.push({
            authorization: req.headers.get('authorization'),
            body: await req.json(),
            method: req.method,
            pathname: url.pathname,
          })
          return Response.json({
            session_id: 'session_123',
            ws_url: `ws://${url.host}/sessions/session_123/ws`,
            work_dir: '/tmp/workdir',
          })
        },
      }),
    )

    const result = await createDirectConnectSession({
      serverUrl: getServerUrl(server),
      authToken: 'token',
      cwd: '/tmp/project',
      dangerouslySkipPermissions: true,
    })

    expect(requests).toEqual([
      {
        authorization: 'Bearer token',
        body: {
          cwd: '/tmp/project',
          dangerously_skip_permissions: true,
        },
        method: 'POST',
        pathname: '/sessions',
      },
    ])
    expect(result).toEqual({
      config: {
        sessionId: 'session_123',
        serverUrl: getServerUrl(server),
        wsUrl: `ws://127.0.0.1:${server.port}/sessions/session_123/ws`,
        authToken: 'token',
        unixSocket: undefined,
      },
      workDir: '/tmp/workdir',
      state: {
        serverUrl: getServerUrl(server),
        workDir: '/tmp/workdir',
      },
    })
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
    expect(getDirectConnectErrorMessage(new DirectConnectError('boom'))).toBe(
      'boom',
    )
    expect(getDirectConnectErrorMessage('plain')).toBe('plain')
  })

  test('runs headless direct-connect execution through the kernel surface', async () => {
    const stdoutChunks: string[] = []
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
    process.stdout.write = mock((chunk: unknown) => {
      stdoutChunks.push(String(chunk))
      return true
    }) as unknown as typeof process.stdout.write
    FakeWebSocket.messagesToEmit = [
      createRuntimeEvent(1, {
        type: 'headless.protocol_message',
        replayable: true,
        payload: {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'runtime result',
          uuid: 'sdk-result-1',
        },
      }),
    ]

    await runConnectHeadless(
      {
        sessionId: 'session_123',
        serverUrl: 'http://127.0.0.1:9000',
        wsUrl: 'ws://127.0.0.1:9000/sessions/session_123/ws',
      },
      'hello',
      'text',
      false,
    )

    expect(stdoutChunks.join('')).toBe('runtime result\n')
  })

  test('delegates server startup through the kernel surface', async () => {
    const config = { port: 0, host: '127.0.0.1' }
    const sessionManager = {
      createSession: mock(async () => null),
      hasSession: mock(() => false),
      attachSink: mock(() => null),
      handleSessionInput: mock(() => false),
      detachSink: mock(() => {}),
    }
    const logger = { warn: mock(() => {}) }

    const server = trackServer(
      startServer(config as never, sessionManager as never, logger as never),
    )
    const response = await fetch(`${getServerUrl(server)}/health`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  test('assembles server host dependencies through the kernel surface', async () => {
    const assembly = assembleServerHost({
      port: '0',
      host: '127.0.0.1',
      idleTimeoutMs: '123',
      maxSessions: '9',
      createAuthToken: () => 'generated-token',
    })
    trackServer(assembly.server)

    expect(assembly.authToken).toBe('generated-token')
    expect(assembly.config).toEqual({
      port: 0,
      host: '127.0.0.1',
      authToken: 'generated-token',
      unix: undefined,
      workspace: undefined,
      idleTimeoutMs: 123,
      maxSessions: 9,
    })
    const response = await fetch(`${getServerUrl(assembly.server)}/health`)
    expect(response.status).toBe(200)
  })
})
