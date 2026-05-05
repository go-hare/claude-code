import type { SDKMessage } from '../../../../entrypoints/agentSdkTypes.js'
import {
  createToolProgressTrackingState,
  type ToolProgressTrackingState,
} from '../../../../utils/queryHelpers.js'
import type { KernelEvent } from '../../../contracts/events.js'
import {
  createHeadlessSDKMessageRuntimeEvent,
  projectSemanticRuntimeEventsFromSDKMessage,
  createTurnOutputDeltaRuntimeEventFromSDKMessage,
  getCanonicalProjectionForSDKMessage,
} from '../../../core/events/compatProjection.js'
import {
  isQueryStreamEvent,
  queryMessageToCompatibilitySDKMessages,
  queryStreamEventToSDKMessage,
} from './QueryTurnCompatibilityProjector.js'
import type {
  QueryStreamEventMessage,
  QueryTurnMessageProjection,
  QueryTurnMessageProjectionOptions,
  QueryTurnProjectionInput,
  QueryTurnTerminalResult,
} from './QueryTurnProjectionTypes.js'
export type {
  QueryStreamEventMessage,
  QueryTurnMessageProjection,
  QueryTurnMessageProjectionOptions,
  QueryTurnProjectionInput,
  QueryTurnTerminalResult,
  QueryUserReplayMessage,
  QuerySystemInitMessage,
} from './QueryTurnProjectionTypes.js'

export type QueryTurnEventAdapterOptions = {
  conversationId: string
  turnId: string
  getAbortReason: () => string | null
  getProgressProjectionEnvironment: () => {
    now: number
    remoteEnabled: boolean
  }
  progressTrackingState?: ToolProgressTrackingState
}

export type QueryTurnEventAdapter = {
  projectQueryMessage(
    message: QueryTurnProjectionInput,
    options?: QueryTurnMessageProjectionOptions,
  ): KernelEvent[]
  projectQueryMessageWithCompatibility(
    message: QueryTurnProjectionInput,
    options?: QueryTurnMessageProjectionOptions,
  ): QueryTurnMessageProjection
  createFallbackTerminalEvent(): KernelEvent
  hasTerminalResult(): boolean
}

export function createQueryTurnEventAdapter(
  options: QueryTurnEventAdapterOptions,
): QueryTurnEventAdapter {
  let sawTerminalResult = false
  const projectedCompatibilityMessageKeys = new Set<string>()
  const progressTrackingState =
    options.progressTrackingState ?? createToolProgressTrackingState()
  const projectCompatibilitySDKMessage = (
    message: SDKMessage,
    projectOptions: {
      includeCompatibility?: boolean
    } = {},
  ): KernelEvent[] => {
    const events: KernelEvent[] = []
    const outputDeltaEvent =
      createTurnOutputDeltaRuntimeEventFromSDKMessage({
        conversationId: options.conversationId,
        turnId: options.turnId,
        message,
      })
    if (outputDeltaEvent) {
      events.push(outputDeltaEvent)
    }
    events.push(
      ...projectSemanticRuntimeEventsFromSDKMessage({
        conversationId: options.conversationId,
        turnId: options.turnId,
        message,
      }),
    )

    const canonicalProjection =
      getCanonicalProjectionForSDKMessage(message)
    if (
      projectOptions.includeCompatibility !== false &&
      !shouldSkipCompatibilityProjection(
        message,
        projectedCompatibilityMessageKeys,
      )
    ) {
      events.push(
        createHeadlessSDKMessageRuntimeEvent({
          conversationId: options.conversationId,
          turnId: options.turnId,
          message,
          metadata: canonicalProjection
            ? { canonicalProjection }
            : undefined,
        }),
      )
    }

    return events
  }
  const projectQueryMessageWithCompatibility = (
    message: QueryTurnProjectionInput,
    projectOptions?: QueryTurnMessageProjectionOptions,
  ): QueryTurnMessageProjection => {
    if (isQueryTerminalResult(message)) {
      sawTerminalResult = true
      const includeCompatibility =
        projectOptions?.includeCompatibility ?? true
      const compatibilityMessages =
        includeCompatibility && message.sdkMessage
          ? [message.sdkMessage]
          : []
      const compatibilityEvents = message.sdkMessage
        ? projectCompatibilitySDKMessage(message.sdkMessage, {
            includeCompatibility,
          })
        : []
      if (includeCompatibility && message.sdkMessage) {
        markProjectedCompatibilityMessage(
          message.sdkMessage,
          projectedCompatibilityMessageKeys,
        )
      }
      return {
        events: [
          createTerminalEvent(
            getQueryTerminalResultOutcome({
              abortReason: options.getAbortReason(),
              conversationId: options.conversationId,
              result: message,
              turnId: options.turnId,
            }),
          ),
          ...compatibilityEvents,
        ],
        compatibilityMessages,
      }
    }
    if (!isQueryStreamEvent(message)) {
      const compatibilityMessages = queryMessageToCompatibilitySDKMessages({
        conversationId: options.conversationId,
        getProgressProjectionEnvironment:
          options.getProgressProjectionEnvironment,
        message,
        progressTrackingState,
      })
      if (compatibilityMessages.length === 0) {
        return { events: [], compatibilityMessages: [] }
      }
      const includeCompatibility =
        projectOptions?.includeCompatibility ?? true
      const events = compatibilityMessages.flatMap(compatibilityMessage =>
        projectCompatibilitySDKMessage(compatibilityMessage, {
          includeCompatibility,
        }),
      )
      if (includeCompatibility) {
        for (const compatibilityMessage of compatibilityMessages) {
          markProjectedCompatibilityMessage(
            compatibilityMessage,
            projectedCompatibilityMessageKeys,
          )
        }
      }
      return {
        events,
        compatibilityMessages: includeCompatibility
          ? compatibilityMessages
          : [],
      }
    }

    const compatibilityMessage = queryStreamEventToSDKMessage({
      conversationId: options.conversationId,
      message,
    })
    const events = projectCompatibilitySDKMessage(compatibilityMessage, {
      includeCompatibility: projectOptions?.includeCompatibility ?? true,
    })
    if (projectOptions?.includeCompatibility !== false) {
      markProjectedCompatibilityMessage(
        compatibilityMessage,
        projectedCompatibilityMessageKeys,
      )
    }
    return {
      events,
      compatibilityMessages:
        projectOptions?.includeCompatibility === false
          ? []
          : [compatibilityMessage],
    }
  }

  return {
    projectQueryMessage(message, projectOptions) {
      return projectQueryMessageWithCompatibility(
        message,
        projectOptions,
      ).events
    },

    projectQueryMessageWithCompatibility,

    createFallbackTerminalEvent() {
      const abortReason = options.getAbortReason()
      return createTerminalEvent({
        conversationId: options.conversationId,
        turnId: options.turnId,
        type: abortReason ? 'turn.failed' : 'turn.completed',
        state: abortReason ? 'failed' : 'completed',
        stopReason: abortReason,
      })
    },

    hasTerminalResult() {
      return sawTerminalResult
    },
  }
}

