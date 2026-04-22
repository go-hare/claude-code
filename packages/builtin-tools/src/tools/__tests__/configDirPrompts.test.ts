import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  buildCronCreatePrompt,
  buildCronDeletePrompt,
  buildCronListPrompt,
} from '../ScheduleCronTool/prompt.js'
import { getEnterWorktreeToolPrompt } from '../EnterWorktreeTool/prompt.js'
import { CLAUDE_CODE_GUIDE_AGENT } from '../AgentTool/built-in/claudeCodeGuideAgent.js'
import { getPrompt as getTeamCreatePrompt } from '../TeamCreateTool/prompt.js'
import { getPrompt as getTeamDeletePrompt } from '../TeamDeleteTool/prompt.js'
import { STATUSLINE_SETUP_AGENT } from '../AgentTool/built-in/statuslineSetup.js'
import { WorkflowTool } from '../WorkflowTool/WorkflowTool.js'

const originalProjectConfigDirName =
  process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
const originalConfigDir = process.env.CLAUDE_CONFIG_DIR

afterEach(() => {
  if (originalProjectConfigDirName === undefined) {
    delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
  } else {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = originalProjectConfigDirName
  }

  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
})

describe('config dir prompts', () => {
  test('cron prompts and schema text honor custom project config dir', async () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    expect(buildCronCreatePrompt(true)).toContain('.hare/scheduled_tasks.json')
    expect(buildCronDeletePrompt(true)).toContain('.hare/scheduled_tasks.json')
    expect(buildCronListPrompt(true)).toContain('.hare/scheduled_tasks.json')

    const { CronCreateTool } = await import(
      `../ScheduleCronTool/CronCreateTool.js?project-dir=.hare`
    )
    const durableDescription = CronCreateTool.inputSchema.shape.durable
      .description
    expect(durableDescription).toContain('.hare/scheduled_tasks.json')
  })

  test('team prompts honor custom user config dir display path', () => {
    process.env.CLAUDE_CONFIG_DIR = join(homedir(), '.hare')

    expect(getTeamCreatePrompt()).toContain('~/.hare/teams/{team-name}/config.json')
    expect(getTeamCreatePrompt()).toContain('~/.hare/tasks/{team-name}/')
    expect(getTeamDeletePrompt()).toContain('~/.hare/teams/{team-name}/')
    expect(getTeamDeletePrompt()).toContain('~/.hare/tasks/{team-name}/')
  })

  test('workflow prompt and description honor custom project config dir', async () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    expect(await WorkflowTool.description()).toContain('.hare/workflows/')
    expect(await WorkflowTool.prompt()).toContain('.hare/workflows/')
  })

  test('worktree prompt honors custom project config dir', () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    expect(getEnterWorktreeToolPrompt()).toContain('.hare/worktrees/')
  })

  test('statusline setup prompt honors custom user config dir display path', () => {
    process.env.CLAUDE_CONFIG_DIR = join(homedir(), '.hare')

    const prompt = STATUSLINE_SETUP_AGENT.getSystemPrompt()
    expect(prompt).toContain('~/.hare/statusline-command.sh')
    expect(prompt).toContain('~/.hare/settings.json')
  })

  test('claude code guide prompt honors custom project config dir name', () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    const prompt = CLAUDE_CODE_GUIDE_AGENT.getSystemPrompt({
      toolUseContext: {
        options: {
          commands: [],
          agentDefinitions: { activeAgents: [] },
          mcpClients: [],
        },
      },
    } as never)
    expect(prompt).toContain('.hare/ directory')
  })
})
