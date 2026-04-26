import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ContinueLaunchOptions } from '../continueLauncher.js'

const callOrder: string[] = []

const mockClearSessionCaches = mock(() => {
  callOrder.push('clear-caches')
})
const mockExitWithError = mock(async () => {
  callOrder.push('exit-error')
})
const mockLogEvent = mock((_name: string, _payload: unknown) => {})
const mockLaunchRepl = mock(async () => {
  callOrder.push('launch')
})
const mockLoadConversationForResume = mock(async (): Promise<any> => null)
const mockLogError = mock((_error: unknown) => {
  callOrder.push('log-error')
})
const mockProcessResumedConversation = mock(async (): Promise<any> => undefined)
const mockRestoreSessionStateFromLog = mock(() => {})

mock.module('../../../../commands/clear/caches.js', () => ({
  clearSessionCaches: mockClearSessionCaches,
}))

mock.module('../../../../interactiveHelpers.js', () => ({
  exitWithError: mockExitWithError,
}))

mock.module('../launchAnalyticsDeps.js', () => ({
  logEvent: mockLogEvent,
}))

mock.module('../../../../replLauncher.js', () => ({
  launchRepl: mockLaunchRepl,
}))

mock.module('../../../../utils/conversationRecovery.js', () => ({
  loadConversationForResume: mockLoadConversationForResume,
}))

mock.module('../../../../utils/log.js', () => ({
  logError: mockLogError,
}))

mock.module('../../../../utils/sessionRestore.js', () => ({
  processResumedConversation: mockProcessResumedConversation,
  restoreSessionStateFromLog: mockRestoreSessionStateFromLog,
}))

const { runContinueLaunch } = await import('../continueLauncher.js')

function createLaunchOptions(): ContinueLaunchOptions {
  return {
    root: { id: 'root' } as never,
    appProps: {
      getFpsMetrics: () => undefined,
      stats: {} as never,
      initialState: { sessionId: 'session-1' } as never,
    },
    sessionConfig: {
      debug: true,
      commands: [{ name: 'help' }] as never,
      initialTools: [],
      mcpClients: [],
      autoConnectIdeFlag: false,
      mainThreadAgentDefinition: undefined,
      disableSlashCommands: false,
      thinkingConfig: { type: 'adaptive' } as never,
    } as never,
    renderAndRun: mock(async () => {}) as never,
    forkSession: false,
    resumeContext: {
      modeApi: null,
      mainThreadAgentDefinition: undefined,
      agentDefinitions: {} as never,
      currentCwd: '/tmp/project',
      cliAgents: [],
      initialState: { sessionId: 'session-1' } as never,
    },
    startupModes: {
      activateProactive: mock(() => {
        callOrder.push('proactive')
      }),
      activateBrief: mock(() => {
        callOrder.push('brief')
      }),
    },
    runtime: {
      exit: mock((_code: number) => {
        callOrder.push(`exit:${_code}`)
      }),
    },
  }
}

describe('runContinueLaunch', () => {
  beforeEach(() => {
    callOrder.length = 0
    mockClearSessionCaches.mockClear()
    mockExitWithError.mockClear()
    mockLogEvent.mockClear()
    mockLaunchRepl.mockClear()
    mockLoadConversationForResume.mockClear()
    mockLogError.mockClear()
    mockProcessResumedConversation.mockClear()
  })

  test('resumes the latest conversation and launches the repl', async () => {
    const options = createLaunchOptions()

    mockLoadConversationForResume.mockImplementationOnce(async () => ({
      messages: [],
      turnInterruptionState: null,
      sessionId: 'session-continue',
      fullPath: '/tmp/continue.jsonl',
    }))
    mockProcessResumedConversation.mockImplementationOnce(async () => ({
      messages: [{ uuid: 'm1', type: 'user', message: { content: 'hi' } }],
      fileHistorySnapshots: undefined,
      contentReplacements: undefined,
      agentName: 'Agent',
      agentColor: undefined,
      restoredAgentDef: undefined,
      initialState: { sessionId: 'restored-session' },
    }))

    await runContinueLaunch(options)

    expect(callOrder).toEqual(['clear-caches', 'proactive', 'brief', 'launch'])
    expect(mockLoadConversationForResume).toHaveBeenCalledWith(undefined, undefined)
    expect(mockLaunchRepl).toHaveBeenCalledTimes(1)
    expect(mockExitWithError).toHaveBeenCalledTimes(0)
  })

  test('reports missing conversations through exitWithError', async () => {
    const options = createLaunchOptions()

    await runContinueLaunch(options)

    expect(callOrder).toEqual(['clear-caches', 'exit-error'])
    expect(mockLaunchRepl).toHaveBeenCalledTimes(0)
    expect(options.runtime.exit).toHaveBeenCalledTimes(0)
  })
})
