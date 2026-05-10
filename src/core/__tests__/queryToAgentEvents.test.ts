import { describe, expect, test } from 'bun:test'

import {
  projectQueryEventToAgentEvents,
  projectToolResultMessageToAgentEvent,
} from '../adapters/queryToAgentEvents.js'

const context = {
  sessionId: 'session-1',
  turnId: 'turn-1',
}

describe('projectQueryEventToAgentEvents', () => {
  test('projects request and assistant message lifecycle events', () => {
    expect(
      projectQueryEventToAgentEvents({ type: 'stream_request_start' }, context),
    ).toEqual([{ type: 'request.started', requestId: 'turn-1:request' }])

    expect(
      projectQueryEventToAgentEvents(
        {
          type: 'stream_event',
          event: {
            type: 'message_start',
            message: {
              id: 'message-1',
              usage: { input_tokens: 10, output_tokens: 0 },
            },
          },
        },
        context,
      ),
    ).toEqual([
      {
        type: 'message.started',
        sessionId: 'session-1',
        turnId: 'turn-1',
        messageId: 'message-1',
        role: 'assistant',
      },
      {
        type: 'usage.updated',
        sessionId: 'session-1',
        turnId: 'turn-1',
        usage: {
          inputTokens: 10,
          outputTokens: 0,
          cacheReadInputTokens: undefined,
          cacheCreationInputTokens: undefined,
        },
      },
    ])
  })

  test('projects text, thinking, citation, and tool input deltas', () => {
    expect(
      projectQueryEventToAgentEvents(
        {
          type: 'stream_event',
          uuid: 'message-1',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'hello' },
          },
        },
        context,
      ),
    ).toEqual([
      {
        type: 'message.delta',
        sessionId: 'session-1',
        turnId: 'turn-1',
        messageId: 'message-1',
        text: 'hello',
      },
    ])

    expect(
      projectQueryEventToAgentEvents(
        {
          type: 'stream_event',
          uuid: 'message-1',
          event: {
            type: 'content_block_delta',
            delta: { type: 'thinking_delta', thinking: 'think' },
          },
        },
        context,
      ),
    ).toEqual([
      {
        type: 'message.thinking_delta',
        sessionId: 'session-1',
        turnId: 'turn-1',
        messageId: 'message-1',
        text: 'think',
      },
    ])

    expect(
      projectQueryEventToAgentEvents(
        {
          type: 'stream_event',
          uuid: 'message-1',
          event: {
            type: 'content_block_delta',
            delta: { type: 'citations_delta', citation: { url: 'https://x.test' } },
          },
        },
        context,
      ),
    ).toEqual([
      {
        type: 'message.citation_delta',
        sessionId: 'session-1',
        turnId: 'turn-1',
        messageId: 'message-1',
        citation: {
          metadata: { citation: { url: 'https://x.test' } },
        },
      },
    ])

    expect(
      projectQueryEventToAgentEvents(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            content_block: { id: 'tool-1' },
            delta: { type: 'input_json_delta', partial_json: '{"path"' },
          },
        },
        context,
      ),
    ).toEqual([
      {
        type: 'tool.input_delta',
        sessionId: 'session-1',
        turnId: 'turn-1',
        toolCallId: 'tool-1',
        delta: '{"path"',
      },
    ])
  })

  test('projects tool requested and terminal result events', () => {
    expect(
      projectQueryEventToAgentEvents(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Read',
              input: { file_path: 'README.md' },
            },
          },
        },
        context,
      ),
    ).toEqual([
      {
        type: 'tool.requested',
        sessionId: 'session-1',
        turnId: 'turn-1',
        toolCall: {
          id: 'tool-1',
          name: 'Read',
          input: { file_path: 'README.md' },
        },
      },
    ])

    expect(
      projectQueryEventToAgentEvents(
        {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'done',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        },
        context,
      ),
    ).toEqual([
      {
        type: 'usage.updated',
        sessionId: 'session-1',
        turnId: 'turn-1',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadInputTokens: undefined,
          cacheCreationInputTokens: undefined,
        },
      },
      {
        type: 'turn.completed',
        sessionId: 'session-1',
        turnId: 'turn-1',
        result: {
          stopReason: 'end_turn',
          isError: false,
          output: 'done',
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadInputTokens: undefined,
            cacheCreationInputTokens: undefined,
          },
        },
      },
    ])
  })

  test('projects messages, compact boundaries, retries, and max turns', () => {
    expect(
      projectQueryEventToAgentEvents(
        {
          type: 'assistant',
          uuid: 'message-1',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'hello' }],
            stop_reason: 'end_turn',
            model: 'claude',
          },
        },
        context,
      ),
    ).toEqual([
      {
        type: 'message.completed',
        sessionId: 'session-1',
        turnId: 'turn-1',
        message: {
          id: 'message-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'hello' }],
          stopReason: 'end_turn',
          model: 'claude',
          usage: undefined,
        },
      },
    ])

    expect(
      projectQueryEventToAgentEvents(
        {
          type: 'system',
          subtype: 'compact_boundary',
          compactMetadata: { trigger: 'manual' },
        },
        context,
      ),
    ).toEqual([
      {
        type: 'context.compacted',
        sessionId: 'session-1',
        turnId: 'turn-1',
        metadata: { metadata: { trigger: 'manual' } },
      },
    ])

    expect(
      projectQueryEventToAgentEvents(
        {
          type: 'system',
          subtype: 'api_error',
          retryAttempt: 2,
          maxRetries: 3,
          retryInMs: 1000,
          error: 'rate_limit',
        },
        context,
      ),
    ).toEqual([
      {
        type: 'error.retrying',
        sessionId: 'session-1',
        turnId: 'turn-1',
        error: { message: 'rate_limit', cause: 'rate_limit' },
        attempt: 2,
        maxRetries: 3,
        retryDelayMs: 1000,
      },
    ])

    expect(
      projectQueryEventToAgentEvents(
        {
          type: 'attachment',
          attachment: { type: 'max_turns_reached', maxTurns: 5 },
        },
        context,
      ),
    ).toEqual([
      {
        type: 'turn.failed',
        sessionId: 'session-1',
        turnId: 'turn-1',
        error: {
          message: 'Reached maximum number of turns (5)',
          code: 'MAX_TURNS_REACHED',
          metadata: { type: 'max_turns_reached', maxTurns: 5 },
        },
      },
    ])
  })

  test('projects explicit tool result messages', () => {
    expect(
      projectToolResultMessageToAgentEvent(
        {
          type: 'user',
          uuid: 'message-1',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', content: 'ok' }],
          },
        },
        context,
        'tool-1',
      ),
    ).toEqual({
      type: 'tool.completed',
      sessionId: 'session-1',
      turnId: 'turn-1',
      toolCallId: 'tool-1',
      result: {
        content: [],
        isError: false,
        metadata: { sourceMessageId: 'message-1' },
      },
    })
  })
})
