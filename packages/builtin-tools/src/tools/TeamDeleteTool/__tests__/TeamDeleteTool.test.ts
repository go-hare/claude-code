import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const cleanupTeamDirectoriesMock = mock(async () => {})
const readTeamFileMock = mock(((): any => null) as any)
const unregisterTeamForSessionCleanupMock = mock(() => {})
const requestTeammateShutdownMock = mock(async () => true)
const terminateTeammateMock = mock(async () => true)
const killInProcessTeammateMock = mock(() => true)
const clearTeammateColorsMock = mock(() => {})
const clearLeaderTeamNameMock = mock(() => {})
const sleepMock = mock(async (ms: number) => {
  fakeNow += ms
})
const logEventMock = mock(() => {})

let fakeNow = 0
const realDateNow = Date.now

mock.module('src/utils/agentSwarmsEnabled.js', () => ({
  isAgentSwarmsEnabled: () => true,
}))

mock.module('../teamDeleteDeps.js', () => ({
  logEvent: logEventMock,
  cleanupTeamDirectories: cleanupTeamDirectoriesMock,
  readTeamFile: readTeamFileMock,
  unregisterTeamForSessionCleanup: unregisterTeamForSessionCleanupMock,
  requestTeammateShutdown: requestTeammateShutdownMock,
  terminateTeammate: terminateTeammateMock,
  killInProcessTeammate: killInProcessTeammateMock,
  clearTeammateColors: clearTeammateColorsMock,
  clearLeaderTeamName: clearLeaderTeamNameMock,
  sleep: sleepMock,
}))

type MinimalAppState = {
  teamContext?: { teamName: string }
  inbox: { messages: unknown[] }
  tasks: Record<string, unknown>
}

function createContext(teamName: string) {
  let state: MinimalAppState = {
    teamContext: { teamName },
    inbox: { messages: ['stale'] },
    tasks: {},
  }

  return {
    context: {
      getAppState: () => state,
      setAppState: (updater: (prev: MinimalAppState) => MinimalAppState) => {
        state = updater(state)
      },
      abortController: new AbortController(),
    } as any,
    getState: () => state,
  }
}

function activeTeamFile() {
  return {
    members: [
      {
        agentId: 'team-lead@alpha-team',
        name: 'team-lead',
        tmuxPaneId: 'leader',
        cwd: 'D:/work',
        subscriptions: [],
      },
      {
        agentId: 'worker@alpha-team',
        name: 'worker',
        tmuxPaneId: 'pane-1',
        cwd: 'D:/work',
        subscriptions: [],
        backendType: 'tmux',
        isActive: true,
      },
    ],
  }
}

function inactiveTeamFile() {
  return {
    members: [
      {
        agentId: 'team-lead@alpha-team',
        name: 'team-lead',
        tmuxPaneId: 'leader',
        cwd: 'D:/work',
        subscriptions: [],
      },
      {
        agentId: 'worker@alpha-team',
        name: 'worker',
        tmuxPaneId: 'pane-1',
        cwd: 'D:/work',
        subscriptions: [],
        backendType: 'tmux',
        isActive: false,
      },
    ],
  }
}

