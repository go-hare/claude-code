import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state'
import {
  cleanupTempDir,
  createTempDir,
  writeTempFile,
} from '../../../tests/mocks/file-system'
import { AUTONOMY_DIR, resetAutonomyAuthorityForTests } from '../autonomyAuthority'
import {
  createAutonomyQueuedPrompt,
  listAutonomyRuns,
  markAutonomyRunCompleted,
} from '../autonomyRuns'
import {
  claimConsumableQueuedAutonomyCommands,
  finalizeAutonomyCommandsForTurn,
} from '../autonomyQueueLifecycle'
import { resetCommandQueue } from '../messageQueueManager'
import { join } from 'path'

let tempDir = ''

beforeEach(async () => {
  tempDir = await createTempDir('autonomy-queue-')
  resetStateForTests()
  resetAutonomyAuthorityForTests()
  resetCommandQueue()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
  await writeTempFile(tempDir, join(AUTONOMY_DIR, 'AGENTS.md'), 'authority')
})

afterEach(async () => {
  resetStateForTests()
  resetAutonomyAuthorityForTests()
  resetCommandQueue()
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('autonomyQueueLifecycle', () => {
  test('claims queued autonomy commands and skips stale completed commands', async () => {
    const fresh = await createAutonomyQueuedPrompt({
      basePrompt: 'fresh',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
    })
    const stale = await createAutonomyQueuedPrompt({
      basePrompt: 'stale',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(fresh).not.toBeNull()
    expect(stale).not.toBeNull()

    await markAutonomyRunCompleted(stale!.autonomy!.runId, tempDir, 200)

    const claim = await claimConsumableQueuedAutonomyCommands(
      [fresh!, stale!],
      tempDir,
    )

    expect(claim.attachmentCommands.map(command => command.autonomy?.runId)).toEqual([
      fresh!.autonomy!.runId,
    ])
    expect(claim.staleCommands.map(command => command.autonomy?.runId)).toEqual([
      stale!.autonomy!.runId,
    ])
    expect(claim.claimedCommands).toHaveLength(1)

    const runs = await listAutonomyRuns(tempDir)
    expect(runs.find(run => run.runId === fresh!.autonomy!.runId)).toMatchObject({
      status: 'running',
    })
  })

  test('finalizes claimed commands and advances follow-up flow steps', async () => {
    const command = await createAutonomyQueuedPrompt({
      basePrompt: 'single step',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(command).not.toBeNull()
    await claimConsumableQueuedAutonomyCommands([command!], tempDir)

    const nextCommands = await finalizeAutonomyCommandsForTurn({
      commands: [command!],
      outcome: { type: 'completed' },
      currentDir: tempDir,
      priority: 'later',
    })

    expect(nextCommands).toEqual([])
    const runs = await listAutonomyRuns(tempDir)
    expect(runs.find(run => run.runId === command!.autonomy!.runId)).toMatchObject({
      status: 'completed',
    })
  })
})
