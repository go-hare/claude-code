import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  RuntimeEventBus,
  RuntimeEventReplayError,
  RuntimeEventSerializationError,
} from '../RuntimeEventBus.js'
import { RuntimeEventFileJournal } from '../RuntimeEventJournal.js'

function createClock(): () => string {
  let tick = 0
  return () => {
    const second = String(tick++).padStart(2, '0')
    return `2026-04-26T00:00:${second}.000Z`
  }
}

function createMessageIds(): () => string {
  let nextId = 1
  return () => `message-${nextId++}`
}

function createBus(maxReplayEvents?: number): RuntimeEventBus {
  return new RuntimeEventBus({
    runtimeId: 'runtime-1',
    maxReplayEvents,
    now: createClock(),
    createMessageId: createMessageIds(),
  })
}

describe('RuntimeEventBus', () => {
  test('emits serializable runtime envelopes with monotonic sequence', () => {
    const bus = createBus()

    const first = bus.emit({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      type: 'turn.started',
      replayable: true,
      payload: { state: 'running' },
    })
    const second = bus.emit({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      type: 'turn.delta',
      replayable: true,
      payload: { text: 'hello' },
    })

    expect(first).toMatchObject({
      schemaVersion: 'kernel.runtime.v1',
      messageId: 'message-1',
      sequence: 1,
      timestamp: '2026-04-26T00:00:00.000Z',
      source: 'kernel_runtime',
      kind: 'event',
      runtimeId: 'runtime-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      eventId: 'conversation-1:1',
      payload: {
        type: 'turn.started',
        eventId: 'conversation-1:1',
        replayable: true,
        payload: { state: 'running' },
      },
    })
    expect(second).toMatchObject({
      messageId: 'message-2',
      sequence: 2,
      eventId: 'conversation-1:2',
    })
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
  })

  test('keeps event ids local to runtime and conversation scopes', () => {
    const bus = createBus()

    const runtimeEvent = bus.emit({
      type: 'runtime.ready',
      replayable: true,
    })
    const firstConversationEvent = bus.emit({
      conversationId: 'conversation-1',
      type: 'conversation.ready',
      replayable: true,
    })
    const secondConversationEvent = bus.emit({
      conversationId: 'conversation-2',
      type: 'conversation.ready',
      replayable: true,
    })
    const nextFirstConversationEvent = bus.emit({
      conversationId: 'conversation-1',
      type: 'turn.started',
      replayable: true,
    })

    expect(runtimeEvent.eventId).toBe('runtime-1:1')
    expect(firstConversationEvent.eventId).toBe('conversation-1:1')
    expect(secondConversationEvent.eventId).toBe('conversation-2:1')
    expect(nextFirstConversationEvent.eventId).toBe('conversation-1:2')
  })

  test('replays events after a cursor within the requested conversation', () => {
    const bus = createBus()

    const first = bus.emit({
      conversationId: 'conversation-1',
      type: 'turn.started',
      replayable: true,
    })
    const otherConversation = bus.emit({
      conversationId: 'conversation-2',
      type: 'turn.started',
      replayable: true,
    })
    const second = bus.emit({
      conversationId: 'conversation-1',
      type: 'turn.delta',
      replayable: true,
    })

    expect(
      bus
        .replay({ conversationId: 'conversation-1' })
        .map(event => event.eventId),
    ).toEqual([first.eventId, second.eventId])
    expect(
      bus
        .replay({
          conversationId: 'conversation-1',
          sinceEventId: first.eventId,
        })
        .map(event => event.eventId),
    ).toEqual([second.eventId])
    expect(
      bus
        .replay({ conversationId: 'conversation-2' })
        .map(event => event.eventId),
    ).toEqual([otherConversation.eventId])
  })

  test('distinguishes expired replay cursors from unknown cursors', () => {
    const bus = createBus(2)

    const first = bus.emit({
      conversationId: 'conversation-1',
      type: 'event.one',
      replayable: true,
    })
    bus.emit({
      conversationId: 'conversation-1',
      type: 'event.two',
      replayable: true,
    })
    bus.emit({
      conversationId: 'conversation-1',
      type: 'event.three',
      replayable: true,
    })

    expect(() =>
      bus.replay({
        conversationId: 'conversation-1',
        sinceEventId: first.eventId,
      }),
    ).toThrow(RuntimeEventReplayError)

    try {
      bus.replay({
        conversationId: 'conversation-1',
        sinceEventId: first.eventId,
      })
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeEventReplayError)
      expect((error as RuntimeEventReplayError).code).toBe('not_found')
    }

    try {
      bus.replay({
        conversationId: 'conversation-1',
        sinceEventId: 'missing-event',
      })
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeEventReplayError)
      expect((error as RuntimeEventReplayError).code).toBe('not_found')
    }
  })

  test('drops expired cursor metadata when the replay buffer evicts old events', () => {
    const bus = createBus(1)

    const first = bus.emit({
      conversationId: 'conversation-1',
      type: 'event.one',
      replayable: true,
    })
    bus.emit({
      conversationId: 'conversation-2',
      type: 'event.two',
      replayable: true,
    })

    try {
      bus.replay({
        conversationId: 'conversation-1',
        sinceEventId: first.eventId,
      })
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeEventReplayError)
      expect((error as RuntimeEventReplayError).code).toBe('not_found')
    }
  })

  test('rejects non-serializable event and envelope payloads', () => {
    const bus = createBus()
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(() =>
      bus.emit({
        type: 'bad.function',
        replayable: true,
        payload: { fn: () => 'nope' },
      }),
    ).toThrow(RuntimeEventSerializationError)
    expect(() =>
      bus.emit({
        type: 'bad.circular',
        replayable: true,
        payload: circular,
      }),
    ).toThrow(RuntimeEventSerializationError)
    expect(() =>
      bus.ack({
        requestId: 'request-1',
        payload: { count: BigInt(1) },
      }),
    ).toThrow(RuntimeEventSerializationError)
  })

  test('accepts shared plain objects because JSON can serialize duplicate references', () => {
    const bus = createBus()
    const sharedMetadata = { promptKind: 'text', charCount: 5 }

    const event = bus.emit({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      type: 'turn.started',
      replayable: true,
      payload: {
        input: {
          contextAssembly: {
            modelVisible: [
              {
                type: 'turn.prompt',
                category: 'model_visible',
                source: 'user_input',
                metadata: sharedMetadata,
              },
            ],
            hostVisible: [],
            operatorDebug: [
              {
                type: 'turn_input.summary',
                category: 'operator_debug',
                source: 'runtime',
                metadata: sharedMetadata,
              },
            ],
          },
        },
      },
    })

    expect(JSON.parse(JSON.stringify(event))).toEqual(event)
  })

  test('does not add non-replayable events to the replay buffer', () => {
    const bus = createBus()

    const transient = bus.emit({
      conversationId: 'conversation-1',
      type: 'turn.progress',
      replayable: false,
      payload: { text: 'streaming' },
    })
    const replayable = bus.emit({
      conversationId: 'conversation-1',
      type: 'turn.completed',
      replayable: true,
    })

    expect(transient.eventId).toBeUndefined()
    expect(bus.replay({ conversationId: 'conversation-1' })).toEqual([
      replayable,
    ])
  })

  test('notifies subscribers without letting observer errors affect emission', () => {
    const bus = createBus()
    const observed: unknown[] = []
    bus.subscribe(envelope => {
      observed.push(envelope)
    })
    bus.subscribe(() => {
      throw new Error('observer failed')
    })

    const event = bus.emit({
      conversationId: 'conversation-1',
      type: 'turn.started',
      replayable: true,
    })
    const ack = bus.ack({
      requestId: 'request-1',
      payload: { ok: true },
    })

    expect(observed).toEqual([event, ack])
  })

  test('hydrates replay envelopes and advances generated event ids', () => {
    const source = new RuntimeEventBus({
      runtimeId: 'runtime-1',
      now: createClock(),
    })
    const first = source.emit({
      conversationId: 'conversation-1',
      type: 'turn.started',
      replayable: true,
    })
    const hydrated = new RuntimeEventBus({
      runtimeId: 'runtime-1',
      now: createClock(),
      initialReplayEnvelopes: [first],
    })

    expect(hydrated.replay({ conversationId: 'conversation-1' })).toEqual([
      first,
    ])

    const next = hydrated.emit({
      conversationId: 'conversation-1',
      type: 'turn.delta',
      replayable: true,
    })

    expect(next.sequence).toBe(first.sequence + 1)
    expect(next.messageId).toBe('kernel-message-2')
    expect(next.eventId).toBe('conversation-1:2')
  })

  test('persists and reads only replayable event envelopes from a journal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'runtime-event-journal-'))
    const journalPath = join(dir, 'events.ndjson')

    try {
      const journal = new RuntimeEventFileJournal(journalPath)
      const bus = createBus()
      const replayable = bus.emit({
        conversationId: 'conversation-1',
        type: 'turn.started',
        replayable: true,
      })
      const transient = bus.emit({
        conversationId: 'conversation-1',
        type: 'turn.progress',
        replayable: false,
      })
      const ack = bus.ack({
        requestId: 'request-1',
        payload: { ok: true },
      })

      journal.append(replayable)
      journal.append(transient)
      journal.append(ack)

      expect(journal.readReplayableEnvelopes()).toEqual([replayable])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
