import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'

const forkCommandSource = readFileSync(
  new URL('../fork/fork.tsx', import.meta.url),
  'utf8',
)

describe('/fork command contract', () => {
  test('routes through explicit fork:true input', () => {
    expect(forkCommandSource).toContain('fork: true')
    expect(forkCommandSource).not.toContain(
      'Omitting subagent_type triggers implicit fork.',
    )
  })
})
