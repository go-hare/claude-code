import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { getWorkflowDirPath, getWorkflowDirRelativePath } from '../constants.js'

const originalProjectConfigDirName =
  process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME

afterEach(() => {
  if (originalProjectConfigDirName === undefined) {
    delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
  } else {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = originalProjectConfigDirName
  }
})

describe('workflow config paths', () => {
  test('uses the default project config dir name', () => {
    delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME

    expect(getWorkflowDirRelativePath()).toBe('.claude/workflows')
    expect(getWorkflowDirPath('C:\\repo')).toBe(
      join('C:\\repo', '.claude', 'workflows'),
    )
  })

  test('honors a custom project config dir name', () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    expect(getWorkflowDirRelativePath()).toBe('.hare/workflows')
    expect(getWorkflowDirPath('C:\\repo')).toBe(
      join('C:\\repo', '.hare', 'workflows'),
    )
  })
})
