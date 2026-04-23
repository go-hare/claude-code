import {
  messagesAfterAreOnlySynthetic,
  selectableUserMessagesFilter,
} from '../components/MessageSelector.js'
import type { Message, UserMessage } from '../types/message.js'

export function maybeRestoreCancelledReplTurn({
  abortReason,
  hasActiveQuery,
  inputValue,
  commandQueueLength,
  viewingAgentTaskId,
  messages,
  removeLastFromHistory,
  restoreMessage,
}: {
  abortReason: unknown
  hasActiveQuery: boolean
  inputValue: string
  commandQueueLength: number
  viewingAgentTaskId: string | null | undefined
  messages: Message[]
  removeLastFromHistory: () => void
  restoreMessage: (message: UserMessage) => void
}): boolean {
  if (
    abortReason !== 'user-cancel' ||
    hasActiveQuery ||
    inputValue !== '' ||
    commandQueueLength !== 0 ||
    viewingAgentTaskId
  ) {
    return false
  }

  const lastUserMessage = messages.findLast(selectableUserMessagesFilter)
  if (!lastUserMessage) {
    return false
  }

  const lastUserMessageIndex = messages.lastIndexOf(lastUserMessage)
  if (!messagesAfterAreOnlySynthetic(messages, lastUserMessageIndex)) {
    return false
  }

  removeLastFromHistory()
  restoreMessage(lastUserMessage)
  return true
}
