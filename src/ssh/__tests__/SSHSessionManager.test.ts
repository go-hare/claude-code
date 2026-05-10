import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { Subprocess } from 'bun'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('src/utils/debug.ts', debugMock)

import {
  SSHSessionManagerImpl,
  type SSHSessionManagerOptions,
} from '../SSHSessionManager'

function createMockSubprocess(options?: {
  exitCode?: number | null
  stdoutLines?: string[]
}): {
  proc: Subprocess
  stdinChunks: Uint8Array[]
  writeToStdout: (data: string) => void
  simulateExit: (code?: number) => void
} {
  let stdoutController!: ReadableStreamDefaultController<Uint8Array>
  const exitResolvers: Array<(code: number) => void> = []
  let exitCode: number | null = options?.exitCode ?? null

  const stdout = new ReadableStream<Uint8Array>({
    start(controller) {
      stdoutController = controller
      if (options?.stdoutLines) {
        const encoder = new TextEncoder()
        for (const line of options.stdoutLines) {
          controller.enqueue(encoder.encode(`${line}\n`))
        }
      }
    },
  })

  const stdinChunks: Uint8Array[] = []
  const stdin = {
    write(data: Uint8Array) {
      stdinChunks.push(data)
      return data.length
    },
    flush() {},
    end() {},
  }

  const exited = new Promise<number>(resolve => {
    exitResolvers.push(resolve)
    if (exitCode !== null) resolve(exitCode)
  })

  const proc = {
    stdout,
    stdin,
    stderr: null,
    get exitCode() {
      return exitCode
    },
    exited,
    kill: mock(() => {}),
    pid: 12345,
    killed: false,
    signalCode: null,
    ref: () => {},
    unref: () => {},
  } as unknown as Subprocess

  return {
    proc,
    stdinChunks,
    writeToStdout(data: string) {
      stdoutController.enqueue(new TextEncoder().encode(`${data}\n`))
    },
    simulateExit(code = 0) {
      exitCode = code
      try {
        stdoutController.close()
      } catch {
        // Stream may already be closed.
      }
      for (const resolve of exitResolvers) resolve(code)
    },
  }
}

type MockState = {
  messages: unknown[]
  permissionRequests: Array<{ request: unknown; requestId: string }>
  reconnectingCalls: Array<{ attempt: number; max: number }>
  connectedCount: number
  disconnectedCount: number
  errors: Error[]
}

function createMockOptions(
  overrides?: Partial<SSHSessionManagerOptions>,
): SSHSessionManagerOptions & { state: MockState } {
  const state: MockState = {
    messages: [],
    permissionRequests: [],
    reconnectingCalls: [],
    connectedCount: 0,
    disconnectedCount: 0,
    errors: [],
  }

  return {
    state,
    onMessage: msg => {
      state.messages.push(msg)
    },
    onPermissionRequest: (request, requestId) => {
      state.permissionRequests.push({ request, requestId })
    },
    onConnected: () => {
      state.connectedCount++
    },
    onReconnecting: (attempt, max) => {
      state.reconnectingCalls.push({ attempt, max })
    },
    onDisconnected: () => {
      state.disconnectedCount++
    },
    onError: err => {
      state.errors.push(err)
    },
    ...overrides,
  }
}

function decodeLastStdinChunk(chunks: Uint8Array[]): Record<string, unknown> {
  const written = new TextDecoder().decode(chunks.at(-1))
  return JSON.parse(written)
}

beforeEach(() => {
  mock.restore()
})

