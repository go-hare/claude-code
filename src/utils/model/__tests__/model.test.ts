import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resetSettingsCache } from '../../settings/settingsCache.js'
import {
  firstPartyNameToCanonical,
  getProviderModelEnvSetting,
  getUserSpecifiedModelSetting,
} from '../model.js'

const ORIGINAL_ENV = {
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GROK_MODEL: process.env.GROK_MODEL,
  CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
  CLAUDE_CODE_USE_GEMINI: process.env.CLAUDE_CODE_USE_GEMINI,
  CLAUDE_CODE_USE_GROK: process.env.CLAUDE_CODE_USE_GROK,
  CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
}

let tempConfigDir: string | undefined

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

beforeEach(() => {
  tempConfigDir = mkdtempSync(join(tmpdir(), 'hare-model-test-'))
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  resetSettingsCache()
  delete process.env.ANTHROPIC_MODEL
  delete process.env.OPENAI_MODEL
  delete process.env.GEMINI_MODEL
  delete process.env.GROK_MODEL
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_GEMINI
  delete process.env.CLAUDE_CODE_USE_GROK
})

afterEach(() => {
  resetSettingsCache()
  restoreEnv()
  if (tempConfigDir) {
    rmSync(tempConfigDir, { recursive: true, force: true })
    tempConfigDir = undefined
  }
})

describe('firstPartyNameToCanonical', () => {
  test('maps opus-4-6 full name to canonical', () => {
    expect(firstPartyNameToCanonical('claude-opus-4-6-20250514')).toBe(
      'claude-opus-4-6',
    )
  })

  test('maps sonnet-4-6 full name', () => {
    expect(firstPartyNameToCanonical('claude-sonnet-4-6-20250514')).toBe(
      'claude-sonnet-4-6',
    )
  })

  test('maps haiku-4-5', () => {
    expect(firstPartyNameToCanonical('claude-haiku-4-5-20251001')).toBe(
      'claude-haiku-4-5',
    )
  })

  test('maps 3P provider format', () => {
    expect(firstPartyNameToCanonical('us.anthropic.claude-opus-4-6-v1:0')).toBe(
      'claude-opus-4-6',
    )
  })

  test('maps claude-3-7-sonnet', () => {
    expect(firstPartyNameToCanonical('claude-3-7-sonnet-20250219')).toBe(
      'claude-3-7-sonnet',
    )
  })

  test('maps claude-3-5-sonnet', () => {
    expect(firstPartyNameToCanonical('claude-3-5-sonnet-20241022')).toBe(
      'claude-3-5-sonnet',
    )
  })

  test('maps claude-3-5-haiku', () => {
    expect(firstPartyNameToCanonical('claude-3-5-haiku-20241022')).toBe(
      'claude-3-5-haiku',
    )
  })

  test('maps claude-3-opus', () => {
    expect(firstPartyNameToCanonical('claude-3-opus-20240229')).toBe(
      'claude-3-opus',
    )
  })

  test('is case insensitive', () => {
    expect(firstPartyNameToCanonical('Claude-Opus-4-6-20250514')).toBe(
      'claude-opus-4-6',
    )
  })

  test('falls back to input for unknown model', () => {
    expect(firstPartyNameToCanonical('unknown-model')).toBe('unknown-model')
  })

  test('differentiates opus-4 vs opus-4-5 vs opus-4-6', () => {
    expect(firstPartyNameToCanonical('claude-opus-4-20240101')).toBe(
      'claude-opus-4',
    )
    expect(firstPartyNameToCanonical('claude-opus-4-5-20240101')).toBe(
      'claude-opus-4-5',
    )
    expect(firstPartyNameToCanonical('claude-opus-4-6-20240101')).toBe(
      'claude-opus-4-6',
    )
  })

  test('maps opus-4-1', () => {
    expect(firstPartyNameToCanonical('claude-opus-4-1-20240101')).toBe(
      'claude-opus-4-1',
    )
  })

  test('maps sonnet-4-5', () => {
    expect(firstPartyNameToCanonical('claude-sonnet-4-5-20240101')).toBe(
      'claude-sonnet-4-5',
    )
  })

  test('maps sonnet-4', () => {
    expect(firstPartyNameToCanonical('claude-sonnet-4-20240101')).toBe(
      'claude-sonnet-4',
    )
  })
})

describe('getProviderModelEnvSetting', () => {
  test('uses ANTHROPIC_MODEL for first-party style providers', () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6'

    expect(getProviderModelEnvSetting()).toBe('claude-sonnet-4-6')
  })

  test('uses OPENAI_MODEL for OpenAI provider', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_MODEL = 'gpt-5.5'

    expect(getProviderModelEnvSetting()).toBe('gpt-5.5')
  })

  test('uses GEMINI_MODEL for Gemini provider', () => {
    process.env.CLAUDE_CODE_USE_GEMINI = '1'
    process.env.GEMINI_MODEL = 'gemini-2.5-pro'

    expect(getProviderModelEnvSetting()).toBe('gemini-2.5-pro')
  })

  test('uses GROK_MODEL for Grok provider', () => {
    process.env.CLAUDE_CODE_USE_GROK = '1'
    process.env.GROK_MODEL = 'grok-4'

    expect(getProviderModelEnvSetting()).toBe('grok-4')
  })
})

describe('getUserSpecifiedModelSetting', () => {
  test('prefers provider-specific env model over settings-style fallbacks', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_MODEL = 'gpt-5.5'

    expect(getUserSpecifiedModelSetting()).toBe('gpt-5.5')
  })
})
