import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import { SessionRuntime } from '../../runtime/capabilities/execution/SessionRuntime.js'
import type {
  AgentContent,
  AgentInput,
  AgentTurnExecutionContext,
  AgentTurnExecutor,
} from '../types.js'
import { projectQueryEventToAgentEvents } from './queryToAgentEvents.js'

type SessionRuntimeLike = Pick<SessionRuntime, 'submitMessage'>

export type SessionRuntimeExecutorOptions = {
  runtime: SessionRuntimeLike
}

function inputToPrompt(input: AgentInput): string | ContentBlockParam[] {
  const textParts: string[] = []
  const blocks: ContentBlockParam[] = []

  for (const content of input.content) {
    if (content.type === 'text') {
      textParts.push(content.text)
      continue
    }
    const block = contentToContentBlock(content)
    if (block) {
      blocks.push(block)
    }
  }

  if (blocks.length === 0) {
    return textParts.join('\n')
  }

  return [
    ...textParts.map(text => ({ type: 'text' as const, text })),
    ...blocks,
  ]
}

function contentToContentBlock(
  content: AgentContent,
): ContentBlockParam | undefined {
  if (content.type === 'image') {
    return {
      type: 'image',
      source: content.source,
    } as unknown as ContentBlockParam
  }
  if (content.type === 'resource') {
    return {
      type: 'text',
      text: content.text ?? content.uri,
    }
  }
  return undefined
}

export function createSessionRuntimeExecutor(
  options: SessionRuntimeExecutorOptions,
): AgentTurnExecutor {
  return async function* sessionRuntimeExecutor(
    input: AgentInput,
    context: AgentTurnExecutionContext,
  ) {
    const prompt = inputToPrompt(input)
    for await (const message of options.runtime.submitMessage(prompt)) {
      yield* projectQueryEventToAgentEvents(message, context)
    }
  }
}
