import { feature } from 'bun:bundle'
import { createStreamlinedTransformer } from 'src/utils/streamlinedTransform.js'
import type { ProtocolMessage } from 'src/types/protocol/index.js'
import type { ProtocolStdoutMessage } from 'src/types/protocol/controlTypes.js'
import type { HeadlessRuntimeOptions } from '../HeadlessRuntime.js'
import type { KernelRuntimeEnvelopeBase } from '../../../contracts/events.js'
import type { RuntimeEventBus } from '../../../core/events/RuntimeEventBus.js'
import type { StructuredIO } from './io/structuredIO.js'
import {
  createHeadlessProtocolMessageRuntimeEvent,
  projectRuntimeEnvelopeToLegacyProtocolStreamJsonMessages,
  projectProtocolMessageToLegacyStreamJsonMessages,
} from '../../../core/events/compatProjection.js'

type HeadlessRuntimeStreamPublisherOptions = {
  eventBus: Pick<RuntimeEventBus, 'emit'>
  conversationId: string
  getTurnId(): string | undefined
  onPublishError?(error: unknown): void
}

type HeadlessRuntimeStreamPublisher = {
  publishCompatibilityMessage(
    message: ProtocolMessage,
  ): KernelRuntimeEnvelopeBase | undefined
}

function shouldTrackHeadlessResultMessage(message: ProtocolMessage): boolean {
  return !(
    message.type === 'control_response' ||
    message.type === 'control_request' ||
    message.type === 'control_cancel_request' ||
    (message.type === 'system' &&
      (message.subtype === 'session_state_changed' ||
        message.subtype === 'task_notification' ||
        message.subtype === 'task_started' ||
        message.subtype === 'task_progress' ||
        message.subtype === 'post_turn_summary')) ||
    message.type === 'stream_event' ||
    message.type === 'keep_alive' ||
    message.type === 'streamlined_text' ||
    message.type === 'streamlined_tool_use_summary' ||
    message.type === 'prompt_suggestion'
  )
}

export function createHeadlessRuntimeStreamPublisher(
  options: HeadlessRuntimeStreamPublisherOptions,
): HeadlessRuntimeStreamPublisher {
  return {
    publishCompatibilityMessage(message) {
      try {
        return options.eventBus.emit(
          createHeadlessProtocolMessageRuntimeEvent({
            conversationId: options.conversationId,
            turnId: options.getTurnId(),
            message,
          }),
        )
      } catch (error) {
        options.onPublishError?.(error)
        return undefined
      }
    },
  }
}

export function createHeadlessStreamCollector(
  options: Pick<HeadlessRuntimeOptions, 'outputFormat' | 'verbose'>,
  runtimePublisher?: HeadlessRuntimeStreamPublisher,
): {
  handleMessage(
    structuredIO: StructuredIO,
    message: ProtocolMessage,
  ): Promise<void>
  getMessages(): ProtocolMessage[]
  getLastMessage(): ProtocolMessage | undefined
} {
  const needsFullArray = options.outputFormat === 'json' && options.verbose
  const messages: ProtocolMessage[] = []
  let lastMessage: ProtocolMessage | undefined
  const transformToStreamlined =
    feature('STREAMLINED_OUTPUT') &&
    process.env.CLAUDE_CODE_STREAMLINED_OUTPUT &&
    options.outputFormat === 'stream-json'
      ? createStreamlinedTransformer()
      : null

  return {
    async handleMessage(structuredIO, message) {
      const runtimeEnvelope =
        runtimePublisher?.publishCompatibilityMessage(message)

      if (transformToStreamlined) {
        const transformed = transformToStreamlined(
          message as unknown as ProtocolStdoutMessage,
        )
        if (transformed) {
          await structuredIO.write(transformed)
        }
      } else if (options.outputFormat === 'stream-json' && options.verbose) {
        const legacyMessages = runtimeEnvelope
          ? projectRuntimeEnvelopeToLegacyProtocolStreamJsonMessages(runtimeEnvelope)
          : projectProtocolMessageToLegacyStreamJsonMessages(message)
        for (const legacyMessage of legacyMessages) {
          await structuredIO.write(legacyMessage)
        }
      }

      if (!shouldTrackHeadlessResultMessage(message)) {
        return
      }

      if (needsFullArray) {
        messages.push(message)
      }
      lastMessage = message
    },
    getMessages() {
      return messages
    },
    getLastMessage() {
      return lastMessage
    },
  }
}
