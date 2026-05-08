import { describe, expect, test } from 'bun:test'
import { Readable } from 'stream'

import type {
  RuntimeCommandExecutionResult,
  RuntimeCommandGraphEntry,
} from '../../runtime/contracts/command.js'
import type {
  RuntimeMcpLifecycleResult,
  RuntimeMcpResourceRef,
  RuntimeMcpServerRef,
  RuntimeMcpToolBinding,
} from '../../runtime/contracts/mcp.js'
import type {
  RuntimeToolCallResult,
  RuntimeToolDescriptor,
} from '../../runtime/contracts/tool.js'
import { RuntimeEventBus } from '../../runtime/core/events/RuntimeEventBus.js'
import type {
  RuntimeAgentRegistrySnapshot,
  RuntimeAgentRunCancelRequest,
  RuntimeAgentRunCancelResult,
  RuntimeAgentRunDescriptor,
  RuntimeAgentRunListSnapshot,
  RuntimeAgentRunOutput,
  RuntimeAgentRunOutputRequest,
  RuntimeAgentSpawnRequest,
  RuntimeAgentSpawnResult,
} from '../../runtime/contracts/agent.js'
import type {
  RuntimeTaskAssignRequest,
  RuntimeTaskCreateRequest,
  RuntimeTaskDescriptor,
  RuntimeTaskListSnapshot,
  RuntimeTaskMutationResult,
  RuntimeTaskUpdateRequest,
} from '../../runtime/contracts/task.js'
import type {
  RuntimeTeamCreateRequest,
  RuntimeTeamCreateResult,
  RuntimeTeamDestroyRequest,
  RuntimeTeamDestroyResult,
  RuntimeTeamDescriptor,
  RuntimeTeamListSnapshot,
  RuntimeTeamMessageRequest,
  RuntimeTeamMessageResult,
} from '../../runtime/contracts/team.js'
import type { KernelContextSnapshot } from '../context.js'
import { runKernelRuntimeJsonRpcLiteProtocol } from '../jsonRpcLiteProtocol.js'
import type {
  KernelMemoryDescriptor,
  KernelMemoryDocument,
} from '../memory.js'

