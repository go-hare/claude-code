import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  createDefaultKernelRuntimeAgentRegistry,
  createDefaultKernelRuntimeTaskRegistry,
} from '../runtimeAgentTaskRegistries.js'

let previousConfigDir: string | undefined
let tempConfigDir: string | undefined

beforeEach(async () => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempConfigDir = await mkdtemp(join(tmpdir(), 'kernel-agent-task-registry-'))
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
})

afterEach(async () => {
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  if (tempConfigDir) {
    await rm(tempConfigDir, { recursive: true, force: true })
  }
})

describe('createDefaultKernelRuntimeAgentRegistry', () => {
  test('persists task execution linkage and owned files for spawned workers', async () => {
    const taskRegistry = createDefaultKernelRuntimeTaskRegistry(undefined)
    const createdTask = await taskRegistry.createTask?.({
      taskListId: 'alpha',
      subject: 'Review',
      description: 'Review code',
      status: 'in_progress',
    })
    const taskId = createdTask?.taskId
    expect(taskId).toBeString()

    const agentRegistry = createDefaultKernelRuntimeAgentRegistry('/tmp', {
      executor: false,
      listAgents: async () => ({
        activeAgents: [
          {
            agentType: 'reviewer',
            whenToUse: 'Review code',
            source: 'projectSettings',
            active: true,
          },
        ],
        allAgents: [
          {
            agentType: 'reviewer',
            whenToUse: 'Review code',
            source: 'projectSettings',
            active: true,
          },
        ],
      }),
    })

    const result = await agentRegistry.spawnAgent!(
      {
        prompt: 'Review the kernel patch',
        agentType: 'reviewer',
        taskId: taskId!,
        taskListId: 'alpha',
        ownedFiles: ['src/kernel/runtimeCoordinator.ts'],
        name: 'worker@1',
        teamName: 'alpha',
      },
      { cwd: '/tmp' },
    )

    expect(result).toMatchObject({
      status: 'accepted',
      taskId,
      taskListId: 'alpha',
      agentId: 'worker-1@alpha',
      run: {
        agentId: 'worker-1@alpha',
      },
    })

    const task = await taskRegistry.getTask?.(taskId!, 'alpha')
    expect(task).toMatchObject({
      id: taskId,
      ownedFiles: ['src/kernel/runtimeCoordinator.ts'],
      execution: {
        linkedBackgroundTaskId: result.runId,
        linkedBackgroundTaskType: 'agent_run',
        linkedAgentId: 'worker-1@alpha',
      },
    })
  })
})
