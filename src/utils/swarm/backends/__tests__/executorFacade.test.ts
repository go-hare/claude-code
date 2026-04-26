import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readMailbox } from 'src/utils/teammateMailbox.js'
import {
  createPaneTeammateExecutor,
  createTeammateExecutorForMember,
  resetTrackedPaneCleanupForTesting,
  setPaneCleanupDependenciesForTesting,
  setTeammateTaskDependenciesForTesting,
} from '../executorFacade.js'
import type { PaneBackend } from '../types.js'

type TeammateTaskLookup = { id: string; shutdownRequested: boolean } | undefined

const findTeammateTaskByAgentIdMock = mock((): TeammateTaskLookup => undefined)
const requestTeammateShutdownMock = mock(() => {})
const ensureBackendsRegisteredMock = mock(async () => {})
const killPaneMock = mock(async () => true)

let tempHome: string
let previousConfigDir: string | undefined
let restorePaneCleanupDependencies: (() => void) | undefined
let restoreTeammateTaskDependencies: (() => void) | undefined

function createContext() {
  return {
    options: {
      agentDefinitions: {
        allAgents: [],
        activeAgents: [],
      },
    },
    setAppState: mock(() => {}),
    toolUseId: 'tool-use-1',
  } as any
}

function createBackend(overrides: Partial<PaneBackend> = {}): PaneBackend {
  return {
    type: 'tmux',
    displayName: 'tmux',
    supportsHideShow: true,
    async isAvailable() {
      return true
    },
    async isRunningInside() {
      return false
    },
    async createTeammatePaneInSwarmView() {
      return { paneId: '%1', isFirstTeammate: false }
    },
    async sendCommandToPane() {},
    async setPaneBorderColor() {},
    async setPaneTitle() {},
    async enablePaneBorderStatus() {},
    async rebalancePanes() {},
    async killPane() {
      return true
    },
    async hidePane() {
      return true
    },
    async showPane() {
      return true
    },
    ...overrides,
  }
}

beforeEach(() => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempHome = mkdtempSync(join(tmpdir(), 'executor-facade-'))
  process.env.CLAUDE_CONFIG_DIR = tempHome

  restorePaneCleanupDependencies = setPaneCleanupDependenciesForTesting({
    registerCleanup: () => () => {},
    ensureBackendsRegistered: ensureBackendsRegisteredMock,
    getBackendByType: () =>
      ({
        killPane: killPaneMock,
      }) as any,
  })
  restoreTeammateTaskDependencies = setTeammateTaskDependenciesForTesting({
    findTeammateTaskByAgentId: findTeammateTaskByAgentIdMock as any,
    requestTeammateShutdown: requestTeammateShutdownMock,
  })
})

afterEach(() => {
  restoreTeammateTaskDependencies?.()
  restoreTeammateTaskDependencies = undefined
  restorePaneCleanupDependencies?.()
  restorePaneCleanupDependencies = undefined
  resetTrackedPaneCleanupForTesting()

  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }

  rmSync(tempHome, { recursive: true, force: true })

  findTeammateTaskByAgentIdMock.mockClear()
  requestTeammateShutdownMock.mockClear()
  ensureBackendsRegisteredMock.mockClear()
  killPaneMock.mockClear()
})

