import { describe, expect, mock, test } from 'bun:test'
import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { z } from 'zod/v4'

import {
  getEmptyToolPermissionContext,
  type Tool,
  type ToolUseContext,
} from '../../../Tool.js'
import type { AssistantMessage } from '../../../types/message.js'
import { createFileStateCacheWithSizeLimit } from '../../../utils/fileStateCache.js'
import type { KernelCapabilityPlane } from '../../../runtime/contracts/capability.js'
import {
  createKernelCapabilityPlane,
  toolCapabilityName,
} from '../../../runtime/capabilities/CapabilityPlane.js'

function createTool(name: string): {
  tool: Tool
  call: ReturnType<typeof mock>
} {
  const call = mock(async () => ({ data: 'called' }))
  const tool = {
    name,
    inputSchema: z.object({}),
    maxResultSizeChars: 1024,
    isEnabled: () => true,
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    description: async () => name,
    checkPermissions: async () => ({ behavior: 'allow' }),
    call,
  } as unknown as Tool
  return { tool, call }
}

function createAssistantMessage(toolUse: ToolUseBlock): AssistantMessage {
  return {
    type: 'assistant',
    uuid: 'assistant-1',
    requestId: 'request-1',
    message: {
      id: 'message-1',
      type: 'message',
      role: 'assistant',
      content: [toolUse],
      model: 'test-model',
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    },
    timestamp: new Date().toISOString(),
  } as unknown as AssistantMessage
}

function createToolUseContext(
  tool: Tool,
  options: {
    denyByPermissionRules?: boolean
    capabilityPlane?: KernelCapabilityPlane
  } = {},
): ToolUseContext {
  const permissionContext = {
    ...getEmptyToolPermissionContext(),
    alwaysDenyRules: options.denyByPermissionRules
      ? {
          localSettings: [tool.name],
        }
      : {},
  }
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test-model',
      tools: [tool],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [], allAgents: [] },
    },
    abortController: new AbortController(),
    readFileState: createFileStateCacheWithSizeLimit(8),
    getAppState: () => ({
      toolPermissionContext: permissionContext,
    }),
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    capabilityPlane: options.capabilityPlane,
    messages: [],
  } as unknown as ToolUseContext
}

describe('runToolUse capability preflight', () => {
  test('denies execution before canUseTool or tool.call when capability plane rejects the tool', async () => {
    const actualToolExecutionModule =
      '../toolExecution.js?capability-plane-preflight'
    const { runToolUse } = await import(actualToolExecutionModule)
    const { tool, call } = createTool('Bash')
    const toolUse = {
      type: 'tool_use',
      id: 'tool-use-1',
      name: 'Bash',
      input: {},
    } as ToolUseBlock
    const canUseTool = mock(async () => ({ behavior: 'allow' }))

    const updates = []
    for await (const update of runToolUse(
      toolUse,
      createAssistantMessage(toolUse),
      canUseTool as never,
      createToolUseContext(tool, { denyByPermissionRules: true }),
    )) {
      updates.push(update)
    }

    expect(call).not.toHaveBeenCalled()
    expect(canUseTool).not.toHaveBeenCalled()
    expect(updates).toHaveLength(1)
    const content = (updates[0]!.message as any).message.content[0]
    expect(content.is_error).toBe(true)
    expect(content.content).toContain('CapabilityDenied')
    expect(content.content).toContain('permission_deny_rule')
  })

  test('denies execution with the agent capability plane when permission policy allows it', async () => {
    const actualToolExecutionModule =
      '../toolExecution.js?agent-capability-plane-preflight'
    const { runToolUse } = await import(actualToolExecutionModule)
    const { tool, call } = createTool('TaskCreate')
    const capability = toolCapabilityName('TaskCreate')
    const capabilityPlane = createKernelCapabilityPlane({
      runtimeSupports: [capability],
      hostGrants: [capability],
      modePermits: [],
      denies: [
        {
          capability,
          actor: 'mode',
          reason: 'async_agent_not_permitted',
        },
      ],
      metadata: {
        executionMode: 'async_agent',
        inheritanceMode: 'isolated',
      },
    })
    const toolUse = {
      type: 'tool_use',
      id: 'tool-use-2',
      name: 'TaskCreate',
      input: {},
    } as ToolUseBlock
    const canUseTool = mock(async () => ({ behavior: 'allow' }))

    const updates = []
    for await (const update of runToolUse(
      toolUse,
      createAssistantMessage(toolUse),
      canUseTool as never,
      createToolUseContext(tool, { capabilityPlane }),
    )) {
      updates.push(update)
    }

    expect(call).not.toHaveBeenCalled()
    expect(canUseTool).not.toHaveBeenCalled()
    const content = (updates[0]!.message as any).message.content[0]
    expect(content.is_error).toBe(true)
    expect(content.content).toContain('async_agent_not_permitted')
  })
})
