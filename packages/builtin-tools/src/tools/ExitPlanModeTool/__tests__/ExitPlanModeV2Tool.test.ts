import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { resetStateForTests } from 'src/bootstrap/state.js'

mock.module('bun:bundle', () => ({
  feature: () => false,
}))

mock.module('src/utils/plans.js', () => ({
  clearAllPlanSlugs: () => {},
  clearPlanSlug: () => {},
  copyPlanForFork: async () => false,
  copyPlanForResume: async () => false,
  getPlan: () => '1. Run tests\n2. Verify API behavior',
  getPlanSlug: () => 'test-plan',
  getPlansDirectory: () => '/tmp',
  getPlanFilePath: () => '/tmp/test-plan.md',
  persistFileSnapshotIfRemote: () => Promise.resolve(),
  setPlanSlug: () => {},
}))

const originalVerifyPlan = process.env.CLAUDE_CODE_VERIFY_PLAN

beforeEach(() => {
  resetStateForTests()
  process.env.CLAUDE_CODE_VERIFY_PLAN = 'true'
})

afterEach(() => {
  if (originalVerifyPlan === undefined) {
    delete process.env.CLAUDE_CODE_VERIFY_PLAN
  } else {
    process.env.CLAUDE_CODE_VERIFY_PLAN = originalVerifyPlan
  }
})

describe('ExitPlanModeV2Tool', () => {
  test('creates pending plan verification state for main-thread exits', async () => {
    const { ExitPlanModeV2Tool } = await import('../ExitPlanModeV2Tool.js')

    let appState = {
      toolPermissionContext: {
        mode: 'plan',
        prePlanMode: 'default',
      },
      mcp: { tools: [] },
    }

    const result = await (ExitPlanModeV2Tool.call as any)(
      {} as never,
      {
        agentId: undefined,
        getAppState: () => appState,
        setAppState: (updater: (prev: typeof appState) => typeof appState) => {
          appState = updater(appState as never) as typeof appState
        },
        options: { tools: [] },
      } as never,
    )

    expect(result.data.plan).toContain('Run tests')
    expect(appState.toolPermissionContext.mode).toBe('default')
    expect((appState as typeof appState & {
      pendingPlanVerification?: {
        plan: string
        verificationStarted: boolean
        verificationCompleted: boolean
      }
    }).pendingPlanVerification).toEqual({
      plan: '1. Run tests\n2. Verify API behavior',
      verificationStarted: false,
      verificationCompleted: false,
    })
  })
})
