import { afterEach, describe, expect, test } from 'bun:test'

import { setIsInteractive } from '../../bootstrap/state.js'
import {
  drainSdkEvents,
  enqueueSdkCompatibilityMessages,
  enqueueSdkEvent,
} from '../sdkEventQueue.js'

afterEach(() => {
  drainSdkEvents()
  setIsInteractive(true)
})

describe('sdkEventQueue', () => {
  test('preserves compatibility message uuid and session id when draining', () => {
    setIsInteractive(false)

    enqueueSdkCompatibilityMessages([
      {
        type: 'assistant',
        uuid: '00000000-0000-4000-8000-000000000001',
        session_id: 'session-1',
        parent_tool_use_id: 'toolu_parent',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_child',
              name: 'Read',
              input: { path: 'README.md' },
            },
          ],
        },
      } as any,
    ])

    expect(drainSdkEvents()).toEqual([
      {
        type: 'assistant',
        uuid: '00000000-0000-4000-8000-000000000001',
        session_id: 'session-1',
        parent_tool_use_id: 'toolu_parent',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_child',
              name: 'Read',
              input: { path: 'README.md' },
            },
          ],
        },
      },
    ])
  })

  test('adds uuid and session id for queued sdk events that do not carry them', () => {
    setIsInteractive(false)

    enqueueSdkEvent({
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task-1',
      status: 'completed',
      output_file: '',
      summary: 'done',
    })

    const [event] = drainSdkEvents()
    expect(event).toMatchObject({
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task-1',
      status: 'completed',
      output_file: '',
      summary: 'done',
    })
    expect(typeof event.uuid).toBe('string')
    expect(event.uuid.length).toBeGreaterThan(0)
    expect(typeof event.session_id).toBe('string')
    expect(event.session_id.length).toBeGreaterThan(0)
  })
})
