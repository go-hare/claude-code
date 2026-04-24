import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { runWithAgentContext } from '../utils/agentContext.js'

mock.module('./coordinatorMode.js', () => ({
  isCoordinatorMode: () => true,
  getWorkerAntiInjectionAddendum: () => '',
}))

const { resetFileLockStateForTests } = await import('./fileLockManager.js')
const { validateCoordinatorWriteAccess } = await import('./writeGuard.js')

beforeEach(() => {
  resetFileLockStateForTests()
})

describe('writeGuard', () => {
  test('allows writes inside the worker owned file set', () => {
    const result = runWithAgentContext(
      {
        agentId: 'agent-a',
        agentType: 'subagent',
        ownedFiles: ['src/app.ts'],
      },
      () =>
        validateCoordinatorWriteAccess({
          filePath: 'src/app.ts',
          sourceTool: 'FileEditTool',
        }),
    )

    expect(result).toEqual({ result: true })
  })

  test('rejects writes outside the worker owned file set', () => {
    const result = runWithAgentContext(
      {
        agentId: 'agent-a',
        agentType: 'subagent',
        ownedFiles: ['src/app.ts'],
      },
      () =>
        validateCoordinatorWriteAccess({
          filePath: 'src/other.ts',
          sourceTool: 'FileEditTool',
        }),
    )

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected ownership rejection')
    }
    expect(result.errorCode).toBe(12)
  })

  test('rejects concurrent writes to the same file', () => {
    runWithAgentContext(
      {
        agentId: 'agent-a',
        agentType: 'subagent',
      },
      () =>
        validateCoordinatorWriteAccess({
          filePath: 'src/app.ts',
          sourceTool: 'FileEditTool',
        }),
    )

    const conflict = runWithAgentContext(
      {
        agentId: 'agent-b',
        agentType: 'subagent',
      },
      () =>
        validateCoordinatorWriteAccess({
          filePath: 'src/app.ts',
          sourceTool: 'FileWriteTool',
        }),
    )

    expect(conflict.result).toBe(false)
    if (conflict.result) {
      throw new Error('expected lock conflict')
    }
    expect(conflict.errorCode).toBe(11)
  })
})
