import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test'
import { z } from 'zod/v4'

const claimConsumableQueuedAutonomyCommandsMock = mock(async (commands: any[]) => ({
  attachmentCommands: commands,
  staleCommands: [],
  claimedRunIds: ['run-1'],
  claimedCommands: commands,
}) as any)
const finalizeAutonomyCommandsForTurnMock = mock(async (..._args: any[]) => [] as any)

mock.module('./utils/autonomyQueueLifecycle.js', () => ({
  claimConsumableQueuedAutonomyCommands:
    claimConsumableQueuedAutonomyCommandsMock,
  finalizeAutonomyCommandsForTurn: finalizeAutonomyCommandsForTurnMock,
}))

const { buildTool, getEmptyToolPermissionContext } = await import('./Tool.js')
const { query } = await import('./query.js')
const { getDefaultAppState } = await import('./state/AppStateStore.js')
const {
  enqueuePendingNotification,
  resetCommandQueue,
} = await import('./utils/messageQueueManager.js')
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
  resetCommandQueue()
  claimConsumableQueuedAutonomyCommandsMock.mockClear()
  finalizeAutonomyCommandsForTurnMock.mockClear()
})

describe('query autonomy lifecycle', () => {
  test('claims and finalizes queued autonomy commands injected mid-turn', async () => {
    const queuedCommand = {
      value: 'scheduled follow-up',
      mode: 'prompt',
      priority: 'next',
      isMeta: true,
      uuid: 'queued-command-1',
      autonomy: {
        runId: 'run-1',
        trigger: 'scheduled-task',
      },
    } as any

    enqueuePendingNotification(queuedCommand)

    let callCount = 0
    const stream = query({
      messages: [createUserMessage({ content: 'run query' })],
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
                  name: 'TestTool',
                  input: {},
                } as any,
              ],
            })
            return
          }
          yield createAssistantMessage({ content: 'done' })
        },
      } as any,
    })

    await expect(collectQueryTerminal(stream as any)).resolves.toMatchObject({
      reason: 'completed',
    })

    expect(callCount).toBe(2)
    expect(claimConsumableQueuedAutonomyCommandsMock).toHaveBeenCalled()
    expect(finalizeAutonomyCommandsForTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [queuedCommand],
        outcome: { type: 'completed' },
        priority: 'later',
      }),
    )
  })
})

afterAll(() => {
  mock.restore()
})