describe('runKernelRuntimeJsonRpcLiteProtocol', () => {
  test('rejects legacy top-level fields instead of accepting old wire messages', async () => {
    const output = createOutputCollector()

    await runKernelRuntimeJsonRpcLiteProtocol({
      input: Readable.from([
        `${JSON.stringify({
          id: 'legacy-1',
          method: 'runtime.ping',
          schemaVersion: 'kernel.runtime.command.v1',
        })}\n`,
      ]),
      output,
      commandCatalog: createCommandCatalog(),
      eventJournalPath: false,
      conversationJournalPath: false,
    })

    expect(output.messages).toHaveLength(1)
    expect(output.messages[0]).toMatchObject({
      id: 'legacy-1',
      error: {
        code: 'invalid_request',
      },
    })
  })

  test('lists, describes, and executes graph commands without raw string escape hatches', async () => {
    const output = createOutputCollector()

    await runKernelRuntimeJsonRpcLiteProtocol({
      input: Readable.from([
        `${JSON.stringify({
          id: 'list-1',
          method: 'commands.list',
        })}\n`,
        `${JSON.stringify({
          id: 'describe-1',
          method: 'commands.describe',
          params: { commandId: 'poor.toggle' },
        })}\n`,
        `${JSON.stringify({
          id: 'execute-1',
          method: 'commands.execute',
          params: {
            commandId: 'poor.toggle',
            arguments: { args: '--enabled true' },
          },
        })}\n`,
        `${JSON.stringify({
          id: 'bad-execute-1',
          method: 'commands.execute',
          params: {
            command: 'poor.toggle --enabled true',
          },
        })}\n`,
      ]),
      output,
      commandCatalog: createCommandCatalog(),
      eventJournalPath: false,
      conversationJournalPath: false,
    })

    const [list, describeCommand, execute, badExecute] = output.messages
    expect(list.result).toMatchObject({
      commands: expect.arrayContaining([
        expect.objectContaining({
          commandId: 'poor.toggle',
          source: 'unit-test',
        }),
        expect.objectContaining({
          commandId: 'turn.run',
          source: 'typed-core',
        }),
      ]),
    })
    expect(describeCommand.result).toMatchObject({
      commandId: 'poor.toggle',
      aliases: ['poor'],
      summary: 'Toggle poor mode',
    })
    expect(execute.result).toMatchObject({
      name: 'poor.toggle',
      result: {
        type: 'text',
        text: 'ran: --enabled true',
      },
    })
    expect(badExecute.error).toMatchObject({
      code: 'invalid_params',
    })
  })

  test('projects subscribed runtime events as event notifications', async () => {
    const output = createOutputCollector()
    const eventBus = new RuntimeEventBus({
      runtimeId: 'runtime-test',
    })

    await runKernelRuntimeJsonRpcLiteProtocol({
      input: Readable.from([
        `${JSON.stringify({
          id: 'sub-1',
          method: 'events.subscribe',
          params: {
            filter: {
              types: ['commands.executed'],
            },
          },
        })}\n`,
        `${JSON.stringify({
          id: 'execute-1',
          method: 'commands.execute',
          params: {
            commandId: 'poor.toggle',
            arguments: '--status',
          },
        })}\n`,
      ]),
      output,
      eventBus,
      commandCatalog: createCommandCatalog(),
      eventJournalPath: false,
      conversationJournalPath: false,
    })

    const eventMessage = output.messages.find(
      message => message.method === 'event',
    )
    expect(eventMessage).toMatchObject({
      method: 'event',
      params: {
        eventId: expect.any(String),
        sequence: expect.any(Number),
        sessionId: null,
        turnId: null,
        type: 'commands.executed',
        payload: {
          name: 'poor.toggle',
        },
      },
    })
  })

  test('serves tools through core service without old wire commands', async () => {
    const output = createOutputCollector()
    const eventBus = new RuntimeEventBus({
      runtimeId: 'runtime-test',
    })

    await runKernelRuntimeJsonRpcLiteProtocol({
      input: Readable.from([
        `${JSON.stringify({
          id: 'tools-list-1',
          method: 'tools.list',
        })}\n`,
        `${JSON.stringify({
          id: 'tools-describe-1',
          method: 'tools.describe',
          params: { toolName: 'EchoTool' },
        })}\n`,
        `${JSON.stringify({
          id: 'sub-1',
          method: 'events.subscribe',
          params: {
            filter: {
              types: ['tools.called'],
            },
          },
        })}\n`,
        `${JSON.stringify({
          id: 'tools-call-1',
          method: 'tools.call',
          params: {
            toolName: 'EchoTool',
            input: { text: 'hi' },
          },
        })}\n`,
      ]),
      output,
      eventBus,
      commandCatalog: createCommandCatalog(),
      toolCatalog: createToolCatalog(),
      eventJournalPath: false,
      conversationJournalPath: false,
    })

    expect(output.messages[0]).toMatchObject({
      id: 'tools-list-1',
      result: {
        tools: [
          expect.objectContaining({
            name: 'EchoTool',
          }),
        ],
      },
    })
    expect(output.messages[1]).toMatchObject({
      id: 'tools-describe-1',
      result: {
        tool: expect.objectContaining({
          name: 'EchoTool',
        }),
      },
    })
    expect(output.messages.find(message => message.id === 'tools-call-1'))
      .toMatchObject({
        result: {
          toolName: 'EchoTool',
          output: { text: 'hi' },
        },
      })
    expect(output.messages.find(message => message.method === 'event'))
      .toMatchObject({
        method: 'event',
        params: {
          type: 'tools.called',
          payload: {
            toolName: 'EchoTool',
          },
        },
      })
  })

  test('serves MCP methods through core service', async () => {
    const output = createOutputCollector()

    await runKernelRuntimeJsonRpcLiteProtocol({
      input: Readable.from([
        `${JSON.stringify({
          id: 'mcp-servers-1',
          method: 'mcp.servers.list',
        })}\n`,
        `${JSON.stringify({
          id: 'mcp-tools-1',
          method: 'mcp.tools.list',
          params: { serverName: 'local' },
        })}\n`,
        `${JSON.stringify({
          id: 'mcp-resources-1',
          method: 'mcp.resources.list',
          params: { serverName: 'local' },
        })}\n`,
        `${JSON.stringify({
          id: 'mcp-connect-1',
          method: 'mcp.connect',
          params: { serverName: 'local' },
        })}\n`,
      ]),
      output,
      commandCatalog: createCommandCatalog(),
      mcpRegistry: createMcpRegistry(),
      eventJournalPath: false,
      conversationJournalPath: false,
    })

    expect(output.messages[0]).toMatchObject({
      result: {
        servers: [
          {
            name: 'local',
            state: 'connected',
          },
        ],
      },
    })
    expect(output.messages[1]).toMatchObject({
      result: {
        tools: [
          {
            server: 'local',
            runtimeToolName: 'mcp__local__echo',
          },
        ],
      },
    })
    expect(output.messages[2]).toMatchObject({
      result: {
        resources: [
          {
            server: 'local',
            uri: 'file:///tmp/a.txt',
          },
        ],
      },
    })
    expect(output.messages[3]).toMatchObject({
      result: {
        serverName: 'local',
        state: 'connected',
      },
    })
  })

  test('serves context and memory methods through core services', async () => {
    const output = createOutputCollector()

    await runKernelRuntimeJsonRpcLiteProtocol({
      input: Readable.from([
        `${JSON.stringify({
          id: 'context-read-1',
          method: 'context.read',
        })}\n`,
        `${JSON.stringify({
          id: 'context-git-1',
          method: 'context.gitStatus',
        })}\n`,
        `${JSON.stringify({
          id: 'memory-list-1',
          method: 'memory.list',
        })}\n`,
        `${JSON.stringify({
          id: 'memory-read-1',
          method: 'memory.read',
          params: { id: 'mem-1' },
        })}\n`,
        `${JSON.stringify({
          id: 'memory-update-1',
          method: 'memory.update',
          params: { id: 'mem-1', content: 'new' },
        })}\n`,
      ]),
      output,
      commandCatalog: createCommandCatalog(),
      contextManager: createContextManager(),
      memoryManager: createMemoryManager(),
      eventJournalPath: false,
      conversationJournalPath: false,
    })

    expect(output.messages[0]).toMatchObject({
      id: 'context-read-1',
      result: {
        system: {
          os: 'test',
        },
        user: {
          cwd: 'D:\\work\\test',
        },
      },
    })
    expect(output.messages[1]).toMatchObject({
      id: 'context-git-1',
      result: {
        gitStatus: 'clean',
      },
    })
    expect(output.messages[2]).toMatchObject({
      id: 'memory-list-1',
      result: {
        memories: [
          {
            id: 'mem-1',
            path: 'mem-1',
            source: 'project',
            bytes: 3,
          },
        ],
      },
    })
    expect(output.messages[3]).toMatchObject({
      id: 'memory-read-1',
      result: {
        memory: {
          id: 'mem-1',
          content: 'old',
        },
      },
    })
    expect(output.messages[4]).toMatchObject({
      id: 'memory-update-1',
      result: {
        memory: {
          id: 'mem-1',
          content: 'new',
        },
      },
    })
  })

  test('serves agents, tasks, and teams through core services', async () => {
    const output = createOutputCollector()
    const eventBus = new RuntimeEventBus({
      runtimeId: 'runtime-test',
    })

    await runKernelRuntimeJsonRpcLiteProtocol({
      input: Readable.from([
        `${JSON.stringify({
          id: 'sub-1',
          method: 'events.subscribe',
          params: {
            filter: {
              types: [
                'agents.spawned',
                'tasks.created',
                'tasks.updated',
                'tasks.assigned',
                'teams.created',
                'teams.message.sent',
                'teams.destroyed',
              ],
            },
          },
        })}\n`,
        `${JSON.stringify({ id: 'agents-list-1', method: 'agents.list' })}\n`,
        `${JSON.stringify({
          id: 'agents-spawn-1',
          method: 'agents.spawn',
          params: { agentType: 'general-purpose', prompt: 'do it' },
        })}\n`,
        `${JSON.stringify({
          id: 'agents-runs-1',
          method: 'agents.runs.list',
        })}\n`,
        `${JSON.stringify({
          id: 'agents-run-1',
          method: 'agents.runs.get',
          params: { runId: 'run-1' },
        })}\n`,
        `${JSON.stringify({
          id: 'agents-output-1',
          method: 'agents.output.get',
          params: { runId: 'run-1', tailBytes: 10 },
        })}\n`,
        `${JSON.stringify({
          id: 'agents-cancel-1',
          method: 'agents.runs.cancel',
          params: { runId: 'run-1', reason: 'stop' },
        })}\n`,
        `${JSON.stringify({
          id: 'tasks-list-1',
          method: 'tasks.list',
          params: { taskListId: 'tl-1' },
        })}\n`,
        `${JSON.stringify({
          id: 'tasks-create-1',
          method: 'tasks.create',
          params: {
            taskListId: 'tl-1',
            subject: 'Build core',
            description: 'Wire task core',
          },
        })}\n`,
        `${JSON.stringify({
          id: 'tasks-update-1',
          method: 'tasks.update',
          params: { taskId: 'task-1', status: 'in_progress' },
        })}\n`,
        `${JSON.stringify({
          id: 'tasks-assign-1',
          method: 'tasks.assign',
          params: { taskId: 'task-1', owner: 'worker' },
        })}\n`,
        `${JSON.stringify({ id: 'teams-list-1', method: 'teams.list' })}\n`,
        `${JSON.stringify({
          id: 'teams-create-1',
          method: 'teams.create',
          params: { teamName: 'alpha' },
        })}\n`,
        `${JSON.stringify({
          id: 'teams-message-1',
          method: 'teams.message',
          params: {
            teamName: 'alpha',
            recipient: '*',
            message: 'hello',
          },
        })}\n`,
        `${JSON.stringify({
          id: 'teams-destroy-1',
          method: 'teams.destroy',
          params: { teamName: 'alpha', force: true },
        })}\n`,
      ]),
      output,
      eventBus,
      commandCatalog: createCommandCatalog(),
      agentRegistry: createAgentRegistry(),
      taskRegistry: createTaskRegistry(),
      teamRegistry: createTeamRegistry(),
      eventJournalPath: false,
      conversationJournalPath: false,
    })

    expect(output.messages.find(message => message.id === 'agents-list-1'))
      .toMatchObject({
        result: {
          activeAgents: [
            {
              agentType: 'general-purpose',
            },
          ],
        },
      })
    expect(output.messages.find(message => message.id === 'agents-spawn-1'))
      .toMatchObject({
        result: {
          status: 'accepted',
          runId: 'run-1',
        },
      })
    expect(output.messages.find(message => message.id === 'agents-run-1'))
      .toMatchObject({
        result: {
          run: {
            runId: 'run-1',
          },
        },
      })
    expect(output.messages.find(message => message.id === 'agents-output-1'))
      .toMatchObject({
        result: {
          runId: 'run-1',
          output: 'ok',
        },
      })
    expect(output.messages.find(message => message.id === 'tasks-create-1'))
      .toMatchObject({
        result: {
          taskId: 'task-1',
          created: true,
        },
      })
    expect(output.messages.find(message => message.id === 'tasks-assign-1'))
      .toMatchObject({
        result: {
          assigned: true,
        },
      })
    expect(output.messages.find(message => message.id === 'teams-create-1'))
      .toMatchObject({
        result: {
          created: true,
          team: {
            teamName: 'alpha',
          },
        },
      })
    expect(output.messages.find(message => message.id === 'teams-destroy-1'))
      .toMatchObject({
        result: {
          success: true,
          teamName: 'alpha',
        },
      })
    expect(
      output.messages
        .filter(message => message.method === 'event')
        .map(message => (message.params as { type?: string }).type),
    ).toEqual(
      expect.arrayContaining([
        'agents.spawned',
        'tasks.created',
        'tasks.updated',
        'tasks.assigned',
        'teams.created',
        'teams.message.sent',
        'teams.destroyed',
      ]),
    )
  })
})

