import { describe, expect, test } from 'bun:test'

import {
  RemoteSessionManager,
  projectRemoteSdkMessageToAgentEvents,
} from '../RemoteSessionManager.js'

describe('projectRemoteSdkMessageToAgentEvents', () => {
  test('projects remote SDK messages to AgentEvent payloads with session context', () => {
    const events = projectRemoteSdkMessageToAgentEvents('remote-session-1', {
      type: 'assistant',
      uuid: 'message-1',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello remote' }],
      },
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'message.completed',
      sessionId: 'remote-session-1',
      turnId: 'remote-session-1',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello remote' }],
      },
    })
  })
})

describe('RemoteSessionManager permission responses', () => {
  test('preserves tool and decision metadata in allow and deny responses', () => {
    const sent: unknown[] = []
    const manager = new RemoteSessionManager(
      {
        sessionId: 'remote-session-1',
        getAccessToken: () => 'token',
        orgUuid: 'org-1',
      },
      {
        onMessage() {},
        onPermissionRequest() {},
      },
    )

    ;(
      manager as unknown as {
        websocket: { sendControlResponse(value: unknown): void }
        pendingPermissionRequests: Map<string, unknown>
      }
    ).websocket = {
      sendControlResponse(value: unknown) {
        sent.push(value)
      },
    }
    ;(
      manager as unknown as {
        pendingPermissionRequests: Map<string, unknown>
      }
    ).pendingPermissionRequests.set('req-allow', {
      tool_use_id: 'tool-allow',
    })
    ;(
      manager as unknown as {
        pendingPermissionRequests: Map<string, unknown>
      }
    ).pendingPermissionRequests.set('req-deny', {
      tool_use_id: 'tool-deny',
    })

    manager.respondToPermissionRequest('req-allow', {
      behavior: 'allow',
      updatedInput: { command: 'ls -la' },
      updatedPermissions: [{ rule: 'Bash(ls -la)' }],
    })
    manager.respondToPermissionRequest('req-deny', {
      behavior: 'deny',
      message: 'User denied',
    })

    expect(sent[0]).toMatchObject({
      response: {
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
    expect(sent[1]).toMatchObject({
      response: {
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
})