function shouldSkipCompatibilityProjection(
  message: SDKMessage,
  projectedCompatibilityMessageKeys: Set<string>,
): boolean {
  const key = getCompatibilityProjectionKey(message)
  return key ? projectedCompatibilityMessageKeys.has(key) : false
}

function markProjectedCompatibilityMessage(
  message: SDKMessage,
  projectedCompatibilityMessageKeys: Set<string>,
): void {
  const key = getCompatibilityProjectionKey(message)
  if (key) {
    projectedCompatibilityMessageKeys.add(key)
  }
}

function getCompatibilityProjectionKey(message: SDKMessage): string | undefined {
  return typeof message.uuid === 'string' && message.uuid.length > 0
    ? `uuid:${message.uuid}`
    : undefined
}

function isQueryTerminalResult(
  message: QueryTurnProjectionInput,
): message is QueryTurnTerminalResult {
  const record = message as Record<string, unknown>
  return record.type === 'query_result' && typeof record.isError === 'boolean'
}

function getQueryTerminalResultOutcome(options: {
  abortReason: string | null
  conversationId: string
  turnId: string
  result: QueryTurnTerminalResult
}): {
  conversationId: string
  turnId: string
  type: 'turn.completed' | 'turn.failed'
  state: 'completed' | 'failed'
  stopReason: string | null
} {
  if (options.abortReason) {
    return {
      conversationId: options.conversationId,
      turnId: options.turnId,
      type: 'turn.failed',
      state: 'failed',
      stopReason: options.abortReason,
    }
  }

  const failed = options.result.isError
  return {
    conversationId: options.conversationId,
    turnId: options.turnId,
    type: failed ? 'turn.failed' : 'turn.completed',
    state: failed ? 'failed' : 'completed',
    stopReason: getQueryTerminalStopReason(options.result),
  }
}

function getQueryTerminalStopReason(
  result: QueryTurnTerminalResult,
): string | null {
  if (result.stopReason) {
    return result.stopReason
  }
  switch (result.subtype) {
    case 'error_max_budget_usd':
    case 'error_max_turns':
    case 'error_max_structured_output_retries':
      return 'max_turn_requests'
    default:
      return null
  }
}

function createTerminalEvent(options: {
  conversationId: string
  turnId: string
  type: 'turn.completed' | 'turn.failed'
  state: 'completed' | 'failed'
  stopReason: string | null
}): KernelEvent {
  return {
    conversationId: options.conversationId,
    turnId: options.turnId,
    type: options.type,
    replayable: true,
    payload: {
      conversationId: options.conversationId,
      turnId: options.turnId,
      state: options.state,
      stopReason: options.stopReason,
    },
  }
}
