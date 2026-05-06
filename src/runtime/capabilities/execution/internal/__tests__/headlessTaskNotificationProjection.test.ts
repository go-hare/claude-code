import { describe, expect, test } from 'bun:test'
import type { UUID } from 'crypto'
import { projectHeadlessTaskNotification } from '../headlessTaskNotificationProjection.js'

describe('projectHeadlessTaskNotification', () => {
  test('projects terminal XML task notifications to canonical runtime events and protocol messages', () => {
    const projection = projectHeadlessTaskNotification({
      value: `<task-notification>
<task-id>agent-1</task-id>
<tool-use-id>toolu-1</tool-use-id>
<output-file>/tmp/agent-1.out</output-file>
<status>completed</status>
<summary>done</summary>
<usage><total_tokens>12</total_tokens><tool_uses>3</tool_uses><duration_ms>45</duration_ms></usage>
</task-notification>`,
      sessionId: 'session-1',
      uuid: 'uuid-1' as UUID,
    })

    expect(projection?.runtimeEvent).toEqual({
      type: 'tasks.notification',
      replayable: true,
      payload: {
        taskId: 'agent-1',
        toolUseId: 'toolu-1',
        status: 'completed',
        outputFile: '/tmp/agent-1.out',
        summary: 'done',
        usage: {
          total_tokens: 12,
          tool_uses: 3,
          duration_ms: 45,
        },
        source: 'queued_task_notification',
      },
      metadata: {
        compatibilityProjection: 'headless.sdk_task_notification',
      },
    })
    expect(projection?.protocolMessage).toMatchObject({
      type: 'system',
      subtype: 'task_notification',
      task_id: 'agent-1',
      tool_use_id: 'toolu-1',
      status: 'completed',
      output_file: '/tmp/agent-1.out',
      summary: 'done',
      session_id: 'session-1',
      uuid: 'uuid-1',
    })
    expect(projection?.handoffEvent).toMatchObject({
      type: 'handoff.completed',
      payload: {
        phase: 'handoff',
        state: 'completed',
        source: 'queued_task_notification',
        taskId: 'agent-1',
      },
    })
  })

  test('does not project statusless stream notifications as terminal task events', () => {
    const projection = projectHeadlessTaskNotification({
      value: `<task-notification>
<task-id>agent-1</task-id>
<summary>still running</summary>
</task-notification>`,
      sessionId: 'session-1',
      uuid: 'uuid-1' as UUID,
    })

    expect(projection).toBeUndefined()
  })

  test('normalizes killed notifications to stopped', () => {
    const projection = projectHeadlessTaskNotification({
      value: `<task-notification>
<task-id>agent-1</task-id>
<status>killed</status>
<summary>killed</summary>
</task-notification>`,
      sessionId: 'session-1',
      uuid: 'uuid-1' as UUID,
    })

    expect(projection?.runtimeEvent.payload).toMatchObject({
      status: 'stopped',
    })
    expect(projection?.protocolMessage).toMatchObject({
      status: 'stopped',
    })
  })
})
