import { describe, expect, test } from 'bun:test'
import { createCliLaunchContext } from '../sharedLaunchContext.js'

describe('createCliLaunchContext', () => {
  test('builds shared app and repl props once for launcher branches', () => {
    const commands = [{ name: 'help' }] as never
    const initialState = { sessionId: 'session-1' } as never
    const mainThreadAgentDefinition = { name: 'agent' } as never
    const thinkingConfig = { type: 'adaptive' } as never
    const stats = {
      increment() {},
      set() {},
      observe() {},
      add() {},
      getAll() {
        return {}
      },
    } as never

    const context = createCliLaunchContext({
      getFpsMetrics: () => undefined,
      stats,
      initialState,
      debug: true,
      commands,
      autoConnectIdeFlag: false,
      mainThreadAgentDefinition,
      disableSlashCommands: false,
      thinkingConfig,
    })

    expect(context.appProps).toEqual({
      getFpsMetrics: expect.any(Function),
      stats,
      initialState,
    })
    expect(context.replProps).toEqual({
      debug: true,
      commands,
      autoConnectIdeFlag: false,
      mainThreadAgentDefinition,
      disableSlashCommands: false,
      thinkingConfig,
    })
  })
})
