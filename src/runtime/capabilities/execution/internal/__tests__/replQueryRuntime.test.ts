import { describe, expect, mock, test } from 'bun:test'

import { asSystemPrompt } from 'src/utils/systemPromptType.js'

import {
  prepareReplRuntimeQuery,
  runReplRuntimeQuery,
} from '../replQueryRuntime.js'

function createToolUseContext() {
  return {
    options: {
      tools: [] as any,
      mainLoopModel: 'sonnet',
      mcpClients: [{ name: 'mcp-a' }] as any,
      customSystemPrompt: 'custom prompt',
      appendSystemPrompt: 'append prompt',
    },
    getAppState: () =>
      ({
        toolPermissionContext: {
          additionalWorkingDirectories: new Map([
            ['/tmp/worktree', { source: 'test' }],
          ]),
        },
      }) as any,
  } as any
}

describe('replQueryRuntime', () => {
  test('prepares REPL runtime query state through injected seams', async () => {
    const toolUseContext = createToolUseContext()
    const fetchSystemPromptParts = mock(async () => ({
      defaultSystemPrompt: ['default prompt'],
      userContext: { base: 'user' },
      systemContext: { system: 'ctx' },
    }))
    const buildEffectiveSystemPrompt = mock(() =>
      asSystemPrompt(['effective prompt']),
    )

    const prepared = await prepareReplRuntimeQuery({
      toolUseContext,
      mainThreadAgentDefinition: undefined,
      extraUserContext: { terminalFocus: 'unfocused' },
      effort: 'high',
      deps: {
        fetchSystemPromptParts,
        buildEffectiveSystemPrompt,
        queryFn: (async function* () {}) as any,
      },
    })

    expect(fetchSystemPromptParts).toHaveBeenCalledWith({
      tools: toolUseContext.options.tools,
      mainLoopModel: 'sonnet',
      additionalWorkingDirectories: ['/tmp/worktree'],
      mcpClients: toolUseContext.options.mcpClients,
      customSystemPrompt: 'custom prompt',
    })
    expect(buildEffectiveSystemPrompt).toHaveBeenCalledTimes(1)
    expect(prepared.userContext).toEqual({
      base: 'user',
      terminalFocus: 'unfocused',
    })
    expect(prepared.systemContext).toEqual({ system: 'ctx' })
    expect(prepared.systemPrompt).toEqual(asSystemPrompt(['effective prompt']))
    expect(prepared.toolUseContext.renderedSystemPrompt).toEqual(
      asSystemPrompt(['effective prompt']),
    )
    expect(toolUseContext.getAppState().effortValue).toBeUndefined()
    expect(prepared.toolUseContext.getAppState().effortValue).toBe('high')
    expect(prepared.toolUseContext).not.toBe(toolUseContext)
  })

  test('runs the prepared REPL query and forwards streamed events', async () => {
    const queryEvents = [{ type: 'event-a' }, { type: 'event-b' }]
    const onQueryEvent = mock((_event: unknown) => {})
    const queryFn = mock(async function* () {
      yield queryEvents[0]
      yield queryEvents[1]
    })

    const prepared = await runReplRuntimeQuery({
      messages: [] as any,
      canUseTool: (async () => ({ behavior: 'allow' })) as any,
      querySource: 'interactive' as any,
      onQueryEvent,
      toolUseContext: createToolUseContext(),
      mainThreadAgentDefinition: undefined,
      deps: {
        fetchSystemPromptParts: async () => ({
          defaultSystemPrompt: ['default prompt'],
          userContext: { base: 'user' },
          systemContext: { system: 'ctx' },
        }),
        buildEffectiveSystemPrompt: () => asSystemPrompt(['effective prompt']),
        queryFn: queryFn as any,
      },
    })

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(onQueryEvent).toHaveBeenCalledTimes(2)
    expect(onQueryEvent.mock.calls[0]?.[0]).toEqual(queryEvents[0])
    expect(onQueryEvent.mock.calls[1]?.[0]).toEqual(queryEvents[1])
    expect(prepared.systemPrompt).toEqual(asSystemPrompt(['effective prompt']))
  })
})
