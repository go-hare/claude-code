// Auto-generated stub — replace with real implementation
import type { ToolUseContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import { createChildAbortController } from '../../utils/abortController.js'
import type { Attachment } from '../../utils/attachments.js'

export type SkillDiscoveryPrefetch = {
  promise: Promise<Attachment[]>
  settledAt: number | null
  signal: AbortSignal
  [Symbol.dispose](): void
}

async function runSkillDiscoveryPrefetch(
  _input: string | null,
  _messages: Message[],
  _toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  return []
}

export function startSkillDiscoveryPrefetch(
  input: string | null,
  messages: Message[],
  toolUseContext: ToolUseContext,
): SkillDiscoveryPrefetch {
  const abortController = createChildAbortController(
    toolUseContext.abortController,
  )
  const promise = runSkillDiscoveryPrefetch(input, messages, {
    ...toolUseContext,
    abortController,
  })

  const handle: SkillDiscoveryPrefetch = {
    promise,
    settledAt: null,
    signal: abortController.signal,
    [Symbol.dispose]() {
      abortController.abort()
    },
  }

  void promise.finally(() => {
    handle.settledAt = Date.now()
  })

  return handle
}

export async function collectSkillDiscoveryPrefetch(
  pending: SkillDiscoveryPrefetch,
): Promise<Attachment[]> {
  return pending.promise
}

export const getTurnZeroSkillDiscovery: (
  input: string,
  messages: Message[],
  context: ToolUseContext,
) => Promise<Attachment | null> = (async () => null)
