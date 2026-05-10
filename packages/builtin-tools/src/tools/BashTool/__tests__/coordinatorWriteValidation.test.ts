import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { resetFileLockStateForTests } from 'src/coordinator/fileLockManager.js'
import { runWithAgentContext } from 'src/utils/agentContext.js'
import { expandPath } from 'src/utils/path.js'

mock.module('src/coordinator/coordinatorMode.js', () => ({
  isCoordinatorMode: () => true,
  getWorkerAntiInjectionAddendum: () => '',
}))

const { validateCoordinatorBashWriteAccess } = await import(
  '../coordinatorWriteValidation.js'
)

function validateAsWorker(command: string, ownedFiles: string[]) {
  return runWithAgentContext(
    {
      agentId: 'worker-1',
      agentType: 'subagent',
      ownedFiles,
    },
    () => validateCoordinatorBashWriteAccess(command, 'worker-1'),
  )
}

describe('validateCoordinatorBashWriteAccess', () => {
  beforeEach(() => {
    resetFileLockStateForTests()
  })

  test('validates output redirection targets through the coordinator write guard', async () => {
    const result = await validateAsWorker('printf ok > owned.txt', [
      expandPath('owned.txt'),
    ])

    expect(result.result).toBe(true)
  })

  test('rejects output redirection outside owned_files', async () => {
    const result = await validateAsWorker('printf ok > other.txt', [
      expandPath('owned.txt'),
    ])

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected redirection rejection')
    }
    expect(result.message).toContain('not assigned')
  })

  test('rejects heredoc output redirection outside owned_files', async () => {
    const result = await validateAsWorker(
      "cat <<'EOF' > other.txt\ncontent\nEOF",
      [expandPath('owned.txt')],
    )

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected heredoc redirection rejection')
    }
    expect(result.message).toContain('not assigned')
  })

  test('rejects inline interpreter writes that cannot be statically targeted', async () => {
    const result = await validateAsWorker(
      `python -c "open('other.txt', 'w').write('x')"`,
      [expandPath('owned.txt')],
    )

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected inline interpreter rejection')
    }
    expect(result.message).toContain('statically valid target paths')
  })

  test('rejects heredoc-fed interpreter writes that cannot be statically targeted', async () => {
    const result = await validateAsWorker(
      "python - <<'PY'\nopen('other.txt', 'w').write('x')\nPY",
      [expandPath('owned.txt')],
    )

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected heredoc interpreter rejection')
    }
    expect(result.message).toContain('statically valid target paths')
  })

  test('rejects perl inline open writes that cannot be statically targeted', async () => {
    const result = await validateAsWorker(
      `perl -e "open(my $fh, '>', 'other.txt')"`,
      [expandPath('owned.txt')],
    )

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected perl inline write rejection')
    }
    expect(result.message).toContain('statically valid target paths')
  })

  test('allows inline interpreter reads without write patterns', async () => {
    const result = await validateAsWorker(
      `python -c "print(open('other.txt').read())"`,
      [expandPath('owned.txt')],
    )

    expect(result.result).toBe(true)
  })

  test('validates nested shell -c write targets through the coordinator write guard', async () => {
    const result = await validateAsWorker(
      `bash -lc 'printf ok > other.txt'`,
      [expandPath('owned.txt')],
    )

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected nested shell target rejection')
    }
    expect(result.message).toContain('not assigned')
  })

  test('allows nested shell -c writes to assigned files', async () => {
    const result = await validateAsWorker(
      `sh -c 'printf ok > owned.txt'`,
      [expandPath('owned.txt')],
    )

    expect(result.result).toBe(true)
  })

  test('validates tee output targets', async () => {
    const result = await validateAsWorker('printf ok | tee other.txt', [
      expandPath('owned.txt'),
    ])

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected tee target rejection')
    }
    expect(result.message).toContain('not assigned')
  })

  test('does not treat option values as write targets for common write commands', async () => {
    const result = await validateAsWorker('touch -r ref.txt owned.txt', [
      expandPath('owned.txt'),
    ])

    expect(result.result).toBe(true)
  })

  test('validates sed in-place targets without treating expressions as files', async () => {
    const result = await validateAsWorker(`sed -i -e 's/a/b/' owned.txt`, [
      expandPath('owned.txt'),
    ])

    expect(result.result).toBe(true)
  })

  test('allows output redirection to null devices', async () => {
    const result = await validateAsWorker('printf ok > /dev/null', [
      expandPath('owned.txt'),
    ])

    expect(result.result).toBe(true)
  })

  test('rejects relative write targets after directory changes', async () => {
    const result = await validateAsWorker('cd subdir && printf ok > owned.txt', [
      expandPath('subdir/owned.txt'),
    ])

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected directory change rejection')
    }
    expect(result.message).toContain('directory changes')
  })

  test('BashTool.call returns coordinator rejection before shell execution', async () => {
    const { BashTool } = await import('../BashTool.js')

    const result = await runWithAgentContext(
      {
        agentId: 'worker-1',
        agentType: 'subagent',
        ownedFiles: [expandPath('owned.txt')],
      },
      () =>
        (BashTool.call as any)(
          { command: 'printf ok > other.txt' },
          {
            agentId: 'worker-1',
            abortController: new AbortController(),
            getAppState: () => ({}),
            setAppState: () => {},
            setToolJSX: () => {},
          },
        ),
    )

    expect(result.data.stderr).toContain('not assigned')
    expect(result.data.stderr).toContain('Exit code 1')
  })
})
