import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  resetStateForTests,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from 'src/bootstrap/state.js'
import { joinProjectConfigPath } from 'src/utils/configPaths.js'
import { runWithCwdOverride } from 'src/utils/cwd.js'
import { getWorkflowDirPath } from '../constants.js'
import { WorkflowTool } from '../WorkflowTool.js'

let cwd: string
const originalProjectConfigDirName =
  process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME

beforeEach(async () => {
  cwd = join(
    tmpdir(),
    `workflow-tool-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await mkdir(cwd, { recursive: true })
  resetStateForTests()
  setOriginalCwd(cwd)
  setProjectRoot(cwd)
  setCwdState(cwd)
})

afterEach(async () => {
  if (originalProjectConfigDirName === undefined) {
    delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
  } else {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = originalProjectConfigDirName
  }
  resetStateForTests()
  await rm(cwd, { recursive: true, force: true })
})

async function writeWorkflowFixture(filename: string, content: string) {
  const workflowDir = getWorkflowDirPath(cwd)
  await mkdir(workflowDir, { recursive: true })
  await writeFile(join(workflowDir, filename), content)
}

async function callWorkflow(
  input: Parameters<typeof WorkflowTool.call>[0],
) {
  return runWithCwdOverride(cwd, () => WorkflowTool.call(input))
}

describe('WorkflowTool', () => {
  test('starts a workflow run and persists step state in the configured project config dir', async () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    await writeWorkflowFixture(
      'release.md',
      ['# Release', '', '- [ ] Run tests', '- [ ] Build package'].join('\n'),
    )

    const result = await callWorkflow({ workflow: 'release' })

    expect(result.data.output).toContain('Workflow run started')
    expect(result.data.output).toContain('Run tests')
    const match = result.data.output.match(/run_id: ([a-f0-9-]+)/)
    expect(match?.[1]).toBeString()

    const raw = await readFile(
      joinProjectConfigPath(cwd, 'workflow-runs', `${match![1]}.json`),
      'utf-8',
    )
    const run = JSON.parse(raw)
    expect(run.workflow).toBe('release')
    expect(run.status).toBe('running')
    expect(run.steps).toHaveLength(2)
    expect(run.steps[0].status).toBe('running')
    expect(run.steps[1].status).toBe('pending')
  })

  test('advances a workflow run through completion', async () => {
    await writeWorkflowFixture(
      'audit.yaml',
      [
        'steps:',
        '  - name: Inspect',
        '    prompt: Inspect the code',
        '  - name: Verify',
        '    prompt: Run focused tests',
      ].join('\n'),
    )

    const started = await callWorkflow({ workflow: 'audit' })
    const runId = started.data.output.match(/run_id: ([a-f0-9-]+)/)![1]!

    const next = await callWorkflow({
      workflow: 'audit',
      action: 'advance',
      run_id: runId,
    })
    expect(next.data.output).toContain('Next workflow step')
    expect(next.data.output).toContain('Run focused tests')

    const done = await callWorkflow({
      workflow: 'audit',
      action: 'advance',
      run_id: runId,
    })
    expect(done.data.output).toContain('Workflow completed')
  })

  test('lists and cancels workflow runs', async () => {
    await writeWorkflowFixture('cleanup.md', '- Remove stale files')

    const started = await callWorkflow({ workflow: 'cleanup' })
    const runId = started.data.output.match(/run_id: ([a-f0-9-]+)/)![1]!

    const listed = await callWorkflow({
      workflow: 'cleanup',
      action: 'list',
    })
    expect(listed.data.output).toContain(runId)

    const cancelled = await callWorkflow({
      workflow: 'cleanup',
      action: 'cancel',
      run_id: runId,
    })
    expect(cancelled.data.output).toContain('Workflow cancelled')
  })
})
