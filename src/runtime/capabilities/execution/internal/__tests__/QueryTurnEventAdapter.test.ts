import { describe, expect, test } from 'bun:test'

import type { ProtocolMessage } from 'src/types/protocol/index.js'
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
  test('projects query stream events without compatibility envelopes', () => {
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

    expect(events.map(event => event.type)).toEqual(['turn.output_delta'])
    expect(events[0]).toMatchObject({
      payload: {
        source: 'protocol_stream_event',
        text: 'from query',
      },
    })
    expect(events.some(event => event.type === 'headless.protocol_message')).toBe(
      false,
    )
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
      'headless.protocol_message',
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
        'headless.protocol_message',
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

  test('does not project tool summary compatibility envelopes by default', () => {
    const adapter = createAdapter()

    const queryEvents = adapter.projectQueryMessage({
      type: 'tool_use_summary',
      summary: 'Finished tool batch',
      precedingToolUseIds: ['toolu_1'],
      uuid: 'summary-1',
    })

    expect(queryEvents).toEqual([])
  })

  test('does not project compact boundary compatibility envelopes by default', () => {
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

    expect(queryEvents).toEqual([])
  })

  test('projects query local command output as canonical deltas only', () => {
    const adapter = createAdapter()

    const queryEvents = adapter.projectQueryMessage({
      type: 'system',
      subtype: 'local_command',
      content: '<local-command-stdout>local output</local-command-stdout>',
      uuid: 'local-1',
    })

    expect(queryEvents.map(event => event.type)).toEqual(['turn.delta'])
    expect(queryEvents[0]).toMatchObject({
      payload: {
        kind: 'assistant_message',
        text: 'local output',
      },
    })
  })

  test('does not project explicit user replay compatibility envelopes by default', () => {
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

    expect(queryEvents).toEqual([])
  })

  test('does not project queued command attachment compatibility by default', () => {
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

    expect(queryEvents).toEqual([])
  })

  test('does not project API retry compatibility envelopes by default', () => {
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

    expect(queryEvents).toEqual([])
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
      'headless.protocol_message',
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

  test('projects query assistant messages as canonical deltas only', () => {
    const adapter = createAdapter()

    const queryEvents = adapter.projectQueryMessage({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'assistant output' }],
      },
      uuid: '00000000-0000-4000-8000-000000000010',
    })

    expect(queryEvents.map(event => event.type)).toEqual(['turn.delta'])
    expect(queryEvents[0]).toMatchObject({
      payload: {
        kind: 'assistant_message',
        text: 'assistant output',
      },
    })
  })

  test('does not project user message compatibility envelopes by default', () => {
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

    expect(queryEvents).toEqual([])
  })

  test('projects tool-use stream starts as semantic turn progress', () => {
    const adapter = createAdapter()

    const events = adapter.projectQueryMessage({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        content_block: {
          type: 'tool_use',
          id: 'toolu_stream_1',
          name: 'Read',
          input: { path: 'README.md' },
        },
      },
      parent_tool_use_id: 'toolu_parent',
      uuid: 'tool-stream-1',
    })

    expect(events.map(event => event.type)).toEqual(['turn.progress'])
    expect(events[0]).toMatchObject({
      payload: {
        kind: 'tool_use_start',
        toolUseId: 'toolu_stream_1',
        parentToolUseId: 'toolu_parent',
        toolName: 'Read',
        toolInput: { path: 'README.md' },
      },
    })
  })

  test('projects assistant tool-use blocks as semantic turn progress', () => {
    const adapter = createAdapter()

    const events = adapter.projectQueryMessage({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'running tool' },
          {
            type: 'tool_use',
            id: 'toolu_assistant_1',
            name: 'Bash',
            input: { command: 'pwd' },
          },
        ],
      },
      uuid: 'assistant-tool-1',
    } as unknown as Parameters<typeof adapter.projectQueryMessage>[0])

    expect(events.map(event => event.type)).toContain('turn.delta')
    expect(events.map(event => event.type)).toContain('turn.progress')
    expect(events.some(event => event.type === 'headless.protocol_message')).toBe(
      false,
    )
    expect(events.find(event => event.type === 'turn.progress')).toMatchObject({
      payload: {
        kind: 'tool_use_start',
        toolUseId: 'toolu_assistant_1',
        toolName: 'Bash',
        toolInput: { command: 'pwd' },
      },
    })
  })

  test('projects user tool results as semantic turn progress', () => {
    const adapter = createAdapter()

    const events = adapter.projectQueryMessage({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_result_1',
            content: 'done',
            is_error: false,
          },
        ],
      },
      uuid: 'user-tool-result-1',
    } as unknown as Parameters<typeof adapter.projectQueryMessage>[0])

    expect(events.map(event => event.type)).toEqual(['turn.progress'])
    expect(events[0]).toMatchObject({
      payload: {
        kind: 'tool_use_done',
        toolUseId: 'toolu_result_1',
        content: 'done',
        isError: false,
      },
    })
  })

  test('projects query terminal results and keeps protocol result as compatibility only', () => {
    const adapter = createAdapter()

    const projection = adapter.projectQueryMessageWithCompatibility({
      type: 'query_result',
      subtype: 'success',
      isError: false,
      stopReason: 'end_turn',
      protocolMessage: {
        type: 'result',
        subtype: 'success',
        is_error: false,
        stop_reason: 'end_turn',
        session_id: 'conversation-1',
        uuid: 'result-1',
      } as unknown as ProtocolMessage,
    })

    expect(projection.events.map(event => event.type)).toEqual([
      'turn.completed',
      'headless.protocol_message',
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

  test('projects query stream deltas without compatibility envelopes', () => {
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

    expect(events.map(event => event.type)).toEqual(['turn.output_delta'])
    expect(events[0]).toMatchObject({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      payload: {
        source: 'protocol_stream_event',
        text: 'hello',
      },
      metadata: {
        compatibilitySource: 'headless.protocol_message',
      },
    })
    expect(events.some(event => event.type === 'headless.protocol_message')).toBe(
      false,
    )
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
