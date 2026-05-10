import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const autoCompactContent = readFileSync(
  join(import.meta.dir, '../autoCompact.ts'),
  'utf8',
)
const compactContent = readFileSync(
  join(import.meta.dir, '../compact.ts'),
  'utf8',
)
const compactCommandContent = readFileSync(
  join(import.meta.dir, '../../../commands/compact/compact.ts'),
  'utf8',
)

describe('compact runtime state seams', () => {
  test('autoCompact routes prompt and compaction state through runtime providers', () => {
    expect(autoCompactContent).not.toContain("bootstrap/state.js")
    expect(autoCompactContent).toContain(
      'createRuntimePromptStateProvider',
    )
    expect(autoCompactContent).toContain(
      'createRuntimeCompactionStateProvider',
    )
    expect(autoCompactContent).toContain('getPromptState().sdkBetas')
    expect(autoCompactContent).toContain(
      'compactionStateProvider.markPostCompaction()',
    )
  })

  test('compact service routes invoked skills and compaction state through runtime providers', () => {
    expect(compactContent).not.toContain("bootstrap/state.js")
    expect(compactContent).toContain(
      'createRuntimeInvokedSkillStateProvider',
    )
    expect(compactContent).toContain(
      'createRuntimeCompactionStateProvider',
    )
    expect(compactContent).toContain(
      'invokedSkillStateProvider.getInvokedSkillsForAgent',
    )
    expect(compactContent).toContain(
      'compactionStateProvider.markPostCompaction()',
    )
  })

  test('compact command only uses runtime compaction state seam', () => {
    expect(compactCommandContent).not.toContain("bootstrap/state.js")
    expect(compactCommandContent).toContain(
      'createRuntimeCompactionStateProvider',
    )
    expect(compactCommandContent).toContain(
      'compactionStateProvider.markPostCompaction()',
    )
  })
})
