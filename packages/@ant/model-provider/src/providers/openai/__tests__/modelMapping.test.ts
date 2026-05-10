import { describe, expect, test } from 'bun:test'
import { resolveOpenAIModel } from '../modelMapping.js'

const MODEL_ENV_KEYS = [
  'OPENAI_MODEL',
  'OPENAI_DEFAULT_HAIKU_MODEL',
  'OPENAI_DEFAULT_SONNET_MODEL',
  'OPENAI_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
] as const

type ModelEnvKey = (typeof MODEL_ENV_KEYS)[number]
type ModelEnvSnapshot = Record<ModelEnvKey, string | undefined>

function snapshotModelEnv(): ModelEnvSnapshot {
  return Object.fromEntries(
    MODEL_ENV_KEYS.map(key => [key, process.env[key]]),
  ) as ModelEnvSnapshot
}

function restoreModelEnv(snapshot: ModelEnvSnapshot): void {
  for (const key of MODEL_ENV_KEYS) {
    const value = snapshot[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function withModelEnv<T>(
  overrides: Partial<Record<ModelEnvKey, string>>,
  fn: () => T,
): T {
  const snapshot = snapshotModelEnv()
  try {
    for (const key of MODEL_ENV_KEYS) {
      delete process.env[key]
    }
    for (const [key, value] of Object.entries(overrides) as [
      ModelEnvKey,
      string,
    ][]) {
      process.env[key] = value
    }
    return fn()
  } finally {
    restoreModelEnv(snapshot)
  }
}

describe('resolveOpenAIModel', () => {
  test('OPENAI_MODEL env var overrides Claude-family model mapping', () => {
    expect(
      withModelEnv({ OPENAI_MODEL: 'my-custom-model' }, () =>
        resolveOpenAIModel('claude-sonnet-4-6'),
      ),
    ).toBe('my-custom-model')
  })

  test('custom OpenAI model selection overrides OPENAI_MODEL default', () => {
    expect(
      withModelEnv({ OPENAI_MODEL: 'gpt-5.5' }, () =>
        resolveOpenAIModel('gpt-5.4'),
      ),
    ).toBe('gpt-5.4')
  })

  test('ANTHROPIC_DEFAULT_SONNET_MODEL overrides default map', () => {
    expect(
      withModelEnv({ ANTHROPIC_DEFAULT_SONNET_MODEL: 'my-sonnet' }, () =>
        resolveOpenAIModel('claude-sonnet-4-6'),
      ),
    ).toBe('my-sonnet')
  })

  test('ANTHROPIC_DEFAULT_HAIKU_MODEL overrides default map', () => {
    expect(
      withModelEnv({ ANTHROPIC_DEFAULT_HAIKU_MODEL: 'my-haiku' }, () =>
        resolveOpenAIModel('claude-haiku-4-5-20251001'),
      ),
    ).toBe('my-haiku')
  })

  test('ANTHROPIC_DEFAULT_OPUS_MODEL overrides default map', () => {
    expect(
      withModelEnv({ ANTHROPIC_DEFAULT_OPUS_MODEL: 'my-opus' }, () =>
        resolveOpenAIModel('claude-opus-4-6'),
      ),
    ).toBe('my-opus')
  })

  test('maps known Anthropic model via DEFAULT_MODEL_MAP', () => {
    expect(withModelEnv({}, () => resolveOpenAIModel('claude-sonnet-4-6'))).toBe(
      'gpt-4o',
    )
  })

  test('maps haiku model', () => {
    expect(
      withModelEnv({}, () => resolveOpenAIModel('claude-haiku-4-5-20251001')),
    ).toBe('gpt-4o-mini')
  })

  test('maps opus model', () => {
    expect(withModelEnv({}, () => resolveOpenAIModel('claude-opus-4-6'))).toBe(
      'o3',
    )
    expect(withModelEnv({}, () => resolveOpenAIModel('claude-opus-4-7'))).toBe(
      'o3',
    )
  })

  test('passes through unknown model name', () => {
    expect(withModelEnv({}, () => resolveOpenAIModel('some-random-model'))).toBe(
      'some-random-model',
    )
  })

  test('strips [1m] suffix', () => {
    expect(
      withModelEnv({}, () => resolveOpenAIModel('claude-sonnet-4-6[1m]')),
    ).toBe('gpt-4o')
  })
})
