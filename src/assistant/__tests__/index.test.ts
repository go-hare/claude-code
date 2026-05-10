import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  getSessionCreatedTeams,
  resetStateForTests,
  setCwdState,
  setKairosActive,
  setOriginalCwd,
  setProjectRoot,
  switchSession,
} from '../../bootstrap/state.js'
import { asSessionId } from '../../types/ids.js'

import {
  cleanupTempDir,
  createTempDir,
  writeTempFile,
} from '../../../tests/mocks/file-system'

const testCwd = 'D:\\workspace\\repo'

let configHomeDir = ''
let previousClaudeConfigDir: string | undefined
let mockSettings: Record<string, unknown> = {}
const teammateModeOverrides: string[] = []
const writeTeamFileCalls: Array<{ teamName: string; teamFile: unknown }> = []
const ensuredTaskDirs: string[] = []
const resetTaskLists: string[] = []
const leaderTeamNames: string[] = []

mock.module('../deps.js', () => ({
  formatAgentId: (agentName: string, teamName: string) =>
    `${agentName}@${teamName}`,
  getDefaultMainLoopModel: () => 'default-model',
  parseUserSpecifiedModel: (model: string) => `parsed:${model}`,
  getInitialSettings: () => mockSettings,
  setCliTeammateModeOverride: (mode: string) => {
    teammateModeOverrides.push(mode)
  },
  TEAM_LEAD_NAME: 'team-lead',
  getTeamFilePath: (teamName: string) => `/teams/${teamName}.json`,
  sanitizeName: (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, ''),
  writeTeamFileAsync: async (teamName: string, teamFile: unknown) => {
    writeTeamFileCalls.push({ teamName, teamFile })
  },
  assignTeammateColor: () => 'cyan',
  ensureTasksDir: async (taskListId: string) => {
    ensuredTaskDirs.push(taskListId)
  },
  resetTaskList: async (taskListId: string) => {
    resetTaskLists.push(taskListId)
  },
  setLeaderTeamName: (teamName: string) => {
    leaderTeamNames.push(teamName)
  },
}))

const { getAssistantSystemPromptAddendum, initializeAssistantTeam } =
  await import('../index.js')

function setTestSession(sessionId: string): void {
  switchSession(asSessionId(sessionId))
}

describe('assistant mode', () => {
  beforeEach(async () => {
    resetStateForTests()
    setKairosActive(false)
    setOriginalCwd(testCwd)
    setProjectRoot(testCwd)
    setCwdState(testCwd)
    setTestSession(`session-${Date.now()}-${Math.random().toString(16).slice(2)}`)

    previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    configHomeDir = await createTempDir('assistant-config-')
    process.env.CLAUDE_CONFIG_DIR = configHomeDir
    mockSettings = {}
    teammateModeOverrides.length = 0
    writeTeamFileCalls.length = 0
    ensuredTaskDirs.length = 0
    resetTaskLists.length = 0
    leaderTeamNames.length = 0
  })

  afterEach(async () => {
    resetStateForTests()
    if (previousClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
    }
    if (configHomeDir) {
      await cleanupTempDir(configHomeDir)
    }
  })

  test('initializeAssistantTeam creates and caches an implicit in-process team', async () => {
    setTestSession('session-alpha')

    const context = await initializeAssistantTeam('opus')

    expect(context).toBeDefined()
    expect(writeTeamFileCalls).toHaveLength(1)
    expect(writeTeamFileCalls[0]?.teamName).toBe('assistant-session-alpha')
    expect(writeTeamFileCalls[0]?.teamFile).toMatchObject({
      name: 'assistant-session-alpha',
      leadAgentId: 'team-lead@assistant-session-alpha',
      leadSessionId: 'session-alpha',
      members: [
        expect.objectContaining({
          agentId: 'team-lead@assistant-session-alpha',
          model: 'parsed:opus',
          cwd: testCwd,
          backendType: 'in-process',
        }),
      ],
    })
    expect(getSessionCreatedTeams().has('assistant-session-alpha')).toBe(true)
    expect(ensuredTaskDirs).toEqual(['assistant-session-alpha'])
    expect(resetTaskLists).toEqual(['assistant-session-alpha'])
    expect(leaderTeamNames).toEqual(['assistant-session-alpha'])
    expect(teammateModeOverrides).toEqual(['in-process'])
    expect(context).toMatchObject({
      teamName: 'assistant-session-alpha',
      teamFilePath: '/teams/assistant-session-alpha.json',
      leadAgentId: 'team-lead@assistant-session-alpha',
      selfAgentId: 'team-lead@assistant-session-alpha',
      selfAgentName: 'team-lead',
      selfAgentColor: 'cyan',
      isLeader: true,
    })

    const cached = await initializeAssistantTeam('haiku')

    expect(cached).toBe(context)
    expect(writeTeamFileCalls).toHaveLength(1)
    expect(teammateModeOverrides).toEqual(['in-process', 'in-process'])
  })

  test('getAssistantSystemPromptAddendum includes assistant name and optional custom prompt', async () => {
    mockSettings = { assistantName: 'KAIROS' }
    await writeTempFile(
      configHomeDir,
      'agents/assistant.md',
      'Custom assistant override',
    )

    const prompt = getAssistantSystemPromptAddendum()

    expect(prompt).toContain('# Assistant Mode')
    expect(prompt).toContain('Display name for connected clients: KAIROS.')
    expect(prompt).toContain('Custom assistant override')
  })
})
