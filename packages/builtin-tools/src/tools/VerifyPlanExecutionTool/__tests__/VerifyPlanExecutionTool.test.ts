import { afterEach, describe, expect, test } from 'bun:test'
import { VerifyPlanExecutionTool } from '../VerifyPlanExecutionTool.js'

const originalVerifyPlan = process.env.CLAUDE_CODE_VERIFY_PLAN

afterEach(() => {
  if (originalVerifyPlan === undefined) {
    delete process.env.CLAUDE_CODE_VERIFY_PLAN
  } else {
    process.env.CLAUDE_CODE_VERIFY_PLAN = originalVerifyPlan
  }
})

describe('VerifyPlanExecutionTool', () => {
  test('marks pending plan verification complete and preserves notes in summary', async () => {
    let appState = {
      pendingPlanVerification: {
        plan: 'Ship the feature',
        verificationStarted: false,
        verificationCompleted: false,
      },
    }

    const result = await (VerifyPlanExecutionTool.call as any)(
      {
        plan_summary: 'Implemented the approved plan',
        verification_notes: 'Ran tests and checked the error path.',
        all_steps_completed: true,
      },
      {
        getAppState: () => appState,
        setAppState: (updater: (prev: typeof appState) => typeof appState) => {
          appState = updater(appState as never) as typeof appState
        },
      } as never,
    ) as any

    expect(result.data.verified).toBe(true)
    expect(result.data.summary).toContain('Implemented the approved plan')
    expect(result.data.summary).toContain('Verification notes:')
    expect(appState.pendingPlanVerification).toEqual({
      plan: 'Ship the feature',
      verificationStarted: true,
      verificationCompleted: true,
    })
  })

  test('launches the verification agent in the background when available', async () => {
    process.env.CLAUDE_CODE_VERIFY_PLAN = 'true'

    let appState = {
      pendingPlanVerification: {
        plan: '1. Run tests\n2. Verify the API',
        verificationStarted: false,
        verificationCompleted: false,
      },
    }

    const agentTool = {
      name: 'Agent',
      call: async () => ({
        data: {
          status: 'async_launched',
          agentId: 'agent-verifier',
          outputFile: '/tmp/verifier.log',
        },
      }),
    }

    const result = await (VerifyPlanExecutionTool.call as any)(
      {
        plan_summary: 'Implemented the approved plan',
        verification_notes: 'Ran the fast checks first.',
        all_steps_completed: true,
      },
      {
        agentId: undefined,
        getAppState: () => appState,
        setAppState: (updater: (prev: typeof appState) => typeof appState) => {
          appState = updater(appState as never) as typeof appState
        },
        options: {
          agentDefinitions: {
            activeAgents: [{ agentType: 'verification' }],
            allAgents: [],
          },
          tools: [agentTool],
        },
        toolUseId: 'verify-plan',
      },
      async () => ({ behavior: 'allow' as const }),
      {
        type: 'assistant',
        uuid: 'assistant-1',
        message: {
          role: 'assistant',
          content: [],
        },
      },
    )

    expect(result.data.verifierLaunched).toBe(true)
    expect(result.data.summary).toContain('Background verification agent launched.')
    expect(appState.pendingPlanVerification).toEqual({
      plan: '1. Run tests\n2. Verify the API',
      verificationStarted: true,
      verificationCompleted: false,
    })
  })
})