function createOutputCollector(): {
  messages: Array<Record<string, unknown>>
  write(chunk: string): boolean
} {
  const messages: Array<Record<string, unknown>> = []
  return {
    messages,
    write(chunk: string) {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) {
          continue
        }
        messages.push(JSON.parse(line) as Record<string, unknown>)
      }
      return true
    },
  }
}

function createCommandCatalog(): {
  listCommands(): Promise<readonly RuntimeCommandGraphEntry[]>
  executeCommand(request: {
    name: string
    args?: string
  }): Promise<RuntimeCommandExecutionResult>
} {
  return {
    async listCommands() {
      return [
        {
          descriptor: {
            name: 'poor.toggle',
            description: 'Toggle poor mode',
            kind: 'local',
            aliases: ['poor'],
            argumentHint: '--enabled true',
          },
          source: 'unit-test',
          supportsNonInteractive: true,
          modelInvocable: true,
        },
      ]
    },
    async executeCommand(request) {
      return {
        name: request.name,
        result: {
          type: 'text',
          text: `ran: ${request.args ?? ''}`.trim(),
        },
      }
    },
  }
}

function createToolCatalog(): {
  listTools(): Promise<readonly RuntimeToolDescriptor[]>
  callTool(request: {
    toolName: string
    input?: unknown
  }): Promise<RuntimeToolCallResult>
} {
  return {
    async listTools() {
      return [
        {
          name: 'EchoTool',
          description: 'Echo input',
          source: 'builtin',
          safety: 'read',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string' },
            },
          },
        },
      ]
    },
    async callTool(request) {
      return {
        toolName: request.toolName,
        output: request.input,
      }
    },
  }
}

