import { describe, expect, test } from 'bun:test'

import type { SDKMessage } from '../../../../../entrypoints/agentSdkTypes.js'
import { createQueryTurnEventAdapter } from '../QueryTurnEventAdapter.js'

function createAdapter(abortReason: string | null = null) {
  const now = 30_000
  return createQueryTurnEventAdapter({
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    getAbortReason: () => abortReason,
    getProgressProjectionEnvironment: () => ({
      now,
      remoteEnabled: true,
    }),
  })
}

describe('QueryTurnEventAdapter', () => {
  test('projects query stream events through the adapter input seam', () => {
    const adapter = createAdapter()
    const events = adapter.projectQueryMessage({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: 'from query',
        },
      },
      session_id: 'query-session',
      uuid: 'query-stream-1',
    })

    expect(events.map(event => event.type)).toEqual([
      'turn.output_delta',
      'headless.sdk_message',
    ])
    expect(events[0]).toMatchObject({
      payload: {
        source: 'sdk_stream_event',
        text: 'from query',
      },
    })
    expect(events[1]).toMatchObject({
      payload: {
        type: 'stream_event',
        session_id: 'query-session',
        uuid: 'query-stream-1',
      },
      metadata: {
        canonicalProjection: 'turn.output_delta',
      },
    })
  })

  test('projects query stream deltas with compatibility from the same input', () => {
    const adapter = createAdapter()
    const queryEvent = {
      type: 'content_block_delta',
      delta: {
        type: 'text_delta',
        text: 'one delta',
      },
    }

    const projection = adapter.projectQueryMessageWithCompatibility({
      type: 'stream_event',
      event: queryEvent,
      uuid: 'query-stream-1',
    })

    expect(projection.events.map(event => event.type)).toEqual([
      'turn.output_delta',
      'headless.sdk_message',
    ])
    expect(projection.compatibilityMessages).toHaveLength(1)
    expect(projection.events[1]).toMatchObject({
      metadata: {
        canonicalProjection: 'turn.output_delta',
      },
      payload: {
        type: 'stream_event',
        uuid: 'query-stream-1',
      },
    })
  })

  test('ignores query messages without a canonical event projection', () => {
    const adapter = createAdapter()

    expect(
      adapter.projectQueryMessage({
        type: 'stream_request_start',
      }),
    ).toEqual([])
  })

  test('projects query system init as a compatibility envelope', () => {
    const previousApiKey = process.env.ANTHROPIC_API_KEY
    const globalWithMacro = globalThis as unknown as {
      MACRO?: Record<string, unknown>
    }
    const previousMacro = globalWithMacro.MACRO
    process.env.ANTHROPIC_API_KEY = 'test-key'
    globalWithMacro.MACRO = { VERSION: '0.0.0-test' }
    const adapter = createAdapter()
    try {
      const projection = adapter.projectQueryMessageWithCompatibility({
        type: 'query_system_init',
        inputs: {
          tools: [{ name: 'Read' }],
          mcpClients: [{ name: 'fs', type: 'connected' }],
          model: 'claude-test',
          permissionMode: 'default',
          commands: [
            { name: 'help' },
            { name: 'hidden', userInvocable: false },
          ],
          agents: [{ agentType: 'general-purpose' }],
          skills: [{ name: 'review' }],
          plugins: [{ name: 'builtin', path: '/tmp/plugin', source: 'test' }],
          fastMode: false,
        },
      })
      expect(projection.events.map(event => event.type)).toEqual([
        'headless.sdk_message',
      ])
      expect(projection.compatibilityMessages).toHaveLength(1)
      expect(projection.events[0]).toMatchObject({
        payload: {
          type: 'system',
          subtype: 'init',
          tools: ['Read'],
          model: 'claude-test',
          slash_commands: ['help'],
          agents: ['general-purpose'],
        },
      })
    } finally {
      if (previousMacro === undefined) {
        delete globalWithMacro.MACRO
      } else {
        globalWithMacro.MACRO = previousMacro
      }
      if (previousApiKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY
      } else {
        process.env.ANTHROPIC_API_KEY = previousApiKey
      }
    }
  })

  test('projects query tool summaries as compatibility envelopes', () => {
    const adapter = createAdapter()

    const queryEvents = adapter.projectQueryMessage({
      type: 'tool_use_summary',
      summary: 'Finished tool batch',
      precedingToolUseIds: ['toolu_1'],
      uuid: 'summary-1',
    })

    expect(queryEvents.map(event => event.type)).toEqual([
      'headless.sdk_message',
    ])
    expect(queryEvents[0]).toMatchObject({
      payload: {
        type: 'tool_use_summary',
        summary: 'Finished tool batch',
        preceding_tool_use_ids: ['toolu_1'],
      },
    })
  })

  test('projects query compact boundaries as compatibility envelopes', () => {
    const adapter = createAdapter()

    const queryEvents = adapter.projectQueryMessage({
      type: 'system',
      subtype: 'compact_boundary',
      compactMetadata: {
        trigger: 'manual',
        preTokens: 100,
        preservedSegment: {
          headUuid: '00000000-0000-4000-8000-000000000001',
          anchorUuid: '00000000-0000-4000-8000-000000000002',
          tailUuid: '00000000-0000-4000-8000-000000000003',
        },
      },
      uuid: 'compact-1',
    })

    expect(
      queryEvents.map(event => event.type),
    ).toEqual(['headless.sdk_message'])
    expect(queryEvents[0]).toMatchObject({
      payload: {
        type: 'system',
        subtype: 'compact_boundary',
        compact_metadata: {
          trigger: 'manual',
          pre_tokens: 100,
          preserved_segment: {
            head_uuid: '00000000-0000-4000-8000-000000000001',
            anchor_uuid: '00000000-0000-4000-8000-000000000002',
            tail_uuid: '00000000-0000-4000-8000-000000000003',
          },
        },
      },
    })
  })

  test('projects query local command output as compatibility envelopes', () => {
    const adapter = createAdapter()

    const queryEvents = adapter.projectQueryMessage({
      type: 'system',
      subtype: 'local_command',
      content: '<local-command-stdout>local output</local-command-stdout>',
      uuid: 'local-1',
    })

    expect(queryEvents.map(event => event.type)).toEqual([
      'headless.sdk_message',
    ])
    expect(queryEvents[0]).toMatchObject({
      payload: {
        type: 'assistant',
        uuid: 'local-1',
        session_id: 'conversation-1',
      },
    })
  })

  test('projects explicit query user replays as compatibility envelopes', () => {
    const adapter = createAdapter()

    const queryEvents = adapter.projectQueryMessage({
      type: 'query_user_replay',
      message: {
        role: 'user',
        content: 'queued prompt',
      },
      uuid: 'user-replay-1',
      timestamp: '2026-05-04T00:00:00.000Z',
      isReplay: true,
      isSynthetic: false,
    })

    expect(queryEvents.map(event => event.type)).toEqual([
      'headless.sdk_message',
    ])
    expect(queryEvents[0]).toMatchObject({
      payload: {
        type: 'user',
        uuid: 'user-replay-1',
        isReplay: true,
        isSynthetic: false,
      },
    })
  })

  test('projects queued command attachments as user replay compatibility', () => {
    const adapter = createAdapter()

    const queryEvents = adapter.projectQueryMessage({
      type: 'attachment',
      attachment: {
        type: 'queued_command',
        prompt: 'run queued command',
        source_uuid: 'source-1',
      },
      uuid: 'attachment-1',
      timestamp: '2026-05-04T00:00:00.000Z',
    })

    expect(queryEvents.map(event => event.type)).toEqual([
      'headless.sdk_message',
    ])
    expect(queryEvents[0]).toMatchObject({
      payload: {
        type: 'user',
        uuid: 'source-1',
        isReplay: true,
        message: {
          role: 'user',
          content: 'run queued command',
        },
      },
    })
  })

  test('projects query API retry messages as compatibility envelopes', () => {
    const adapter = createAdapter()

    const queryEvents = adapter.projectQueryMessage({
      type: 'system',
      subtype: 'api_error',
      retryAttempt: 2,
      maxRetries: 5,
      retryInMs: 1000,
      error: {
        status: 429,
        message: 'rate limited',
      },
      uuid: 'api-retry-1',
    })

    expect(queryEvents.map(event => event.type)).toEqual([
      'headless.sdk_message',
    ])
    expect(queryEvents[0]).toMatchObject({
      payload: {
        type: 'system',
        subtype: 'api_retry',
        attempt: 2,
        max_retries: 5,
        retry_delay_ms: 1000,
        error_status: 429,
        error: 'rate_limit',
      },
    })
  })

  test('projects query progress messages as compatibility sidecars once', () => {
    const adapter = createAdapter()

    const projection = adapter.projectQueryMessageWithCompatibility({
      type: 'progress',
      uuid: 'progress-1',
      parent_tool_use_id: 'toolu_parent',
      parentToolUseID: 'toolu_parent',
      data: {
        type: 'agent_progress',
        message: {
          type: 'assistant',
          uuid: 'nested-progress-1',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'agent update' }],
          },
        },
        elapsedTimeSeconds: 2,
        taskId: 'task-1',
      },
    } as unknown as Parameters<
      typeof adapter.projectQueryMessageWithCompatibility
    >[0])

    expect(projection.events.map(event => event.type)).toEqual([
      'headless.sdk_message',
    ])
    expect(projection.events[0]).toMatchObject({
      payload: {
        type: 'assistant',
        uuid: 'nested-progress-1',
        parent_tool_use_id: 'toolu_parent',
      },
    })
  })

  test('projects throttled tool progress through the query progress input', () => {
    let now = 30_000
    const adapter = createQueryTurnEventAdapter({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      getAbortReason: () => null,
      getProgressProjectionEnvironment: () => ({
        now,
        remoteEnabled: true,
      }),
    })
    const progressMessage = {
      type: 'progress',
      uuid: 'tool-progress-1',
      parentToolUseID: 'toolu_parent',
      toolUseID: 'toolu_child',
      data: {
        type: 'bash_progress',
        elapsedTimeSeconds: 2,
        taskId: 'task-1',
        message: {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'ignored' }],
          },
        },
      },
    } as unknown as Parameters<
      typeof adapter.projectQueryMessageWithCompatibility
    >[0]

    const first = adapter.projectQueryMessageWithCompatibility(progressMessage)
    const second = adapter.projectQueryMessageWithCompatibility(progressMessage)
    now = 60_001
    const third = adapter.projectQueryMessageWithCompatibility(progressMessage)

    expect(first.compatibilityMessages).toHaveLength(1)
    expect(first.events[0]).toMatchObject({
      payload: {
        type: 'tool_progress',
        tool_name: 'Bash',
        uuid: 'tool-progress-1',
      },
    })
    expect(second).toEqual({ events: [], compatibilityMessages: [] })
    expect(third.compatibilityMessages).toHaveLength(1)
  })

  test('projects query assistant messages as compatibility envelopes', () => {
    const adapter = createAdapter()

    const queryEvents = adapter.projectQueryMessage({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'assistant output' }],
      },
      uuid: '00000000-0000-4000-8000-000000000010',
    })

    expect(queryEvents.map(event => event.type)).toEqual([
      'headless.sdk_message',
    ])
    expect(queryEvents[0]).toMatchObject({
      payload: {
        type: 'assistant',
        uuid: '00000000-0000-4000-8000-000000000010',
        message: {
          content: [{ type: 'text', text: 'assistant output' }],
        },
      },
    })
  })

  test('projects query user messages as compatibility envelopes', () => {
    const adapter = createAdapter()

    const queryEvents = adapter.projectQueryMessage({
      type: 'user',
      message: {
        role: 'user',
        content: 'user input',
      },
      uuid: '00000000-0000-4000-8000-000000000020',
      timestamp: '2026-05-04T00:00:00.000Z',
    })

    expect(queryEvents.map(event => event.type)).toEqual([
      'headless.sdk_message',
    ])
    expect(queryEvents[0]).toMatchObject({
      payload: {
        type: 'user',
        uuid: '00000000-0000-4000-8000-000000000020',
        message: {
          content: [{ type: 'text', text: 'user input' }],
        },
      },
    })
  })

  test('projects query terminal results and keeps SDK result as compatibility only', () => {
    const adapter = createAdapter()

    const projection = adapter.projectQueryMessageWithCompatibility({
      type: 'query_result',
      subtype: 'success',
      isError: false,
      stopReason: 'end_turn',
      sdkMessage: {
        type: 'result',
        subtype: 'success',
        is_error: false,
        stop_reason: 'end_turn',
        session_id: 'conversation-1',
        uuid: 'result-1',
      } as unknown as SDKMessage,
    })

    expect(projection.events.map(event => event.type)).toEqual([
      'turn.completed',
      'headless.sdk_message',
    ])
    expect(projection.events[0]).toMatchObject({
      payload: {
        state: 'completed',
        stopReason: 'end_turn',
      },
    })
    expect(projection.compatibilityMessages).toHaveLength(1)
    expect(adapter.hasTerminalResult()).toBe(true)
  })

  test('maps query terminal error subtypes to existing stop reasons', () => {
    const adapter = createAdapter()
    const events = adapter.projectQueryMessage({
      type: 'query_result',
      subtype: 'error_max_turns',
      isError: true,
      stopReason: null,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'turn.failed',
      payload: {
        state: 'failed',
        stopReason: 'max_turn_requests',
      },
    })
  })

  test('projects query stream deltas before compatibility envelopes', () => {
    const adapter = createAdapter()
    const events = adapter.projectQueryMessage({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: 'hello',
        },
      },
      session_id: 'conversation-1',
      uuid: 'stream-1',
    })

    expect(events.map(event => event.type)).toEqual([
      'turn.output_delta',
      'headless.sdk_message',
    ])
    expect(events[0]).toMatchObject({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      payload: {
        source: 'sdk_stream_event',
        text: 'hello',
      },
      metadata: {
        compatibilitySource: 'headless.sdk_message',
      },
    })
    expect(events[1]).toMatchObject({
      metadata: {
        canonicalProjection: 'turn.output_delta',
      },
      payload: {
        type: 'stream_event',
        uuid: 'stream-1',
      },
    })
    expect(adapter.hasTerminalResult()).toBe(false)
  })

  test('projects query result messages into terminal runtime events', () => {
    const adapter = createAdapter()
    const events = adapter.projectQueryMessage({
      type: 'query_result',
      subtype: 'success',
      isError: false,
      stopReason: 'end_turn',
    })

    expect(events.map(event => event.type)).toEqual([
      'turn.completed',
    ])
    expect(events[0]).toMatchObject({
      payload: {
        conversationId: 'conversation-1',
        state: 'completed',
        stopReason: 'end_turn',
        turnId: 'turn-1',
      },
    })
    expect(adapter.hasTerminalResult()).toBe(true)
  })

  test('normalizes aborted query results and fallback terminals as failures', () => {
    const adapter = createAdapter('interrupt')

    expect(adapter.createFallbackTerminalEvent()).toMatchObject({
      type: 'turn.failed',
      payload: {
        state: 'failed',
        stopReason: 'interrupt',
      },
    })

    const events = adapter.projectQueryMessage({
      type: 'query_result',
      subtype: 'success',
      isError: false,
      stopReason: 'end_turn',
    })

    expect(events[0]).toMatchObject({
      type: 'turn.failed',
      payload: {
        state: 'failed',
        stopReason: 'interrupt',
      },
    })
  })
})
