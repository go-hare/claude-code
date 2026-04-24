import { describe, expect, test } from 'bun:test'
import {
  acquireFileLock,
  getFileLockStats,
  resetFileLockStateForTests,
  transferAgentLocks,
} from './fileLockManager.js'

describe('fileLockManager', () => {
  test('allows the same worker to reacquire the same file lock', () => {
    resetFileLockStateForTests()

    const first = acquireFileLock('src/app.ts', 'agent-a', {
      sourceTool: 'FileEditTool',
    })
    const second = acquireFileLock('src/app.ts', 'agent-a', {
      sourceTool: 'FileWriteTool',
    })

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(getFileLockStats().activeLocks).toBe(1)
  })

  test('rejects concurrent writers for the same file', () => {
    resetFileLockStateForTests()

    acquireFileLock('src/app.ts', 'agent-a', {
      sourceTool: 'FileEditTool',
    })
    const conflict = acquireFileLock('src/app.ts', 'agent-b', {
      sourceTool: 'FileWriteTool',
    })

    expect(conflict.success).toBe(false)
    if (conflict.success) {
      throw new Error('expected conflict')
    }
    expect(conflict.conflict.agentId).toBe('agent-a')
    expect(conflict.conflict.sourceTool).toBe('FileEditTool')
    expect(getFileLockStats().totalConflicts).toBe(1)
  })

  test('transfers locks to a new worker id', () => {
    resetFileLockStateForTests()

    acquireFileLock('src/app.ts', 'agent-a')

    expect(transferAgentLocks('agent-a', 'agent-b')).toBe(1)
    const reacquire = acquireFileLock('src/app.ts', 'agent-b')

    expect(reacquire.success).toBe(true)
    expect(getFileLockStats().totalTransfers).toBe(1)
  })
})
