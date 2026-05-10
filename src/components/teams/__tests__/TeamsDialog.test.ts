import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import * as execFileUtils from '../../../utils/execFileNoThrow.js'
import * as tasks from '../../../utils/tasks.js'
import * as backendDetection from '../../../utils/swarm/backends/detection.js'
import * as backendRegistry from '../../../utils/swarm/backends/registry.js'
import * as teamHelpers from '../../../utils/swarm/teamHelpers.js'
import * as teammateLifecycle from '../../../utils/swarm/teammateLifecycle.js'

const hidePaneMock = mock(async () => true)
const showPaneMock = mock(async () => true)

const execFileNoThrowSpy = spyOn(execFileUtils, 'execFileNoThrow')
const ensureBackendsRegisteredSpy = spyOn(
  backendRegistry,
  'ensureBackendsRegistered',
)
const getBackendByTypeSpy = spyOn(backendRegistry, 'getBackendByType')
const isInsideTmuxSyncSpy = spyOn(backendDetection, 'isInsideTmuxSync')
const addHiddenPaneIdSpy = spyOn(teamHelpers, 'addHiddenPaneId')
const removeHiddenPaneIdSpy = spyOn(teamHelpers, 'removeHiddenPaneId')
const removeMemberFromTeamSpy = spyOn(teamHelpers, 'removeMemberFromTeam')
const removeMemberByAgentIdSpy = spyOn(teamHelpers, 'removeMemberByAgentId')
const listTasksSpy = spyOn(tasks, 'listTasks')
const unassignTeammateTasksSpy = spyOn(tasks, 'unassignTeammateTasks')
const terminateTeammateSpy = spyOn(teammateLifecycle, 'terminateTeammate')

const {
  hideTeammate,
  killTeammate,
  removeTerminatedTeammateFromTeamConfig,
  showTeammate,
  viewTeammateOutput,
} = await import('../TeamsDialog.js')

beforeEach(() => {
  hidePaneMock.mockImplementation(async () => true)
  showPaneMock.mockImplementation(async () => true)
  execFileNoThrowSpy.mockImplementation(
    async () => ({ code: 0, stdout: '', stderr: '' }) as any,
  )
  ensureBackendsRegisteredSpy.mockImplementation(async () => {})
  getBackendByTypeSpy.mockImplementation(
    () =>
      ({
        hidePane: hidePaneMock,
        showPane: showPaneMock,
      }) as any,
  )
  isInsideTmuxSyncSpy.mockImplementation(() => false)
  addHiddenPaneIdSpy.mockImplementation(() => true)
  removeHiddenPaneIdSpy.mockImplementation(() => true)
  removeMemberFromTeamSpy.mockImplementation(() => true)
  removeMemberByAgentIdSpy.mockImplementation(() => true)
  listTasksSpy.mockImplementation(async () => [])
  unassignTeammateTasksSpy.mockImplementation(
    async () =>
      ({
        unassignedTasks: [],
        notificationMessage: 'worker terminated',
      }) as any,
  )
  terminateTeammateSpy.mockImplementation(async () => true)
})

afterEach(() => {
  hidePaneMock.mockReset()
  showPaneMock.mockReset()
  execFileNoThrowSpy.mockReset()
  ensureBackendsRegisteredSpy.mockReset()
  getBackendByTypeSpy.mockReset()
  isInsideTmuxSyncSpy.mockReset()
  addHiddenPaneIdSpy.mockReset()
  removeHiddenPaneIdSpy.mockReset()
  removeMemberFromTeamSpy.mockReset()
  removeMemberByAgentIdSpy.mockReset()
  listTasksSpy.mockReset()
  unassignTeammateTasksSpy.mockReset()
  terminateTeammateSpy.mockReset()
})

afterAll(() => {
  execFileNoThrowSpy.mockRestore()
  ensureBackendsRegisteredSpy.mockRestore()
  getBackendByTypeSpy.mockRestore()
  isInsideTmuxSyncSpy.mockRestore()
  addHiddenPaneIdSpy.mockRestore()
  removeHiddenPaneIdSpy.mockRestore()
  removeMemberFromTeamSpy.mockRestore()
  removeMemberByAgentIdSpy.mockRestore()
  listTasksSpy.mockRestore()
  unassignTeammateTasksSpy.mockRestore()
  terminateTeammateSpy.mockRestore()
})

