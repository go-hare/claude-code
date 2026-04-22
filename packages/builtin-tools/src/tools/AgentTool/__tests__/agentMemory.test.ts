import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join, sep } from 'node:path'
import {
  resetStateForTests,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from 'src/bootstrap/state.js'
import { cleanupTempDir, createTempDir } from '../../../../../../tests/mocks/file-system'
import { getAgentMemoryDir, isAgentMemoryPath } from '../agentMemory.js'
import { getSnapshotDirForAgent } from '../agentMemorySnapshot.js'

let tempDir = ''
const originalProjectConfigDirName =
  process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME

beforeEach(async () => {
  tempDir = await createTempDir('agent-memory-')
  delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
  resetStateForTests()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
  setCwdState(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  if (originalProjectConfigDirName === undefined) {
    delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
  } else {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = originalProjectConfigDirName
  }
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('agent memory config paths', () => {
  test('uses the default project config dir for project, local, and snapshot memory', () => {
    expect(getAgentMemoryDir('worker', 'project')).toBe(
      join(tempDir, '.claude', 'agent-memory', 'worker') + sep,
    )
    expect(getAgentMemoryDir('worker', 'local')).toBe(
      join(tempDir, '.claude', 'agent-memory-local', 'worker') + sep,
    )
    expect(getSnapshotDirForAgent('worker')).toBe(
      join(tempDir, '.claude', 'agent-memory-snapshots', 'worker'),
    )
  })

  test('honors a custom project config dir name for project-local memory paths', () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    expect(getAgentMemoryDir('worker', 'project')).toBe(
      join(tempDir, '.hare', 'agent-memory', 'worker') + sep,
    )
    expect(getAgentMemoryDir('worker', 'local')).toBe(
      join(tempDir, '.hare', 'agent-memory-local', 'worker') + sep,
    )
    expect(getSnapshotDirForAgent('worker')).toBe(
      join(tempDir, '.hare', 'agent-memory-snapshots', 'worker'),
    )
  })

  test('recognizes custom project config memory paths', () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'

    expect(
      isAgentMemoryPath(
        join(tempDir, '.hare', 'agent-memory', 'worker', 'MEMORY.md'),
      ),
    ).toBe(true)
    expect(
      isAgentMemoryPath(
        join(tempDir, '.hare', 'agent-memory-local', 'worker', 'MEMORY.md'),
      ),
    ).toBe(true)
    expect(
      isAgentMemoryPath(
        join(tempDir, '.claude', 'agent-memory', 'worker', 'MEMORY.md'),
      ),
    ).toBe(false)
  })
})
