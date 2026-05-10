import { describe, expect, test } from 'bun:test'

import type { AgentEvent } from 'src/core/types.js'
import { attachSourceSdkMessage } from 'src/core/adapters/agentEventSdkWire.js'
import { agentEventToReplQueryEvents } from '../agentEventHandler.js'
import type { SDKMessage } from 'src/entrypoints/sdk/coreTypes.generated.js'

function event(overrides: Partial<AgentEvent>): AgentEvent {
  return {
    id: 'event-1',
    sequence: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    sessionId: 'session-1',
    turnId: 'turn-1',
    ...overrides,
  } as AgentEvent
}

describe('agentEventToReplQueryEvents', () => {
  test('preserves source query events for the REPL state machine', () => {
    const source = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'hello' },
      },
    } satisfies SDKMessage

    const payload = attachSourceSdkMessage(
      {
        type: 'message.delta',
        sessionId: 'session-1',
        turnId: 'turn-1',
        messageId: 'message-1',
        text: 'hello',
      },
      source,
    )

    expect(
      agentEventToReplQueryEvents(event(payload as Partial<AgentEvent>)),
    ).toEqual([source])
  })

  test('projects core-native text deltas to REPL stream events', () => {
    expect(
      agentEventToReplQueryEvents(
        event({
          type: 'message.delta',
          messageId: 'message-1',
          text: 'hello',
        }),
      ),
    ).toEqual([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'hello' },
        },
      },
    ])
  })

  test('projects core-native assistant completions to assistant messages', () => {
    const [message] = agentEventToReplQueryEvents(
      event({
        type: 'message.completed',
        message: {
          id: 'message-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          usage: { inputTokens: 3, outputTokens: 2 },
        },
      }),
    )

    expect(message).toMatchObject({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
        usage: {
          input_tokens: 3,
          output_tokens: 2,
        },
      },
    })
  })
})
