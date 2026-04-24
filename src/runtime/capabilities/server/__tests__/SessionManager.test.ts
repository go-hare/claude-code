import { describe, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'events'
import { resolve } from 'path'
import { PassThrough } from 'stream'
import type { ChildProcess } from 'child_process'

import { SessionManager } from '../SessionManager.js'
import { RuntimeSessionRegistry } from '../SessionRegistry.js'
import type { RuntimeManagedSession } from '../contracts.js'

function waitForAsyncWork(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function createRuntimeHandle() {
  const process = new EventEmitter() as ChildProcess
  const stdout = new PassThrough()
  const stderr = new PassThrough()

  return {
    sessionId: 'runtime-session-1',
    workDir: '/tmp/runtime-session-1',
    process,
    stdout,
    stderr,
    writeLine: mock((_data: string) => true),
    terminate: mock(() => {}),
    forceKill: mock(() => {}),
  }
}

describe('SessionManager', () => {
  test('routes session lifecycle through the managed-session contract', async () => {
    const createSessionRuntime = mock(
      ({
        cwd,
        sessionId,
      }: {
        cwd: string
        sessionId: string
        dangerouslySkipPermissions?: boolean
      }) => ({
        ...createRuntimeHandle(),
        sessionId,
        workDir: cwd,
      }),
    )
    const attachSink = mock((_sink: unknown) => {})
    const detachSink = mock((_sink: unknown) => {})
    const handleInput = mock((_rawMessage: string) => true)
    const stopAndWait = mock(async (_force?: boolean) => {})
    let stopCallback: ((session: RuntimeManagedSession) => void) | null = null
    let managedSession: RuntimeManagedSession | null = null

    const createManagedSession = mock(options => {
      stopCallback = options.onStopped
      expect(options.idleTimeoutMs).toBe(123)
      managedSession = {
        id: options.runtime.sessionId,
        workDir: options.runtime.workDir,
        isLive: true,
        attachSink,
        detachSink,
        handleInput,
        stopAndWait,
        toIndexEntry() {
          return {
            sessionId: this.id,
            transcriptSessionId: this.id,
            cwd: this.workDir,
            createdAt: 1,
            lastActiveAt: 2,
          }
        },
      }
      return managedSession
    })

    const manager = new SessionManager(
      {
        createSessionRuntime,
      },
      {
        idleTimeoutMs: 123,
        createManagedSession,
        registry: new RuntimeSessionRegistry({
          load: async () => ({}),
          list: async () => [],
          upsert: async () => {},
          remove: async () => {},
        }),
      },
    )

    const created = await manager.createSession({
      cwd: '/tmp/runtime-session-1',
    })

    expect(created).toEqual({
      sessionId: expect.any(String),
      workDir: resolve('/tmp/runtime-session-1'),
    })
    expect(createSessionRuntime).toHaveBeenCalledTimes(1)
    expect(createManagedSession).toHaveBeenCalledTimes(1)
    expect(manager.getSession(created.sessionId)).toBe(managedSession)

    const sink = {
      send: mock((_data: string) => {}),
      close: mock((_code?: number, _reason?: string) => {}),
    }

    expect(manager.attachSink(created.sessionId, sink)).toBe(managedSession)
    expect(attachSink).toHaveBeenCalledWith(sink)
    expect(manager.handleSessionInput(created.sessionId, 'hello')).toBe(true)
    expect(handleInput).toHaveBeenCalledWith('hello')
    manager.detachSink(created.sessionId, sink)
    expect(detachSink).toHaveBeenCalledWith(sink)

    await manager.destroyAll()
    expect(stopAndWait).toHaveBeenCalledWith(true)
    const onStopped = stopCallback
    const sessionForStop = managedSession
    expect(onStopped).not.toBeNull()
    expect(sessionForStop).not.toBeNull()
    if (!onStopped || !sessionForStop) {
      throw new Error('Expected managed session stop callback to be registered')
    }
    ;(onStopped as unknown as (session: RuntimeManagedSession) => void)(
      sessionForStop as RuntimeManagedSession,
    )
    await waitForAsyncWork()
    expect(manager.hasSession(created.sessionId)).toBe(false)
  })
})
