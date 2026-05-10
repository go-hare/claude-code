import type { Message } from 'src/types/message'
import { projectSnippedView, isSnipBoundaryMessage } from './snipProjection.js'

type SnipMarkerLike = Message & {
  subtype?: string
  content?: unknown
}

export function isSnipMarkerMessage(message: Message): boolean {
  if (message.type !== 'system') {
    return false
  }
  const marker = message as SnipMarkerLike
  return marker.subtype === 'snip_marker'
}

export function snipCompactIfNeeded(
  messages: Message[],
  options?: { force?: boolean },
): {
  messages: Message[]
  executed: boolean
  tokensFreed: number
  boundaryMessage?: Message
} {
  const boundaryMessage = [...messages].reverse().find(isSnipBoundaryMessage)
  if (!options?.force && !boundaryMessage) {
    return {
      messages,
      executed: false,
      tokensFreed: 0,
    }
  }

  const compactedMessages = projectSnippedView(messages)
  return {
    messages: compactedMessages,
    executed: true,
    tokensFreed: Math.max(0, messages.length - compactedMessages.length),
    boundaryMessage,
  }
}

export function isSnipRuntimeEnabled(): boolean {
  return true
}

export function shouldNudgeForSnips(messages: Message[]): boolean {
  return messages.length >= 20 && !messages.some(isSnipBoundaryMessage)
}

export const SNIP_NUDGE_TEXT =
  'This conversation is getting long. Consider snipping older history if it is no longer needed for the current task.'
