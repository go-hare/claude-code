import { describe, expect, mock, test } from 'bun:test'

import {
  AgentEventBus,
  AgentTurn,
  createAgent,
  createSessionRuntimeExecutor,
  type AgentTurnExecutor,
} from '../index.js'

describe('AgentCore', () => {
  test('creates sessions and records the session start event', () => {
    const agent = createAgent({ cwd: '/repo' })
    const session = agent.createSession({ id: 'session-1' })

    expect(agent.getSession('session-1')).toBe(session)
    expect(session.cwd).toBe('/repo')
    expect(session.replayEvents().map(event => event.type)).toEqual([
      'session.started',
    ])
  })

  test('streams explicit missing-executor terminal event through AgentTurn', async () => {
    const agent = createAgent({ cwd: '/repo' })
    const session = agent.createSession({ id: 'session-1' })

    const events = []
    for await (const event of session.stream({
      content: [{ type: 'text', text: 'hello' }],
    })) {
      events.push(event)
    }

    expect(events.map(event => event.type)).toEqual([
      'turn.started',
      'turn.failed',
    ])
    expect(events[0]).toMatchObject({
      type: 'turn.started',
      sessionId: 'session-1',
    })
    expect(events[1]).toMatchObject({
      type: 'turn.failed',
      sessionId: 'session-1',
      error: { code: 'AGENT_CORE_EXECUTOR_MISSING' },
    })
  })

  test('AgentTurn streams the same terminal shape as the session', async () => {
    const events = []
    const bus = new AgentEventBus({ sessionId: 'session-1' })
    const turn = new AgentTurn({
      sessionId: 'session-1',
      cwd: '/repo',
      input: { content: [{ type: 'text', text: 'hello' }] },
      publish: event => bus.publish(event),
    })

    for await (const event of turn.stream()) {
      events.push(event)
    }

    expect(events.map(event => event.type)).toEqual([
      'turn.started',
      'turn.failed',
    ])
  })

  test('streams events from the configured executor through the session bus', async () => {
    const executor: AgentTurnExecutor = async function* (_input, context) {
      yield {
        type: 'message.delta',
        sessionId: context.sessionId,
        turnId: context.turnId,
        messageId: 'message-1',
        text: 'hello',
      }
      yield {
        type: 'turn.completed',
        sessionId: context.sessionId,
        turnId: context.turnId,
        result: { stopReason: 'end_turn', isError: false, output: 'hello' },
      }
    }
    const agent = createAgent({ cwd: '/repo', executor })
    const session = agent.createSession({ id: 'session-1' })

    const events = []
    for await (const event of session.stream({
      content: [{ type: 'text', text: 'hello' }],
    })) {
      events.push(event)
    }

    expect(events.map(event => event.type)).toEqual([
      'turn.started',
      'message.delta',
      'turn.completed',
    ])
    expect(session.replayEvents().map(event => event.type)).toEqual([
      'session.started',
      'turn.started',
      'message.delta',
      'turn.completed',
    ])
  })

  test('creates an executor from SessionRuntime submitMessage output', async () => {
    const runtime = {
      submitMessage: mock(async function* () {
        yield {
          type: 'stream_event',
          uuid: 'message-1',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'hello' },
          },
        }
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'hello',
          stop_reason: 'end_turn',
        }
      }),
    }
    const executor = createSessionRuntimeExecutor({ runtime })
    const agent = createAgent({ cwd: '/repo', executor })
    const session = agent.createSession({ id: 'session-1' })

    const events = []
    for await (const event of session.stream({
      content: [{ type: 'text', text: 'hello' }],
    })) {
      events.push(event)
    }

    expect(runtime.submitMessage).toHaveBeenCalledWith('hello')
    expect(events.map(event => event.type)).toEqual([
      'turn.started',
      'message.delta',
      'turn.completed',
    ])
  })
})
