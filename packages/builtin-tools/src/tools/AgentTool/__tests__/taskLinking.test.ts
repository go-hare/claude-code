import { afterEach, describe, expect, mock, test } from 'bun:test'

mock.module('bun:bundle', () => ({ feature: () => false }))

const { setIsInteractive } = await import('src/bootstrap/state.js')
const {
  normalizeAgentOwnedFiles,
  resolveAgentTaskExecutionContext,
  shouldExposeTaskIdInput,
} = await import('../taskLinking.js')

afterEach(() => {
  delete process.env.CLAUDE_CODE_ENABLE_TASKS
  setIsInteractive(true)
})

describe('taskLinking', () => {
  test('hides task_id when task tools are unavailable in non-interactive mode', () => {
    setIsInteractive(false)
    delete process.env.CLAUDE_CODE_ENABLE_TASKS

    expect(shouldExposeTaskIdInput()).toBe(false)
  })

  test('shows task_id when task tools are explicitly enabled', () => {
    setIsInteractive(false)
    process.env.CLAUDE_CODE_ENABLE_TASKS = '1'

    expect(shouldExposeTaskIdInput()).toBe(true)
  })

  test('normalizes empty owned_files to undefined', () => {
    expect(normalizeAgentOwnedFiles(['', '  '])).toBeUndefined()
    expect(normalizeAgentOwnedFiles([' src/app.ts ', 'test.ts'])).toEqual([
      'src/app.ts',
      'test.ts',
    ])
  })

  test('rejects unknown task_id instead of launching untracked work', async () => {
    const warnings: string[] = []

    await expect(
      resolveAgentTaskExecutionContext({
        taskId: 'missing-task',
        explicitOwnedFiles: undefined,
        getTaskListId: () => 'session-1',
        getTask: async () => undefined,
        getTaskOwnedFiles: () => undefined,
        logWarning: message => warnings.push(message),
      }),
    ).rejects.toThrow("Task 'missing-task' was not found")

    expect(warnings[0]).toContain('pass a valid task_id')
  })

  test('links a known task and prefers explicit owned files', async () => {
    const result = await resolveAgentTaskExecutionContext({
      taskId: ' 1 ',
      explicitOwnedFiles: ['src/owned.ts'],
      getTaskListId: () => 'session-1',
      getTask: async () => ({
        id: '1',
        subject: 'task',
        description: 'desc',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      }),
      getTaskOwnedFiles: () => ['src/from-task.ts'],
    })

    expect(result).toEqual({
      taskExecutionContext: {
        taskListId: 'session-1',
        taskId: '1',
        ownedFiles: ['src/owned.ts'],
      },
    })
  })

  test('does not inherit parent task context when task_id is omitted', async () => {
    const result = await resolveAgentTaskExecutionContext({
      explicitOwnedFiles: undefined,
      getTaskListId: () => 'session-1',
      getTask: async () => undefined,
      getTaskOwnedFiles: () => undefined,
    })

    expect(result).toEqual({})
  })
})
