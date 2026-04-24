import { describe, expect, mock, test } from 'bun:test'
import { createHeadlessSessionContext } from '../headlessSessionControl.js'

describe('createHeadlessSessionContext', () => {
  test('tracks received UUIDs per session', () => {
    const sessionA = createHeadlessSessionContext({} as never)
    const sessionB = createHeadlessSessionContext({} as never)
    const uuid =
      '11111111-1111-1111-1111-111111111111' as `${string}-${string}-${string}-${string}-${string}`

    expect(sessionA.control.trackReceivedMessageUuid(uuid)).toBe(true)
    expect(sessionA.control.hasReceivedMessageUuid(uuid)).toBe(true)

    expect(sessionB.control.hasReceivedMessageUuid(uuid)).toBe(false)
    expect(sessionB.control.trackReceivedMessageUuid(uuid)).toBe(true)
  })

  test('runs registered cleanups once in reverse order', async () => {
    const session = createHeadlessSessionContext({} as never)
    const calls: string[] = []
    const first = mock(() => {
      calls.push('first')
    })
    const second = mock(() => {
      calls.push('second')
    })

    session.registerCleanup(first)
    session.registerCleanup(second)

    await session.cleanup()
    await session.cleanup()

    expect(second).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['second', 'first'])
  })

  test('reuses runtime session registry for indexed sessions', async () => {
    const upsert = mock(async () => {})
    const remove = mock(async () => {})
    const session = createHeadlessSessionContext(
      {} as never,
      {
        indexStore: {
          load: async () => ({}),
          list: async () => [],
          upsert,
          remove,
        },
      },
    )

    const indexedSession = {
      id: 'session-1',
      workDir: '/tmp/session-1',
      isLive: true,
      async stopAndWait() {},
      toIndexEntry() {
        return {
          sessionId: 'session-1',
          transcriptSessionId: 'session-1',
          cwd: '/tmp/session-1',
          createdAt: 1,
          lastActiveAt: 2,
        }
      },
    }

    await session.registerIndexedSession(indexedSession)
    expect(session.getIndexedSession('session-1')).toBe(indexedSession)
    expect(session.listIndexedSessions()).toEqual([indexedSession])
    expect(session.liveIndexedSessionCount()).toBe(1)

    session.syncIndexedSession(indexedSession)

    indexedSession.isLive = false
    expect(session.liveIndexedSessionCount()).toBe(0)

    await session.removeIndexedSession('session-1')

    expect(upsert).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledWith('session-1')
    expect(session.getIndexedSession('session-1')).toBeNull()
    expect(session.listIndexedSessions()).toEqual([])
  })
})
