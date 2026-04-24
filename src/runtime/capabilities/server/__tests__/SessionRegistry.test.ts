import { describe, expect, mock, test } from 'bun:test'

import { RuntimeSessionRegistry } from '../SessionRegistry.js'

type FakeSession = {
  id: string
  workDir: string
  isLive: boolean
  stopAndWait(force?: boolean): Promise<void>
  toIndexEntry(): {
    sessionId: string
    transcriptSessionId: string
    cwd: string
    createdAt: number
    lastActiveAt: number
  }
}

function createSession(
  id: string,
  isLive = true,
): FakeSession {
  return {
    id,
    workDir: `/tmp/${id}`,
    isLive,
    async stopAndWait() {},
    toIndexEntry() {
      return {
        sessionId: id,
        transcriptSessionId: id,
        cwd: `/tmp/${id}`,
        createdAt: 1,
        lastActiveAt: 2,
      }
    },
  }
}

describe('RuntimeSessionRegistry', () => {
  test('tracks sessions and live count, and persists add/remove', async () => {
    const upsert = mock(async () => {})
    const remove = mock(async () => {})
    const registry = new RuntimeSessionRegistry<FakeSession>({
      load: async () => ({}),
      list: async () => [],
      upsert,
      remove,
    })

    const liveSession = createSession('session-live', true)
    const stoppedSession = createSession('session-stopped', false)

    await registry.add(liveSession)
    await registry.add(stoppedSession)

    expect(registry.has('session-live')).toBe(true)
    expect(registry.get('session-live')).toBe(liveSession)
    expect(registry.liveCount()).toBe(1)
    expect(upsert).toHaveBeenCalledTimes(2)

    await registry.remove('session-live')

    expect(registry.has('session-live')).toBe(false)
    expect(remove).toHaveBeenCalledWith('session-live')
  })

  test('syncs index entries without replacing in-memory ownership', () => {
    const upsert = mock(async () => {})
    const registry = new RuntimeSessionRegistry<FakeSession>({
      load: async () => ({}),
      list: async () => [],
      upsert,
      remove: async () => {},
    })
    const session = createSession('session-sync')

    registry.sync(session)

    expect(upsert).toHaveBeenCalledTimes(1)
    const call = upsert.mock.calls[0] as unknown as
      | [
          string,
          {
            sessionId: string
            transcriptSessionId: string
            cwd: string
            createdAt: number
            lastActiveAt: number
          },
        ]
      | undefined
    expect(call?.[0]).toBe('session-sync')
    expect(call?.[1]).toEqual(session.toIndexEntry())
  })
})
