import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { InteractiveLaunchOptions } from '../interactiveLauncher.js'

const callOrder: string[] = []

const mockLogEvent = mock((_name: string, _payload: unknown) => {
  callOrder.push('event')
})
const mockLaunchRepl = mock(async () => {
  callOrder.push('launch')
})
const mockBuildDeepLinkBanner = mock((_options: unknown) => {
  callOrder.push('banner')
  return 'deep-link-banner'
})

mock.module('../launchAnalyticsDeps.js', () => ({
  logEvent: mockLogEvent,
}))

mock.module('../../../../replLauncher.js', () => ({
  launchRepl: mockLaunchRepl,
}))

mock.module('../../../../utils/deepLink/banner.js', () => ({
  buildDeepLinkBanner: mockBuildDeepLinkBanner,
}))

const { runInteractiveLaunch } = await import('../interactiveLauncher.js')

afterAll(() => {
  mock.restore()
})

function createLaunchOptions(): InteractiveLaunchOptions {
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
    hookMessages: [],
    hooksPromise: undefined,
    pendingStartupMessages: undefined,
    startupModes: {
      activateProactive: mock(() => {
        callOrder.push('proactive')
      }),
      activateBrief: mock(() => {
        callOrder.push('brief')
      }),
    },
    profileCheckpoint: mock((_checkpoint: string) => {
      callOrder.push('checkpoint')
    }),
    features: {
      coordinatorMode: true,
      lodestone: true,
    },
    coordinatorMode: 'coordinator',
    saveMode: mock((_mode: 'coordinator' | 'normal') => {
      callOrder.push('save-mode')
    }),
    deepLink: {},
    cwd: '/tmp/project',
  }
}

describe('runInteractiveLaunch', () => {
  beforeEach(() => {
    callOrder.length = 0
    mockLogEvent.mockClear()
    mockLaunchRepl.mockClear()
    mockBuildDeepLinkBanner.mockClear()
  })

  test('launches repl with pending hook promise when no resolved hook messages exist', async () => {
    const options = createLaunchOptions()
    const hookMessages = Promise.resolve([{ uuid: 'hook-1', type: 'system', content: 'hook' }])
    options.hooksPromise = hookMessages as never

    await runInteractiveLaunch(options)

    expect(callOrder).toEqual(['checkpoint', 'proactive', 'brief', 'save-mode', 'launch'])
    expect(mockLaunchRepl).toHaveBeenCalledWith(
      options.root,
      options.appProps,
      expect.objectContaining({
        pendingHookMessages: hookMessages,
        initialMessages: undefined,
      }),
      options.renderAndRun,
    )
  })

  test('adds a deep-link banner before existing hook messages', async () => {
    const options = createLaunchOptions()
    options.hookMessages = [{ uuid: 'hook-1', type: 'system', content: 'hook' }] as never
    options.deepLink = {
      origin: 'browser',
      repo: 'anthropic/repo',
      prefill: 'hello',
      lastFetch: Date.UTC(2026, 3, 24),
    }

    await runInteractiveLaunch(options)

    expect(callOrder).toEqual([
      'checkpoint',
      'proactive',
      'brief',
      'save-mode',
      'event',
      'banner',
      'launch',
    ])
    const launchArgs = mockLaunchRepl.mock.calls[0] as unknown as
      | [unknown, unknown, { initialMessages?: unknown[] }, unknown]
      | undefined
    expect(launchArgs?.[2].initialMessages?.[0]).toMatchObject({
      type: 'system',
      content: 'deep-link-banner',
      level: 'warning',
    })
    expect(launchArgs?.[2].initialMessages?.slice(1)).toEqual(
      options.hookMessages,
    )
  })
})
