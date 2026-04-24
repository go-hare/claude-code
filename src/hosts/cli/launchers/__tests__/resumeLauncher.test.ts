import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ResumeLikeLaunchOptions } from '../resumeLauncher.js'

const callOrder: string[] = []

const mockClearSessionCaches = mock(() => {
  callOrder.push('clear-caches')
})
const mockLaunchResumeChooser = mock(async () => {
  callOrder.push('chooser')
})
const mockLaunchTeleportRepoMismatchDialog = mock(async () => null)
const mockLaunchTeleportResumeWrapper = mock(async () => null)
const mockLaunchRepl = mock(async () => {
  callOrder.push('launch')
})
const mockExitWithError = mock(async () => {
  callOrder.push('exit-error')
})
const mockWaitForPolicyLimitsToLoad = mock(async () => {
  callOrder.push('policy-wait')
})
const mockIsPolicyAllowed = mock(() => true)
const mockLogEvent = mock((_name: string, _payload: unknown) => {})
const mockLoadConversationForResume = mock(async (): Promise<any> => null)
const mockGetWorktreePaths = mock(async (_cwd: string) => ['/tmp/worktree'])
const mockLogError = mock((_error: unknown) => {})
const mockSearchSessionsByCustomTitle = mock(async () => [])
const mockGetSessionIdFromLog = mock((_log: unknown) => undefined)
const mockLoadTranscriptFromFile = mock(async (_path: string) => {
  throw Object.assign(new Error('not found'), { code: 'ENOENT' })
})
const mockProcessResumedConversation = mock(async (): Promise<any> => undefined)
const mockCheckOutTeleportedSessionBranch = mock(async () => ({
  branchName: 'main',
  branchError: null,
}))
const mockProcessMessagesForTeleportResume = mock((_messages: unknown, _error: unknown) => [])
const mockValidateGitState = mock(async () => {})
const mockValidateSessionRepository = mock(async () => ({ status: 'match' }))
const mockFetchSession = mock(async (_sessionId: string) => ({}))
const mockValidateUuid = mock((_value: unknown): string | null => null)
const mockRunRemoteLaunch = mock(async () => {
  callOrder.push('remote-launch')
})

class MockTeleportOperationError extends Error {
  constructor(message: string, public readonly formattedMessage: string) {
    super(message)
  }
}

mock.module('../../../../commands/clear/caches.js', () => ({
  clearSessionCaches: mockClearSessionCaches,
}))

mock.module('../../../../services/policyLimits/index.js', () => ({
  waitForPolicyLimitsToLoad: mockWaitForPolicyLimitsToLoad,
  isPolicyAllowed: mockIsPolicyAllowed,
}))

mock.module('../../../../constants/product.js', () => ({
  getRemoteSessionUrl: (sessionId: string) => `https://remote/${sessionId}`,
}))

mock.module('../../../../dialogLaunchers.js', () => ({
  launchResumeChooser: mockLaunchResumeChooser,
  launchTeleportRepoMismatchDialog: mockLaunchTeleportRepoMismatchDialog,
  launchTeleportResumeWrapper: mockLaunchTeleportResumeWrapper,
}))

mock.module('../../../../interactiveHelpers.js', () => ({
  exitWithError: mockExitWithError,
}))

mock.module('../../../../services/analytics/index.js', () => ({
  logEvent: mockLogEvent,
}))

mock.module('../../../../replLauncher.js', () => ({
  launchRepl: mockLaunchRepl,
}))

mock.module('../../../../utils/array.js', () => ({
  count: <T>(items: T[], predicate: (item: T) => boolean) =>
    items.filter(predicate).length,
}))

mock.module('../../../../utils/conversationRecovery.js', () => ({
  loadConversationForResume: mockLoadConversationForResume,
}))

mock.module('../../../../utils/errors.js', () => ({
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  isENOENT: (error: unknown) =>
    Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'ENOENT',
    ),
  TeleportOperationError: MockTeleportOperationError,
}))

mock.module('../../../../utils/githubRepoPathMapping.js', () => ({
  filterExistingPaths: mock(async (_paths: string[]) => []),
  getKnownPathsForRepo: mock((_repo: string) => []),
}))

mock.module('../../../../utils/getWorktreePaths.js', () => ({
  getWorktreePaths: mockGetWorktreePaths,
}))

mock.module('../../../../utils/log.js', () => ({
  logError: mockLogError,
}))

mock.module('../../../../utils/sessionStorage.js', () => ({
  searchSessionsByCustomTitle: mockSearchSessionsByCustomTitle,
  getSessionIdFromLog: mockGetSessionIdFromLog,
  loadTranscriptFromFile: mockLoadTranscriptFromFile,
}))

mock.module('../../../../utils/sessionRestore.js', () => ({
  processResumedConversation: mockProcessResumedConversation,
}))

mock.module('../../../../utils/teleport.js', () => ({
  checkOutTeleportedSessionBranch: mockCheckOutTeleportedSessionBranch,
  processMessagesForTeleportResume: mockProcessMessagesForTeleportResume,
  validateGitState: mockValidateGitState,
  validateSessionRepository: mockValidateSessionRepository,
}))

