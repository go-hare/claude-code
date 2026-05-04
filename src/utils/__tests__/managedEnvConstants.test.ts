import { describe, expect, test } from 'bun:test'

import { isProviderManagedEnvVar } from '../managedEnvConstants.js'

describe('managedEnvConstants', () => {
  test('classifies host-owned provider routing flags as managed', () => {
    expect(isProviderManagedEnvVar('CLAUDE_CODE_USE_OPENAI')).toBe(true)
    expect(isProviderManagedEnvVar('CLAUDE_CODE_USE_GROK')).toBe(true)
    expect(isProviderManagedEnvVar('OPENAI_BASE_URL')).toBe(true)
    expect(isProviderManagedEnvVar('GROK_BASE_URL')).toBe(true)
    expect(isProviderManagedEnvVar('GROK_API_KEY')).toBe(true)
    expect(isProviderManagedEnvVar('XAI_API_KEY')).toBe(true)
    expect(isProviderManagedEnvVar('GROK_MODEL_MAP')).toBe(true)
  })

  test('does not classify unrelated env vars as provider managed', () => {
    expect(isProviderManagedEnvVar('NO_COLOR')).toBe(false)
    expect(isProviderManagedEnvVar('PATH')).toBe(false)
  })
})
