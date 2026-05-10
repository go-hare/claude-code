import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const claudeContent = readFileSync(join(import.meta.dir, '../claude.ts'), 'utf8')
const loggingContent = readFileSync(
  join(import.meta.dir, '../logging.ts'),
  'utf8',
)

describe('api bootstrap state seams', () => {
  test('claude.ts reads runtime-owned state through bootstrap providers', () => {
    expect(claudeContent).not.toContain("from 'src/bootstrap/state.js'")
    expect(claudeContent).toContain(
      'createRuntimePromptStateProvider()',
    )
    expect(claudeContent).toContain(
      'createRuntimeRequestDebugStateProvider()',
    )
    expect(claudeContent).toContain(
      'createRuntimeSessionIdentityStateProvider()',
    )
  })

  test('logging.ts reads runtime-owned state through bootstrap providers', () => {
    expect(loggingContent).not.toContain("from 'src/bootstrap/state.js'")
    expect(loggingContent).toContain(
      'createRuntimeCompactionStateProvider()',
    )
    expect(loggingContent).toContain(
      'createRuntimeRequestDebugStateProvider()',
    )
    expect(loggingContent).toContain(
      'createRuntimeSessionIdentityStateProvider()',
    )
    expect(loggingContent).toContain(
      'createRuntimeTeleportStateProvider()',
    )
    expect(loggingContent).toContain('createRuntimeUsageStateProvider()')
  })
})
