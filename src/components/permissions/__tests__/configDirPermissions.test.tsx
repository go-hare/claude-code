import { afterEach, describe, expect, test } from 'bun:test'
import { homedir } from 'os'
import { join } from 'path'
import { getEmptyToolPermissionContext } from '../../../Tool.js'
import {
  getFilePermissionOptions,
  isInClaudeFolder,
  isInGlobalClaudeFolder,
} from '../FilePermissionDialog/permissionOptions.js'
import { optionForPermissionSaveDestination } from '../rules/AddPermissionRules.js'

const ORIGINAL_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR
const ORIGINAL_PROJECT_CONFIG_DIR_NAME =
  process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
const ORIGINAL_USE_COWORK_PLUGINS = process.env.CLAUDE_CODE_USE_COWORK_PLUGINS

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

  if (ORIGINAL_USE_COWORK_PLUGINS === undefined) {
    delete process.env.CLAUDE_CODE_USE_COWORK_PLUGINS
  } else {
    process.env.CLAUDE_CODE_USE_COWORK_PLUGINS = ORIGINAL_USE_COWORK_PLUGINS
  }
})

describe('permission config dir abstractions', () => {
  test('detects configured project config dir in file permission options', () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    const filePath = join(process.cwd(), '.hare', 'settings.json')
    expect(isInClaudeFolder(filePath)).toBe(true)

    const options = getFilePermissionOptions({
      filePath,
      toolPermissionContext: getEmptyToolPermissionContext(),
      operationType: 'write',
    })

    expect(options[1]?.option).toEqual({
      type: 'accept-session',
      scope: 'claude-folder',
    })
  })

  test('detects configured user config dir in global file permission options', () => {
    process.env.CLAUDE_CONFIG_DIR = join(homedir(), '.hare')

    const filePath = join(homedir(), '.hare', 'settings.json')
    expect(isInGlobalClaudeFolder(filePath)).toBe(true)

    const options = getFilePermissionOptions({
      filePath,
      toolPermissionContext: getEmptyToolPermissionContext(),
      operationType: 'write',
    })

    expect(options[1]?.option).toEqual({
      type: 'accept-session',
      scope: 'global-claude-folder',
    })
  })

  test('uses configured user settings path in save destination description', () => {
    process.env.CLAUDE_CONFIG_DIR = join(homedir(), '.hare')

    const option = optionForPermissionSaveDestination('userSettings')

    expect(option.description).toBe('Saved in ~/.hare/settings.json')
  })
})
