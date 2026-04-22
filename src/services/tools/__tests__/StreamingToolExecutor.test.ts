import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { z } from 'zod/v4'
import { buildTool, getEmptyToolPermissionContext } from '../../../Tool.js'
import { createFileStateCacheWithSizeLimit } from '../../../utils/fileStateCache.js'

const observedContextValues: string[] = []

function makeToolResultMessage(toolUseID: string) {
  return {
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseID,
          content: `result:${toolUseID}`,
          is_error: false,
        },
      ],
    },
  } as const
}

mock.module('../toolExecution.js', () => ({
  runToolUse: (toolUse: { id: string }, _assistant: unknown, _canUseTool: unknown, context: { criticalSystemReminder_EXPERIMENTAL?: string }) =>
    (async function* () {
      switch (toolUse.id) {
        case 'safe-1':
          yield {
            message: makeToolResultMessage(toolUse.id),
            contextModifier: {
              toolUseID: toolUse.id,
              modifyContext: (ctx: Record<string, unknown>) => ({
                ...ctx,
                criticalSystemReminder_EXPERIMENTAL: 'safe-batch-applied',
              }),
            },
          }
          return
        case 'safe-2':
          yield { message: makeToolResultMessage(toolUse.id) }
          return
        case 'serial-1':
          observedContextValues.push(
            context.criticalSystemReminder_EXPERIMENTAL ?? '',
          )
          yield { message: makeToolResultMessage(toolUse.id) }
          return
        case 'tail-safe':
          yield {
            message: makeToolResultMessage(toolUse.id),
            contextModifier: {
              toolUseID: toolUse.id,
              modifyContext: (ctx: Record<string, unknown>) => ({
                ...ctx,
                criticalSystemReminder_EXPERIMENTAL: 'tail-batch-applied',
              }),
            },
          }
          return
        default:
          yield { message: makeToolResultMessage(toolUse.id) }
      }
    })(),
}))

const { StreamingToolExecutor } = await import('../StreamingToolExecutor.js')

function makeTool(name: string, isConcurrencySafe: boolean) {
  return buildTool({
    name,
    inputSchema: z.object({}),
    maxResultSizeChars: 10_000,
    call: async () => ({ data: 'ok' }),
    description: async () => name,
    prompt: async () => name,
    isConcurrencySafe: () => isConcurrencySafe,
    mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
      type: 'tool_result' as const,
      tool_use_id: toolUseID,
      content: String(content),
    }),
    renderToolUseMessage: () => null,
  })
}

function makeAssistantMessage(toolUseID: string, name: string) {
  return {
    uuid: `assistant-${toolUseID}`,
    message: {
      id: `message-${toolUseID}`,
      content: [
        {
          type: 'tool_use',
          id: toolUseID,
          name,
          input: {},
        },
      ],
    },
  } as any
}

function makeContext(tools: ReturnType<typeof makeTool>[]) {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test-model',
      tools,
      verbose: false,
      thinkingConfig: {},
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: {},
    },
    abortController: new AbortController(),
    readFileState: createFileStateCacheWithSizeLimit(1),
    getAppState: () => ({
      toolPermissionContext: getEmptyToolPermissionContext(),
    }),
    setAppState: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    messages: [],
    criticalSystemReminder_EXPERIMENTAL: 'initial',
  } as any
}

async function collectUpdates(executor: InstanceType<typeof StreamingToolExecutor>) {
  const updates = []
  for await (const update of executor.getRemainingResults()) {
    updates.push(update)
  }
  return updates
}

describe('StreamingToolExecutor context modifiers', () => {
  beforeEach(() => {
    observedContextValues.length = 0
  })

  test('applies concurrent batch context before the next serial tool starts', async () => {
    const safeTool = makeTool('SafeTool', true)
    const serialTool = makeTool('SerialTool', false)
    const tools = [safeTool, serialTool]
    const executor = new StreamingToolExecutor(
      tools,
      mock(async () => ({ behavior: 'allow', updatedInput: {} }) as never),
      makeContext(tools),
    )

    executor.addTool(
      { type: 'tool_use', id: 'safe-1', name: 'SafeTool', input: {} } as any,
      makeAssistantMessage('safe-1', 'SafeTool'),
    )
    executor.addTool(
      { type: 'tool_use', id: 'safe-2', name: 'SafeTool', input: {} } as any,
      makeAssistantMessage('safe-2', 'SafeTool'),
    )
    executor.addTool(
      { type: 'tool_use', id: 'serial-1', name: 'SerialTool', input: {} } as any,
      makeAssistantMessage('serial-1', 'SerialTool'),
    )

    const updates = await collectUpdates(executor)
    const lastContext = updates.at(-1)?.newContext as
      | { criticalSystemReminder_EXPERIMENTAL?: string }
      | undefined

    expect(observedContextValues).toEqual(['safe-batch-applied'])
    expect(lastContext?.criticalSystemReminder_EXPERIMENTAL).toBe(
      'safe-batch-applied',
    )
  })

  test('emits a final context update for trailing concurrent modifiers', async () => {
    const safeTool = makeTool('SafeTool', true)
    const tools = [safeTool]
    const executor = new StreamingToolExecutor(
      tools,
      mock(async () => ({ behavior: 'allow', updatedInput: {} }) as never),
      makeContext(tools),
    )

    executor.addTool(
      { type: 'tool_use', id: 'tail-safe', name: 'SafeTool', input: {} } as any,
      makeAssistantMessage('tail-safe', 'SafeTool'),
    )

    const updates = await collectUpdates(executor)
    const contextUpdates = updates.filter(
      update => update.newContext !== undefined,
    )
    const lastContext = contextUpdates.at(-1)?.newContext as
      | { criticalSystemReminder_EXPERIMENTAL?: string }
      | undefined

    expect(lastContext?.criticalSystemReminder_EXPERIMENTAL).toBe(
      'tail-batch-applied',
    )
    expect(
      executor.getUpdatedContext().criticalSystemReminder_EXPERIMENTAL,
    ).toBe('tail-batch-applied')
  })
})
