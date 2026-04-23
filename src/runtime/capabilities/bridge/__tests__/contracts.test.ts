import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

const repoRoot = process.cwd()

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(join(repoRoot, relativePath), 'utf8')
}

describe('bridge runtime contracts', () => {
  test('defines runtime-owned bridge deps contracts', async () => {
    const contracts = await readRepoFile(
      'src/runtime/capabilities/bridge/contracts.ts',
    )

    expect(contracts).toContain('export interface HeadlessBridgeDeps')
    expect(contracts).toContain('export type BridgeLoopRunner =')
    expect(contracts).toContain('export type HeadlessBridgeInitialSessionParams =')
  })

  test('headless bridge entry depends on bridge types instead of bridgeMain', async () => {
    const entry = await readRepoFile(
      'src/runtime/capabilities/bridge/HeadlessBridgeEntry.ts',
    )
    const types = await readRepoFile('src/bridge/types.ts')
    const contracts = await readRepoFile(
      'src/runtime/capabilities/bridge/contracts.ts',
    )

    expect(entry).toContain("from '../../../bridge/types.js'")
    expect(entry).toContain("from './contracts.js'")
    expect(entry).not.toContain("from '../../../bridge/bridgeMain.js'")
    expect(types).toContain('export type BackoffConfig = {')
    expect(contracts).toContain('backoffConfig?: BackoffConfig')
  })
})
