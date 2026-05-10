import { describe, expect, test } from 'bun:test'

describe('beta header assembly safety', () => {
  test('empty beta strings would create an invalid header without filtering', () => {
    const betas = [
      'claude-code-20250219',
      '',
      'interleaved-thinking-2025-05-14',
    ]

    expect(betas.toString()).toBe(
      'claude-code-20250219,,interleaved-thinking-2025-05-14',
    )
    expect(betas.filter(Boolean).toString()).toBe(
      'claude-code-20250219,interleaved-thinking-2025-05-14',
    )
  })

  test('cache editing header is only appended when non-empty', () => {
    const betasParams = ['claude-code-20250219']
    const cacheEditingHeaderLatched = true
    const cacheEditingBetaHeader = ''

    if (
      cacheEditingHeaderLatched &&
      cacheEditingBetaHeader &&
      !betasParams.includes(cacheEditingBetaHeader)
    ) {
      betasParams.push(cacheEditingBetaHeader)
    }

    expect(betasParams).toEqual(['claude-code-20250219'])
  })

  test('final beta list filters empty feature-gated constants', () => {
    const filteredBetas = [
      'claude-code-20250219',
      '',
      'context-1m-2025-08-07',
      '',
    ].filter(Boolean)

    expect(filteredBetas).toEqual([
      'claude-code-20250219',
      'context-1m-2025-08-07',
    ])
    expect(filteredBetas).not.toContain('')
  })
})
