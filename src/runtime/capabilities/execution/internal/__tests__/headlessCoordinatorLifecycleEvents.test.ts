import { describe, expect, test } from 'bun:test'
import {
  createCoordinatorLifecycleEvent,
  projectCoordinatorLifecycleFromCompatibilityMessage,
} from '../headlessCoordinatorLifecycleEvents.js'

describe('headless coordinator lifecycle events', () => {
  test('projects task_started compatibility bookends to handoff.started events', () => {
    expect(
      projectCoordinatorLifecycleFromCompatibilityMessage(
        {
          type: 'system',
          subtype: 'task_started',
          task_id: 'agent-1',
          tool_use_id: 'toolu-1',
          task_type: 'local_agent',
          description: 'worker task',
        },
        'turn-1',
      ),
    ).toEqual({
      turnId: 'turn-1',
      type: 'handoff.started',
      replayable: true,
      payload: {
        phase: 'handoff',
        state: 'started',
        source: 'sdk_task_started',
        taskId: 'agent-1',
        taskType: 'local_agent',
        toolUseId: 'toolu-1',
        description: 'worker task',
      },
    })
  })

  test('projects terminal task notifications to handoff terminal events', () => {
    expect(
      projectCoordinatorLifecycleFromCompatibilityMessage(
        {
          type: 'system',
          subtype: 'task_notification',
          task_id: 'agent-1',
          status: 'failed',
          summary: 'failed',
        },
        'turn-2',
      ),
    ).toEqual({
      turnId: 'turn-2',
      type: 'handoff.failed',
      replayable: true,
      payload: {
        phase: 'handoff',
        state: 'failed',
        source: 'sdk_task_notification',
        taskId: 'agent-1',
        status: 'failed',
        summary: 'failed',
        reason: 'failed',
      },
    })
  })

  test('creates team lifecycle events without undefined payload fields', () => {
    expect(
      createCoordinatorLifecycleEvent({
        type: 'team.shutdown_requested',
        phase: 'team_shutdown',
        state: 'requested',
        source: 'headless_team_shutdown',
        teamName: 'core',
        teammateName: undefined,
        reason: 'input_closed',
      }),
    ).toEqual({
      type: 'team.shutdown_requested',
      replayable: true,
      payload: {
        phase: 'team_shutdown',
        state: 'requested',
        source: 'headless_team_shutdown',
        teamName: 'core',
        reason: 'input_closed',
      },
    })
  })
})
