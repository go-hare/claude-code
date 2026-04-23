import type { AppState } from '../state/AppStateStore.js'
import type { Message, UserMessage } from '../types/message.js'
import { getGlobalConfigWriteCount } from '../utils/config.js'
import {
  createApiMetricsMessage,
  getContentText,
  isCompactBoundaryMessage,
} from '../utils/messages.js'
import {
  BASH_INPUT_TAG,
  COMMAND_MESSAGE_TAG,
  COMMAND_NAME_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
} from '../constants/xml.js'

type SetMessages = (updater: (prev: Message[]) => Message[]) => void

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!
}

export function maybeGenerateReplSessionTitle({
  newMessages,
  titleDisabled,
  sessionTitle,
  agentTitle,
  haikuTitleAttemptedRef,
  generateSessionTitle,
  setHaikuTitle,
}: {
  newMessages: Message[]
  titleDisabled: boolean
  sessionTitle: string | undefined
  agentTitle: string | undefined
  haikuTitleAttemptedRef: { current: boolean }
  generateSessionTitle: (
    text: string,
    signal: AbortSignal,
  ) => Promise<string | undefined | null>
  setHaikuTitle: (title: string | undefined) => void
}): void {
  if (
    titleDisabled ||
    sessionTitle ||
    agentTitle ||
    haikuTitleAttemptedRef.current
  ) {
    return
  }

  const firstUserMessage = newMessages.find(
    (message): message is UserMessage =>
      message.type === 'user' && !message.isMeta,
  )
  const text = firstUserMessage
    ? getContentText(
        firstUserMessage.message!.content as Parameters<
          typeof getContentText
        >[0],
      )
    : null

  if (
    !text ||
    text.startsWith(`<${LOCAL_COMMAND_STDOUT_TAG}>`) ||
    text.startsWith(`<${COMMAND_MESSAGE_TAG}>`) ||
    text.startsWith(`<${COMMAND_NAME_TAG}>`) ||
    text.startsWith(`<${BASH_INPUT_TAG}>`)
  ) {
    return
  }

  haikuTitleAttemptedRef.current = true
  void generateSessionTitle(text, new AbortController().signal).then(
    title => {
      if (title) {
        setHaikuTitle(title)
      } else {
        haikuTitleAttemptedRef.current = false
      }
    },
    () => {
      haikuTitleAttemptedRef.current = false
    },
  )
}

export function runReplPreQueryHostPrep<TMcpClient, TIdeClient>({
  shouldQuery,
  getFreshMcpClients,
  onDiagnosticQueryStart,
  getConnectedIdeClient,
  closeOpenDiffs,
  markProjectOnboardingComplete,
}: {
  shouldQuery: boolean
  getFreshMcpClients: () => TMcpClient[]
  onDiagnosticQueryStart: (clients: TMcpClient[]) => void
  getConnectedIdeClient: (
    clients: TMcpClient[],
  ) => TIdeClient | null | undefined
  closeOpenDiffs: (ideClient: TIdeClient) => void | Promise<void>
  markProjectOnboardingComplete: () => void
}): void {
  if (shouldQuery) {
    const freshClients = getFreshMcpClients()
    onDiagnosticQueryStart(freshClients)
    const ideClient = getConnectedIdeClient(freshClients)
    if (ideClient) {
      void closeOpenDiffs(ideClient)
    }
  }

  markProjectOnboardingComplete()
}

export function syncReplAllowedToolsForTurn({
  setStoreState,
  additionalAllowedTools,
}: {
  setStoreState: (updater: (prev: AppState) => AppState) => void
  additionalAllowedTools: string[]
}): void {
  setStoreState(prev => {
    const current = prev.toolPermissionContext.alwaysAllowRules.command
    if (
      current === additionalAllowedTools ||
      (current?.length === additionalAllowedTools.length &&
        current.every((value, index) => value === additionalAllowedTools[index]))
    ) {
      return prev
    }

    return {
      ...prev,
      toolPermissionContext: {
        ...prev.toolPermissionContext,
        alwaysAllowRules: {
          ...prev.toolPermissionContext.alwaysAllowRules,
          command: additionalAllowedTools,
        },
      },
    }
  })
}

export function shortCircuitReplNonQueryTurn({
  shouldQuery,
  newMessages,
  bumpConversationId,
  clearContextBlocked,
  resetLoadingState,
  setAbortController,
}: {
  shouldQuery: boolean
  newMessages: Message[]
  bumpConversationId: () => void
  clearContextBlocked?: () => void
  resetLoadingState: () => void
  setAbortController: (controller: AbortController | null) => void
}): boolean {
  if (shouldQuery) {
    return false
  }

  if (newMessages.some(isCompactBoundaryMessage)) {
    bumpConversationId()
    clearContextBlocked?.()
  }

  resetLoadingState()
  setAbortController(null)
  return true
}

export function maybeRefreshCompanionReaction({
  fireCompanionObserver,
  messages,
  setCompanionReaction,
}: {
  fireCompanionObserver?: (
    messages: Message[],
    callback: (reaction: unknown) => void,
  ) => void
  messages: Message[]
  setCompanionReaction: (
    updater: (reaction: unknown) => unknown,
  ) => void
}): void {
  if (!fireCompanionObserver) {
    return
  }

  void fireCompanionObserver(messages, reaction => {
    setCompanionReaction(previous =>
      previous === reaction ? previous : reaction,
    )
  })
}

export function appendReplApiMetricsMessage({
  entries,
  loadingStartTimeMs,
  setMessages,
}: {
  entries: Array<{
    ttftMs: number
    firstTokenTime: number
    lastTokenTime: number
    responseLengthBaseline: number
    endResponseLength: number
  }>
  loadingStartTimeMs: number
  setMessages: SetMessages
}): void {
  if (entries.length === 0) {
    return
  }

  const ttfts = entries.map(entry => entry.ttftMs)
  const otpsValues = entries.map(entry => {
    const delta = Math.round(
      (entry.endResponseLength - entry.responseLengthBaseline) / 4,
    )
    const samplingMs = entry.lastTokenTime - entry.firstTokenTime
    return samplingMs > 0 ? Math.round(delta / (samplingMs / 1000)) : 0
  })
  const isMultiRequest = entries.length > 1

  setMessages(prev => [
    ...prev,
    createApiMetricsMessage({
      ttftMs: isMultiRequest ? median(ttfts) : ttfts[0]!,
      otps: isMultiRequest ? median(otpsValues) : otpsValues[0]!,
      isP50: isMultiRequest,
      turnDurationMs: Date.now() - loadingStartTimeMs,
      configWriteCount: getGlobalConfigWriteCount(),
    }),
  ])
}

export function finalizeReplCompletedTurnHostShell({
  shouldSignalPipeDone,
  signalPipeDone,
  sendBridgeResult,
  shouldAutoHideTungsten,
  setTungstenAutoHidden,
  setAbortController,
}: {
  shouldSignalPipeDone: boolean
  signalPipeDone: () => void
  sendBridgeResult: () => void
  shouldAutoHideTungsten: boolean
  setTungstenAutoHidden: (
    updater: (prev: AppState) => AppState,
  ) => void
  setAbortController: (controller: AbortController | null) => void
}): void {
  if (shouldSignalPipeDone) {
    signalPipeDone()
  }

  sendBridgeResult()

  if (shouldAutoHideTungsten) {
    setTungstenAutoHidden(prev => {
      if (prev.tungstenActiveSession === undefined) return prev
      if (prev.tungstenPanelAutoHidden === true) return prev
      return { ...prev, tungstenPanelAutoHidden: true }
    })
  }

  setAbortController(null)
}
