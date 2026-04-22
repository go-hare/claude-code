import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { createSessionSpawner, safeFilenameId } from '../sessionRunner.js'

const createdPaths: string[] = []

afterEach(() => {
  for (const path of createdPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

function spawnAndWait(params: {
  sessionId: string
  verbose: boolean
  debugFile?: string
}) {
  const scriptRoot = mkdtempSync(join(tmpdir(), 'session-runner-script-'))
  createdPaths.push(scriptRoot)
  const scriptPath = join(scriptRoot, 'child.js')
  writeFileSync(
    scriptPath,
    [
      'const payload = {',
      "  type: 'result',",
      "  subtype: 'success',",
      '  argv: process.argv.slice(2),',
      '};',
      'process.stdout.write(JSON.stringify(payload) + "\\n");',
    ].join('\n'),
  )
  const spawner = createSessionSpawner({
    execPath: process.execPath,
    scriptArgs: [scriptPath],
    env: process.env,
    verbose: params.verbose,
    sandbox: false,
    debugFile: params.debugFile,
    onDebug: () => {},
  })

  return spawner.spawn(
    {
      accessToken: 'token',
      sessionId: params.sessionId,
      sdkUrl: 'http://127.0.0.1:3000/sdk',
      useCcrV2: false,
      workerEpoch: 0,
    },
    process.cwd(),
  )
}

describe('createSessionSpawner', () => {
  test('writes transcript for auto-generated verbose debug paths', async () => {
    const sessionId = 'verbose/session'
    const safeId = safeFilenameId(sessionId)
    const transcriptPath = join(
      tmpdir(),
      'claude',
      `bridge-transcript-${safeId}.jsonl`,
    )
    createdPaths.push(transcriptPath)

    const handle = spawnAndWait({ sessionId, verbose: true })
    await expect(handle.done).resolves.toBe('completed')

    const transcript = readFileSync(transcriptPath, 'utf8').trim()
    const payload = JSON.parse(transcript) as { argv: string[] }

    expect(payload.argv).toContain('--debug-file')
    expect(payload.argv).toContain(
      join(tmpdir(), 'claude', `bridge-session-${safeId}.log`),
    )
  })

  test('creates transcript beside explicit debug file and keeps session suffix', async () => {
    const root = mkdtempSync(join(tmpdir(), 'session-runner-test-'))
    createdPaths.push(root)

    const sessionId = 'nested/session'
    const safeId = safeFilenameId(sessionId)
    const debugFile = join(root, 'logs', 'bridge.log')
    const transcriptPath = join(root, 'logs', `bridge-transcript-${safeId}.jsonl`)

    const handle = spawnAndWait({
      sessionId,
      verbose: false,
      debugFile,
    })
    await expect(handle.done).resolves.toBe('completed')

    const transcript = readFileSync(transcriptPath, 'utf8').trim()
    const payload = JSON.parse(transcript) as { argv: string[] }

    expect(payload.argv).toContain('--debug-file')
    expect(payload.argv).toContain(join(root, 'logs', `bridge-${safeId}.log`))
  })
})