describe('TeamDeleteTool', () => {
  beforeEach(() => {
    fakeNow = 0
    Date.now = () => fakeNow
  })

  afterEach(() => {
    Date.now = realDateNow
    cleanupTeamDirectoriesMock.mockReset()
    readTeamFileMock.mockReset()
    unregisterTeamForSessionCleanupMock.mockReset()
    requestTeammateShutdownMock.mockReset()
    terminateTeammateMock.mockReset()
    killInProcessTeammateMock.mockReset()
    clearTeammateColorsMock.mockReset()
    clearLeaderTeamNameMock.mockReset()
    sleepMock.mockReset()
    logEventMock.mockReset()

    cleanupTeamDirectoriesMock.mockImplementation(async () => {})
    readTeamFileMock.mockImplementation(() => null)
    requestTeammateShutdownMock.mockImplementation(async () => true)
    terminateTeammateMock.mockImplementation(async () => true)
    killInProcessTeammateMock.mockImplementation(() => true)
    sleepMock.mockImplementation(async (ms: number) => {
      fakeNow += ms
    })
  })

  test('requests active teammate shutdown before waiting and blocks while they remain active', async () => {
    readTeamFileMock
      .mockImplementationOnce(() => activeTeamFile())
      .mockImplementationOnce(() => activeTeamFile())
      .mockImplementationOnce(() => activeTeamFile())

    const { TeamDeleteTool } = await import('../TeamDeleteTool.js')
    const { context, getState } = createContext('alpha-team')

    const result = await (TeamDeleteTool.call as any)({ wait_ms: 10 }, context)

    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain(
      'Cleanup is still blocked after waiting 10ms: worker.',
    )
    expect(requestTeammateShutdownMock).toHaveBeenCalledWith(
      'alpha-team',
      expect.objectContaining({ name: 'worker' }),
      context,
      'Team cleanup requested by team lead',
    )
    expect(sleepMock).toHaveBeenCalledTimes(1)
    expect(cleanupTeamDirectoriesMock).not.toHaveBeenCalled()
    expect(getState().teamContext?.teamName).toBe('alpha-team')
  })

  test('cleans up when immediate shutdown is reflected without wait_ms', async () => {
    readTeamFileMock
      .mockImplementationOnce(() => activeTeamFile())
      .mockImplementationOnce(() => inactiveTeamFile())
      .mockImplementationOnce(() => inactiveTeamFile())

    const { TeamDeleteTool } = await import('../TeamDeleteTool.js')
    const { context, getState } = createContext('alpha-team')

    const result = await (TeamDeleteTool.call as any)({}, context)

    expect(result.data.success).toBe(true)
    expect(sleepMock).not.toHaveBeenCalled()
    expect(requestTeammateShutdownMock).toHaveBeenCalledWith(
      'alpha-team',
      expect.objectContaining({ name: 'worker' }),
      context,
      'Team cleanup requested by team lead',
    )
    expect(terminateTeammateMock).toHaveBeenCalledWith(
      'alpha-team',
      expect.objectContaining({ name: 'worker' }),
      context,
    )
    expect(cleanupTeamDirectoriesMock).toHaveBeenCalledWith('alpha-team')
    expect(getState().teamContext).toBeUndefined()
  })

  test('kills lingering in-process inactive teammate before cleanup', async () => {
    readTeamFileMock.mockImplementation(() => inactiveTeamFile())
    terminateTeammateMock.mockImplementation(async () => false)

    const { TeamDeleteTool } = await import('../TeamDeleteTool.js')
    const { context, getState } = createContext('alpha-team')
    getState().tasks['task-worker'] = {
      id: 'task-worker',
      type: 'in_process_teammate',
      status: 'running',
      identity: { agentId: 'worker@alpha-team' },
      executionBackend: 'in-process',
    }

    const result = await (TeamDeleteTool.call as any)({}, context)

    expect(result.data.success).toBe(true)
    expect(killInProcessTeammateMock).toHaveBeenCalledWith(
      'task-worker',
      context.setAppState,
    )
    expect(cleanupTeamDirectoriesMock).toHaveBeenCalledWith('alpha-team')
  })

  test('blocks cleanup when lingering in-process inactive teammate cannot be killed', async () => {
    readTeamFileMock.mockImplementation(() => inactiveTeamFile())
    terminateTeammateMock.mockImplementation(async () => false)
    killInProcessTeammateMock.mockImplementation(() => false)

    const { TeamDeleteTool } = await import('../TeamDeleteTool.js')
    const { context, getState } = createContext('alpha-team')
    getState().tasks['task-worker'] = {
      id: 'task-worker',
      type: 'in_process_teammate',
      status: 'running',
      identity: { agentId: 'worker@alpha-team' },
      executionBackend: 'in-process',
    }

    const result = await (TeamDeleteTool.call as any)({}, context)

    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain(
      'Cleanup is still blocked by running teammate(s): worker.',
    )
    expect(cleanupTeamDirectoriesMock).not.toHaveBeenCalled()
    expect(getState().teamContext?.teamName).toBe('alpha-team')
  })

  test('cleans up after teammates exit during wait_ms', async () => {
    readTeamFileMock
      .mockImplementationOnce(() => activeTeamFile())
      .mockImplementationOnce(() => inactiveTeamFile())
      .mockImplementationOnce(() => inactiveTeamFile())
      .mockImplementationOnce(() => inactiveTeamFile())

    const { TeamDeleteTool } = await import('../TeamDeleteTool.js')
    const { context, getState } = createContext('alpha-team')

    const result = await (TeamDeleteTool.call as any)({ wait_ms: 10 }, context)

    expect(result.data.success).toBe(true)
    expect(result.data.message).toContain(
      'Cleaned up directories and worktrees for team "alpha-team"',
    )
    expect(requestTeammateShutdownMock).toHaveBeenCalledWith(
      'alpha-team',
      expect.objectContaining({ name: 'worker' }),
      context,
      'Team cleanup requested by team lead',
    )
    expect(cleanupTeamDirectoriesMock).toHaveBeenCalledWith('alpha-team')
    expect(unregisterTeamForSessionCleanupMock).toHaveBeenCalledWith(
      'alpha-team',
    )
    expect(clearTeammateColorsMock).toHaveBeenCalledTimes(1)
    expect(clearLeaderTeamNameMock).toHaveBeenCalledTimes(1)
    expect(logEventMock).toHaveBeenCalledWith('tengu_team_deleted', {
      team_name: 'alpha-team',
    })
    expect(getState().teamContext).toBeUndefined()
    expect(getState().inbox.messages).toEqual([])
  })

  test('blocks cleanup when shutdown request fails', async () => {
    requestTeammateShutdownMock.mockImplementation(async () => false)
    readTeamFileMock
      .mockImplementationOnce(() => activeTeamFile())
      .mockImplementationOnce(() => activeTeamFile())

    const { TeamDeleteTool } = await import('../TeamDeleteTool.js')
    const { context, getState } = createContext('alpha-team')

    const result = await (TeamDeleteTool.call as any)({}, context)

    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain(
      'Cannot cleanup team with 1 active member(s): worker.',
    )
    expect(sleepMock).not.toHaveBeenCalled()
    expect(requestTeammateShutdownMock).toHaveBeenCalledWith(
      'alpha-team',
      expect.objectContaining({ name: 'worker' }),
      context,
      'Team cleanup requested by team lead',
    )
    expect(cleanupTeamDirectoriesMock).not.toHaveBeenCalled()
    expect(getState().teamContext?.teamName).toBe('alpha-team')
  })
})
