import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const packageRoot = join(import.meta.dir, '../..')
const runScript = `
import { waitForUrlEvent } from './src/index.ts'
const value = await waitForUrlEvent(Number(process.env.URL_HANDLER_TEST_TIMEOUT ?? '1'))
process.stdout.write(value === null ? 'null' : value)
`

function runWaitForUrlEvent(options?: {
  env?: Record<string, string | undefined>
  args?: string[]
}): string {
  const env = { ...process.env }
  delete env.CLAUDE_CODE_URL_EVENT
  delete env.CLAUDE_CODE_DEEP_LINK_URL
  delete env.CLAUDE_CODE_URL
  delete env.URL_HANDLER_TEST_TIMEOUT

  for (const [key, value] of Object.entries(options?.env ?? {})) {
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }

  return execFileSync('bun', ['-e', runScript, ...(options?.args ?? [])], {
    cwd: packageRoot,
    env,
    encoding: 'utf8',
  })
}

describe('waitForUrlEvent', () => {
  test('resolves to null with an explicit timeout', () => {
    expect(
      runWaitForUrlEvent({ env: { URL_HANDLER_TEST_TIMEOUT: '1' } }),
    ).toBe('null')
  })

  test('uses the native URL handler path on supported macOS builds', () => {
    if (process.platform !== 'darwin') {
      return
    }

    const nativePath = join(
      packageRoot,
      '..',
      '..',
      'vendor',
      'url-handler',
      `${process.arch}-darwin`,
      'url-handler.node',
    )

    expect(existsSync(nativePath)).toBe(true)
  })

  test('does not read compatibility environment URLs', () => {
    expect(
      runWaitForUrlEvent({
        env: { CLAUDE_CODE_URL_EVENT: 'claude-cli://prompt?q=hello' },
      }),
    ).toBe('null')
  })

  test('does not read compatibility argv URLs', () => {
    expect(
      runWaitForUrlEvent({ args: ['claude://prompt?q=hello'] }),
    ).toBe('null')
  })
})
