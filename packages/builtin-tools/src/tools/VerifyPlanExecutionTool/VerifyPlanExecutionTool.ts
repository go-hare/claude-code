import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool, findToolByName } from 'src/Tool.js'
import { AGENT_TOOL_NAME, VERIFICATION_AGENT_TYPE } from '../AgentTool/constants.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { VERIFY_PLAN_EXECUTION_TOOL_NAME } from './constants.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    plan_summary: z
      .string()
      .describe('A summary of the plan that was executed.'),
    verification_notes: z
      .string()
      .optional()
      .describe(
        'Notes on what was verified and any issues found during verification.',
      ),
    all_steps_completed: z
      .boolean()
      .describe('Whether all planned steps were completed successfully.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type VerifyInput = z.infer<InputSchema>

type VerifyOutput = {
  verified: boolean
  summary: string
  verifierLaunched?: boolean
}

function buildVerificationPrompt(input: VerifyInput, approvedPlan: string): string {
  const notes = input.verification_notes?.trim()
  return [
    'Verify whether the implementation actually completed the approved plan.',
    '',
    'Approved plan:',
    approvedPlan,
    '',
    'Implementer summary:',
    input.plan_summary,
    notes
      ? ['', 'Implementer verification notes:', notes].join('\n')
      : '',
    '',
    'Focus on concrete evidence. Try to falsify the claim that the plan is complete.',
  ]
    .filter(Boolean)
    .join('\n')
}

export const VerifyPlanExecutionTool = buildTool({
  name: VERIFY_PLAN_EXECUTION_TOOL_NAME,
  searchHint: 'verify plan execution check completion',
  maxResultSizeChars: 10_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return 'Verify that a plan was executed correctly before exiting plan mode'
  },
  async prompt() {
    return `Verify that a plan has been executed correctly. Call this tool before your final summary to confirm all steps were completed.

Guidelines:
- Summarize the plan that was executed
- Note whether all steps completed successfully
- Include any verification notes (tests passed, files created, etc.)
- If steps were skipped or failed, explain why in verification_notes
- When the verification agent is available, this tool will launch it in the background automatically`
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },

  userFacingName() {
    return 'VerifyPlan'
  },

  renderToolUseMessage(input: Partial<VerifyInput>) {
    if (input.all_steps_completed === true) {
      return 'Verify Plan: all steps completed'
    }
    if (input.all_steps_completed === false) {
      return 'Verify Plan: incomplete'
    }
    return 'Verify Plan'
  },

  mapToolResultToToolResultBlockParam(
    content: VerifyOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    if (content.verifierLaunched) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: `Plan verification started in background: ${content.summary}`,
      }
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: content.verified
        ? `Plan verified: ${content.summary}`
        : `Plan verification failed: ${content.summary}`,
    }
  },

  async call(input: VerifyInput, context, canUseTool, assistantMessage) {
    const pending = context.getAppState().pendingPlanVerification
    const summary = input.verification_notes
      ? `${input.plan_summary}\n\nVerification notes:\n${input.verification_notes}`
      : input.plan_summary
    let verifierLaunched = false
    let verificationCompleted = true

    if (
      process.env.CLAUDE_CODE_VERIFY_PLAN === 'true' &&
      !context.agentId &&
      pending &&
      assistantMessage &&
      canUseTool
    ) {
      const verificationAgentAvailable =
        context.options.agentDefinitions.activeAgents.some(
          agent => agent.agentType === VERIFICATION_AGENT_TYPE,
        )
      const agentTool = findToolByName(context.options.tools, AGENT_TOOL_NAME)

      if (verificationAgentAvailable && agentTool) {
        const agentInput = {
          description: 'Verify plan execution',
          prompt: buildVerificationPrompt(input, pending.plan),
          run_in_background: true,
          subagent_type: VERIFICATION_AGENT_TYPE,
        }
        const nestedToolUseId =
          `${context.toolUseId ?? VERIFY_PLAN_EXECUTION_TOOL_NAME}:verification`
        const permissionResult = await canUseTool(
          agentTool,
          agentInput,
          context,
          assistantMessage,
          nestedToolUseId,
        )

        if (permissionResult.behavior === 'allow') {
          const finalInput = (permissionResult.updatedInput ?? agentInput) as typeof agentInput
          const launchResult = await (agentTool.call as any)(
            finalInput,
            context,
            canUseTool,
            assistantMessage,
          )

          if (launchResult?.data?.status === 'async_launched') {
            verifierLaunched = true
            verificationCompleted = false
          }
        }
      }
    }

    context.setAppState(prev => {
      const nextPending = prev.pendingPlanVerification
      if (!nextPending) {
        return prev
      }

      return {
        ...prev,
        pendingPlanVerification: {
          ...nextPending,
          verificationStarted: true,
          verificationCompleted,
        },
      }
    })

    return {
      data: {
        verified: input.all_steps_completed,
        summary: verifierLaunched
          ? `${summary}\n\nBackground verification agent launched.`
          : summary,
        verifierLaunched: verifierLaunched || undefined,
      },
    }
  },
})
