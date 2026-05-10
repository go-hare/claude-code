import { afterEach, describe, expect, test } from 'bun:test'

const { createAdapter } = await import('../adapters/index')

const originalAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL
const originalUseOpenAI = process.env.CLAUDE_CODE_USE_OPENAI
const originalUseGemini = process.env.CLAUDE_CODE_USE_GEMINI
const originalUseGrok = process.env.CLAUDE_CODE_USE_GROK
const originalWebSearchAdapter = process.env.WEB_SEARCH_ADAPTER

afterEach(() => {
  if (originalAnthropicBaseUrl === undefined) {
    delete process.env.ANTHROPIC_BASE_URL
  } else {
    process.env.ANTHROPIC_BASE_URL = originalAnthropicBaseUrl
  }
  if (originalUseOpenAI === undefined) {
    delete process.env.CLAUDE_CODE_USE_OPENAI
  } else {
    process.env.CLAUDE_CODE_USE_OPENAI = originalUseOpenAI
  }
  if (originalUseGemini === undefined) {
    delete process.env.CLAUDE_CODE_USE_GEMINI
  } else {
    process.env.CLAUDE_CODE_USE_GEMINI = originalUseGemini
  }
  if (originalUseGrok === undefined) {
    delete process.env.CLAUDE_CODE_USE_GROK
  } else {
    process.env.CLAUDE_CODE_USE_GROK = originalUseGrok
  }
  if (originalWebSearchAdapter === undefined) {
    delete process.env.WEB_SEARCH_ADAPTER
  } else {
    process.env.WEB_SEARCH_ADAPTER = originalWebSearchAdapter
  }
})

describe('createAdapter', () => {
  test('reuses the same instance when the selected backend does not change', () => {
    process.env.WEB_SEARCH_ADAPTER = 'brave'

    const firstAdapter = createAdapter()
    const secondAdapter = createAdapter()

    expect(firstAdapter).toBe(secondAdapter)
    expect(firstAdapter.constructor.name).toBe('BraveSearchAdapter')
  })

  test('rebuilds the adapter when WEB_SEARCH_ADAPTER changes', () => {
    process.env.WEB_SEARCH_ADAPTER = 'brave'
    const braveAdapter = createAdapter()

    process.env.WEB_SEARCH_ADAPTER = 'bing'
    const bingAdapter = createAdapter()

    expect(bingAdapter).not.toBe(braveAdapter)
    expect(bingAdapter.constructor.name).toBe('BingSearchAdapter')
  })

  test('selects the API adapter for first-party Anthropic URLs', () => {
    delete process.env.WEB_SEARCH_ADAPTER
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com'

    expect(createAdapter().constructor.name).toBe('ApiSearchAdapter')
  })

  test('selects the Exa adapter for third-party Anthropic base URLs', () => {
    delete process.env.WEB_SEARCH_ADAPTER
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GROK
    process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:8317/v1'

    expect(createAdapter().constructor.name).toBe('ExaSearchAdapter')
  })
})
