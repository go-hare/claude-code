import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { runConnectHeadlessRuntime } from '../HostRuntime.js'

type FakeEvent = { data?: string }
type FakeListener = (event: FakeEvent) => void

class FakeWebSocket {
  static readonly OPEN = 1
  static instances: FakeWebSocket[] = []
  static messagesToEmit: unknown[] = []

  readyState = FakeWebSocket.OPEN
  readonly sent: string[] = []
  private readonly listeners = new Map<string, FakeListener[]>()

  constructor(_url: string, _options?: unknown) {
    FakeWebSocket.instances.push(this)
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

const originalWebSocket = globalThis.WebSocket
const originalStdoutWrite = process.stdout.write

let stdoutChunks: string[] = []

function mockStdout(): void {
  stdoutChunks = []
  process.stdout.write = mock((chunk: unknown) => {
    stdoutChunks.push(String(chunk))
    return true
  }) as unknown as typeof process.stdout.write
}

function createRuntimeEvent(
  sequence: number,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: 'kernel_runtime_event',
    uuid: `runtime-message-${sequence}`,
    session_id: 'session-1',
    envelope: {
      schemaVersion: 'kernel.runtime.v1',
      messageId: `runtime-message-${sequence}`,
      eventId: `runtime-event-${sequence}`,
      sequence,
      timestamp: '2026-04-27T00:00:00.000Z',
      source: 'kernel_runtime',
      kind: 'event',
      runtimeId: 'runtime-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      payload,
    },
  }
}

beforeEach(() => {
  FakeWebSocket.instances = []
  FakeWebSocket.messagesToEmit = []
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
  mockStdout()
})

afterEach(() => {
  globalThis.WebSocket = originalWebSocket
  process.stdout.write = originalStdoutWrite
})

describe('runConnectHeadlessRuntime', () => {
  test('uses headless.sdk_message runtime events as direct-host result fallback', async () => {
    FakeWebSocket.messagesToEmit = [
      createRuntimeEvent(1, {
        type: 'headless.sdk_message',
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

    const runPromise = runConnectHeadlessRuntime(
      {
        serverUrl: 'http://localhost:8080',
        sessionId: 'session-1',
        wsUrl: 'ws://localhost:8080/sessions/session-1/ws',
      },
      'hello',
      'text',
    )

    await runPromise

    expect(stdoutChunks.join('')).toBe('runtime result\n')
  })

  test('uses semantic turn.output_delta runtime events when no SDK result arrives', async () => {
    FakeWebSocket.messagesToEmit = [
      createRuntimeEvent(1, {
        type: 'turn.output_delta',
        replayable: true,
        payload: { text: 'hello ' },
      }),
      createRuntimeEvent(2, {
        type: 'turn.output_delta',
        replayable: true,
        payload: { text: 'world' },
      }),
      createRuntimeEvent(3, {
        type: 'turn.completed',
        replayable: true,
        payload: { state: 'completed', stopReason: 'success' },
      }),
    ]

    const runPromise = runConnectHeadlessRuntime(
      {
        serverUrl: 'http://localhost:8080',
        sessionId: 'session-1',
        wsUrl: 'ws://localhost:8080/sessions/session-1/ws',
      },
      'hello',
      'text',
    )

    await runPromise

    expect(stdoutChunks.join('')).toBe('hello world\n')
  })

  test('projects semantic turn.failed runtime events as direct-host failures', async () => {
    FakeWebSocket.messagesToEmit = [
      createRuntimeEvent(1, {
        type: 'turn.output_delta',
        replayable: true,
        payload: { text: 'partial output' },
      }),
      createRuntimeEvent(2, {
        type: 'turn.failed',
        replayable: true,
        payload: {
          state: 'failed',
          stopReason: 'interrupt',
          error: 'interrupted by host',
        },
      }),
    ]

    const runPromise = runConnectHeadlessRuntime(
      {
        serverUrl: 'http://localhost:8080',
        sessionId: 'session-1',
        wsUrl: 'ws://localhost:8080/sessions/session-1/ws',
      },
      'hello',
      'text',
    )

    await expect(runPromise).rejects.toThrow('interrupted by host')
    expect(stdoutChunks.join('')).toBe('')
  })
})