describe('executorFacade', () => {
  test('spawns pane teammates with agent type and inherited auto permission mode', async () => {
    let sentCommand = ''
    const backend = createBackend({
      async sendCommandToPane(_paneId, command) {
        sentCommand = command
      },
    })
    const context = createContext()
    const executor = createPaneTeammateExecutor(backend)

    const result = await executor.spawn!(
      {
        teammateId: 'reviewer@alpha',
        sanitizedName: 'reviewer',
        teamName: 'alpha',
        prompt: 'review the change',
        cwd: tempHome,
        teammateColor: 'blue',
        agentType: 'code-reviewer',
        permissionMode: 'auto',
        useSplitPane: true,
      },
      context,
    )

    expect(result.backendType).toBe('tmux')
    expect(result.paneId).toBe('%1')
    expect(sentCommand).toContain('--agent-type')
    expect(sentCommand).toContain('code-reviewer')
    expect(sentCommand).toContain('--permission-mode')
    expect(sentCommand).toContain('auto')
    expect(context.setAppState).toHaveBeenCalledTimes(1)
  })

  test('preserves separate-window spawning when useSplitPane is false', async () => {
    let paneSpawned = false
    let windowSpawned = false
    const backend = createBackend({
      async createTeammatePaneInSwarmView() {
        paneSpawned = true
        return { paneId: '%pane', isFirstTeammate: false }
      },
      async createTeammateWindowInSwarmView() {
        windowSpawned = true
        return {
          paneId: '%window',
          windowName: 'teammate-worker',
          isFirstTeammate: false,
        }
      },
    })
    const executor = createPaneTeammateExecutor(backend)

    const result = await executor.spawn!(
      {
        teammateId: 'worker@alpha',
        sanitizedName: 'worker',
        teamName: 'alpha',
        prompt: 'do work',
        cwd: tempHome,
        teammateColor: 'green',
        useSplitPane: false,
      },
      createContext(),
    )

    expect(paneSpawned).toBe(false)
    expect(windowSpawned).toBe(true)
    expect(result.paneId).toBe('%window')
    expect(result.windowName).toBe('teammate-worker')
    expect(result.isSplitPane).toBe(false)
  })

  test('resolves executor type from teammate membership data', () => {
    expect(
      createTeammateExecutorForMember({
        agentId: 'lead@alpha',
        name: 'lead',
        tmuxPaneId: 'in-process',
      }),
    )?.toMatchObject({ type: 'in-process' })

    expect(
      createTeammateExecutorForMember({
        agentId: 'worker@alpha',
        name: 'worker',
        tmuxPaneId: '%1',
        backendType: 'tmux',
      }),
    )?.toMatchObject({ type: 'tmux' })

    expect(
      createTeammateExecutorForMember({
        agentId: 'legacy@alpha',
        name: 'legacy',
        tmuxPaneId: '%2',
      }),
    ).toBeUndefined()
  })

  test('marks pane teammates as stopping after graceful shutdown request', async () => {
    findTeammateTaskByAgentIdMock.mockReturnValue({
      id: 'task-pane-1',
      shutdownRequested: false,
    })
    const executor = createPaneTeammateExecutor('tmux')
    const context = {
      getAppState: () => ({ tasks: {} }),
      setAppState: mock(() => {}),
    }

    const result = await executor.requestShutdown(
      'alpha',
      {
        agentId: 'worker@alpha',
        name: 'worker',
        tmuxPaneId: '%1',
        backendType: 'tmux',
      },
      context,
      'graceful shutdown',
    )

    expect(result).toBe(true)
    expect(requestTeammateShutdownMock).toHaveBeenCalledWith(
      'task-pane-1',
      context.setAppState,
    )
    const inbox = await readMailbox('worker', 'alpha')
    expect(inbox).toHaveLength(1)
    expect(inbox[0]?.text).toContain('"type":"shutdown_request"')
  })

  test('does not resend graceful shutdown for pane teammates already stopping', async () => {
    findTeammateTaskByAgentIdMock.mockReturnValue({
      id: 'task-pane-1',
      shutdownRequested: true,
    })
    const executor = createPaneTeammateExecutor('tmux')

    const result = await executor.requestShutdown(
      'alpha',
      {
        agentId: 'worker@alpha',
        name: 'worker',
        tmuxPaneId: '%1',
        backendType: 'tmux',
      },
      {
        getAppState: () => ({ tasks: {} }),
        setAppState: mock(() => {}),
      },
      'graceful shutdown',
    )

    expect(result).toBe(true)
    expect(requestTeammateShutdownMock).not.toHaveBeenCalled()
    expect(await readMailbox('worker', 'alpha')).toEqual([])
  })
})
