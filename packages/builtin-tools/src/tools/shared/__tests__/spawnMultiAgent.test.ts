import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { ToolUseContext } from 'src/Tool.js'
import {
  registerOutOfProcessTeammateTaskForTesting,
  resetTrackedPaneCleanupForTesting,
  setPaneCleanupDependenciesForTesting,
} from 'src/utils/swarm/backends/executorFacade.js'

const cleanupFns = new Set<() => Promise<void>>()
const ensureBackendsRegisteredMock = mock(async () => {})
const killPaneMock = mock(async () => true)
let restorePaneCleanupDependencies: (() => void) | undefined

function setAppState(updater: (prev: any) => any): void {
  updater({ tasks: {} })
}

function installPaneCleanupDependencies(): void {
  restorePaneCleanupDependencies = setPaneCleanupDependenciesForTesting({
    registerCleanup: (cleanupFn: () => Promise<void>) => {
      cleanupFns.add(cleanupFn)
      return () => {
        cleanupFns.delete(cleanupFn)
      }
    },
    ensureBackendsRegistered: ensureBackendsRegisteredMock,
    getBackendByType: () =>
      ({
        killPane: killPaneMock,
      }) as any,
  })
}

async function runRegisteredCleanup(): Promise<void> {
  await Promise.all(Array.from(cleanupFns).map(fn => fn()))
}

describe('out-of-process teammate cleanup tracking', () => {
  afterEach(() => {
    restorePaneCleanupDependencies?.()
    restorePaneCleanupDependencies = undefined
    resetTrackedPaneCleanupForTesting()
    ensureBackendsRegisteredMock.mockReset()
    killPaneMock.mockReset()
    cleanupFns.clear()
    ensureBackendsRegisteredMock.mockImplementation(async () => {})
    killPaneMock.mockImplementation(async () => true)
  })

  test('kills tracked pane teammates during leader-exit cleanup', async () => {
    installPaneCleanupDependencies()

    registerOutOfProcessTeammateTaskForTesting(setAppState, {
      teammateId: 'worker@alpha',
      sanitizedName: 'worker',
      teamName: 'alpha',
      teammateColor: 'blue',
      prompt: 'do work',
      paneId: '%12',
      insideTmux: false,
      backendType: 'tmux',
    })

    await runRegisteredCleanup()

    expect(ensureBackendsRegisteredMock).toHaveBeenCalled()
    expect(killPaneMock).toHaveBeenCalledWith('%12', true)
  })

  test('unregisters tracked cleanup after local abort to avoid double-kill', async () => {
    installPaneCleanupDependencies()
    let registeredTask: { abortController: AbortController } | undefined

    registerOutOfProcessTeammateTaskForTesting(
      updater => {
        const next = updater({ tasks: {} } as any)
        registeredTask = Object.values(next.tasks)[0] as {
          abortController: AbortController
        }
      },
      {
        teammateId: 'worker@alpha',
        sanitizedName: 'worker',
        teamName: 'alpha',
        teammateColor: 'blue',
        prompt: 'do work',
        paneId: '%12',
        insideTmux: false,
        backendType: 'tmux',
      },
    )

    registeredTask?.abortController.abort()
    await Promise.resolve()
    expect(killPaneMock).toHaveBeenCalledTimes(1)

    await runRegisteredCleanup()
    expect(killPaneMock).toHaveBeenCalledTimes(1)
  })
})

describe('spawnTeammate validation', () => {
  test('points missing team recovery at TeamCreate', async () => {
    const { spawnTeammate } = await import('../spawnMultiAgent.js')

    const context = {
      getAppState: () => ({
        mainLoopModel: 'gpt-5.4',
        teamContext: undefined,
        toolPermissionContext: { mode: 'default' },
      }),
    } as ToolUseContext

    try {
      await spawnTeammate(
        {
          name: 'worker',
          prompt: 'do work',
          team_name: `missing-team-${Date.now()}`,
        },
        context,
      )
      throw new Error('expected missing team error')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('TeamCreate')
      expect((error as Error).message).not.toContain('spawnTeam')
    }
  })
})
