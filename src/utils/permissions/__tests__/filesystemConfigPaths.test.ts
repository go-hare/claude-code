import { afterEach, describe, expect, test } from 'bun:test'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  getClaudeSkillScope,
  getGlobalConfigPermissionPattern,
  getProjectConfigPermissionPattern,
  isClaudeSettingsPath,
} from '../filesystem.js'

const ORIGINAL_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR
const ORIGINAL_PROJECT_CONFIG_DIR_NAME =
  process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME

afterEach(() => {
  if (ORIGINAL_CONFIG_DIR === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CONFIG_DIR
  }

  if (ORIGINAL_PROJECT_CONFIG_DIR_NAME === undefined) {
    delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
  } else {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME =
      ORIGINAL_PROJECT_CONFIG_DIR_NAME
  }
})

describe('filesystem config dir abstractions', () => {
  test('uses configured project config dir for project permission pattern', () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    expect(getProjectConfigPermissionPattern()).toBe('/.hare/**')
  })

  test('uses configured user config dir for global permission pattern', () => {
    process.env.CLAUDE_CONFIG_DIR = join(homedir(), '.hare')

    expect(getGlobalConfigPermissionPattern()).toBe('~/.hare/**')
  })

  test('uses configured project config dir for project skill scope', () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    expect(
      getClaudeSkillScope(
        join(process.cwd(), '.hare', 'skills', 'demo-skill', 'SKILL.md'),
      ),
    ).toEqual({
      skillName: 'demo-skill',
      pattern: '/.hare/skills/demo-skill/**',
    })
  })

  test('uses configured project config dir for settings path detection', () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    expect(
      isClaudeSettingsPath(join(process.cwd(), '.hare', 'settings.local.json')),
    ).toBe(true)
  })
})
