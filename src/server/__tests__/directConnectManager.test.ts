import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import type { ProtocolControlRequest } from 'src/types/protocol/controlTypes.js'
import type { KernelRuntimeEnvelopeBase } from '../../runtime/contracts/events.js'
import { DirectConnectSessionManager } from '../directConnectManager.js'

type FakeEvent = { data?: string }
type FakeListener = (event: FakeEvent) => void

class FakeWebSocket {
  static readonly OPEN = 1
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.OPEN
  readonly sent: string[] = []
  private readonly listeners = new Map<string, FakeListener[]>()

  constructor(_url: string, _options?: unknown) {
    FakeWebSocket.instances.push(this)
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
  }

  close(): void {
    this.readyState = 3
    this.dispatch('close')
  }
}

const originalWebSocket = globalThis.WebSocket

beforeEach(() => {
  FakeWebSocket.instances = []
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
})

afterEach(() => {
  globalThis.WebSocket = originalWebSocket
})

function createManager(callbacks?: {
  onPermissionCancelled?: (requestId: string, toolUseId?: string) => void
  onRuntimeEvent?: (envelope: KernelRuntimeEnvelopeBase) => void
}) {
  return new DirectConnectSessionManager(
    {
      serverUrl: 'http://localhost:8080',
      sessionId: 'session-1',
      wsUrl: 'ws://localhost:8080/sessions/session-1/ws',
    },
    {
      onMessage: mock(() => {}),
      onPermissionRequest: mock(() => {}),
      onPermissionCancelled: callbacks?.onPermissionCancelled,
      onRuntimeEvent: callbacks?.onRuntimeEvent,
    },
  )
}

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1)
  if (!socket) {
    throw new Error('Expected fake websocket instance')
  }
  return socket
}

function sendSocketMessage(socket: FakeWebSocket, message: unknown): void {
  socket.dispatch('message', { data: `${JSON.stringify(message)}\n` })
}

function createRuntimeEventMessage() {
  return {
    type: 'kernel_runtime_event',
    uuid: 'message-1',
    session_id: 'session-1',
    envelope: {
      schemaVersion: 'kernel.runtime.v1',
      messageId: 'message-1',
      sequence: 1,
      timestamp: '2026-04-26T00:00:00.000Z',
      source: 'kernel_runtime',
      kind: 'event',
      runtimeId: 'runtime-1',
      conversationId: 'conversation-1',
      eventId: 'conversation-1:1',
      payload: {
        type: 'headless.protocol_message',
        replayable: true,
      },
    },
  } as const
}

describe('DirectConnectSessionManager', () => {
  test('permission responses preserve toolUseID and decision classification', () => {
    const manager = createManager()
    manager.connect()
    const socket = latestSocket()

    sendSocketMessage(socket, {
      type: 'control_request',
      request_id: 'request-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'pwd' },
        tool_use_id: 'tool-use-1',
      },
    } satisfies ProtocolControlRequest)

    manager.respondToPermissionRequest('request-1', {
      behavior: 'allow',
      updatedInput: { command: 'pwd' },
    })

    expect(socket.sent.map(line => JSON.parse(line))).toEqual([
      {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: 'request-1',
          response: {
            behavior: 'allow',
            updatedInput: { command: 'pwd' },
            toolUseID: 'tool-use-1',
            decisionClassification: 'user_temporary',
          },
        },
      },
    ])
  })

  test('permission responses preserve permanent permission updates', () => {
    const manager = createManager()
    manager.connect()
    const socket = latestSocket()

    sendSocketMessage(socket, {
      type: 'control_request',
      request_id: 'request-permanent',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'pwd' },
        tool_use_id: 'tool-use-permanent',
      },
    } satisfies ProtocolControlRequest)

    manager.respondToPermissionRequest('request-permanent', {
      behavior: 'allow',
      updatedInput: { command: 'pwd' },
      updatedPermissions: [{ rule: 'Bash(pwd)' }],
      decisionClassification: 'user_permanent',
    })

    expect(JSON.parse(socket.sent[0] ?? '{}')).toMatchObject({
      response: {
        response: {
          behavior: 'allow',
          updatedPermissions: [{ rule: 'Bash(pwd)' }],
          toolUseID: 'tool-use-permanent',
          decisionClassification: 'user_permanent',
        },
      },
    })
  })

  test('control_cancel_request clears pending permission prompts', () => {
    const onPermissionCancelled = mock(
      (_requestId: string, _toolUseId?: string) => {},
    )
    const manager = createManager({ onPermissionCancelled })
    manager.connect()
    const socket = latestSocket()

    sendSocketMessage(socket, {
      type: 'control_request',
      request_id: 'request-2',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'rm file' },
        tool_use_id: 'tool-use-2',
      },
    } satisfies ProtocolControlRequest)
    sendSocketMessage(socket, {
      type: 'control_cancel_request',
      request_id: 'request-2',
    })

    expect(onPermissionCancelled).toHaveBeenCalledWith(
      'request-2',
      'tool-use-2',
    )

    manager.respondToPermissionRequest('request-2', {
      behavior: 'deny',
      message: 'User denied permission',
    })
    expect(socket.sent).toEqual([])
  })

  test('routes kernel runtime events without forwarding them as protocol messages', () => {
    const onRuntimeEvent = mock((_envelope: KernelRuntimeEnvelopeBase) => {})
    const manager = createManager({ onRuntimeEvent })
    manager.connect()
    const socket = latestSocket()

    sendSocketMessage(socket, createRuntimeEventMessage())

    expect(onRuntimeEvent).toHaveBeenCalledWith(
      createRuntimeEventMessage().envelope,
    )
  })
})
