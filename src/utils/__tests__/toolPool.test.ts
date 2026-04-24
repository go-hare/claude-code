import { describe, expect, test } from 'bun:test'
import { buildTool, getEmptyToolPermissionContext } from '../../Tool.js'
import { assembleToolPool } from '../../runtime/capabilities/tools/ToolPolicy.js'
import { applyCoordinatorToolFilter, mergeAndFilterTools, resolveReplToolState } from '../toolPool.js'

function makeTool(
  name: string,
  overrides: Record<string, unknown> = {},
) {
  return buildTool({
    name,
    inputSchema: { type: 'object' as const } as any,
    maxResultSizeChars: 10_000,
    call: async () => ({ data: 'ok' }),
    description: async () => `${name} description`,
    prompt: async () => `${name} prompt`,
    mapToolResultToToolResultBlockParam: (
      content: unknown,
      toolUseID: string,
    ) => ({
      type: 'tool_result' as const,
      tool_use_id: toolUseID,
      content: String(content),
    }),
    renderToolUseMessage: () => null,
    ...overrides,
  })
}

describe('mergeAndFilterTools', () => {
  test('allows exact duplicate references across merge inputs', () => {
    const shared = makeTool('SharedTool')
    expect(
      mergeAndFilterTools([shared], [shared], getEmptyToolPermissionContext().mode),
    ).toEqual([shared])
  })

  test('keeps the first tool when different implementations share the same primary name', () => {
    const first = makeTool('FileRead')
    const second = makeTool('FileRead', {
      mcpInfo: { serverName: 'docs', toolName: 'search' },
    })

    expect(
      mergeAndFilterTools([first], [second], getEmptyToolPermissionContext().mode),
    ).toEqual([first])
  })
})

describe('applyCoordinatorToolFilter', () => {
  test('keeps coordinator orchestration and task tracking tools', () => {
    const agent = makeTool('Agent')
    const sendMessage = makeTool('SendMessage')
    const taskCreate = makeTool('TaskCreate')
    const taskGet = makeTool('TaskGet')
    const taskList = makeTool('TaskList')
    const taskUpdate = makeTool('TaskUpdate')
    const bash = makeTool('Bash')

    expect(
      applyCoordinatorToolFilter([
        agent,
        sendMessage,
        taskCreate,
        taskGet,
        taskList,
        taskUpdate,
        bash,
      ]).map(tool => tool.name),
    ).toEqual([
      'Agent',
      'SendMessage',
      'TaskCreate',
      'TaskGet',
      'TaskList',
      'TaskUpdate',
    ])
  })
})

describe('assembleToolPool', () => {
  test('keeps the built-in tool when an MCP tool collides with its primary name', () => {
    const conflictingMcpTool = makeTool('Bash', {
      mcpInfo: { serverName: 'docs', toolName: 'search' },
    })

    const tools = assembleToolPool(
      getEmptyToolPermissionContext(),
      [conflictingMcpTool],
    )

    expect(tools.find(tool => tool.name === 'Bash')?.mcpInfo).toBeUndefined()
  })
})

describe('resolveReplToolState', () => {
  test('resolves main-thread tools from the shared REPL assembly path', () => {
    const remoteOnlyTool = makeTool('RemoteOnlyTool')

    const result = resolveReplToolState({
      initialTools: [remoteOnlyTool],
      mcpTools: [],
      toolPermissionContext: getEmptyToolPermissionContext(),
      mainThreadAgentDefinition: {
        tools: ['RemoteOnlyTool'],
        disallowedTools: [],
        source: 'built-in',
        permissionMode: 'default',
      } as any,
    })

    expect(result.tools).toEqual([remoteOnlyTool])
    expect(result.allowedAgentTypes).toBeUndefined()
  })
})
