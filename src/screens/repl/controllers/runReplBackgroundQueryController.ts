import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { ProcessUserInputContext } from '../../../utils/processUserInput/processUserInput.js'
import type { Message as MessageType } from '../../../types/message.js'
import type { QueuedCommand } from '../../../types/textInputTypes.js'
import type { SetAppState } from '../../../utils/messageQueueManager.js'
import type { QueryParams } from '../../../query.js'
import type { KernelPreparedReplRuntimeQuery } from '../../../kernel/replRuntimeController.js'

export type RunReplBackgroundQueryControllerOptions = {
  abortForegroundQuery(): void
  removeTaskNotifications(): QueuedCommand[]
  getCurrentMessages(): MessageType[]
  getToolUseContext(
    messages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    mainLoopModel: string,
  ): ProcessUserInputContext
  mainLoopModel: string
  mainThreadAgentDefinition: AgentDefinition | undefined
  prepareBackgroundQuery(params: {
    toolUseContext: ProcessUserInputContext
    mainThreadAgentDefinition: AgentDefinition | undefined
  }): Promise<KernelPreparedReplRuntimeQuery>
  getNotificationMessages(
    removedNotifications: QueuedCommand[],
  ): Promise<MessageType[]>
  canUseTool: QueryParams['canUseTool']
  querySource: QueryParams['querySource']
  description: string
  setAppState: SetAppState
  startBackgroundSession(params: {
    messages: MessageType[]
    queryParams: Omit<QueryParams, 'messages'>
    description: string
    setAppState: SetAppState
    agentDefinition: AgentDefinition | undefined
  }): void
}

export async function runReplBackgroundQueryController(
  options: RunReplBackgroundQueryControllerOptions,
): Promise<void> {
  options.abortForegroundQuery()
  const removedNotifications = options.removeTaskNotifications()
  const currentMessages = options.getCurrentMessages()
  const toolUseContext = options.getToolUseContext(
    currentMessages,
    [],
    new AbortController(),
    options.mainLoopModel,
  )
  const preparedQuery = await options.prepareBackgroundQuery({
    toolUseContext,
    mainThreadAgentDefinition: options.mainThreadAgentDefinition,
  })

  const notificationMessages = await options
    .getNotificationMessages(removedNotifications)
    .catch(() => [])

  const existingPrompts = new Set<string>()
  for (const message of currentMessages) {
    if (
      message.type === 'attachment' &&
      message.attachment?.type === 'queued_command' &&
      message.attachment.commandMode === 'task-notification' &&
      typeof message.attachment.prompt === 'string'
    ) {
      existingPrompts.add(message.attachment.prompt)
    }
  }

  const uniqueNotifications = notificationMessages.filter(
    message =>
      message.type !== 'attachment' ||
      message.attachment?.type !== 'queued_command' ||
      message.attachment.commandMode !== 'task-notification' ||
      typeof message.attachment.prompt !== 'string' ||
      !existingPrompts.has(message.attachment.prompt),
  )

  options.startBackgroundSession({
    messages: [...currentMessages, ...uniqueNotifications],
    queryParams: {
      systemPrompt: preparedQuery.systemPrompt,
      userContext: preparedQuery.userContext,
      systemContext: preparedQuery.systemContext,
      canUseTool: options.canUseTool,
      toolUseContext: preparedQuery.toolUseContext,
      querySource: options.querySource,
    },
    description: options.description,
    setAppState: options.setAppState,
    agentDefinition: options.mainThreadAgentDefinition,
  })
}
