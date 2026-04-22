import { describe, expect, mock, test } from 'bun:test'

const mockRunHeadlessRuntime = mock(async () => {})
const mockSetState = mock((_updater: unknown) => {})

mock.module('../../state/AppStateStore.js', () => ({
  getDefaultAppState: () => ({}),
}))

mock.module('../../state/onChangeAppState.js', () => ({
  onChangeAppState: () => {},
}))

mock.module('../../state/store.js', () => ({
  createStore: () => ({
    getState: () => ({}),
    setState: mockSetState,
  }),
}))

mock.module('../../utils/effort.js', () => ({
  getInitialEffortSetting: () => 'medium',
  parseEffortValue: () => undefined,
}))

mock.module('../../utils/fastMode.js', () => ({
  getInitialFastModeSetting: () => false,
  isFastModeEnabled: () => false,
}))

mock.module('../../utils/permissions/permissionSetup.js', () => ({
  verifyAutoModeGateAccess: mock(async () => ({
    updateContext: (context: unknown) => context,
  })),
}))

mock.module('../../runtime/capabilities/execution/HeadlessRuntime.js', () => ({
  runHeadlessRuntime: mockRunHeadlessRuntime,
}))

const { runKernelHeadless } = await import('../headless.js')

describe('runKernelHeadless', () => {
  test('delegates to the runtime headless entry', async () => {
    const state = {
      sessionId: 'session_123',
    }
    const environment = {
      store: {
        getState: () => state,
        setState: mockSetState,
      },
      commands: [{ name: 'commit' }],
      tools: [{ name: 'Bash' }],
      sdkMcpConfigs: { local: { type: 'sdk', name: 'local' } },
      agents: [{ agentType: 'default' }],
    }
    const options = {
      continue: false,
      resume: undefined,
      resumeSessionAt: undefined,
      verbose: false,
      outputFormat: undefined,
      jsonSchema: undefined,
      permissionPromptToolName: undefined,
      allowedTools: undefined,
      thinkingConfig: undefined,
      maxTurns: undefined,
      maxBudgetUsd: undefined,
      taskBudget: undefined,
      systemPrompt: undefined,
      appendSystemPrompt: undefined,
      userSpecifiedModel: undefined,
      fallbackModel: undefined,
      teleport: undefined,
      sdkUrl: undefined,
      replayUserMessages: undefined,
      includePartialMessages: undefined,
      forkSession: false,
      rewindFiles: undefined,
      enableAuthStatus: undefined,
      agent: undefined,
      workload: undefined,
    }

    await runKernelHeadless(
      'hello',
      environment as never,
      options,
    )

    expect(mockRunHeadlessRuntime).toHaveBeenCalledTimes(1)
    const call = mockRunHeadlessRuntime.mock.calls[0] as unknown as
      | [
          string,
          () => unknown,
          typeof mockSetState,
          typeof environment.commands,
          typeof environment.tools,
          typeof environment.sdkMcpConfigs,
          typeof environment.agents,
          typeof options,
        ]
      | undefined
    expect(call?.[0]).toBe('hello')
    expect(call?.[1]()).toBe(state)
    expect(call?.[2]).toBe(mockSetState)
    expect(call?.[3]).toBe(environment.commands)
    expect(call?.[4]).toBe(environment.tools)
    expect(call?.[5]).toBe(environment.sdkMcpConfigs)
    expect(call?.[6]).toBe(environment.agents)
    expect(call?.[7]).toBe(options)
  })
})
