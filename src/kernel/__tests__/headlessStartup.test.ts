import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { filterAllowedProtocolBetas } from '../../utils/betas.js'
import type { RuntimeHeadlessStartupStateWriter } from '../../runtime/core/state/bootstrapProvider.js'

const { prepareKernelHeadlessStartup } = await import('../headlessStartup.js')

const savedAuthEnv = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
  CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR:
    process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR,
}

type TestDeps = {
  stateWriter: RuntimeHeadlessStartupStateWriter & {
    setSessionPersistenceDisabled: ReturnType<typeof mock>
    setProtocolBetas: ReturnType<typeof mock>
  }
  startDeferredPrefetches: ReturnType<typeof mock>
  logSessionTelemetry: ReturnType<typeof mock>
  startBackgroundHousekeeping: ReturnType<typeof mock>
  startProtocolMemoryMonitor: ReturnType<typeof mock>
}

function createDeps(): TestDeps {
  return {
    stateWriter: {
      setSessionPersistenceDisabled: mock((_disabled: boolean) => {}),
      setProtocolBetas: mock((_betas: string[] | undefined) => {}),
    },
    startDeferredPrefetches: mock(() => {}),
    logSessionTelemetry: mock(() => {}),
    startBackgroundHousekeeping: mock(() => {}),
    startProtocolMemoryMonitor: mock(() => {}),
  }
}

describe('prepareKernelHeadlessStartup', () => {
  let deps: TestDeps

  beforeEach(() => {
    deps = createDeps()
    process.env.ANTHROPIC_API_KEY = 'test-key'
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(savedAuthEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  test('writes startup state through the injected runtime state writer', async () => {
    const betas = ['beta-1', 'beta-2']

    await prepareKernelHeadlessStartup(
      {
        sessionPersistenceDisabled: true,
        betas,
        bareMode: false,
        userType: 'ant',
      },
      deps,
    )

    expect(deps.stateWriter.setSessionPersistenceDisabled).toHaveBeenCalledWith(
      true,
    )
    expect(deps.stateWriter.setProtocolBetas).toHaveBeenCalledWith(
      filterAllowedProtocolBetas(betas),
    )
    expect(deps.startDeferredPrefetches).toHaveBeenCalledTimes(1)
    expect(deps.startBackgroundHousekeeping).toHaveBeenCalledTimes(1)
    expect(deps.startProtocolMemoryMonitor).toHaveBeenCalledTimes(1)
    expect(deps.logSessionTelemetry).toHaveBeenCalledTimes(1)
  })

  test('skips background startup helpers in bare mode', async () => {
    await prepareKernelHeadlessStartup(
      {
        sessionPersistenceDisabled: false,
        betas: [],
        bareMode: true,
        userType: 'ant',
      },
      deps,
    )

    expect(
      deps.stateWriter.setSessionPersistenceDisabled,
    ).not.toHaveBeenCalled()
    expect(deps.stateWriter.setProtocolBetas).toHaveBeenCalledWith(
      filterAllowedProtocolBetas([]),
    )
    expect(deps.startDeferredPrefetches).not.toHaveBeenCalled()
    expect(deps.startBackgroundHousekeeping).not.toHaveBeenCalled()
    expect(deps.startProtocolMemoryMonitor).not.toHaveBeenCalled()
    expect(deps.logSessionTelemetry).toHaveBeenCalledTimes(1)
  })
})
