import { describe, expect, test } from 'bun:test'

import type { AgentEvent } from '../types.js'
import {
  agentEventToSdkMessages,
  projectSdkMessageToAgentEventPayloads,
} from '../adapters/agentEventSdkWire.js'

describe('agentEventSdkWire', () => {
  test('projects SDK messages into source-preserving AgentEvent payloads', () => {
    const source = {
      type: 'assistant',
      uuid: 'message-1',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'source text' }],
      },
    }

    const [payload] = projectSdkMessageToAgentEventPayloads(source, {
      sessionId: 'session-1',
      turnId: 'turn-1',
    })

    expect(payload).toMatchObject({
      type: 'message.completed',
      sessionId: 'session-1',
      turnId: 'turn-1',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'source text' }],
      },
    })

    const [message] = agentEventToSdkMessages({
      id: 'event-1',
      sequence: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      ...payload,
    } as AgentEvent)
    expect(message).toBe(source)
  })

  test('falls back to SDK-compatible projection for core-native events', () => {
    const [message] = agentEventToSdkMessages({
      id: 'event-1',
      sequence: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      sessionId: 'session-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      result: {
        stopReason: 'end_turn',
        isError: false,
        output: 'done',
      },
    })

    expect(message).toMatchObject({
      type: 'result',
      subtype: 'success',
      result: 'done',
      stop_reason: 'end_turn',
      session_id: 'session-1',
    })
  })
})
