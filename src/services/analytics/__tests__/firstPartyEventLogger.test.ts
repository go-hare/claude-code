import { afterEach, describe, expect, test } from 'bun:test'

import { is1PEventLoggingEnabled } from '../firstPartyEventLogger.js'

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  CLAUDE_CODE_ENABLE_ANTHROPIC_EVENT_LOGGING:
    process.env.CLAUDE_CODE_ENABLE_ANTHROPIC_EVENT_LOGGING,
  CLAUDE_CODE_USE_BEDROCK: process.env.CLAUDE_CODE_USE_BEDROCK,
  CLAUDE_CODE_USE_VERTEX: process.env.CLAUDE_CODE_USE_VERTEX,
  CLAUDE_CODE_USE_FOUNDRY: process.env.CLAUDE_CODE_USE_FOUNDRY,
  CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
  DISABLE_TELEMETRY: process.env.DISABLE_TELEMETRY,
  DISABLE_NON_ESSENTIAL_MODEL_CALLS:
    process.env.DISABLE_NON_ESSENTIAL_MODEL_CALLS,
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

afterEach(() => {
  restoreEnv()
})

describe('is1PEventLoggingEnabled', () => {
  test('默认关闭 Anthropic 1P 云上报', () => {
    delete process.env.CLAUDE_CODE_ENABLE_ANTHROPIC_EVENT_LOGGING
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    delete process.env.DISABLE_TELEMETRY
    delete process.env.DISABLE_NON_ESSENTIAL_MODEL_CALLS
    process.env.NODE_ENV = 'development'

    expect(is1PEventLoggingEnabled()).toBe(false)
  })

  test('显式开启环境变量时才启用', () => {
    process.env.CLAUDE_CODE_ENABLE_ANTHROPIC_EVENT_LOGGING = '1'
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    delete process.env.DISABLE_TELEMETRY
    delete process.env.DISABLE_NON_ESSENTIAL_MODEL_CALLS
    process.env.NODE_ENV = 'development'

    expect(is1PEventLoggingEnabled()).toBe(true)
  })

  test('即使显式开启，analytics 全局禁用时仍返回 false', () => {
    process.env.CLAUDE_CODE_ENABLE_ANTHROPIC_EVENT_LOGGING = '1'
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    process.env.NODE_ENV = 'development'

    expect(is1PEventLoggingEnabled()).toBe(false)
  })
})
