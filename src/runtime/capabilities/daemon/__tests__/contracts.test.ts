import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

const repoRoot = process.cwd()

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(join(repoRoot, relativePath), 'utf8')
}

describe('daemon runtime contracts', () => {
  test('defines runtime-owned daemon deps contracts', async () => {
    const contracts = await readRepoFile(
      'src/runtime/capabilities/daemon/contracts.ts',
    )
    const runtime = await readRepoFile(
      'src/runtime/capabilities/daemon/DaemonWorkerRuntime.ts',
    )

    expect(contracts).toContain('export interface DaemonWorkerRuntimeDeps')
    expect(contracts).toContain('export type HeadlessBridgeRunner =')
    expect(runtime).toContain("from './contracts.js'")
  })
})
