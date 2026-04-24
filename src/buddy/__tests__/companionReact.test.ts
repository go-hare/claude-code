import { afterEach, describe, expect, test } from 'bun:test'
import {
  getBuddyReactionModel,
  installCompanionObserver,
  parseBuddyReactionResponse,
  triggerCompanionReaction,
} from '../companionReact.js'

const ORIGINAL_ENV = {
  CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_SMALL_FAST_MODEL: process.env.OPENAI_SMALL_FAST_MODEL,
  OPENAI_DEFAULT_HAIKU_MODEL: process.env.OPENAI_DEFAULT_HAIKU_MODEL,
  ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
}

function restoreEnv() {
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
  delete (
    globalThis as typeof globalThis & {
      fireCompanionObserver?: unknown
    }
  ).fireCompanionObserver
})

describe('companionReact', () => {
  test('registers global companion observer', () => {
    installCompanionObserver()

    expect(
      (
        globalThis as typeof globalThis & {
          fireCompanionObserver?: unknown
        }
      ).fireCompanionObserver,
    ).toBe(triggerCompanionReaction)
  })

  test('uses OPENAI_MODEL for reactions when no haiku override is configured', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_MODEL = 'gpt-5.4'
    delete process.env.OPENAI_SMALL_FAST_MODEL
    delete process.env.OPENAI_DEFAULT_HAIKU_MODEL
    delete process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL

    expect(getBuddyReactionModel()).toBe('gpt-5.4')
  })

  test('prefers OPENAI_SMALL_FAST_MODEL when configured', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_MODEL = 'gpt-5.4'
    process.env.OPENAI_SMALL_FAST_MODEL = 'gpt-4.1-mini'

    expect(getBuddyReactionModel()).toBe('gpt-4.1-mini')
  })

  test('parses strict JSON reaction payload', () => {
    expect(
      parseBuddyReactionResponse('{"reaction":"你好呀，今天也别熬太晚。"}'),
    ).toBe('你好呀，今天也别熬太晚。')
  })

  test('parses fenced JSON reaction payload', () => {
    expect(
      parseBuddyReactionResponse(
        '```json\n{"reaction":"小家伙先围观一下。"}\n```',
      ),
    ).toBe('小家伙先围观一下。')
  })

  test('falls back to plain-text reaction when JSON formatting is ignored', () => {
    expect(
      parseBuddyReactionResponse('我这小仙人掌先不扎人，等你写坐代码再说。'),
    ).toBe('我这小仙人掌先不扎人，等你写坐代码再说。')
  })
})
