import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const content = readFileSync(
  join(
    process.cwd(),
    'src/runtime/capabilities/execution/internal/headlessBootstrap.ts',
  ),
  'utf8',
)

describe('headlessBootstrap import discipline', () => {
  test('does not import bootstrap state directly', () => {
    expect(content).not.toContain("from 'src/bootstrap/state.js'")
  })

  test('reads bootstrap state through the runtime provider seam', () => {
    expect(content).toContain(
      'bootstrapStateProvider: RuntimeBootstrapStateProvider',
    )
    expect(content).toContain(
      'bootstrapStateProvider.getSessionIdentity().sessionId',
    )
  })
})
