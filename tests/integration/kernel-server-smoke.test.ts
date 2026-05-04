import { afterEach, describe, expect, mock, test } from 'bun:test'

import {
  assembleServerHost,
  connectDirectHostSession,
  createDirectConnectSession,
} from '../../src/kernel/serverHost.js'

type StoppableServer = {
  port?: number
  stop: (closeActiveConnections: boolean) => void
}

const servers: StoppableServer[] = []

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

afterEach(() => {
  while (servers.length > 0) {
    servers.pop()?.stop(true)
  }
})

describe('kernel server smoke', () => {
  test('supports direct-connect and server assembly through the kernel surface only', async () => {
    const requests: Array<{
      authorization: string | null
      body: unknown
      method: string
      pathname: string
    }> = []
    const directServer = trackServer(
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

    const setOriginalCwd = mock(() => {})
    const setCwdState = mock(() => {})
    const setDirectConnectServerUrl = mock(() => {})
    const serverUrl = getServerUrl(directServer)

    const directConfig = await connectDirectHostSession(
      {
        serverUrl,
        authToken: 'token',
        cwd: '/tmp/project',
        dangerouslySkipPermissions: false,
      },
      {
        setOriginalCwd,
        setCwdState,
        setDirectConnectServerUrl,
      },
    )

    expect(directConfig.sessionId).toBe('session_123')
    expect(setOriginalCwd).toHaveBeenCalledWith('/tmp/workdir')
    expect(setCwdState).toHaveBeenCalledWith('/tmp/workdir')
    expect(setDirectConnectServerUrl).toHaveBeenCalledWith(serverUrl)

    const session = await createDirectConnectSession({
      serverUrl,
      authToken: 'token',
      cwd: '/tmp/project',
      dangerouslySkipPermissions: false,
    })
    expect(session.state).toEqual({
      serverUrl,
      workDir: '/tmp/workdir',
    })
    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({
      authorization: 'Bearer token',
      body: { cwd: '/tmp/project' },
      method: 'POST',
      pathname: '/sessions',
    })

    const assembly = assembleServerHost({
      port: '0',
      host: '127.0.0.1',
      idleTimeoutMs: '123',
      maxSessions: '9',
      createAuthToken: () => 'generated-token',
    })
    trackServer(assembly.server)

    expect(assembly.config).toMatchObject({
      port: 0,
      host: '127.0.0.1',
      authToken: 'generated-token',
      idleTimeoutMs: 123,
      maxSessions: 9,
    })
    const health = await fetch(`${getServerUrl(assembly.server)}/health`)
    expect(health.status).toBe(200)
  })
})
