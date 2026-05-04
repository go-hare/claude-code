import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getAllModelBetas,
  shouldIncludeFirstPartyOnlyBetas,
  shouldUseGlobalCacheScope,
} from '../betas.js'

const envKeys = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
  'DISABLE_INTERLEAVED_THINKING',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_GROK',
] as const

const savedEnv: Record<string, string | undefined> = {}

describe('first-party beta gating on custom anthropic proxies', () => {
  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    process.env.ANTHROPIC_API_KEY = 'dummy'
    process.env.ANTHROPIC_BASE_URL = 'https://proxy.example.com'
  })

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key]
      } else {
        delete process.env[key]
      }
    }
  })

  test('returns false for custom anthropic proxy base urls', () => {
    expect(shouldIncludeFirstPartyOnlyBetas()).toBe(false)
  })

  test('disables global cache scope for custom anthropic proxy base urls', () => {
    expect(shouldUseGlobalCacheScope()).toBe(false)
  })

  test('does not emit first-party-only betas for custom anthropic proxy base urls', () => {
    expect(getAllModelBetas('claude-opus-4-7')).toEqual([
      'claude-code-20250219',
    ])
  })
})
