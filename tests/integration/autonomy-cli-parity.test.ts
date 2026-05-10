import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const repoRoot = join(import.meta.dir, '../..')
const AUTONOMY_USAGE =
  'Usage: /autonomy [status [--deep]|runs [limit]|flows [limit]|flow <id>|flow cancel <id>|flow resume <id>]\n'

let tempRoot = ''

function runCli(args: string[]): {
  code: number | null
  stderr: string
  stdout: string
} {
  const configDir = join(tempRoot, 'config')
  const childEnv: NodeJS.ProcessEnv = {
    HOME: process.env.HOME,
    LANG: process.env.LANG,
    LOGNAME: process.env.LOGNAME,
    NO_COLOR: '1',
    PATH: process.env.PATH,
    SHELL: process.env.SHELL,
    TERM: process.env.TERM,
    TMPDIR: process.env.TMPDIR,
    USER: process.env.USER,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_TERMINAL_TITLE: '1',
    CLAUDE_CONFIG_DIR: configDir,
  }
  const result = spawnSync(
    'bun',
    ['run', 'scripts/dev.ts', '--', ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: childEnv,
      timeout: 30_000,
    },
  )

  if (result.error) {
    return {
      code: result.status,
      stderr: result.error.message,
      stdout: result.stdout ?? '',
    }
  }

  return {
    code: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'autonomy-cli-parity-'))
})

afterEach(() => {
  if (tempRoot) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe('autonomy CLI parity', () => {
  test(
    'routes root autonomy commands through the original slash-style parser',
    () => {
      const status = runCli(['autonomy'])
      expect(status.code).toBe(0)
      expect(status.stderr).toBe('')
      expect(status.stdout).toContain('Autonomy runs:')
      expect(status.stdout).toContain('Autonomy flows:')

      const help = runCli(['autonomy', '--help'])
      expect(help.code).toBe(0)
      expect(help.stderr).toBe('')
      expect(help.stdout).toBe(AUTONOMY_USAGE)
    },
    { timeout: 30_000 },
  )

  test(
    'keeps subcommand help-like inputs on the original text path',
    () => {
      const statusHelp = runCli(['autonomy', 'status', '--help'])
      expect(statusHelp.code).toBe(0)
      expect(statusHelp.stderr).toBe('')
      expect(statusHelp.stdout).toContain('Autonomy runs:')
      expect(statusHelp.stdout).not.toContain('Usage: claude autonomy status')

      const flowHelp = runCli(['autonomy', 'flow', '--help'])
      expect(flowHelp.code).toBe(0)
      expect(flowHelp.stderr).toBe('')
      expect(flowHelp.stdout).toBe('Autonomy flow not found.\n')

      const flowResumeHelp = runCli(['autonomy', 'flow', 'resume', '--help'])
      expect(flowResumeHelp.code).toBe(0)
      expect(flowResumeHelp.stderr).toBe('')
      expect(flowResumeHelp.stdout).toBe(
        'Autonomy flow is not waiting or was not found.\n',
      )
    },
    { timeout: 30_000 },
  )
})

describe('update CLI parity', () => {
  test(
    'keeps the original ccb update help wording',
    () => {
      const result = runCli(['update', '--help'])
      expect(result.code).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toContain(
        'Update claude-code-best (ccb) to the latest version',
      )
    },
    { timeout: 30_000 },
  )
})