function createMcpRegistry(): {
  listServers(): Promise<readonly RuntimeMcpServerRef[]>
  listToolBindings(): Promise<readonly RuntimeMcpToolBinding[]>
  listResources(): Promise<readonly RuntimeMcpResourceRef[]>
  connectServer(request: {
    serverName: string
  }): Promise<RuntimeMcpLifecycleResult>
} {
  return {
    async listServers() {
      return [
        {
          name: 'local',
          transport: 'stdio',
          state: 'connected',
        },
      ]
    },
    async listToolBindings() {
      return [
        {
          server: 'local',
          serverToolName: 'echo',
          runtimeToolName: 'mcp__local__echo',
        },
      ]
    },
    async listResources() {
      return [
        {
          server: 'local',
          uri: 'file:///tmp/a.txt',
        },
      ]
    },
    async connectServer(request) {
      return {
        serverName: request.serverName,
        state: 'connected',
      }
    },
  }
}

function createContextManager(): {
  read(): Promise<KernelContextSnapshot>
  getSystem(): Promise<Record<string, string>>
  getUser(): Promise<Record<string, string>>
  getGitStatus(): Promise<string | null>
  getSystemPromptInjection(): string | null
  setSystemPromptInjection(value: string | null): void
} {
  let injection: string | null = null
  const system = {
    os: 'test',
  }
  const user = {
    cwd: 'D:\\work\\test',
  }
  return {
    async read() {
      return { system, user }
    },
    async getSystem() {
      return system
    },
    async getUser() {
      return user
    },
    async getGitStatus() {
      return 'clean'
    },
    getSystemPromptInjection() {
      return injection
    },
    setSystemPromptInjection(value) {
      injection = value
    },
  }
}

