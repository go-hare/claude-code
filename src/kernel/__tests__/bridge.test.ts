import { beforeEach, describe, expect, mock, test } from 'bun:test'

const mockRunHeadlessBridgeRuntime = mock(async () => {})
const mockCreateSessionSpawner = mock(() => ({ spawn: mock(() => {}) }))
const mockCreateBridgeSessionRuntime = mock(async () => 'session-1')
const lastLogger = {
  current: null as
    | {
        setRepoInfo: ReturnType<typeof mock>
        setSpawnModeDisplay: ReturnType<typeof mock>
      }
    | null,
}
const mockCreateBridgeLogger = mock(() => {
  const logger = {
    setRepoInfo: mock(() => {}),
    setSpawnModeDisplay: mock(() => {}),
  }
  lastLogger.current = logger
  return logger
})

mock.module('../../runtime/capabilities/bridge/HeadlessBridgeEntry.js', () => ({
  runHeadlessBridgeRuntime: mockRunHeadlessBridgeRuntime,
}))
mock.module('../../bridge/sessionRunner.js', () => ({
  createSessionSpawner: mockCreateSessionSpawner,
}))
mock.module('../../bridge/bridgeUI.js', () => ({
  createBridgeLogger: mockCreateBridgeLogger,
}))
mock.module('../../runtime/capabilities/bridge/SessionApi.js', () => ({
  archiveBridgeSessionRuntime: mock(async () => {}),
  createBridgeSessionRuntime: mockCreateBridgeSessionRuntime,
  getBridgeSessionRuntime: mock(async () => null),
  updateBridgeSessionTitleRuntime: mock(async () => {}),
}))

const {
  assembleBridgeCliHost,
  createBridgeCliInitialSession,
  createBridgeHeadlessDeps,
  runBridgeHeadless,
} = await import('../bridge.js')

describe('kernel bridge surface', () => {
  beforeEach(() => {
    mockRunHeadlessBridgeRuntime.mockClear()
    mockCreateSessionSpawner.mockClear()
    mockCreateBridgeSessionRuntime.mockClear()
    mockCreateBridgeLogger.mockClear()
    lastLogger.current = null
  })

  test('assembles bridge cli host dependencies in kernel', async () => {
    const assembly = await assembleBridgeCliHost({
      dir: '/tmp/work/project',
      branch: 'main',
      gitRepoUrl: 'https://github.com/acme/project.git',
      spawnMode: 'worktree',
      worktreeAvailable: true,
      verbose: true,
      sandbox: false,
      permissionMode: 'default',
      onDebug: mock(() => {}),
    })

    expect(mockCreateSessionSpawner).toHaveBeenCalledTimes(1)
    expect(mockCreateBridgeLogger).toHaveBeenCalledTimes(1)
    expect(assembly.logger).toBeDefined()
    expect(assembly.spawner).toBeDefined()
    expect(lastLogger.current).not.toBeNull()
    expect(assembly.logger.setRepoInfo).toBe(lastLogger.current!.setRepoInfo)
    expect(assembly.toggleAvailable).toBe(true)
    expect(lastLogger.current?.setRepoInfo).toHaveBeenCalledWith(
      'project',
      'main',
    )
    expect(lastLogger.current?.setSpawnModeDisplay).toHaveBeenCalledWith(
      'worktree',
    )
  })

  test('creates initial bridge session through kernel helper', async () => {
    const onDebug = mock(() => {})

    const sessionId = await createBridgeCliInitialSession({
      preCreateSession: true,
      environmentId: 'env-1',
      title: 'repo',
      gitRepoUrl: 'https://github.com/acme/project.git',
      branch: 'main',
      signal: new AbortController().signal,
      baseUrl: 'https://example.com',
      getAccessToken: () => 'token',
      permissionMode: 'acceptEdits',
      onDebug,
    })

    expect(sessionId).toBe('session-1')
    expect(mockCreateBridgeSessionRuntime).toHaveBeenCalledTimes(1)
    expect(onDebug).toHaveBeenCalledWith(
      '[bridge:init] Created initial session session-1',
    )
  })

  test('reuses resumed bridge session without pre-creating a new one', async () => {
    const sessionId = await createBridgeCliInitialSession({
      resumeSessionId: 'resume-1',
      preCreateSession: true,
      environmentId: 'env-1',
      title: 'repo',
      gitRepoUrl: null,
      branch: 'main',
      signal: new AbortController().signal,
      baseUrl: 'https://example.com',
      getAccessToken: () => 'token',
      onDebug: mock(() => {}),
    })

    expect(sessionId).toBe('resume-1')
    expect(mockCreateBridgeSessionRuntime).toHaveBeenCalledTimes(0)
  })

  test('assembles default headless bridge deps in kernel', () => {
    const runBridgeLoop = mock(async () => {})
    const deps = createBridgeHeadlessDeps(runBridgeLoop as never)

    expect(deps.bridgeLoginError).toBeString()
    expect(deps.runBridgeLoop).toBe(runBridgeLoop)
    expect(typeof deps.getBaseUrl).toBe('function')
    expect(typeof deps.createSpawner).toBe('function')
    expect(typeof deps.createInitialSession).toBe('function')
  })

  test('delegates headless bridge entry through kernel-owned deps', async () => {
    const runBridgeLoop = mock(async () => {})
    const signal = new AbortController().signal
    const opts = {
      dir: '/tmp/project',
      spawnMode: 'same-dir' as const,
      capacity: 1,
      sandbox: false,
      createSessionOnStart: false,
      getAccessToken: () => 'token',
      onAuth401: async () => false,
      log: mock(() => {}),
    }

    await runBridgeHeadless(opts, signal, runBridgeLoop as never)

    expect(mockRunHeadlessBridgeRuntime).toHaveBeenCalledTimes(1)
    const call = mockRunHeadlessBridgeRuntime.mock.calls[0] as unknown as
      | [typeof opts, AbortSignal, ReturnType<typeof createBridgeHeadlessDeps>]
      | undefined
    expect(call?.[0]).toBe(opts)
    expect(call?.[1]).toBe(signal)
    expect(call?.[2]?.runBridgeLoop).toBe(runBridgeLoop)
  })
})
