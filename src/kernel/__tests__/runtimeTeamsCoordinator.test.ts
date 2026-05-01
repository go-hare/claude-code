import { describe, expect, test } from 'bun:test'

import { createKernelRuntime } from '../runtime.js'

describe('kernel team/coordinator facade', () => {
  test('exposes team list/detail and lifecycle helpers through the public runtime', async () => {
    const team = {
      teamName: 'alpha',
      description: 'Alpha team',
      taskListId: 'alpha',
      teamFilePath: '/tmp/alpha/config.json',
      createdAt: 1,
      leadAgentId: 'team-lead@alpha',
      memberCount: 2,
      activeMemberCount: 2,
      members: [
        {
          agentId: 'team-lead@alpha',
          name: 'team-lead',
          joinedAt: 1,
          cwd: '/tmp/alpha',
        },
        {
          agentId: 'worker@alpha',
          name: 'worker',
          joinedAt: 2,
          cwd: '/tmp/alpha',
          isActive: true,
        },
      ],
    }
    const task = {
      id: '1',
      subject: 'Review',
      description: 'Review the patch',
      status: 'in_progress' as const,
      taskListId: 'alpha',
      owner: 'worker',
      blocks: [],
      blockedBy: [],
    }
    const run = {
      runId: 'run-1',
      status: 'running' as const,
      prompt: 'Review the SDK patch',
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
      agentId: 'worker@alpha',
      taskListId: 'alpha',
      teamName: 'alpha',
    }

    const runtime = await createKernelRuntime({
      id: 'runtime-teams-test',
      workspacePath: '/tmp/kernel-runtime-teams-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      capabilityResolver: {
        listDescriptors: () => [
          createCapabilityDescriptor('runtime', 'ready'),
          createCapabilityDescriptor('agents', 'ready'),
          createCapabilityDescriptor('tasks', 'ready'),
          createCapabilityDescriptor('teams', 'ready'),
        ],
        requireCapability: async () => undefined,
        reloadCapabilities: async () => [],
      },
      teamRegistry: {
        async listTeams() {
          return { teams: [team] }
        },
        async getTeam(teamName) {
          return teamName === 'alpha' ? team : null
        },
        async createTeam() {
          return {
            created: true,
            team,
          }
        },
        async sendMessage() {
          return {
            success: true,
            teamName: 'alpha',
            recipients: ['worker'],
            message: 'Message sent to worker',
          }
        },
        async destroyTeam() {
          return {
            success: true,
            teamName: 'alpha',
            message: 'Team destroyed',
          }
        },
      },
      agentRegistry: {
        async listAgents() {
          return {
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
          }
        },
        async listAgentRuns() {
          return { runs: [run] }
        },
      },
      taskRegistry: {
        async listTasks(taskListId) {
          return {
            taskListId: taskListId ?? 'alpha',
            tasks: [task],
          }
        },
        async getTask(taskId) {
          return taskId === '1' ? task : null
        },
      },
    })

    try {
      await runtime.start()

      const listed = await runtime.teams.list()
      expect(listed).toEqual([team])

      const detail = await runtime.teams.get('alpha')
      expect(detail).toMatchObject({
        teamName: 'alpha',
        tasks: [expect.objectContaining({ id: '1' })],
        runs: [expect.objectContaining({ runId: 'run-1' })],
      })

      await runtime.teams.create({
        teamName: 'alpha',
      }).then(result =>
        expect(result).toMatchObject({
          created: true,
          team: { teamName: 'alpha' },
        }),
      )
      await runtime.teams.send({
        teamName: 'alpha',
        recipient: 'worker',
        message: 'Ping',
      }).then(result =>
        expect(result).toMatchObject({
          success: true,
          recipients: ['worker'],
        }),
      )
      await runtime.teams.destroy({
        teamName: 'alpha',
      }).then(result =>
        expect(result).toMatchObject({
          success: true,
          teamName: 'alpha',
        }),
      )
    } finally {
      await runtime.dispose()
    }
  })

  test('exposes coordinator task and worker helpers through the public runtime', async () => {
    const spawnRequests: Array<Record<string, unknown>> = []
    const assignRequests: Array<Record<string, unknown>> = []

    const runtime = await createKernelRuntime({
      id: 'runtime-coordinator-test',
      workspacePath: '/tmp/kernel-runtime-coordinator-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      capabilityResolver: {
        listDescriptors: () => [
          createCapabilityDescriptor('runtime', 'ready'),
          createCapabilityDescriptor('agents', 'ready'),
          createCapabilityDescriptor('tasks', 'ready'),
          createCapabilityDescriptor('coordinator', 'ready'),
        ],
        requireCapability: async () => undefined,
        reloadCapabilities: async () => [],
      },
      agentRegistry: {
        async listAgents() {
          return {
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
          }
        },
        async spawnAgent(request) {
          spawnRequests.push(request as unknown as Record<string, unknown>)
          return {
            status: 'async_launched',
            prompt: request.prompt,
            runId: 'run-2',
            taskId: request.taskId,
            taskListId: request.taskListId,
          }
        },
        async listAgentRuns() {
          return {
            runs: [
              {
                runId: 'run-2',
                status: 'running',
                prompt: 'Review file ownership',
                createdAt: '2026-04-29T00:00:00.000Z',
                updatedAt: '2026-04-29T00:00:00.000Z',
                taskId: '42',
                taskListId: 'alpha',
                runInBackground: true,
              },
            ],
          }
        },
        async getAgentRun(runId) {
          return runId === 'run-2'
            ? {
                runId: 'run-2',
                status: 'running',
                prompt: 'Review file ownership',
                createdAt: '2026-04-29T00:00:00.000Z',
                updatedAt: '2026-04-29T00:00:00.000Z',
                taskId: '42',
                taskListId: 'alpha',
                runInBackground: true,
              }
            : null
        },
        async getAgentOutput() {
          return {
            runId: 'run-2',
            available: true,
            output: 'worker output',
          }
        },
        async cancelAgentRun() {
          return {
            runId: 'run-2',
            cancelled: true,
            status: 'cancelled',
          }
        },
      },
      taskRegistry: {
        async listTasks(taskListId) {
          return {
            taskListId: taskListId ?? 'alpha',
            tasks: [
              {
                id: '42',
                subject: 'Ownership review',
                description: 'Review file ownership',
                status: 'in_progress',
                taskListId: taskListId ?? 'alpha',
                owner: 'reviewer',
                blocks: [],
                blockedBy: [],
                ownedFiles: ['src/kernel/runtimeTeams.ts'],
              },
            ],
          }
        },
        async getTask(taskId) {
          return taskId === '42'
            ? {
                id: '42',
                subject: 'Ownership review',
                description: 'Review file ownership',
                status: 'in_progress',
                taskListId: 'alpha',
                owner: 'reviewer',
                blocks: [],
                blockedBy: [],
                ownedFiles: ['src/kernel/runtimeTeams.ts'],
              }
            : null
        },
        async assignTask(request) {
          assignRequests.push(request as unknown as Record<string, unknown>)
          return {
            task: {
              id: request.taskId,
              subject: 'Ownership review',
              description: 'Review file ownership',
              status: request.status ?? 'in_progress',
              taskListId: request.taskListId ?? 'alpha',
              owner: request.owner,
              blocks: [],
              blockedBy: [],
            },
            taskListId: request.taskListId ?? 'alpha',
            taskId: request.taskId,
            updatedFields: ['owner', 'status'],
            assigned: true,
          }
        },
      },
    })

    try {
      await runtime.start()

      await runtime.coordinator.spawnWorker({
        agentType: 'reviewer',
        prompt: 'Review file ownership',
        taskId: '42',
        taskListId: 'alpha',
      }).then(result =>
        expect(result).toMatchObject({
          status: 'async_launched',
          runId: 'run-2',
        }),
      )
      expect(spawnRequests[0]?.runInBackground).toBe(true)

      await runtime.coordinator.assignTask({
        taskId: '42',
        taskListId: 'alpha',
        owner: 'reviewer',
      }).then(result =>
        expect(result).toMatchObject({
          assigned: true,
          task: { id: '42', owner: 'reviewer' },
        }),
      )
      expect(assignRequests[0]?.owner).toBe('reviewer')

      await runtime.coordinator.listAssignments({
        taskListId: 'alpha',
        owner: 'reviewer',
        hasOwnedFiles: true,
      }).then(tasks =>
        expect(tasks).toEqual([
          expect.objectContaining({
            id: '42',
            owner: 'reviewer',
          }),
        ]),
      )
      await runtime.coordinator.getWorkerRun('run-2').then(run =>
        expect(run).toMatchObject({
          runId: 'run-2',
          status: 'running',
        }),
      )
      await runtime.coordinator.getWorkerOutput('run-2').then(output =>
        expect(output).toMatchObject({
          runId: 'run-2',
          output: 'worker output',
        }),
      )
      await runtime.coordinator.cancelWorker('run-2').then(result =>
        expect(result).toMatchObject({
          runId: 'run-2',
          cancelled: true,
        }),
      )
    } finally {
      await runtime.dispose()
    }
  })

  test('invokes a coordinator assignment as one runtime-owned operation', async () => {
    const createRequests: Array<Record<string, unknown>> = []
    const assignRequests: Array<Record<string, unknown>> = []
    const spawnRequests: Array<Record<string, unknown>> = []
    const updateRequests: Array<Record<string, unknown>> = []

    const runtime = await createKernelRuntime({
      id: 'runtime-coordinator-invoke-test',
      workspacePath: '/tmp/kernel-runtime-coordinator-invoke-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      capabilityResolver: {
        listDescriptors: () => [
          createCapabilityDescriptor('runtime', 'ready'),
          createCapabilityDescriptor('agents', 'ready'),
          createCapabilityDescriptor('tasks', 'ready'),
          createCapabilityDescriptor('coordinator', 'ready'),
        ],
        requireCapability: async () => undefined,
        reloadCapabilities: async () => [],
      },
      agentRegistry: {
        async listAgents() {
          return {
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
          }
        },
        async spawnAgent(request) {
          spawnRequests.push(request as unknown as Record<string, unknown>)
          return {
            status: 'async_launched',
            prompt: request.prompt,
            runId: 'run-3',
            agentId: 'agent-3',
            backgroundTaskId: 'run-3',
            taskId: request.taskId,
            taskListId: request.taskListId,
            run: {
              runId: 'run-3',
              status: 'running',
              prompt: request.prompt,
              createdAt: '2026-04-29T00:00:00.000Z',
              updatedAt: '2026-04-29T00:00:00.000Z',
              agentId: 'agent-3',
            },
          }
        },
      },
      taskRegistry: {
        async listTasks(taskListId) {
          return {
            taskListId: taskListId ?? 'alpha',
            tasks: [],
          }
        },
        async getTask(taskId, taskListId) {
          return {
            id: taskId,
            subject: 'Ownership review',
            description: 'Review file ownership',
            status: 'in_progress',
            taskListId: taskListId ?? 'alpha',
            owner: 'reviewer',
            blocks: [],
            blockedBy: [],
            ownedFiles: ['src/kernel/runtimeCoordinator.ts'],
            execution: {
              linkedBackgroundTaskId: 'run-3',
              linkedBackgroundTaskType: 'agent_run',
              linkedAgentId: 'agent-3',
            },
          }
        },
        async createTask(request) {
          createRequests.push(request as unknown as Record<string, unknown>)
          return {
            task: {
              id: '43',
              subject: request.subject,
              description: request.description,
              status: request.status ?? 'pending',
              taskListId: request.taskListId ?? 'alpha',
              owner: request.owner,
              blocks: [],
              blockedBy: [],
              ownedFiles: request.ownedFiles,
            },
            taskListId: request.taskListId ?? 'alpha',
            taskId: '43',
            updatedFields: ['subject', 'description'],
            created: true,
          }
        },
        async assignTask(request) {
          assignRequests.push(request as unknown as Record<string, unknown>)
          return {
            task: {
              id: request.taskId,
              subject: 'Ownership review',
              description: 'Review file ownership',
              status: request.status ?? 'in_progress',
              taskListId: request.taskListId ?? 'alpha',
              owner: request.owner,
              blocks: [],
              blockedBy: [],
              ownedFiles: request.ownedFiles,
            },
            taskListId: request.taskListId ?? 'alpha',
            taskId: request.taskId,
            updatedFields: ['owner', 'status', 'ownedFiles'],
            assigned: true,
          }
        },
        async updateTask(request) {
          updateRequests.push(request as unknown as Record<string, unknown>)
          return {
            task: {
              id: request.taskId,
              subject: 'Ownership review',
              description: 'Review file ownership',
              status: 'in_progress',
              taskListId: request.taskListId ?? 'alpha',
              owner: 'reviewer',
              blocks: [],
              blockedBy: [],
              ownedFiles: ['src/kernel/runtimeCoordinator.ts'],
              execution: {
                linkedBackgroundTaskId: 'run-3',
                linkedBackgroundTaskType: 'agent_run',
                linkedAgentId: 'agent-3',
              },
            },
            taskListId: request.taskListId ?? 'alpha',
            taskId: request.taskId,
            updatedFields: ['metadata'],
          }
        },
      },
    })

    try {
      await runtime.start()

      const result = await runtime.coordinator.invoke({
        taskListId: 'alpha',
        task: {
          subject: 'Ownership review',
          description: 'Review file ownership',
        },
        owner: 'reviewer',
        status: 'in_progress',
        ownedFiles: ['src/kernel/runtimeCoordinator.ts'],
        worker: {
          agentType: 'reviewer',
          prompt: 'Review file ownership',
        },
      })

      expect(createRequests).toEqual([
        expect.objectContaining({
          taskListId: 'alpha',
          subject: 'Ownership review',
          owner: 'reviewer',
          status: 'in_progress',
          ownedFiles: ['src/kernel/runtimeCoordinator.ts'],
        }),
      ])
      expect(assignRequests).toEqual([
        expect.objectContaining({
          taskId: '43',
          taskListId: 'alpha',
          owner: 'reviewer',
          ownedFiles: ['src/kernel/runtimeCoordinator.ts'],
          status: 'in_progress',
        }),
      ])
      expect(spawnRequests).toEqual([
        expect.objectContaining({
          agentType: 'reviewer',
          prompt: 'Review file ownership',
          taskId: '43',
          taskListId: 'alpha',
          ownedFiles: ['src/kernel/runtimeCoordinator.ts'],
          runInBackground: true,
        }),
      ])
      expect(updateRequests).toEqual([
        expect.objectContaining({
          taskId: '43',
          taskListId: 'alpha',
          metadata: {
            taskExecution: {
              linkedBackgroundTaskId: 'run-3',
              linkedBackgroundTaskType: 'agent_run',
              linkedAgentId: 'agent-3',
            },
          },
        }),
      ])
      expect(result).toMatchObject({
        task: {
          id: '43',
          execution: {
            linkedBackgroundTaskId: 'run-3',
            linkedBackgroundTaskType: 'agent_run',
            linkedAgentId: 'agent-3',
          },
        },
        worker: {
          status: 'async_launched',
          runId: 'run-3',
          taskId: '43',
          taskListId: 'alpha',
        },
        taskResult: {
          created: true,
        },
        assignmentResult: {
          assigned: true,
        },
        linkageResult: {
          updatedFields: ['metadata'],
        },
      })
    } finally {
      await runtime.dispose()
    }
  })
})

function createCapabilityDescriptor(
  name: string,
  status: 'declared' | 'loading' | 'ready' | 'degraded' | 'failed' | 'disabled',
) {
  return {
    name,
    status,
    lazy: true,
    dependencies: [],
    reloadable: true,
  }
}
