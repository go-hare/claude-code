import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resetStateForTests } from '../../../bootstrap/state.js'
import { getDefaultAppState } from '../../../state/AppStateStore.js'
import { readMailbox } from '../../teammateMailbox.js'
import { getTask, getTaskListId } from '../../tasks.js'
import {
  captureTeammateModeSnapshot,
  clearCliTeammateModeOverride,
  setCliTeammateModeOverride,
} from '../backends/teammateModeSnapshot.js'

const startInProcessTeammateMock = mock(() => {})

mock.module('src/utils/swarm/inProcessRunner.js', () => ({
  startInProcessTeammate: startInProcessTeammateMock,
}))

let tempHome: string
let previousConfigDir: string | undefined
let previousAnthropicApiKey: string | undefined
let state: any

function setState(updater: (prev: any) => any): void {
  state = updater(state)
}

function readTeamConfig(teamName: string): any {
  return JSON.parse(
    readFileSync(join(tempHome, 'teams', teamName, 'config.json'), 'utf-8'),
  )
}

function writeTeamConfig(teamName: string, config: unknown): void {
  const teamDir = join(tempHome, 'teams', teamName)
  mkdirSync(teamDir, { recursive: true })
  writeFileSync(join(teamDir, 'config.json'), JSON.stringify(config, null, 2))
}

beforeEach(() => {
  resetStateForTests()
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  previousAnthropicApiKey = process.env.ANTHROPIC_API_KEY
  tempHome = join(
    tmpdir(),
    `agent-teams-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  process.env.CLAUDE_CONFIG_DIR = tempHome
  process.env.ANTHROPIC_API_KEY = 'test-key'
  setCliTeammateModeOverride('in-process')
  captureTeammateModeSnapshot()
  startInProcessTeammateMock.mockReset()
  startInProcessTeammateMock.mockImplementation(() => {})
  state = getDefaultAppState()
})

afterEach(() => {
  clearCliTeammateModeOverride('auto')
  resetStateForTests()
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  if (previousAnthropicApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = previousAnthropicApiKey
  }
  rmSync(tempHome, { recursive: true, force: true })
  mock.restore()
})

describe('Agent Teams lifecycle', () => {
  test('spawn with explicit team_name restores team context from team file', async () => {
    const { TeamCreateTool } = await import(
      '../../../../packages/builtin-tools/src/tools/TeamCreateTool/TeamCreateTool.js'
    )
    const { spawnTeammate } = await import(
      '../../../../packages/builtin-tools/src/tools/shared/spawnMultiAgent.js'
    )

    const context = {
      getAppState: () => state,
      setAppState: setState,
      options: {
        agentDefinitions: { activeAgents: [] },
      },
      abortController: new AbortController(),
      toolUseId: 'toolu_restore_team',
    } as any

    await TeamCreateTool.call(
      { team_name: 'alpha', agent_type: 'lead-specialist' },
      context,
      undefined as any,
      undefined as any,
    )
    state = getDefaultAppState()

    await spawnTeammate(
      {
        name: 'worker',
        prompt: 'handle assigned tasks',
        team_name: 'alpha',
      },
      context,
    )

    expect(state.teamContext?.teamName).toBe('alpha')
    expect(state.teamContext?.teamFilePath).toBe(
      join(tempHome, 'teams', 'alpha', 'config.json'),
    )
    expect(state.teamContext?.leadAgentId).toBe('team-lead@alpha')
    expect(state.teamContext?.teammates['team-lead@alpha']).toMatchObject({
      name: 'team-lead',
      agentType: 'lead-specialist',
    })
    expect(state.teamContext?.teammates['worker@alpha']).toMatchObject({
      name: 'worker',
      tmuxPaneId: 'in-process',
    })
  })

  test('runs TeamCreate -> spawn -> TaskUpdate -> SendMessage -> TeamDelete', async () => {
    const { TeamCreateTool } = await import(
      '../../../../packages/builtin-tools/src/tools/TeamCreateTool/TeamCreateTool.js'
    )
    const { spawnTeammate } = await import(
      '../../../../packages/builtin-tools/src/tools/shared/spawnMultiAgent.js'
    )
    const { TaskCreateTool } = await import(
      '../../../../packages/builtin-tools/src/tools/TaskCreateTool/TaskCreateTool.js'
    )
    const { TaskUpdateTool } = await import(
      '../../../../packages/builtin-tools/src/tools/TaskUpdateTool/TaskUpdateTool.js'
    )
    const { SendMessageTool } = await import(
      '../../../../packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.js'
    )
    const { TeamDeleteTool } = await import(
      '../../../../packages/builtin-tools/src/tools/TeamDeleteTool/TeamDeleteTool.js'
    )

    const context = {
      getAppState: () => state,
      setAppState: setState,
      options: {
        agentDefinitions: { activeAgents: [] },
      },
      abortController: new AbortController(),
      toolUseId: 'toolu_lifecycle',
    } as any

    const created = await TeamCreateTool.call(
      { team_name: 'alpha', description: 'test team' },
      context,
      undefined as any,
      undefined as any,
    )
    expect(created.data.team_name).toBe('alpha')

    const spawned = await spawnTeammate(
      {
        name: 'worker',
        prompt: 'handle assigned tasks',
        team_name: 'alpha',
      },
      context,
    )
    expect(spawned.data.agent_id).toBe('worker@alpha')
    expect(startInProcessTeammateMock).toHaveBeenCalledTimes(1)

    const configAfterSpawn = readTeamConfig('alpha')
    expect(
      configAfterSpawn.members.some(
        (member: any) => member.agentId === 'worker@alpha',
      ),
    ).toBe(true)

    const task = await TaskCreateTool.call(
      { subject: 'Check lifecycle', description: 'Verify team task flow' },
      context,
    )
    await TaskUpdateTool.call(
      { taskId: task.data.task.id, owner: 'worker' },
      context,
    )

    const updatedTask = await getTask(getTaskListId(), task.data.task.id)
    expect(updatedTask?.owner).toBe('worker')

    const message = await SendMessageTool.call(
      {
        to: 'worker',
        summary: 'Status request',
        message: 'Please report status.',
      },
      context,
      async () => ({ behavior: 'allow' as const }),
      undefined as any,
    )
    expect(message.data.success).toBe(true)

    const inbox = await readMailbox('worker', 'alpha')
    expect(inbox.some(entry => entry.text === 'Please report status.')).toBe(
      true,
    )

    const teammateTask = Object.values(state.tasks).find(
      (candidate: any) =>
        candidate?.type === 'in_process_teammate' &&
        candidate?.identity?.agentId === 'worker@alpha',
    ) as any
    expect(teammateTask).toBeDefined()

    const blockedDelete = await TeamDeleteTool.call(
      {},
      context,
      undefined as any,
      undefined as any,
    )
    expect(blockedDelete.data.success).toBe(false)
    expect(
      Object.values(state.tasks).find(
        (candidate: any) => candidate?.identity?.agentId === 'worker@alpha',
      ),
    ).toMatchObject({ shutdownRequested: true })

    const config = readTeamConfig('alpha')
    config.members = config.members.map((member: any) =>
      member.name === 'worker' ? { ...member, isActive: false } : member,
    )
    writeTeamConfig('alpha', config)

    const deleted = await TeamDeleteTool.call(
      {},
      context,
      undefined as any,
      undefined as any,
    )
    expect(deleted.data.success).toBe(true)
    expect(state.teamContext).toBeUndefined()
  })
})