function createMemoryManager(): {
  list(): Promise<readonly KernelMemoryDescriptor[]>
  read(id: string): Promise<KernelMemoryDocument>
  update(request: {
    id: string
    content: string
  }): Promise<KernelMemoryDocument>
} {
  let content = 'old'
  const descriptor = {
    id: 'mem-1',
    path: 'mem-1',
    source: 'project' as const,
    bytes: 3,
  }
  return {
    async list() {
      return [descriptor]
    },
    async read(id) {
      return {
        ...descriptor,
        id,
        path: id,
        content,
      }
    },
    async update(request) {
      content = request.content
      return {
        ...descriptor,
        id: request.id,
        path: request.id,
        content,
      }
    },
  }
}

function createAgentRegistry(): {
  listAgents(): Promise<RuntimeAgentRegistrySnapshot>
  spawnAgent(request: RuntimeAgentSpawnRequest): Promise<RuntimeAgentSpawnResult>
  listAgentRuns(): Promise<RuntimeAgentRunListSnapshot>
  getAgentRun(runId: string): Promise<RuntimeAgentRunDescriptor | null>
  getAgentOutput(
    request: RuntimeAgentRunOutputRequest,
  ): Promise<RuntimeAgentRunOutput>
  cancelAgentRun(
    request: RuntimeAgentRunCancelRequest,
  ): Promise<RuntimeAgentRunCancelResult>
} {
  const run = createAgentRun('run-1')
  return {
    async listAgents() {
      return {
        activeAgents: [
          {
            agentType: 'general-purpose',
            whenToUse: 'Always',
            source: 'built-in',
            active: true,
          },
        ],
        allAgents: [
          {
            agentType: 'general-purpose',
            whenToUse: 'Always',
            source: 'built-in',
            active: true,
          },
        ],
      }
    },
    async spawnAgent(request) {
      return {
        status: 'accepted',
        prompt: request.prompt,
        runId: run.runId,
        agentType: request.agentType,
        run,
      }
    },
    async listAgentRuns() {
      return { runs: [run] }
    },
    async getAgentRun(runId) {
      return runId === run.runId ? run : null
    },
    async getAgentOutput(request) {
      return {
        runId: request.runId,
        available: true,
        status: 'running',
        output: 'ok',
      }
    },
    async cancelAgentRun(request) {
      return {
        runId: request.runId,
        cancelled: true,
        status: 'cancelled',
        reason: request.reason,
        run: {
          ...run,
          status: 'cancelled',
          cancelReason: request.reason,
        },
      }
    },
  }
}

