import { afterEach, expect, test } from 'bun:test'
import { getPendingNotificationsSnapshot, resetCommandQueue } from '../../utils/messageQueueManager.js'
import {
  createTask,
  linkTaskToBackgroundTask,
} from '../../utils/tasks.js'
import { enqueueAgentNotification } from './LocalAgentTask.js'

const taskListId = `local-agent-notification-test-${Date.now()}`
const previousTaskListId = process.env.CLAUDE_CODE_TASK_LIST_ID

afterEach(() => {
  resetCommandQueue()
  if (previousTaskListId === undefined) {
    delete process.env.CLAUDE_CODE_TASK_LIST_ID
  } else {
    process.env.CLAUDE_CODE_TASK_LIST_ID = previousTaskListId
  }
})

test('enqueueAgentNotification includes linked task completion hint', async () => {
  process.env.CLAUDE_CODE_TASK_LIST_ID = taskListId
  const linkedTaskId = await createTask(taskListId, {
    subject: 'Finish worker task',
    description: 'Wait for background worker',
    status: 'in_progress',
    owner: undefined,
    blocks: [],
    blockedBy: [],
  })

  await linkTaskToBackgroundTask(taskListId, linkedTaskId, {
    backgroundTaskId: 'a123',
    backgroundTaskType: 'local_agent',
  })

  let state = {
    speculation: { status: 'idle' as const },
    tasks: {
      a123: {
        id: 'a123',
        type: 'local_agent',
        status: 'completed',
        description: 'worker',
        outputFile: '/tmp/out.txt',
        outputOffset: 0,
        notified: false,
      },
    },
  } as any
  const setAppState = (updater: (prev: typeof state) => typeof state) => {
    state = updater(state)
  }

  await enqueueAgentNotification({
    taskId: 'a123',
    description: 'worker',
    status: 'completed',
    setAppState,
    finalMessage: 'done',
  })

  const notifications = getPendingNotificationsSnapshot()
  expect(notifications).toHaveLength(1)
  const message = notifications[0]?.value as string
  expect(message).toContain('Background task for task #')
  expect(message).toContain('call TaskUpdate with status: "completed"')
})

test('enqueueAgentNotification completes pending plan verification for verifier agents', async () => {
  let state = {
    speculation: { status: 'idle' as const },
    pendingPlanVerification: {
      plan: 'Verify the implementation',
      verificationStarted: true,
      verificationCompleted: false,
    },
    tasks: {
      verifier1: {
        id: 'verifier1',
        type: 'local_agent',
        agentType: 'verification',
        status: 'completed',
        description: 'plan verifier',
        outputFile: '/tmp/verifier.txt',
        outputOffset: 0,
        notified: false,
      },
    },
  } as any
  const setAppState = (updater: (prev: typeof state) => typeof state) => {
    state = updater(state)
  }

  await enqueueAgentNotification({
    taskId: 'verifier1',
    description: 'plan verifier',
    status: 'completed',
    setAppState,
    finalMessage: 'verdict ready',
  })

  expect(state.pendingPlanVerification).toEqual({
    plan: 'Verify the implementation',
    verificationStarted: true,
    verificationCompleted: true,
  })
})
