import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions/completions.mjs'
import { z } from 'zod/v4'
import {
  getModelUsage,
  getTotalAPIDuration,
  getTotalAPIDurationWithoutRetries,
  resetCostState,
} from '../../../../bootstrap/state.js'
import type { AssistantMessage } from '../../../../types/message.js'
import { TOOL_SEARCH_TOOL_NAME } from '@go-hare/builtin-tools/tools/ToolSearchTool/prompt.js'

let nextChunks: ChatCompletionChunk[] = []
let lastCreateArgs: Record<string, unknown> | null = null

function makeChunk(
  overrides: Partial<ChatCompletionChunk> & Record<string, unknown> = {},
): ChatCompletionChunk {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 1234567890,
    model: 'gpt-5.4',
    choices: [],
    ...overrides,
  } as ChatCompletionChunk
}

function makeChunksWithUsage(): ChatCompletionChunk[] {
  return [
    makeChunk({
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: 'ok' },
          finish_reason: null,
        },
      ],
    }),
    makeChunk({
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }),
  ]
}

async function fakeOpenAIFetch(
  _input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof init?.body === 'string') {
    lastCreateArgs = JSON.parse(init.body) as Record<string, unknown>
  }
  await new Promise(resolve => setTimeout(resolve, 5))

  const body = `${nextChunks
    .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
    .join('')}data: [DONE]\n\n`
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

mock.module('../../../langfuse/tracing.js', () => ({
  createTrace: () => null,
  recordLLMObservation: () => {},
  recordToolObservation: () => {},
  createToolBatchSpan: () => null,
  endToolBatchSpan: () => {},
  createSubagentTrace: () => null,
  createChildSpan: () => null,
  endTrace: () => {},
}))

mock.module('../../../langfuse/convert.js', () => ({
  convertMessagesToLangfuse: () => [],
  convertOutputToLangfuse: () => [],
  convertToolsToLangfuse: () => [],
}))

async function runQueryModel(
  model = 'gpt-5.5',
  optionOverrides: Record<string, unknown> = {},
  messages: any[] = [],
  tools: any[] = [],
): Promise<AssistantMessage[]> {
  const { clearOpenAIClientCache } = await import('../client.js')
  const { queryModelOpenAI } = await import('../index.js')
  const assistantMessages: AssistantMessage[] = []
  clearOpenAIClientCache()

  for await (const item of queryModelOpenAI(
    messages,
    [] as any,
    tools,
    new AbortController().signal,
    {
      model,
      agents: [],
      allowedAgentTypes: [],
      querySource: 'main_loop',
      getToolPermissionContext: async () => ({
        alwaysAllow: [],
        alwaysDeny: [],
        ask: [],
        mode: 'default',
        isBypassingPermissions: false,
      }),
      fetchOverride: fakeOpenAIFetch,
      ...optionOverrides,
    } as any,
  )) {
    if (item.type === 'assistant') {
      assistantMessages.push(item as AssistantMessage)
    }
  }

  return assistantMessages
}

const originalOpenAIModel = process.env.OPENAI_MODEL
const originalOpenAIAPIKey = process.env.OPENAI_API_KEY
const originalAnthropicAPIKey = process.env.ANTHROPIC_API_KEY
const originalClaudeCodeOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
const originalClaudeCodeUseOpenAI = process.env.CLAUDE_CODE_USE_OPENAI
const originalEnableToolSearch = process.env.ENABLE_TOOL_SEARCH
const originalUserType = process.env.USER_TYPE

beforeEach(() => {
  resetCostState()
  nextChunks = makeChunksWithUsage()
  lastCreateArgs = null
  process.env.OPENAI_MODEL = 'gpt-5.4'
  process.env.OPENAI_API_KEY = 'test-openai-key'
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test-token'
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  process.env.ENABLE_TOOL_SEARCH = 'true'
  delete process.env.USER_TYPE
})

afterEach(() => {
  if (originalOpenAIModel === undefined) {
    delete process.env.OPENAI_MODEL
  } else {
    process.env.OPENAI_MODEL = originalOpenAIModel
  }
  if (originalAnthropicAPIKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = originalAnthropicAPIKey
  }
  if (originalOpenAIAPIKey === undefined) {
    delete process.env.OPENAI_API_KEY
  } else {
    process.env.OPENAI_API_KEY = originalOpenAIAPIKey
  }
  if (originalClaudeCodeOAuthToken === undefined) {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  } else {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = originalClaudeCodeOAuthToken
  }
  if (originalClaudeCodeUseOpenAI === undefined) {
    delete process.env.CLAUDE_CODE_USE_OPENAI
  } else {
    process.env.CLAUDE_CODE_USE_OPENAI = originalClaudeCodeUseOpenAI
  }
  if (originalEnableToolSearch === undefined) {
    delete process.env.ENABLE_TOOL_SEARCH
  } else {
    process.env.ENABLE_TOOL_SEARCH = originalEnableToolSearch
  }
  if (originalUserType === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = originalUserType
  }
})

describe('queryModelOpenAI usage and duration accounting', () => {
  test('records usage under a directly selected OpenAI model', async () => {
    const assistantMessages = await runQueryModel()

    expect(assistantMessages).toHaveLength(1)
    expect(lastCreateArgs?.model).toBe('gpt-5.5')

    const usage = getModelUsage()
    expect(usage['gpt-5.5']?.inputTokens).toBe(11)
    expect(usage['gpt-5.5']?.outputTokens).toBe(7)
    expect(usage['gpt-5.4']).toBeUndefined()
  })

  test('maps Claude-family model names through OPENAI_MODEL', async () => {
    const assistantMessages = await runQueryModel('claude-sonnet-4-6')

    expect(assistantMessages).toHaveLength(1)
    expect(lastCreateArgs?.model).toBe('gpt-5.4')

    const usage = getModelUsage()
    expect(usage['gpt-5.4']?.inputTokens).toBe(11)
    expect(usage['gpt-5.4']?.outputTokens).toBe(7)
  })

  test('resolves effort against the mapped OpenAI model', async () => {
    await runQueryModel('claude-opus-4-6', { effortValue: 'max' })

    expect(lastCreateArgs?.model).toBe('gpt-5.4')
    expect(lastCreateArgs?.reasoning_effort).toBe('high')
  })

  test('records OpenAI streaming request duration', async () => {
    await runQueryModel()

    const duration = getTotalAPIDuration()
    expect(duration).toBeGreaterThan(0)
    expect(getTotalAPIDurationWithoutRetries()).toBe(duration)
  })

  test('prepends available deferred tools for OpenAI-compatible tool search', async () => {
    const deferredTool = {
      name: 'SlackPostMessage',
      isMcp: true,
      inputSchema: z.object({ channel: z.string() }),
      prompt: async () => 'Post a message to Slack',
    }
    const toolSearchTool = {
      name: TOOL_SEARCH_TOOL_NAME,
      inputSchema: z.object({ query: z.string() }),
      prompt: async () => 'Load deferred tool definitions',
    }

    await runQueryModel(
      'gpt-5.5',
      {},
      [],
      [deferredTool, toolSearchTool],
    )

    const requestMessages = lastCreateArgs?.messages as
      | Array<Record<string, unknown>>
      | undefined
    expect(requestMessages).toBeDefined()
    expect(requestMessages?.[0]?.role).toBe('user')
    expect(requestMessages?.[0]?.content).toBe(
      '<available-deferred-tools>\nSlackPostMessage\n</available-deferred-tools>',
    )
  })
})
