import { describe, expect, test } from 'bun:test'

import { createHeadlessManagedSession } from '../headlessManagedSession.js'

describe('createHeadlessManagedSession', () => {
  test('replays interrupted turns through the managed session buffer', () => {
    const interruptedUserMessage = {
      uuid: 'user-1',
      type: 'user',
      message: {
        content: 'resume me',
      },
    } as any
    const interruptionSentinel = {
      uuid: 'system-1',
      type: 'system',
    } as any
    const trailingMessage = {
      uuid: 'tail-1',
      type: 'user',
      message: {
        content: 'keep me',
      },
    } as any

    const session = createHeadlessManagedSession(
      [interruptedUserMessage, interruptionSentinel, trailingMessage],
      {
        sessionId: 'session-1',
        cwd: process.cwd(),
      },
    )

    expect(session.resumeInterruptedTurn(interruptedUserMessage)).toBe(
      'resume me',
    )
    expect(session.messages).toEqual([trailingMessage])
  })

  test('manages the active turn abort controller', () => {
    const session = createHeadlessManagedSession([], {
      sessionId: 'session-1',
      cwd: process.cwd(),
    })

    expect(session.getAbortController()).toBeUndefined()

    const abortController = session.startTurn()
    expect(session.getAbortController()).toBe(abortController)
    expect(abortController.signal.aborted).toBe(false)

    session.abortActiveTurn('interrupt')
    expect(abortController.signal.aborted).toBe(true)
  })

  test('merges pending read-state seeds at the commit boundary', () => {
    const session = createHeadlessManagedSession([], {
      sessionId: 'session-1',
      cwd: process.cwd(),
    })
    session.seedReadFileState('/tmp/seeded.txt', {
      content: 'seeded',
      timestamp: 10,
      offset: undefined,
      limit: undefined,
    })

    expect(session.getReadFileCache().get('/tmp/seeded.txt')?.content).toBe(
      'seeded',
    )
    expect(
      session.getCommittedReadFileState().get('/tmp/seeded.txt'),
    ).toBeUndefined()

    const committed = session.getCommittedReadFileState()
    session.commitReadFileCache(committed)

    expect(
      session.getCommittedReadFileState().get('/tmp/seeded.txt')?.content,
    ).toBe('seeded')
    expect(session.getReadFileCache().get('/tmp/seeded.txt')?.content).toBe(
      'seeded',
    )
  })

  test('exposes a lifecycle contract with session identity and stop semantics', async () => {
    const session = createHeadlessManagedSession([], {
      sessionId: 'session-42',
      cwd: '/tmp/headless-session',
    })

    expect(session.id).toBe('session-42')
    expect(session.workDir).toBe('/tmp/headless-session')
    expect(session.isLive).toBe(true)

    const abortController = session.startTurn()
    await session.stopAndWait(true)

    expect(session.isLive).toBe(false)
    expect(abortController.signal.aborted).toBe(true)
    expect(session.getAbortController()).toBeUndefined()
  })
})