describe('TeamsDialog helpers', () => {
  test('viewTeammateOutput returns a user-visible notice for Windows Terminal', async () => {
    await expect(
      viewTeammateOutput('pane-1', 'windows-terminal'),
    ).resolves.toContain('Windows Terminal cannot focus teammate output automatically yet')
    expect(execFileNoThrowSpy).not.toHaveBeenCalled()
  })

  test('hideTeammate uses the backend and records the pane as hidden', async () => {
    await hideTeammate(
      {
        name: 'alice',
        agentId: 'a1',
        status: 'running',
        tmuxPaneId: '%12',
        cwd: '/tmp',
        backendType: 'tmux',
      } as any,
      'team-a',
    )

    expect(ensureBackendsRegisteredSpy).toHaveBeenCalled()
    expect(hidePaneMock).toHaveBeenCalledWith('%12', true)
    expect(addHiddenPaneIdSpy).toHaveBeenCalledWith('team-a', '%12')
  })

  test('showTeammate uses the backend and removes the hidden marker', async () => {
    await showTeammate(
      {
        name: 'alice',
        agentId: 'a1',
        status: 'idle',
        tmuxPaneId: '%12',
        cwd: '/tmp',
        backendType: 'tmux',
      } as any,
      'team-a',
    )

    expect(ensureBackendsRegisteredSpy).toHaveBeenCalled()
    expect(showPaneMock).toHaveBeenCalledWith('%12', '%12', true)
    expect(removeHiddenPaneIdSpy).toHaveBeenCalledWith('team-a', '%12')
  })

  test('removeTerminatedTeammateFromTeamConfig removes in-process teammates by agent id', () => {
    expect(
      removeTerminatedTeammateFromTeamConfig(
        'team-a',
        'in-process',
        'agent-2@team-a',
      ),
    ).toBe(true)

    expect(removeMemberByAgentIdSpy).toHaveBeenCalledWith(
      'team-a',
      'agent-2@team-a',
    )
    expect(removeMemberFromTeamSpy).not.toHaveBeenCalled()
  })

  test('removeTerminatedTeammateFromTeamConfig removes pane teammates by pane id', () => {
    expect(
      removeTerminatedTeammateFromTeamConfig('team-a', '%12', 'agent-2@team-a'),
    ).toBe(true)

    expect(removeMemberFromTeamSpy).toHaveBeenCalledWith('team-a', '%12')
    expect(removeMemberByAgentIdSpy).not.toHaveBeenCalled()
  })

  test('killTeammate updates team state after lifecycle termination', async () => {
    let appState = {
      teamContext: {
        teammates: {
          'agent-2@team-a': {
            name: 'worker',
          },
        },
      },
      inbox: {
        messages: [],
      },
    } as any

    const setAppState = (updater: (prev: any) => any): void => {
      appState = updater(appState)
    }

    await killTeammate(
      {
        name: 'worker',
        agentId: 'agent-2@team-a',
        tmuxPaneId: 'in-process',
        backendType: 'in-process',
      },
      'team-a',
      {
        getAppState: () => ({ tasks: {} }),
        setAppState,
      },
    )

    expect(terminateTeammateSpy).toHaveBeenCalledWith(
      'team-a',
      {
        name: 'worker',
        agentId: 'agent-2@team-a',
        tmuxPaneId: 'in-process',
        backendType: 'in-process',
      },
      {
        getAppState: expect.any(Function),
        setAppState,
      },
    )
    expect(removeMemberByAgentIdSpy).toHaveBeenCalledWith(
      'team-a',
      'agent-2@team-a',
    )
    expect(unassignTeammateTasksSpy).toHaveBeenCalledWith(
      'team-a',
      'agent-2@team-a',
      'worker',
      'terminated',
    )
    expect(appState.teamContext.teammates['agent-2@team-a']).toBeUndefined()
    expect(appState.inbox.messages).toHaveLength(1)
  })
})
