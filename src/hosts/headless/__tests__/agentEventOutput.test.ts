import { describe, expect, test } from 'bun:test'

import type { AgentEvent } from 'src/core/types.js'
import {
  agentEventToHeadlessMessages,
  promptValueToAgentInput,
} from '../agentEventOutput.js'

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

describe('agentEventToHeadlessMessages', () => {
  test('converts assistant completion to an SDK assistant message', () => {
    const [message] = agentEventToHeadlessMessages(
      event({
        type: 'message.completed',
        message: {
          id: 'message-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'hello' }],
          stopReason: 'end_turn',
          model: 'model-1',
        },
      }),
    )

    expect(message).toMatchObject({
      type: 'assistant',
      session_id: 'session-1',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello' }],
        id: 'message-1',
        stop_reason: 'end_turn',
        model: 'model-1',
      },
      content: 'hello',
    })
  })

  test('converts successful turns to SDK result messages with metrics', () => {
    const [message] = agentEventToHeadlessMessages(
      event({
        type: 'turn.completed',
        result: {
          stopReason: 'end_turn',
          isError: false,
          output: 'done',
          durationMs: 12,
          durationApiMs: 7,
          numTurns: 2,
          totalCostUsd: 0.01,
          usage: {
            inputTokens: 10,
            outputTokens: 3,
            cacheReadInputTokens: 1,
            cacheCreationInputTokens: 2,
          },
          modelUsage: { model: { inputTokens: 10 } },
          permissionDenials: [{ tool_name: 'Bash' }],
        },
      }),
    )

    expect(message).toMatchObject({
      type: 'result',
      subtype: 'success',
      duration_ms: 12,
      duration_api_ms: 7,
      is_error: false,
      num_turns: 2,
      result: 'done',
      stop_reason: 'end_turn',
      total_cost_usd: 0.01,
      usage: {
        input_tokens: 10,
        output_tokens: 3,
        cache_read_input_tokens: 1,
        cache_creation_input_tokens: 2,
      },
      modelUsage: { model: { inputTokens: 10 } },
      permission_denials: [{ tool_name: 'Bash' }],
    })
  })

  test('converts failed turns to SDK error result messages', () => {
    const [message] = agentEventToHeadlessMessages(
      event({
        type: 'turn.failed',
        error: {
          message: 'boom',
          code: 'MAX_TURNS_REACHED',
        },
      }),
    )

    expect(message).toMatchObject({
      type: 'result',
      subtype: 'error_max_turns',
      is_error: true,
      errors: ['boom'],
      session_id: 'session-1',
    })
  })
})

describe('promptValueToAgentInput', () => {
  test('converts string prompts to AgentInput', () => {
    expect(promptValueToAgentInput('hello')).toEqual({
      content: [{ type: 'text', text: 'hello' }],
    })
  })

  test('converts content block prompts to AgentInput', () => {
    expect(
      promptValueToAgentInput([
        { type: 'text', text: 'hello' },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'abc' },
        },
      ]),
    ).toEqual({
      content: [
        { type: 'text', text: 'hello' },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'abc' },
        },
      ],
    })
  })
})
