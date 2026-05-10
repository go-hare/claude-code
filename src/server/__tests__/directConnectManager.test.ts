import { afterEach, describe, expect, mock, test } from 'bun:test'

import { DirectConnectSessionManager } from '../directConnectManager.js'

const originalWebSocket = globalThis.WebSocket

class MockWebSocket {
  static instance: MockWebSocket | undefined
  static OPEN = 1

  readyState = MockWebSocket.OPEN
  sent: string[] = []
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>()

  constructor() {
    MockWebSocket.instance = this
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {}
}

describe('DirectConnectSessionManager', () => {
  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
    MockWebSocket.instance = undefined
  })

  test('keeps SDKMessage callbacks and additionally projects AgentEvents', () => {
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
    const onMessage = mock(() => {})
    const onAgentEvent = mock(() => {})
    const manager = new DirectConnectSessionManager(
      {
        serverUrl: 'http://localhost:9000',
        sessionId: 'session-1',
        wsUrl: 'ws://localhost:9000/sessions/session-1/ws',
      },
      {
        onMessage,
        onAgentEvent,
        onPermissionRequest: mock(() => {}),
      },
    )

    manager.connect()
    MockWebSocket.instance!.emit('message', {
      data: JSON.stringify({
        type: 'assistant',
        uuid: 'message-1',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hello' }],
        },
      }),
    })

    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onAgentEvent).toHaveBeenCalledTimes(1)
    const agentEventCall = onAgentEvent.mock.calls[0] as unknown[]
    expect(agentEventCall[0]).toMatchObject({
      type: 'message.completed',
      sessionId: 'session-1',
      turnId: 'session-1',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello' }],
      },
    })
  })
})
