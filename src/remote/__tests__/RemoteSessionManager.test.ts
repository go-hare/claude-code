import { describe, expect, mock, test } from 'bun:test'

import type {
  ProtocolControlRequest,
  ProtocolControlResponse,
} from 'src/types/protocol/controlTypes.js'
import type { KernelRuntimeEnvelopeBase } from '../../runtime/contracts/events.js'
import type { SessionsWebSocketCallbacks } from '../SessionsWebSocket.js'

const actualTeleportApi = await import('../../utils/teleport/api.js')

let lastSocket: FakeSessionsWebSocket | undefined

class FakeSessionsWebSocket {
  readonly sentControlResponses: ProtocolControlResponse[] = []

  constructor(
    _sessionId: string,
    _orgUuid: string,
    _getAccessToken: () => string,
    readonly callbacks: SessionsWebSocketCallbacks,
  ) {
    lastSocket = this
  }

  async connect(): Promise<void> {
    this.callbacks.onConnected?.()
  }

  sendControlResponse(response: ProtocolControlResponse): void {
    this.sentControlResponses.push(response)
  }

  sendControlRequest(): void {}

  isConnected(): boolean {
    return true
  }

  close(): void {}

  reconnect(): void {}
}

mock.module('../SessionsWebSocket.js', () => ({
  SessionsWebSocket: FakeSessionsWebSocket,
}))

mock.module('../../utils/teleport/api.js', () => ({
  ...actualTeleportApi,
  sendEventToRemoteSession: mock(async () => true),
}))

const { RemoteSessionManager } = await import('../RemoteSessionManager.js')

function createManager(callbacks?: {
  onMessage?: (message: unknown) => void
  onRuntimeEvent?: (envelope: KernelRuntimeEnvelopeBase) => void
}) {
  return new RemoteSessionManager(
    {
      sessionId: 'session-1',
      getAccessToken: () => 'token',
      orgUuid: 'org-1',
    },
    {
      onMessage: callbacks?.onMessage ?? mock(() => {}),
      onPermissionRequest: mock(() => {}),
      onRuntimeEvent: callbacks?.onRuntimeEvent,
    },
  )
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

describe('RemoteSessionManager', () => {
  test('permission allow responses preserve toolUseID and decision classification', () => {
    const manager = createManager()
    manager.connect()

    const request: ProtocolControlRequest = {
      type: 'control_request',
      request_id: 'request-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'pwd' },
        tool_use_id: 'tool-use-1',
      },
    }

    lastSocket!.callbacks.onMessage(request)
    manager.respondToPermissionRequest('request-1', {
      behavior: 'allow',
      updatedInput: { command: 'pwd' },
    })

    expect(lastSocket!.sentControlResponses).toEqual([
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

  test('permission deny responses preserve toolUseID and rejection classification', () => {
    const manager = createManager()
    manager.connect()

    lastSocket!.callbacks.onMessage({
      type: 'control_request',
      request_id: 'request-2',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'rm file' },
        tool_use_id: 'tool-use-2',
      },
    } satisfies ProtocolControlRequest)

    manager.respondToPermissionRequest('request-2', {
      behavior: 'deny',
      message: 'User denied permission',
    })

    expect(lastSocket!.sentControlResponses.at(-1)).toEqual({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'request-2',
        response: {
          behavior: 'deny',
          message: 'User denied permission',
          toolUseID: 'tool-use-2',
          decisionClassification: 'user_reject',
        },
      },
    })
  })

  test('routes kernel runtime events without forwarding them as protocol messages', () => {
    const onMessage = mock((_message: unknown) => {})
    const onRuntimeEvent = mock((_envelope: KernelRuntimeEnvelopeBase) => {})
    const manager = createManager({ onMessage, onRuntimeEvent })
    manager.connect()

    lastSocket!.callbacks.onMessage(createRuntimeEventMessage())

    expect(onRuntimeEvent).toHaveBeenCalledWith(
      createRuntimeEventMessage().envelope,
    )
    expect(onMessage).not.toHaveBeenCalled()
  })
})
