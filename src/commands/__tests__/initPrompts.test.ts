import { afterEach, describe, expect, test } from 'bun:test'
import { homedir } from 'node:os'
import { join } from 'node:path'
import initVerifiersCommand from '../init-verifiers.js'
import { buildNewInitPrompt, buildOldInitPrompt } from '../init.js'

const ORIGINAL_PROJECT_CONFIG_DIR_NAME =
  process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME

afterEach(() => {
  if (ORIGINAL_PROJECT_CONFIG_DIR_NAME === undefined) {
    delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
  } else {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME =
      ORIGINAL_PROJECT_CONFIG_DIR_NAME
  }
})

describe('init prompts', () => {
  test('old init prompt remains unchanged when no config paths are referenced', () => {
    const prompt = buildOldInitPrompt('.hare', join(homedir(), '.hare'))

    expect(prompt).toContain('# CLAUDE.md')
    expect(prompt).not.toContain('~/.hare/')
    expect(prompt).not.toContain('~/.claude/')
    expect(prompt).not.toContain('`.hare/')
    expect(prompt).not.toContain('`.claude/')
  })

  test('new init prompt uses configured project config dir', () => {
    const prompt = buildNewInitPrompt('.hare', join(homedir(), '.hare'))

    expect(prompt).toContain('`.hare/skills/`')
    expect(prompt).toContain('`.hare/rules/`')
    expect(prompt).toContain('`.hare/settings.json`')
    expect(prompt).toContain('`.hare/settings.local.json`')
    expect(prompt).toContain('`.hare/worktrees/<name>/`')
    expect(prompt).not.toContain('`.claude/skills/`')
  })

  test('init-verifiers prompt uses configured project config dir', async () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    const blocks = await initVerifiersCommand.getPromptForCommand()
    const prompt = blocks[0]?.text ?? ''

    expect(prompt).toContain('`.hare/skills/`')
    expect(prompt).not.toContain('`.claude/skills/`')
  })
})
