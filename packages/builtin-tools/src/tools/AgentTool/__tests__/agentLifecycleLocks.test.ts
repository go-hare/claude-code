import { afterEach, describe, expect, test } from 'bun:test'
import {
  acquireFileLock,
  getFileLockOwner,
  resetFileLockStateForTests,
} from 'src/coordinator/fileLockManager.js'
import { resetCommandQueue } from 'src/utils/messageQueueManager.js'
import { runAsyncAgentLifecycle } from '../agentToolUtils.js'

afterEach(() => {
  resetFileLockStateForTests()
  resetCommandQueue()
})

describe('runAsyncAgentLifecycle lock cleanup', () => {
  test('releases coordinator file locks when the async agent completes', async () => {
    resetFileLockStateForTests()
    const lock = acquireFileLock('src/agent-lifecycle-locks.ts', 'agent-a', {
      sourceTool: 'FileEditTool',
    })
    expect(lock.success).toBe(true)
    expect(getFileLockOwner('src/agent-lifecycle-locks.ts')).toBe('agent-a')

    await runAsyncAgentLifecycle({
      taskId: 'agent-a',
      abortController: new AbortController(),
      makeStream: async function* () {},
      metadata: {
        prompt: 'do work',
        resolvedAgentModel: 'sonnet',
        isBuiltInAgent: true,
        startTime: Date.now(),
        agentType: 'worker',
        isAsync: true,
      },
      description: 'worker',
      toolUseContext: {
        options: {
          tools: [],
        },
        getAppState: () => ({ toolPermissionContext: {} }) as any,
        setAppState: () => {},
        messages: [],
        readFileState: new Map() as any,
        abortController: new AbortController(),
        setInProgressToolUseIDs: () => {},
        setResponseLength: () => {},
        updateFileHistoryState: () => ({} as never),
        updateAttributionState: () => ({} as never),
      } as any,
      rootSetAppState: () => {},
      agentIdForCleanup: 'agent-a',
      enableSummarization: false,
      getWorktreeResult: async () => ({}),
    })

    expect(getFileLockOwner('src/agent-lifecycle-locks.ts')).toBeNull()
  })
})
