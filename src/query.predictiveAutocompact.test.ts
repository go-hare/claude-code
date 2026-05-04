import { afterEach, describe, expect, mock, test } from 'bun:test'
import { z } from 'zod/v4'

const autocompactSpy = mock(async () => ({
  compactionResult: undefined,
  consecutiveFailures: 0,
}) as any)
const originalAutoCompactWindow = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
const originalBlockingLimit = process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE

const { buildTool, getEmptyToolPermissionContext } = await import('./Tool.js')
const { query } = await import('./query.js')
const { getDefaultAppState } = await import('./state/AppStateStore.js')
const {
  createAssistantMessage,
  createUserMessage,
} = await import('./utils/messages.js')
const { asSystemPrompt } = await import('./utils/systemPromptType.js')
const {
  createFileStateCacheWithSizeLimit,
} = await import('./utils/fileStateCache.js')

function makeMinimalToolDef(overrides: Record<string, unknown> = {}) {
  return {
    name: 'TestTool',
    inputSchema: z.object({}),
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

function createMainThreadToolUseContext() {
  let appState = getDefaultAppState()
  appState.toolPermissionContext = getEmptyToolPermissionContext()
  return {
    abortController: new AbortController(),
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'sonnet',
      tools: [buildTool(makeMinimalToolDef())],
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
    setAppState: (updater: any) => {
      appState = updater(appState)
    },
    messages: [],
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
  }
}

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

afterEach(() => {
  autocompactSpy.mockClear()
  if (originalAutoCompactWindow === undefined) {
    delete process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
  } else {
    process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = originalAutoCompactWindow
  }
  if (originalBlockingLimit === undefined) {
    delete process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE
  } else {
    process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE = originalBlockingLimit
  }
})

describe('query predictive autocompact', () => {
  test('runs autocompact before model call when turn is projected to overflow', async () => {
    process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '26000'
    process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE = '1000000'

    const stream = query({
      messages: [createUserMessage({ content: 'x'.repeat(12_000) })],
      systemPrompt: asSystemPrompt(['system']),
      userContext: {},
      systemContext: {},
      canUseTool: async (_tool, input) => ({
        behavior: 'allow',
        updatedInput: input,
      }),
      toolUseContext: createMainThreadToolUseContext() as any,
      querySource: 'sdk',
      deps: {
        uuid: () => 'query-id',
        microcompact: async (messages: any) => ({ messages }),
        autocompact: autocompactSpy,
        callModel: async function* () {
          yield createAssistantMessage({ content: 'done' })
        },
      } as any,
    })

    await expect(collectQueryTerminal(stream as any)).resolves.toMatchObject({
      reason: 'completed',
    })

    expect(autocompactSpy).toHaveBeenCalledTimes(2)
    const predictiveCall = autocompactSpy.mock.calls[1] as
      | unknown[]
      | undefined
    expect(predictiveCall).toBeDefined()
    expect(predictiveCall?.[0]).toEqual(expect.any(Array))
    expect(predictiveCall?.[1]).toEqual(expect.any(Object))
    expect(predictiveCall?.[2]).toEqual(
      expect.objectContaining({
        toolUseContext: expect.any(Object),
      }),
    )
    expect(predictiveCall?.[3]).toBe('sdk')
    expect(predictiveCall?.[5]).toBe(0)
  })
})
