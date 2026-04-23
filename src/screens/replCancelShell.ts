type FocusedInputDialog =
  | 'elicitation'
  | 'tool-permission'
  | 'prompt'
  | string
  | undefined

type PromptQueueItem = {
  reject: (reason: Error) => void
}

export function runReplCancelShell({
  focusedInputDialog,
  pauseProactive,
  forceEndQuery,
  clearIdleSkip,
  partialStreamingText,
  appendPartialAssistantMessage,
  resetLoadingState,
  shouldClearTokenBudget,
  clearTokenBudget,
  abortToolUseConfirm,
  clearToolUseConfirmQueue,
  promptQueue,
  clearPromptQueue,
  abortCurrentRequest,
  isRemoteMode,
  cancelRemoteRequest,
  clearAbortController,
  notifyTurnCancelled,
}: {
  focusedInputDialog: FocusedInputDialog
  pauseProactive?: () => void
  forceEndQuery: () => void
  clearIdleSkip: () => void
  partialStreamingText: string | null | undefined
  appendPartialAssistantMessage: (text: string) => void
  resetLoadingState: () => void
  shouldClearTokenBudget: boolean
  clearTokenBudget: () => void
  abortToolUseConfirm?: () => void
  clearToolUseConfirmQueue: () => void
  promptQueue: PromptQueueItem[]
  clearPromptQueue: () => void
  abortCurrentRequest: () => void
  isRemoteMode: boolean
  cancelRemoteRequest: () => void
  clearAbortController: () => void
  notifyTurnCancelled: () => void
}): boolean {
  if (focusedInputDialog === 'elicitation') {
    return false
  }

  pauseProactive?.()
  forceEndQuery()
  clearIdleSkip()

  if (partialStreamingText?.trim()) {
    appendPartialAssistantMessage(partialStreamingText)
  }

  resetLoadingState()

  if (shouldClearTokenBudget) {
    clearTokenBudget()
  }

  if (focusedInputDialog === 'tool-permission') {
    abortToolUseConfirm?.()
    clearToolUseConfirmQueue()
  } else if (focusedInputDialog === 'prompt') {
    for (const item of promptQueue) {
      item.reject(new Error('Prompt cancelled by user'))
    }
    clearPromptQueue()
    abortCurrentRequest()
  } else if (isRemoteMode) {
    cancelRemoteRequest()
  } else {
    abortCurrentRequest()
  }

  clearAbortController()
  notifyTurnCancelled()
  return true
}
