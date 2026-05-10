import { describe, expect, test } from 'bun:test'

import { AgentEventBus } from '../AgentEventBus.js'

describe('AgentEventBus', () => {
  test('publishes sequenced events with stable envelope fields', () => {
    const bus = new AgentEventBus({
      sessionId: 'session-1',
      now: () => new Date('2026-05-09T00:00:00.000Z'),
      createId: () => 'event-1',
    })

    const event = bus.publish({
      type: 'status.changed',
      sessionId: 'session-1',
      status: 'running',
    })

    expect(event).toEqual({
      type: 'status.changed',
      id: 'event-1',
      sequence: 1,
      timestamp: '2026-05-09T00:00:00.000Z',
      sessionId: 'session-1',
      status: 'running',
    })
    expect(bus.getLastSequence()).toBe(1)
  })

  test('subscribes and replays events after a sequence', () => {
    let nextId = 0
    const observed: string[] = []
    const bus = new AgentEventBus({
      createId: () => `event-${++nextId}`,
      now: () => new Date('2026-05-09T00:00:00.000Z'),
    })

    const unsubscribe = bus.subscribe(event => {
      observed.push(event.type)
    })

    bus.publish({ type: 'request.started', requestId: 'request-1' })
    bus.publish({
      type: 'session.started',
      sessionId: 'session-1',
      cwd: '/repo',
    })
    unsubscribe()
    bus.publish({
      type: 'session.closed',
      sessionId: 'session-1',
      reason: 'done',
    })

    expect(observed).toEqual(['request.started', 'session.started'])
    expect(bus.replay({ sinceSequence: 1 }).map(event => event.type)).toEqual([
      'session.started',
      'session.closed',
    ])
    expect(bus.replay({ limit: 1 }).map(event => event.type)).toEqual([
      'session.closed',
    ])
  })
})
