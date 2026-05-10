import { afterEach, describe, expect, mock, test } from 'bun:test'

let isForkSubagentFeatureEnabled = false

mock.module('bun:bundle', () => ({
  feature: () => false,
}))

mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: () => false,
}))

mock.module('src/utils/auth.js', () => ({
  getSubscriptionType: () => 'pro',
}))

mock.module('src/utils/embeddedTools.js', () => ({
  hasEmbeddedSearchTools: () => false,
}))

mock.module('src/utils/teammate.js', () => ({
  isTeammate: () => false,
}))

mock.module('src/utils/teammateContext.js', () => ({
  isInProcessTeammate: () => false,
}))

mock.module('../forkSubagent.js', () => ({
  isForkSubagentEnabled: () => isForkSubagentFeatureEnabled,
}))

const { setIsInteractive } = await import('src/bootstrap/state.js')
const { getPrompt } = await import('../prompt.js')

afterEach(() => {
  isForkSubagentFeatureEnabled = false
  delete process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES
  setIsInteractive(true)
})

describe('AgentTool prompt', () => {
  test('describes explicit fork while keeping general-purpose as the default path', async () => {
    isForkSubagentFeatureEnabled = true
    process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES = '0'

    const prompt = await getPrompt(
      [
        {
          agentType: 'worker',
          whenToUse: 'Handle implementation tasks',
          tools: ['*'],
        } as never,
      ],
      false,
    )

    expect(prompt).toContain(
      'If omitted, the general-purpose agent is used. Set `fork: true` to fork from the parent conversation context, inheriting full history and model.',
    )
    expect(prompt).toContain('fork: true,')
    expect(prompt).toContain('run_in_background parameter')
    expect(prompt).not.toContain('or omit it to fork yourself')
  })
})
