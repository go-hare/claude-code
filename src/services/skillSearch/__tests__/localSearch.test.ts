import { describe, expect, test } from 'bun:test'
import {
  searchSkills,
  tokenize,
  tokenizeAndStem,
  type SkillIndexEntry,
} from '../localSearch.js'

function buildTfVector(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1)
  }
  const max = Math.max(...freq.values(), 1)
  const tf = new Map<string, number>()
  for (const [term, count] of freq) {
    tf.set(term, count / max)
  }
  return tf
}

function makeEntry(overrides: Partial<SkillIndexEntry>): SkillIndexEntry {
  const tokens = overrides.tokens ?? []
  const name = overrides.name ?? 'test-skill'
  return {
    name,
    normalizedName:
      overrides.normalizedName ?? name.toLowerCase().replace(/[-_]/g, ' '),
    description: overrides.description ?? '',
    whenToUse: overrides.whenToUse,
    source: overrides.source ?? 'test',
    loadedFrom: overrides.loadedFrom,
    skillRoot: overrides.skillRoot,
    contentLength: overrides.contentLength,
    tokens,
    tfVector: overrides.tfVector ?? buildTfVector(tokens),
  }
}

describe('tokenize', () => {
  test('keeps overlapping CJK bi-grams', () => {
    const tokens = tokenize('优化重构流程')

    expect(tokens).toContain('优化')
    expect(tokens).toContain('化重')
    expect(tokens).toContain('重构')
    expect(tokens).toContain('构流')
    expect(tokens).toContain('流程')
    expect(tokens.length).toBe(5)
  })

  test('retains non-stop-word ASCII tokens', () => {
    const tokens = tokenize('Refactor TypeScript helpers')

    expect(tokens).toContain('refactor')
    expect(tokens).toContain('typescript')
    expect(tokens).toContain('helpers')
  })

  test('does not generate CJK tokens for isolated single characters', () => {
    const tokens = tokenize('优 is lonely')

    expect(tokens.some(token => /[\u4e00-\u9fff]/.test(token))).toBe(false)
    expect(tokens).toContain('lonely')
  })
})

describe('tokenizeAndStem', () => {
  test('stems ASCII words but leaves CJK bi-grams intact', () => {
    const tokens = tokenizeAndStem('refactoring 重构 helpers')

    expect(tokens).toContain('refactor')
    expect(tokens).toContain('重构')
    expect(tokens).toContain('helper')
  })
})

describe('searchSkills', () => {
  test('ranks Chinese-metadata skills for Chinese queries', () => {
    const index: SkillIndexEntry[] = [
      makeEntry({
        name: 'refactor-cleaner',
        description: '清理和重构流程辅助',
        tokens: tokenizeAndStem('refactor-cleaner 清理 重构 流程 的工具'),
      }),
      makeEntry({
        name: 'database-migration',
        description: 'schema upgrade',
        tokens: tokenizeAndStem('database-migration tool for schema upgrades'),
      }),
    ]

    const results = searchSkills('优化重构流程', index, 5)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.name).toBe('refactor-cleaner')
    expect(results[0]?.score).toBeGreaterThan(0)
  })

  test('keeps English ranking behavior stable', () => {
    const index: SkillIndexEntry[] = [
      makeEntry({
        name: 'refactor-helper',
        description: 'refactor typescript',
        tokens: tokenizeAndStem('refactor clean typescript code helper'),
      }),
      makeEntry({
        name: 'security-review',
        description: 'security audit',
        tokens: tokenizeAndStem('security review audit vulnerabilities'),
      }),
    ]

    const results = searchSkills('refactor typescript', index, 5)

    expect(results[0]?.name).toBe('refactor-helper')
  })

  test('filters CJK queries with only one matching bi-gram', () => {
    const index: SkillIndexEntry[] = [
      makeEntry({
        name: 'prompt-optimizer',
        description: 'optimize prompts',
        tokens: tokenizeAndStem(
          'prompt-optimizer optimize prompts for better performance 当前最佳实践',
        ),
      }),
      makeEntry({
        name: 'database-migration',
        description: 'schema upgrade',
        tokens: tokenizeAndStem('database-migration tool for schema upgrades'),
      }),
    ]

    const results = searchSkills('研究当前代码', index, 5)

    expect(results).toEqual([])
  })

  test('exact skill-name matches receive the score boost', () => {
    const index: SkillIndexEntry[] = [
      makeEntry({
        name: 'code-review',
        description: 'review code quality',
        tokens: tokenizeAndStem('code-review review code quality'),
      }),
      makeEntry({
        name: 'security-review',
        description: 'review security',
        tokens: tokenizeAndStem('security-review review security'),
      }),
    ]

    const results = searchSkills('code review', index, 5)

    expect(results[0]?.name).toBe('code-review')
    expect(results[0]!.score).toBeGreaterThanOrEqual(0.75)
  })
})
