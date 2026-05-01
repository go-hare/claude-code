import { describe, expect, test } from 'bun:test'

import type { Tool } from '../../Tool.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'
import { createDefaultKernelRuntimeToolCatalog } from '../wireProtocol.js'

describe('createDefaultKernelRuntimeToolCatalog', () => {
  test('merges shared MCP tools into the default tool catalog and invokes them', async () => {
    const calls: unknown[] = []
    const seenClientNames: string[][] = []
    const mcpClient = {
      name: 'github',
      type: 'connected',
      config: {
        type: 'http',
        url: 'https://example.test/mcp',
        scope: 'project',
      },
      capabilities: { resources: {} },
      client: {} as never,
      cleanup: async () => {},
    } satisfies MCPServerConnection
    const mcpTool = createMcpTool({
      name: 'mcp__github__list_issues',
      serverName: 'github',
      toolName: 'list_issues',
      onCall(input, clientNames) {
        calls.push(input)
        seenClientNames.push(clientNames)
        return { issues: [{ id: 1, title: 'runtime-owned mcp' }] }
      },
    })
    const catalog = createDefaultKernelRuntimeToolCatalog('/tmp', {
      listMcpTools: async () => [mcpTool],
      listMcpClients: async () => [mcpClient],
    })

    const tools = await catalog.listTools()
    expect(
      tools.find(tool => tool.name === 'mcp__github__list_issues'),
    ).toMatchObject({
      name: 'mcp__github__list_issues',
      source: 'mcp',
      isMcp: true,
      provenance: {
        source: 'mcp',
        serverName: 'github',
        toolName: 'list_issues',
      },
    })

    const result = await catalog.callTool!(
      {
        toolName: 'mcp__github__list_issues',
        input: { state: 'open' },
        permissionMode: 'bypassPermissions',
      },
      { cwd: '/tmp' },
    )

    expect(result).toMatchObject({
      toolName: 'mcp__github__list_issues',
      output: {
        issues: [{ id: 1, title: 'runtime-owned mcp' }],
      },
    })
    expect(calls).toEqual([{ state: 'open' }])
    expect(seenClientNames).toEqual([['github']])
  })
})

function createMcpTool(options: {
  name: string
  serverName: string
  toolName: string
  onCall(input: unknown, clientNames: string[]): unknown
}): Tool {
  return {
    name: options.name,
    isMcp: true,
    mcpInfo: {
      serverName: options.serverName,
      toolName: options.toolName,
    },
    maxResultSizeChars: Infinity,
    isEnabled() {
      return true
    },
    isConcurrencySafe() {
      return true
    },
    isReadOnly() {
      return true
    },
    userFacingName() {
      return options.toolName
    },
    async description() {
      return options.toolName
    },
    async prompt() {
      return options.toolName
    },
    inputSchema: {
      safeParse(input: unknown) {
        return { success: true, data: input as Record<string, unknown> }
      },
    },
    async checkPermissions(input: Record<string, unknown>) {
      return { behavior: 'allow', updatedInput: input }
    },
    async call(
      input: Record<string, unknown>,
      context: { options: { mcpClients: Array<{ name: string }> } },
    ) {
      return {
        data: options.onCall(
          input,
          context.options.mcpClients.map(
            (client: { name: string }) => client.name,
          ),
        ),
        newMessages: [],
      }
    },
    toAutoClassifierInput(input: Record<string, unknown>) {
      return input
    },
    mapToolResultToToolResultBlockParam() {
      return {
        type: 'tool_result',
        tool_use_id: 'runtime-owned-mcp',
        content: [{ type: 'text', text: 'ok' }],
      }
    },
  } as unknown as Tool
}
