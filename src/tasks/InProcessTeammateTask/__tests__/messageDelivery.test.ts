import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readMailbox } from '../../../utils/teammateMailbox.js'
import { deliverUserMessageToTeammate } from '../InProcessTeammateTask.js'

function makeTeammateTask(overrides?: Record<string, unknown>) {
  return {
    id: 't-test',
    type: 'in_process_teammate',
    status: 'running',
    description: 'teammate',
    startTime: 0,
    outputFile: '',
    outputOffset: 0,
    notified: false,
    identity: {
      agentId: 'researcher@alpha',
      agentName: 'researcher',
      teamName: 'alpha',
      planModeRequired: false,
      parentSessionId: 'leader-session',
    },
    prompt: 'Do the work',
    awaitingPlanApproval: false,
    permissionMode: 'default',
    isIdle: false,
    shutdownRequested: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    pendingUserMessages: [],
    ...overrides,
  } as Parameters<typeof deliverUserMessageToTeammate>[0]
}

describe('deliverUserMessageToTeammate', () => {
  let previousConfigDir: string | undefined
  let tempConfigDir: string

  beforeEach(() => {
    previousConfigDir = process.env.CLAUDE_CONFIG_DIR
    tempConfigDir = mkdtempSync(join(tmpdir(), 'claude-code-teammate-'))
    process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  })

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    }
    rmSync(tempConfigDir, { recursive: true, force: true })
  })

  test('routes pane-backed teammate input through mailbox instead of pending queue', async () => {
    let state = {
      tasks: {
        't-test': makeTeammateTask({ executionBackend: 'tmux', isIdle: true }),
      },
    }
    const task = state.tasks['t-test']!

    const delivered = await deliverUserMessageToTeammate(
      task,
      'status update',
      undefined,
      updater => {
        state = updater(state as never) as unknown as typeof state
      },
    )

    expect(delivered).toBe(true)
    expect(state.tasks['t-test']?.pendingUserMessages).toEqual([])
    expect(state.tasks['t-test']?.messages).toHaveLength(1)
    expect(state.tasks['t-test']?.isIdle).toBe(false)

    const inbox = await readMailbox('researcher', 'alpha')
    expect(inbox).toHaveLength(1)
    expect(inbox[0]).toMatchObject({
      from: 'user',
      text: 'status update',
      read: false,
    })
  })

  test('keeps true in-process teammate input on the local pending queue', async () => {
    let state = {
      tasks: {
        't-test': makeTeammateTask({ executionBackend: 'in-process' }),
      },
    }
    const task = state.tasks['t-test']!

    const delivered = await deliverUserMessageToTeammate(
      task,
      'status update',
      undefined,
      updater => {
        state = updater(state as never) as unknown as typeof state
      },
    )

    expect(delivered).toBe(true)
    expect(state.tasks['t-test']?.pendingUserMessages).toEqual([
      { message: 'status update' },
    ])
    expect(state.tasks['t-test']?.messages).toHaveLength(1)

    const inbox = await readMailbox('researcher', 'alpha')
    expect(inbox).toEqual([])
  })
})
