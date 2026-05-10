import { describe, expect, test } from 'bun:test'

import { projectRemoteSdkMessageToAgentEvents } from '../RemoteSessionManager.js'

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
