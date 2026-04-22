import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { cleanupTempDir, createTempDir } from '../../../tests/mocks/file-system'
import {
  releaseSchedulerLock,
  tryAcquireSchedulerLock,
} from '../cronTasksLock'

let tempDir = ''
const originalProjectConfigDirName =
  process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME

beforeEach(async () => {
  tempDir = await createTempDir('cron-lock-')
  delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
})

afterEach(async () => {
  await releaseSchedulerLock({ dir: tempDir, lockIdentity: 'scheduler-test' })
  if (originalProjectConfigDirName === undefined) {
    delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
  } else {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = originalProjectConfigDirName
  }
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('cronTasksLock config paths', () => {
  test('writes the scheduler lock under the custom project config dir', async () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    const acquired = await tryAcquireSchedulerLock({
      dir: tempDir,
      lockIdentity: 'scheduler-test',
    })

    expect(acquired).toBe(true)
    expect(
      existsSync(join(tempDir, '.hare', 'scheduled_tasks.lock')),
    ).toBe(true)

    await releaseSchedulerLock({
      dir: tempDir,
      lockIdentity: 'scheduler-test',
    })

    expect(
      existsSync(join(tempDir, '.hare', 'scheduled_tasks.lock')),
    ).toBe(false)
  })
})
