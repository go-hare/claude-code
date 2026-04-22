import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import {
  createDirectConnectSessionRuntime,
  DirectConnectError,
} from '../DirectConnectSessionApi.js'

const originalFetch = globalThis.fetch

function setFetchMock(
  implementation: (...args: unknown[]) => Promise<Response>,
): ReturnType<typeof mock> {
  const fetchMock = mock(implementation)
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('createDirectConnectSessionRuntime', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('sends auth header and dangerously_skip_permissions, then returns config', async () => {
    const fetchMock = setFetchMock(async () => {
      return new Response(
        JSON.stringify({
          session_id: 'session_123',
          ws_url: 'ws://127.0.0.1:9000/sessions/session_123/ws',
          work_dir: '/tmp/remote',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      )
    })

    const result = await createDirectConnectSessionRuntime({
      serverUrl: 'http://127.0.0.1:9000',
      authToken: 'secret-token',
      cwd: '/tmp/project',
      dangerouslySkipPermissions: true,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { unix?: string },
    ]
    expect(call[0]).toBe('http://127.0.0.1:9000/sessions')
    expect(call[1].method).toBe('POST')
    expect(call[1].headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer secret-token',
    })
    expect(JSON.parse(String(call[1].body))).toEqual({
      cwd: '/tmp/project',
      dangerously_skip_permissions: true,
    })
    expect(result).toEqual({
      config: {
        serverUrl: 'http://127.0.0.1:9000',
        sessionId: 'session_123',
        wsUrl: 'ws://127.0.0.1:9000/sessions/session_123/ws',
        authToken: 'secret-token',
        unixSocket: undefined,
      },
      workDir: '/tmp/remote',
    })
  })

  test('omits optional fields when auth token and dangerous permissions are not provided', async () => {
    const fetchMock = setFetchMock(async () => {
      return new Response(
        JSON.stringify({
          session_id: 'session_456',
          ws_url: 'ws://127.0.0.1:9000/sessions/session_456/ws',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      )
    })

    const result = await createDirectConnectSessionRuntime({
      serverUrl: 'http://127.0.0.1:9000',
      cwd: '/tmp/project',
    })

    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { unix?: string },
    ]
    expect(call[1].headers).toEqual({
      'content-type': 'application/json',
    })
    expect(JSON.parse(String(call[1].body))).toEqual({
      cwd: '/tmp/project',
    })
    expect(result).toEqual({
      config: {
        serverUrl: 'http://127.0.0.1:9000',
        sessionId: 'session_456',
        wsUrl: 'ws://127.0.0.1:9000/sessions/session_456/ws',
        authToken: undefined,
        unixSocket: undefined,
      },
      workDir: undefined,
    })
  })

  test('maps fetch failures to DirectConnectError with server context', async () => {
    setFetchMock(async () => {
      throw new Error('connect ECONNREFUSED')
    })

    await expect(
      createDirectConnectSessionRuntime({
        serverUrl: 'http://127.0.0.1:9000',
        cwd: '/tmp/project',
      }),
    ).rejects.toThrow(
      new DirectConnectError(
        'Failed to connect to server at http://127.0.0.1:9000: connect ECONNREFUSED',
      ),
    )
  })

  test('maps non-2xx responses to DirectConnectError', async () => {
    setFetchMock(async () => {
      return new Response('Unauthorized', {
        status: 401,
        statusText: 'Unauthorized',
      })
    })

    await expect(
      createDirectConnectSessionRuntime({
        serverUrl: 'http://127.0.0.1:9000',
        cwd: '/tmp/project',
      }),
    ).rejects.toThrow(
      new DirectConnectError('Failed to create session: 401 Unauthorized'),
    )
  })

  test('rejects invalid session payloads with DirectConnectError', async () => {
    setFetchMock(async () => {
      return new Response(
        JSON.stringify({
          session_id: 'session_789',
          work_dir: '/tmp/remote',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      )
    })

    await expect(
      createDirectConnectSessionRuntime({
        serverUrl: 'http://127.0.0.1:9000',
        cwd: '/tmp/project',
      }),
    ).rejects.toThrow('Invalid session response:')
  })
})
