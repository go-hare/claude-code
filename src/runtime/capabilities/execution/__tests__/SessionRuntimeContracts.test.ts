import { EMPTY_USAGE } from '@ant/model-provider'
import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

import { createFileStateCacheWithSizeLimit } from 'src/utils/fileStateCache.js'

const content = readFileSync(
  join(
    process.cwd(),
    'src/runtime/capabilities/execution/SessionRuntime.ts',
  ),
  'utf8',
)
const headlessManagedSessionContent = readFileSync(
  join(
    process.cwd(),
    'src/runtime/capabilities/execution/internal/headlessManagedSession.ts',
  ),
  'utf8',
)

describe('SessionRuntime contracts', () => {
  test('defines the execution session factory surface', () => {
    expect(content).toContain("from '../../contracts/session.js'")
    expect(content).toContain('export interface RuntimeExecutionSession')
    expect(content).toContain(
      'export interface RuntimeExecutionSession extends RuntimeSessionLifecycle',
    )
    expect(content).toContain('export type ExecutionSessionFactory')
    expect(content).toContain('export const createExecutionSessionRuntime')
  })

  test('keeps MessageSelector optional at the runtime boundary', () => {
    expect(content).toContain(
      "(): typeof import('src/components/MessageSelector.js') | null",
    )
    expect(content).toContain('return null')
    expect(content).toContain('function selectableUserMessagesFilter')
    expect(content).toContain(
      'selectableUserMessagesFilter(message as Message) ?? true',
    )
  })

  test('headless managed session shares the runtime session lifecycle contract', () => {
    expect(headlessManagedSessionContent).toContain(
      "from '../../../contracts/session.js'",
    )
    expect(headlessManagedSessionContent).toContain(
      'export type HeadlessManagedSession = RuntimeSessionLifecycle &',
    )
    expect(headlessManagedSessionContent).toContain(
      'IndexedRuntimeSession &',
    )
    expect(headlessManagedSessionContent).toContain(
      'AttachableRuntimeSession<HeadlessManagedSessionSink> & {',
    )
    expect(headlessManagedSessionContent).toContain(
      'export type HeadlessManagedSessionSink = RuntimeSessionSink<StdoutMessage>',
    )
  })

  test('ask routes through an injected execution session factory', async () => {
    const { ask } = await import('../SessionRuntime.js')
    const initialCache = createFileStateCacheWithSizeLimit(4)
    const nextCache = createFileStateCacheWithSizeLimit(4)
    nextCache.set('/tmp/out.txt', {
      content: 'next-cache',
      timestamp: 1,
      offset: undefined,
      limit: undefined,
    })

    const setReadFileCache = mock((_cache: unknown) => {})
    const stopAndWait = mock(async (_force?: boolean) => {})
    const submitMessage = mock(async function* (
      prompt: string | unknown[],
      options?: { uuid?: string; isMeta?: boolean },
    ) {
      expect(prompt).toBe('hello')
      expect(options).toEqual({
        uuid: 'prompt-1',
        isMeta: true,
      })
      yield {
        type: 'result',
        subtype: 'success',
        duration_ms: 0,
        duration_api_ms: 0,
        is_error: false,
        num_turns: 1,
        stop_reason: null,
        session_id: 'session-1',
        total_cost_usd: 0,
        usage: EMPTY_USAGE,
        modelUsage: {},
        permission_denials: [],
        uuid: 'result-1',
      } as const
    })

    const createSessionRuntime = mock((config: Record<string, unknown>) => {
      expect(config.readFileCache).not.toBe(initialCache)
      expect(config.initialMessages).toEqual([])
      return {
        id: 'session-1',
        workDir: process.cwd(),
        isLive: true,
        submitMessage,
        getReadFileState: () => nextCache,
        stopAndWait,
      }
    })

    const yieldedMessages: unknown[] = []
    for await (const message of ask({
      commands: [],
      prompt: 'hello',
      promptUuid: 'prompt-1',
      isMeta: true,
      cwd: process.cwd(),
      tools: [] as any,
      mcpClients: [],
      canUseTool: async () => ({ behavior: 'allow' }) as any,
      getAppState: () => ({}) as any,
      setAppState: () => ({}) as any,
      getReadFileCache: () => initialCache,
      setReadFileCache,
      createSessionRuntime: createSessionRuntime as any,
    })) {
      yieldedMessages.push(message)
    }

    expect(createSessionRuntime).toHaveBeenCalledTimes(1)
    expect(submitMessage).toHaveBeenCalledTimes(1)
    expect(setReadFileCache).toHaveBeenCalledWith(nextCache)
    expect(stopAndWait).toHaveBeenCalledWith(true)
    expect(yieldedMessages).toHaveLength(1)
  })
})
