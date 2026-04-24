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

  test('routes emitted stdout messages through attached sinks', () => {
    const sent: unknown[] = []
    const session = createHeadlessManagedSession([], {
      sessionId: 'session-1',
      cwd: process.cwd(),
    })
    const sink = {
      send(message: unknown) {
        sent.push(message)
      },
    }

    session.attachSink(sink)
    session.emitOutput({
      type: 'system',
      subtype: 'status',
      status: 'running',
      session_id: 'session-1',
      uuid: 'uuid-1',
    } as any)
    session.detachSink(sink)
    session.emitOutput({
      type: 'system',
      subtype: 'status',
      status: 'idle',
      session_id: 'session-1',
      uuid: 'uuid-2',
    } as any)

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: 'system',
      subtype: 'status',
      status: 'running',
    })
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

  test('derives workDir from the runtime-owned provider seam when supplied', () => {
    let runtimeCwd = '/tmp/initial-cwd'
    const session = createHeadlessManagedSession([], {
      sessionId: 'session-42',
      cwd: '/tmp/fallback-cwd',
      getWorkDir: () => runtimeCwd,
    })

    expect(session.workDir).toBe('/tmp/initial-cwd')

    runtimeCwd = '/tmp/updated-cwd'

    expect(session.workDir).toBe('/tmp/updated-cwd')
    expect(session.toIndexEntry().cwd).toBe('/tmp/updated-cwd')
  })

  test('produces a minimal runtime-owned index entry and syncs owner callbacks', async () => {
    const updated = [] as string[]
    const stopped = [] as string[]
    const session = createHeadlessManagedSession([], {
      sessionId: 'session-indexed',
      cwd: '/tmp/headless-indexed',
      onUpdated: current => {
        updated.push(current.id)
      },
      onStopped: current => {
        stopped.push(current.id)
      },
    })

    session.startTurn()
    session.appendMessages([
      {
        uuid: 'assistant-1',
        type: 'assistant',
        message: { role: 'assistant', content: [] },
      } as any,
    ])
    const entry = session.toIndexEntry()
    session.seedReadFileState('/tmp/file.txt', {
      content: 'seeded',
      timestamp: 10,
      offset: undefined,
      limit: undefined,
    })
    await session.stopAndWait()

    expect(entry).toMatchObject({
      sessionId: 'session-indexed',
      transcriptSessionId: 'session-indexed',
      cwd: '/tmp/headless-indexed',
    })
    expect(typeof entry.createdAt).toBe('number')
    expect(typeof entry.lastActiveAt).toBe('number')
    expect(session.messages).toHaveLength(1)
    expect(updated).toContain('session-indexed')
    expect(stopped).toEqual(['session-indexed'])
  })
})
