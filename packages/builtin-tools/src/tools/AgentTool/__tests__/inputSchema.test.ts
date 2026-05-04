import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test'

let isCoordinatorModeEnabled = false
let isForkSubagentFeatureEnabled = false

mock.module('bun:bundle', () => ({
  feature: () => false,
}))

mock.module('src/coordinator/coordinatorMode.js', () => ({
  getWorkerAntiInjectionAddendum: () => '\nworker anti-injection',
  isCoordinatorMode: () => isCoordinatorModeEnabled,
}))

mock.module('../forkSubagent.js', () => ({
  FORK_AGENT: { agentType: 'fork' },
  buildForkedMessages: () => [],
  buildWorktreeNotice: () => [],
  isForkSubagentEnabled: () => isForkSubagentFeatureEnabled,
  isInForkChild: () => false,
}))

const { setIsInteractive } = await import('src/bootstrap/state.js')
const {
  inputSchema,
  resolveAgentInvocationRouting,
} = await import('../AgentTool.js')

const agentInput = {
  description: 'Read package name',
  prompt: 'Read package.json and report the package name.',
  subagent_type: 'worker',
  name: 'package-reader',
  team_name: 'default',
  mode: 'plan',
  task_id: 'task-1',
  owned_files: ['src/example.ts'],
}

afterEach(() => {
  isCoordinatorModeEnabled = false
  isForkSubagentFeatureEnabled = false
  delete process.env.CLAUDE_CODE_COORDINATOR_MODE
  delete process.env.CLAUDE_CODE_ENABLE_TASKS
  setIsInteractive(true)
})

afterAll(() => {
  mock.restore()
})

describe('AgentTool inputSchema', () => {
  test('hides team-routing fields when coordinator mode is enabled after a prior schema read', () => {
    setIsInteractive(false)
    process.env.CLAUDE_CODE_ENABLE_TASKS = '1'

    const normalInput = inputSchema().parse(agentInput) as Record<
      string,
      unknown
    >

    expect(normalInput.name).toBe('package-reader')
    expect(normalInput.team_name).toBe('default')
    expect(normalInput.mode).toBe('plan')

    isCoordinatorModeEnabled = true
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'

    const coordinatorInput = inputSchema().parse(agentInput) as Record<
      string,
      unknown
    >

    expect(coordinatorInput.name).toBeUndefined()
    expect(coordinatorInput.team_name).toBeUndefined()
    expect(coordinatorInput.mode).toBeUndefined()
    expect(coordinatorInput.task_id).toBe('task-1')
    expect(coordinatorInput.owned_files).toEqual(['src/example.ts'])
  })

  test('preserves explicit fork and background fields when fork feature is enabled', () => {
    isForkSubagentFeatureEnabled = true

    const parsed = inputSchema().parse({
      ...agentInput,
      fork: true,
      run_in_background: true,
    }) as Record<string, unknown>

    expect(parsed.fork).toBe(true)
    expect(parsed.run_in_background).toBe(true)
  })

  test('keeps general-purpose default when fork feature is enabled but fork is not requested', () => {
    isForkSubagentFeatureEnabled = true

    expect(resolveAgentInvocationRouting({})).toEqual({
      effectiveType: 'general-purpose',
      isForkPath: false,
    })
  })

  test('requires an explicit fork request before using the fork path', () => {
    isForkSubagentFeatureEnabled = true

    expect(
      resolveAgentInvocationRouting({
        subagent_type: 'worker',
        fork: true,
      }),
    ).toEqual({
      effectiveType: 'worker',
      isForkPath: true,
    })
  })
})
