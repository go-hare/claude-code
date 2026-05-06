import type { UUID } from 'crypto'
import type { ProtocolStdoutMessage } from 'src/types/protocol/controlTypes.js'
import type { KernelEvent } from '../../../contracts/events.js'
import type {
  RuntimeTaskNotificationPayload,
  RuntimeTaskTerminalStatus,
  RuntimeTaskUsage,
} from '../../../contracts/task.js'
import {
  createCoordinatorLifecycleEvent,
  type CoordinatorLifecycleRuntimeEvent,
} from './headlessCoordinatorLifecycleEvents.js'

export type RuntimeTurnPreludeEvent = Omit<
  KernelEvent,
  'runtimeId' | 'eventId' | 'conversationId' | 'turnId'
>

export type HeadlessTaskNotificationProjection = {
  runtimeEvent: RuntimeTurnPreludeEvent
  handoffEvent: CoordinatorLifecycleRuntimeEvent
  protocolMessage: ProtocolStdoutMessage
}

export function projectHeadlessTaskNotification({
  value,
  sessionId,
  uuid,
}: {
  value: unknown
  sessionId: string
  uuid: UUID
}): HeadlessTaskNotificationProjection | undefined {
  const notificationText = typeof value === 'string' ? value : ''
  const taskId = readXmlTag(notificationText, 'task-id') ?? ''
  const rawStatus = readXmlTag(notificationText, 'status')
  const status = normalizeTaskStatus(rawStatus)
  if (!status) {
    return undefined
  }

  const toolUseId = readXmlTag(notificationText, 'tool-use-id')
  const outputFile = readXmlTag(notificationText, 'output-file') ?? ''
  const summary = readXmlTag(notificationText, 'summary') ?? ''
  const usage = readUsage(notificationText)
  const payload: RuntimeTaskNotificationPayload = {
    taskId,
    ...(toolUseId ? { toolUseId } : {}),
    status,
    outputFile,
    summary,
    ...(usage ? { usage } : {}),
    source: 'queued_task_notification',
  }

  return {
    runtimeEvent: {
      type: 'tasks.notification',
      replayable: true,
      payload,
      metadata: {
        compatibilityProjection: 'headless.sdk_task_notification',
      },
    },
    handoffEvent: createCoordinatorLifecycleEvent({
      type: status === 'completed' ? 'handoff.completed' : 'handoff.failed',
      phase: 'handoff',
      state: status === 'completed' ? 'completed' : 'failed',
      source: 'queued_task_notification',
      taskId: payload.taskId,
      toolUseId: payload.toolUseId,
      status,
      summary,
      reason: status === 'completed' ? undefined : status,
    }),
    protocolMessage: {
      type: 'system',
      subtype: 'task_notification',
      task_id: payload.taskId,
      ...(payload.toolUseId ? { tool_use_id: payload.toolUseId } : {}),
      status: payload.status,
      output_file: payload.outputFile,
      summary: payload.summary,
      ...(payload.usage ? { usage: payload.usage } : {}),
      session_id: sessionId,
      uuid,
    } as ProtocolStdoutMessage,
  }
}

function normalizeTaskStatus(
  status: string | undefined,
): RuntimeTaskTerminalStatus | undefined {
  switch (status) {
    case 'completed':
    case 'failed':
    case 'stopped':
      return status
    case 'killed':
      return 'stopped'
    default:
      return undefined
  }
}

function readUsage(notificationText: string): RuntimeTaskUsage | undefined {
  const usageContent = readXmlTag(notificationText, 'usage') ?? ''
  const totalTokens = readNumberTag(usageContent, 'total_tokens')
  const toolUses = readNumberTag(usageContent, 'tool_uses')
  if (totalTokens === undefined || toolUses === undefined) {
    return undefined
  }
  return {
    total_tokens: totalTokens,
    tool_uses: toolUses,
    duration_ms: readNumberTag(usageContent, 'duration_ms') ?? 0,
  }
}

function readNumberTag(text: string, tag: string): number | undefined {
  const value = readXmlTag(text, tag)
  if (value === undefined) {
    return undefined
  }
  const number = parseInt(value, 10)
  return Number.isNaN(number) ? undefined : number
}

function readXmlTag(text: string, tag: string): string | undefined {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match?.[1]
}
