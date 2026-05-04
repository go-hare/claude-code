import { afterEach, describe, expect, test } from 'bun:test'
import { buildTool, getEmptyToolPermissionContext, type ToolUseContext } from '../Tool.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { QueryDeps } from '../query/deps.js'
import { query } from '../query.js'
import { getDefaultAppState } from '../state/AppStateStore.js'
import { asAgentId } from '../types/ids.js'
import {
  resetCommandQueue,
} from '../utils/messageQueueManager.js'
import {
  createAssistantMessage,
  createAssistantAPIErrorMessage,
  createUserMessage,
} from '../utils/messages.js'
import { asSystemPrompt } from '../utils/systemPromptType.js'
import { createFileStateCacheWithSizeLimit } from '../utils/fileStateCache.js'

function makeMinimalToolDef(overrides: Record<string, unknown> = {}) {
  return {
    name: 'TestTool',
    inputSchema: { type: 'object' as const } as any,
    maxResultSizeChars: 10_000,
    call: async () => ({ data: 'ok' }),
    description: async () => 'A test tool',
    prompt: async () => 'test prompt',
    mapToolResultToToolResultBlockParam: (
      content: unknown,
      toolUseID: string,
    ) => ({
      type: 'tool_result' as const,
      tool_use_id: toolUseID,
      content: String(content),
    }),
    renderToolUseMessage: () => null,
    renderToolResultMessage: () => null,
    renderToolUseProgressMessage: () => null,
    renderToolUseRejectedMessage: () => null,
    renderToolUseErrorMessage: () => null,
    ...overrides,
  }
}

function createTestToolUseContext(
  tools: ReturnType<typeof buildTool>[],
  appState = getDefaultAppState(),
): ToolUseContext {
  appState.toolPermissionContext = getEmptyToolPermissionContext()
  return {
    abortController: new AbortController(),
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'sonnet',
      tools,
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        allAgents: [],
        allowedAgentTypes: undefined,
      } as any,
    },
    readFileState: createFileStateCacheWithSizeLimit(10),
    getAppState: () => appState,
    setAppState: updater => {
      appState = updater(appState)
    },
    messages: [],
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    agentId: asAgentId('agent-before'),
  }
}

const allowTool: CanUseToolFn = async (_tool, input) => ({
  behavior: 'allow',
  updatedInput: input,
})

const passthroughMicrocompact: QueryDeps['microcompact'] = async messages => ({
  messages,
})

afterEach(() => {
  resetCommandQueue()
})

async function collectQueryTerminal(
  stream: AsyncGenerator<unknown, unknown>,
): Promise<unknown> {
  while (true) {
    const next = await stream.next()
    if (next.done) {
      return next.value
    }
  }
}

describe('query post-tool context', () => {
  test('uses updated tool context for post-tool abort handling', async () => {
    const abortedController = new AbortController()
    abortedController.abort('stop-now')
    const switchAgentTool = buildTool(
      makeMinimalToolDef({
        name: 'AbortAfterTool',
        call: async () => ({
          data: 'aborted',
          contextModifier: (ctx: ToolUseContext) => ({
            ...ctx,
            abortController: abortedController,
          }),
        }),
      }),
    )

    let callCount = 0
    const events: Array<{ type: string; [key: string]: unknown }> = []
    const toolUseContext = createTestToolUseContext([switchAgentTool])

    const stream = query({
      messages: [createUserMessage({ content: 'run tool' })],
      systemPrompt: asSystemPrompt(['system']),
      userContext: {},
      systemContext: {},
      canUseTool: allowTool,
      toolUseContext,
      querySource: 'agent:test',
      deps: {
        uuid: () => 'query-id',
        microcompact: passthroughMicrocompact,
        autocompact: async () => ({
          wasCompacted: false,
        }),
        callModel: async function* () {
          callCount++
          if (callCount === 1) {
            yield createAssistantMessage({
              content: [
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'AbortAfterTool',
                  input: {},
                } as any,
              ],
            })
            return
          }
          yield createAssistantMessage({ content: 'done' })
        },
      } as QueryDeps,
    })

    for await (const event of stream) {
      if ('type' in event) {
        events.push(event as any)
      }
    }

    expect(callCount).toBe(1)
  })

  test('returns model_error terminal reason for final API errors', async () => {
    const stream = query({
      messages: [createUserMessage({ content: 'run query' })],
      systemPrompt: asSystemPrompt(['system']),
      userContext: {},
      systemContext: {},
      canUseTool: allowTool,
      toolUseContext: createTestToolUseContext([]),
      querySource: 'agent:test',
      deps: {
        uuid: () => 'query-id',
        microcompact: passthroughMicrocompact,
        autocompact: async () => ({
          wasCompacted: false,
        }),
        callModel: async function* () {
          yield createAssistantAPIErrorMessage({
            content: 'Rate limit exceeded',
          })
        },
      } as QueryDeps,
    })

    await expect(collectQueryTerminal(stream as any)).resolves.toMatchObject({
      reason: 'model_error',
      error: 'api_error',
    })
  })
})
