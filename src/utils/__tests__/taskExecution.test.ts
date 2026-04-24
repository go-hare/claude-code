import { describe, expect, test } from 'bun:test'
import {
  createTask,
  getActiveTaskExecutionContext,
  getTask,
  getTaskExecutionMetadata,
  getTaskOwnedFiles,
  linkTaskToBackgroundTask,
  markTaskCompletionSuggested,
  runWithActiveTaskExecutionContext,
  updateTask,
} from '../tasks.js'

const taskListId = `task-execution-test-${Date.now()}`

async function createTrackedTask() {
  const taskId = await createTask(taskListId, {
    subject: 'Track worker',
    description: 'Link a background worker to this task',
    status: 'in_progress',
    owner: undefined,
    blocks: [],
    blockedBy: [],
    metadata: {
      ownedFiles: ['src/app.ts', 'src/app.ts', 'src/server.ts'],
    },
  })

  return taskId
}

describe('task execution metadata', () => {
  test('links a tracked task to a background task', async () => {
    const taskId = await createTrackedTask()

    await linkTaskToBackgroundTask(taskListId, taskId, {
      backgroundTaskId: 'a123',
      backgroundTaskType: 'local_agent',
      agentId: 'a123',
    })

    const task = await getTask(taskListId, taskId)
    expect(task).not.toBeNull()
    expect(getTaskExecutionMetadata(task!)).toEqual({
      linkedBackgroundTaskId: 'a123',
      linkedBackgroundTaskType: 'local_agent',
      linkedAgentId: 'a123',
      completionSuggestedAt: undefined,
      completionSuggestedByBackgroundTaskId: undefined,
    })
    expect(getTaskOwnedFiles(task!)).toEqual(['src/app.ts', 'src/server.ts'])
  })

  test('marks completion suggestion only for the linked background task', async () => {
    const taskId = await createTrackedTask()

    await linkTaskToBackgroundTask(taskListId, taskId, {
      backgroundTaskId: 'a123',
      backgroundTaskType: 'local_agent',
    })

    expect(await markTaskCompletionSuggested(taskListId, taskId, 'other')).toBe(
      false,
    )
    expect(await markTaskCompletionSuggested(taskListId, taskId, 'a123')).toBe(
      true,
    )
    expect(await markTaskCompletionSuggested(taskListId, taskId, 'a123')).toBe(
      false,
    )

    const task = await getTask(taskListId, taskId)
    const metadata = getTaskExecutionMetadata(task!)
    expect(metadata?.completionSuggestedByBackgroundTaskId).toBe('a123')
    expect(typeof metadata?.completionSuggestedAt).toBe('string')
  })

  test('clears suggestion when task is no longer in progress', async () => {
    const taskId = await createTrackedTask()

    await linkTaskToBackgroundTask(taskListId, taskId, {
      backgroundTaskId: 'a123',
      backgroundTaskType: 'local_agent',
    })
    await updateTask(taskListId, taskId, { status: 'completed' })

    expect(await markTaskCompletionSuggested(taskListId, taskId, 'a123')).toBe(
      false,
    )
  })
})

describe('active task execution context', () => {
  test('isolates active task execution context per async chain', async () => {
    const result = await Promise.all([
      runWithActiveTaskExecutionContext(
        { taskListId: 'list-a', taskId: '1' },
        async () => {
          await Promise.resolve()
          return getActiveTaskExecutionContext()
        },
      ),
      runWithActiveTaskExecutionContext(
        { taskListId: 'list-b', taskId: '2' },
        async () => {
          await Promise.resolve()
          return getActiveTaskExecutionContext()
        },
      ),
    ])

    expect(result).toEqual([
      { taskListId: 'list-a', taskId: '1' },
      { taskListId: 'list-b', taskId: '2' },
    ])
    expect(getActiveTaskExecutionContext()).toBeUndefined()
  })
})