function createTaskRegistry(): {
  listTasks(taskListId?: string): Promise<RuntimeTaskListSnapshot>
  getTask(
    taskId: string,
    taskListId?: string,
  ): Promise<RuntimeTaskDescriptor | null>
  createTask(
    request: RuntimeTaskCreateRequest,
  ): Promise<RuntimeTaskMutationResult>
  updateTask(
    request: RuntimeTaskUpdateRequest,
  ): Promise<RuntimeTaskMutationResult>
  assignTask(
    request: RuntimeTaskAssignRequest,
  ): Promise<RuntimeTaskMutationResult>
} {
  const task = createTask('task-1', 'tl-1')
  return {
    async listTasks(taskListId = 'tl-1') {
      return {
        taskListId,
        tasks: [task],
      }
    },
    async getTask(taskId) {
      return taskId === task.id ? task : null
    },
    async createTask(request) {
      const created = createTask('task-1', request.taskListId ?? 'tl-1')
      return {
        task: created,
        taskListId: created.taskListId,
        taskId: created.id,
        updatedFields: ['subject', 'description'],
        created: true,
      }
    },
    async updateTask(request) {
      return {
        task: {
          ...task,
          status: request.status ?? task.status,
        },
        taskListId: request.taskListId ?? task.taskListId,
        taskId: request.taskId,
        updatedFields: ['status'],
      }
    },
    async assignTask(request) {
      return {
        task: {
          ...task,
          owner: request.owner,
        },
        taskListId: request.taskListId ?? task.taskListId,
        taskId: request.taskId,
        updatedFields: ['owner'],
        assigned: true,
      }
    },
  }
}

function createTeamRegistry(): {
  listTeams(): Promise<RuntimeTeamListSnapshot>
  getTeam(teamName: string): Promise<RuntimeTeamDescriptor | null>
  createTeam(request: RuntimeTeamCreateRequest): Promise<RuntimeTeamCreateResult>
  sendMessage(
    request: RuntimeTeamMessageRequest,
  ): Promise<RuntimeTeamMessageResult>
  destroyTeam(
    request: RuntimeTeamDestroyRequest,
  ): Promise<RuntimeTeamDestroyResult>
} {
  const team = createTeam('alpha')
  return {
    async listTeams() {
      return { teams: [team] }
    },
    async getTeam(teamName) {
      return teamName === team.teamName ? team : null
    },
    async createTeam(request) {
      return {
        created: true,
        team: createTeam(request.teamName),
      }
    },
    async sendMessage(request) {
      return {
        success: true,
        teamName: request.teamName,
        recipients: ['worker'],
        message: 'sent',
      }
    },
    async destroyTeam(request) {
      return {
        success: true,
        teamName: request.teamName,
        message: 'destroyed',
      }
    },
  }
}

function createAgentRun(runId: string): RuntimeAgentRunDescriptor {
  return {
    runId,
    status: 'running',
    prompt: 'do it',
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:00:00.000Z',
    agentType: 'general-purpose',
  }
}

function createTask(
  id: string,
  taskListId: string,
): RuntimeTaskDescriptor {
  return {
    id,
    taskListId,
    subject: 'Build core',
    description: 'Wire task core',
    status: 'pending',
    blocks: [],
    blockedBy: [],
  }
}

function createTeam(teamName: string): RuntimeTeamDescriptor {
  return {
    teamName,
    taskListId: 'tl-1',
    teamFilePath: `teams/${teamName}.json`,
    createdAt: 1,
    leadAgentId: 'lead-alpha',
    memberCount: 1,
    activeMemberCount: 1,
    members: [
      {
        agentId: 'lead-alpha',
        name: 'lead',
        joinedAt: 1,
        cwd: 'D:\\work\\test',
      },
    ],
  }
}