describe('SSHSessionManagerImpl', () => {
  test('connect() sets connected state and calls onConnected once', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.connect()

    expect(manager.isConnected()).toBe(true)
    expect(opts.state.connectedCount).toBe(1)
  })

  test('disconnect() sets disconnected state and kills process once', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.disconnect()
    manager.disconnect()

    expect(manager.isConnected()).toBe(false)
    expect((proc.kill as ReturnType<typeof mock>).mock.calls).toHaveLength(1)
  })

  test('routes SDK messages to onMessage and filters control noise', async () => {
    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    writeToStdout(JSON.stringify({ type: 'control_response' }))
    writeToStdout(JSON.stringify({ type: 'keep_alive' }))
    writeToStdout(JSON.stringify({ type: 'control_cancel_request' }))
    writeToStdout(JSON.stringify({ type: 'streamlined_text' }))
    writeToStdout(JSON.stringify({ type: 'streamlined_tool_use_summary' }))
    writeToStdout(
      JSON.stringify({ type: 'system', subtype: 'post_turn_summary' }),
    )
    writeToStdout(JSON.stringify({ type: 'assistant', message: { role: 'assistant' } }))

    await Bun.sleep(20)
    simulateExit(0)
    await Bun.sleep(20)

    expect(opts.state.messages).toHaveLength(1)
    expect((opts.state.messages[0] as Record<string, unknown>).type).toBe(
      'assistant',
    )
  })

  test('routes can_use_tool control_request to onPermissionRequest', async () => {
    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    writeToStdout(
      JSON.stringify({
        type: 'control_request',
        request_id: 'req-123',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Bash',
          tool_use_id: 'tool-456',
          input: { command: 'ls' },
        },
      }),
    )

    await Bun.sleep(20)
    simulateExit(0)
    await Bun.sleep(20)

    expect(opts.state.permissionRequests).toHaveLength(1)
    expect(opts.state.permissionRequests[0]?.requestId).toBe('req-123')
  })

  test('invalid JSON and non-message objects are skipped', async () => {
    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    writeToStdout('not valid json')
    writeToStdout(JSON.stringify({ noTypeField: true }))
    writeToStdout(JSON.stringify([1, 2, 3]))
    writeToStdout(JSON.stringify({ type: 'assistant', message: { role: 'assistant' } }))

    await Bun.sleep(20)
    simulateExit(0)
    await Bun.sleep(20)

    expect(opts.state.messages).toHaveLength(1)
    expect(opts.state.errors).toHaveLength(0)
  })

  test('sendMessage writes stream-json user message', async () => {
    const { proc, stdinChunks } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    const result = await manager.sendMessage('hello world')

    expect(result).toBe(true)
    expect(decodeLastStdinChunk(stdinChunks)).toMatchObject({
      type: 'user',
      message: {
        role: 'user',
        content: 'hello world',
      },
    })
  })

  test('sendInterrupt writes interrupt control request', () => {
    const { proc, stdinChunks } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.sendInterrupt()

    expect(decodeLastStdinChunk(stdinChunks)).toMatchObject({
      type: 'control_request',
      request: { subtype: 'interrupt' },
    })
  })

  test('respondToPermissionRequest sends allow and deny responses', () => {
    const { proc, stdinChunks } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.respondToPermissionRequest('req-allow', {
      behavior: 'allow',
      updatedInput: { command: 'ls -la' },
      updatedPermissions: [{ rule: 'Bash(ls -la)' }],
      toolUseID: 'tool-allow',
    })
    expect(decodeLastStdinChunk(stdinChunks)).toMatchObject({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'req-allow',
        response: {
          behavior: 'allow',
          updatedInput: { command: 'ls -la' },
          updatedPermissions: [{ rule: 'Bash(ls -la)' }],
          toolUseID: 'tool-allow',
          decisionClassification: 'user_temporary',
        },
      },
    })

    manager.respondToPermissionRequest('req-deny', {
      behavior: 'deny',
      message: 'User denied',
      toolUseID: 'tool-deny',
    })
    expect(decodeLastStdinChunk(stdinChunks)).toMatchObject({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'req-deny',
        response: {
          behavior: 'deny',
          message: 'User denied',
          toolUseID: 'tool-deny',
          decisionClassification: 'user_reject',
        },
      },
    })
  })

  test('process exit without reconnect calls onDisconnected', async () => {
    const { proc, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    simulateExit(1)
    await Bun.sleep(50)

    expect(opts.state.disconnectedCount).toBe(1)
    expect(manager.isConnected()).toBe(false)
  })

  test('user disconnect does not trigger reconnect', async () => {
    let reconnectCalled = false
    const { proc } = createMockSubprocess()
    const opts = createMockOptions({
      reconnect: async () => {
        reconnectCalled = true
        return createMockSubprocess().proc
      },
      maxReconnectAttempts: 3,
    })
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.disconnect()
    await Bun.sleep(50)

    expect(reconnectCalled).toBe(false)
    expect(opts.state.reconnectingCalls).toHaveLength(0)
  })

  test('process exit with reconnect factory attempts reconnection', async () => {
    const { proc: proc1, simulateExit } = createMockSubprocess()
    const { proc: proc2 } = createMockSubprocess()
    const opts = createMockOptions({
      reconnect: mock(async () => proc2),
      maxReconnectAttempts: 1,
    })
    const manager = new SSHSessionManagerImpl(proc1, opts)

    manager.connect()
    simulateExit(1)
    await Bun.sleep(2_200)

    expect(opts.state.reconnectingCalls).toEqual([{ attempt: 1, max: 1 }])
    expect(manager.isConnected()).toBe(true)
  })
})
