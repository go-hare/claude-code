import { useMemo } from 'react'
import type { KernelRuntimeEnvelopeBase } from '../../../kernel/replRuntimeController.js'
import { createKernelRuntimeEventFacade } from '../../../kernel/replRuntimeController.js'
import { logForDebugging } from '../../../utils/debug.js'
import { createAssistantMessage } from '../../../utils/messages.js'
import type { Message as MessageType } from '../../../types/message.js'

type SetMessages = (
  updater: (prev: MessageType[]) => MessageType[],
) => void

export type ReplTransportRuntimeControllerOptions = {
  runtimeId: string
  setMessages: SetMessages
  setStreamingText(next: string | null): void
  setResponseLength(updater: (prev: number) => number): void
  appendStreamingText(updater: (current: string | null) => string | null): void
}

export type ReplTransportRuntimeController = {
  handleTransportRuntimeEvent(envelope: KernelRuntimeEnvelopeBase): void
  handleRuntimeOutputDelta(text: string): void
  handleRuntimeTurnTerminal(): void
}

export function useReplTransportRuntimeController({
  runtimeId,
  setMessages,
  setStreamingText,
  setResponseLength,
  appendStreamingText,
}: ReplTransportRuntimeControllerOptions): ReplTransportRuntimeController {
  return useMemo(
    () =>
      createReplTransportRuntimeController({
        runtimeId,
        setMessages,
        setStreamingText,
        setResponseLength,
        appendStreamingText,
      }),
    [
      appendStreamingText,
      runtimeId,
      setMessages,
      setResponseLength,
      setStreamingText,
    ],
  )
}

export function createReplTransportRuntimeController({
  runtimeId,
  setMessages,
  setStreamingText,
  setResponseLength,
  appendStreamingText,
}: ReplTransportRuntimeControllerOptions): ReplTransportRuntimeController {
  let runtimeOutputBuffer = ''
  const transportRuntimeEventFacade = createKernelRuntimeEventFacade({
    runtimeId,
    maxReplayEvents: 512,
  })

  return {
    handleTransportRuntimeEvent(envelope) {
      const accepted = transportRuntimeEventFacade.ingestEnvelope(envelope)
      logForDebugging(
        `[REPL:runtime-event] kind=${envelope.kind} accepted=${accepted ? 'yes' : 'duplicate'} type=${getRuntimeEventTypeForLog(envelope)} conversationId=${envelope.conversationId ?? ''} eventId=${envelope.eventId ?? ''}`,
      )
    },
    handleRuntimeOutputDelta(text) {
      if (text.length === 0) {
        return
      }
      runtimeOutputBuffer += text
      setResponseLength(length => length + text.length)
      appendStreamingText(current => (current ?? '') + text)
    },
    handleRuntimeTurnTerminal() {
      const text = runtimeOutputBuffer
      runtimeOutputBuffer = ''
      if (!text) {
        return
      }
      setStreamingText(null)
      setMessages(prev => [...prev, createAssistantMessage({ content: text })])
    },
  }
}

function getRuntimeEventTypeForLog(envelope: KernelRuntimeEnvelopeBase): string {
  const payload = envelope.payload
  if (typeof payload === 'object' && payload !== null && 'type' in payload) {
    const type = (payload as { type?: unknown }).type
    if (typeof type === 'string') {
      return type
    }
  }
  return ''
}
