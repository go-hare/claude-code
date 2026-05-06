import { describe, expect, test } from 'bun:test'
import {
  hasHeadlessBackgroundWorkPending,
  observeHeadlessBackgroundCompatibilityMessage,
} from '../headlessBackgroundWork.js'

const baseTask = {
  id: 'a1',
  type: 'local_agent' as const,
  description: 'worker',
  startTime: 0,
  outputFile: '/tmp/a1.output',
  outputOffset: 0,
  agentId: 'a1',
  prompt: 'work',
  agentType: 'worker',
  retrieved: false,
  lastReportedToolCount: 0,
  lastReportedTokenCount: 0,
  pendingMessages: [],
  retain: false,
  diskLoaded: false,
}

function stateWithTask(task: Record<string, unknown>) {
  return {
    tasks: {
      a1: {
        ...baseTask,
        ...task,
      },
    },
  } as never
}

describe('hasHeadlessBackgroundWorkPending', () => {
  test('waits for running background local agents', () => {
    expect(
      hasHeadlessBackgroundWorkPending(
        stateWithTask({
          status: 'running',
          notified: false,
          isBackgrounded: true,
        }),
      ),
    ).toBe(true)
  })

  test('waits for terminal background local agents until notification is enqueued', () => {
    expect(
      hasHeadlessBackgroundWorkPending(
        stateWithTask({
          status: 'completed',
          notified: false,
          isBackgrounded: true,
        }),
      ),
    ).toBe(true)
  })

  test('does not wait after terminal background local agent notification is consumed', () => {
    expect(
      hasHeadlessBackgroundWorkPending(
        stateWithTask({
          status: 'completed',
          notified: true,
          isBackgrounded: true,
        }),
      ),
    ).toBe(false)
  })

  test('does not treat foreground local agents as pending background work', () => {
    expect(
      hasHeadlessBackgroundWorkPending(
        stateWithTask({
          status: 'completed',
          notified: false,
          isBackgrounded: false,
        }),
      ),
    ).toBe(false)
  })
})

describe('observeHeadlessBackgroundCompatibilityMessage', () => {
  test('tracks direct task_started messages and their launching turn', () => {
    const tracking = {
      pendingTaskIds: new Set<string>(),
      handoffTurnIds: new Set<string>(),
    }

    observeHeadlessBackgroundCompatibilityMessage(
      {
        type: 'system',
        subtype: 'task_started',
        task_id: 'agent-1',
        task_type: 'local_agent',
      },
      tracking,
      'turn-1',
    )

    expect(tracking.pendingTaskIds.has('agent-1')).toBe(true)
    expect(tracking.handoffTurnIds.has('turn-1')).toBe(true)
  })

  test('clears pending tasks on terminal task notifications', () => {
    const tracking = {
      pendingTaskIds: new Set<string>(['agent-1']),
      handoffTurnIds: new Set<string>(['turn-1']),
    }

    observeHeadlessBackgroundCompatibilityMessage(
      {
        type: 'system',
        subtype: 'task_notification',
        task_id: 'agent-1',
      },
      tracking,
      'turn-2',
    )

    expect(tracking.pendingTaskIds.has('agent-1')).toBe(false)
    expect(tracking.handoffTurnIds.has('turn-1')).toBe(true)
  })
})