mock.module('../../../../utils/teleport/api.js', () => ({
  fetchSession: mockFetchSession,
}))

mock.module('../../../../utils/uuid.js', () => ({
  validateUuid: mockValidateUuid,
}))

mock.module('../remoteLauncher.js', () => ({
  runRemoteLaunch: mockRunRemoteLaunch,
}))

const { runResumeLikeLaunch } = await import('../resumeLauncher.js')

function createLaunchOptions(): ResumeLikeLaunchOptions {
  return {
    root: { id: 'root' } as never,
    appProps: {
      getFpsMetrics: () => undefined,
      stats: {} as never,
      initialState: { sessionId: 'session-1' } as never,
    },
    replProps: {
      debug: true,
      commands: [{ name: 'help' }] as never,
      autoConnectIdeFlag: false,
      mainThreadAgentDefinition: undefined,
      disableSlashCommands: false,
      thinkingConfig: { type: 'adaptive' } as never,
    },
    sessionConfig: {
      debug: true,
      commands: [{ name: 'help' }] as never,
      autoConnectIdeFlag: false,
      mainThreadAgentDefinition: undefined,
      disableSlashCommands: false,
      thinkingConfig: { type: 'adaptive' } as never,
      initialTools: [],
      mcpClients: [],
    } as never,
    renderAndRun: mock(async () => {}) as never,
    resume: undefined,
    fromPr: undefined,
    forkSession: false,
    remote: null,
    teleport: undefined,
    currentCwd: '/tmp/project',
    fileDownloadPromise: undefined,
    resumeContext: {
      modeApi: null,
      mainThreadAgentDefinition: undefined,
      agentDefinitions: {} as never,
      currentCwd: '/tmp/project',
      cliAgents: [],
      initialState: { sessionId: 'session-1' } as never,
    },
    stateWriter: {
      enableRemoteMode: mock((_sessionId: string) => {}),
      setCwd: mock((_path: string) => {}),
      setOriginalCwd: mock((_path: string) => {}),
      markTeleportedSession: mock((_sessionId: string) => {}),
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
      shutdown: mock(async (_code: number) => {
        callOrder.push(`shutdown:${_code}`)
      }),
      exit: mock((_code: number) => {
        callOrder.push(`exit:${_code}`)
      }),
      writeStdout: mock((_message: string) => {}),
      writeStderr: mock((_message: string) => {}),
    },
  }
}

describe('runResumeLikeLaunch', () => {
  beforeEach(() => {
    callOrder.length = 0
    mockClearSessionCaches.mockClear()
    mockLaunchResumeChooser.mockClear()
    mockLaunchRepl.mockClear()
    mockExitWithError.mockClear()
    mockWaitForPolicyLimitsToLoad.mockClear()
    mockIsPolicyAllowed.mockClear()
    mockLoadConversationForResume.mockClear()
    mockGetWorktreePaths.mockClear()
    mockSearchSessionsByCustomTitle.mockClear()
    mockGetSessionIdFromLog.mockClear()
    mockLoadTranscriptFromFile.mockClear()
    mockProcessResumedConversation.mockClear()
    mockCheckOutTeleportedSessionBranch.mockClear()
    mockProcessMessagesForTeleportResume.mockClear()
    mockValidateGitState.mockClear()
    mockValidateSessionRepository.mockClear()
    mockFetchSession.mockClear()
    mockValidateUuid.mockClear()
    mockRunRemoteLaunch.mockClear()
  })

  test('falls back to the interactive chooser when no resume target resolves', async () => {
    const options = createLaunchOptions()
    options.fromPr = true
    options.forkSession = true

    await runResumeLikeLaunch(options)

    expect(callOrder).toEqual(['clear-caches', 'chooser'])
    expect(mockLaunchResumeChooser).toHaveBeenCalledTimes(1)
    expect(mockLaunchResumeChooser).toHaveBeenCalledWith(
      options.root,
      options.appProps,
      expect.any(Promise),
      expect.objectContaining({
        initialSearchQuery: undefined,
        forkSession: true,
        filterByPr: true,
      }),
    )
    expect(mockLaunchRepl).toHaveBeenCalledTimes(0)
  })

  test('resumes a session by id and launches the REPL with restored state', async () => {
    const options = createLaunchOptions()
    options.resume = '123e4567-e89b-12d3-a456-426614174000'

    mockValidateUuid.mockImplementationOnce(() => options.resume as string)
    mockLoadConversationForResume.mockImplementationOnce(async () => ({
      messages: [],
      turnInterruptionState: null,
      sessionId: options.resume,
      fullPath: '/tmp/session.jsonl',
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

    await runResumeLikeLaunch(options)

    expect(callOrder).toEqual(['clear-caches', 'proactive', 'brief', 'launch'])
    expect(mockLoadConversationForResume).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
      undefined,
    )
    expect(mockLaunchRepl).toHaveBeenCalledTimes(1)
    expect(mockLaunchResumeChooser).toHaveBeenCalledTimes(0)
    expect(mockExitWithError).toHaveBeenCalledTimes(0)
  })
})
