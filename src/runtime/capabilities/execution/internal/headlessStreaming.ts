import { feature } from 'bun:bundle'
import { createStreamlinedTransformer } from 'src/utils/streamlinedTransform.js'
import type { SDKMessage } from 'src/entrypoints/agentSdkTypes.js'
import type { StdoutMessage } from 'src/entrypoints/sdk/controlTypes.js'
import type { HeadlessRuntimeOptions } from '../HeadlessRuntime.js'
import type { KernelRuntimeEnvelopeBase } from '../../../contracts/events.js'
import type { RuntimeEventBus } from '../../../core/events/RuntimeEventBus.js'
import type { StructuredIO } from './io/structuredIO.js'
import {
  createHeadlessSDKMessageRuntimeEvent,
  projectRuntimeEnvelopeToLegacySDKStreamJsonMessages,
  projectSDKMessageToLegacyStreamJsonMessages,
} from '../../../core/events/compatProjection.js'

type HeadlessRuntimeStreamPublisherOptions = {
  eventBus: Pick<RuntimeEventBus, 'emit'>
  conversationId: string
  getTurnId(): string | undefined
  onPublishError?(error: unknown): void
}

type HeadlessRuntimeStreamPublisher = {
  publishSdkMessage(message: SDKMessage): KernelRuntimeEnvelopeBase | undefined
}

function shouldTrackHeadlessResultMessage(message: SDKMessage): boolean {
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
    publishSdkMessage(message) {
      try {
        return options.eventBus.emit(
          createHeadlessSDKMessageRuntimeEvent({
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
    message: SDKMessage,
  ): Promise<void>
  getMessages(): SDKMessage[]
  getLastMessage(): SDKMessage | undefined
} {
  const needsFullArray = options.outputFormat === 'json' && options.verbose
  const messages: SDKMessage[] = []
  let lastMessage: SDKMessage | undefined
  const transformToStreamlined =
    feature('STREAMLINED_OUTPUT') &&
    process.env.CLAUDE_CODE_STREAMLINED_OUTPUT &&
    options.outputFormat === 'stream-json'
      ? createStreamlinedTransformer()
      : null

  return {
    async handleMessage(structuredIO, message) {
      const runtimeEnvelope = runtimePublisher?.publishSdkMessage(message)

      if (transformToStreamlined) {
        const transformed = transformToStreamlined(
          message as unknown as StdoutMessage,
        )
        if (transformed) {
          await structuredIO.write(transformed)
        }
      } else if (options.outputFormat === 'stream-json' && options.verbose) {
        const legacyMessages = runtimeEnvelope
          ? projectRuntimeEnvelopeToLegacySDKStreamJsonMessages(runtimeEnvelope)
          : projectSDKMessageToLegacyStreamJsonMessages(message)
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
