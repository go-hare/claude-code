import type {
  KernelContextAssembly,
  KernelContextEntry,
  KernelContextSource,
} from '../runtime/contracts/context.js'
import type { Attachment } from './attachments.js'
import type { QueuedCommand } from '../types/textInputTypes.js'

type AttachmentType = Attachment['type']

const MEMORY_ATTACHMENT_TYPES = new Set<AttachmentType>([
  'nested_memory',
  'relevant_memories',
  'current_session_memory',
])

const SKILL_ATTACHMENT_TYPES = new Set<AttachmentType>([
  'dynamic_skill',
  'skill_listing',
  'skill_discovery',
  'invoked_skills',
])

const TASK_ATTACHMENT_TYPES = new Set<AttachmentType>([
  'task_reminder',
  'task_status',
  'active_task_completion_reminder',
  'teammate_mailbox',
  'team_context',
  'teammate_shutdown_batch',
])

const TOOL_ATTACHMENT_TYPES = new Set<AttachmentType>([
  'command_permissions',
  'deferred_tools_delta',
  'mcp_instructions_delta',
])

const OPERATOR_ATTACHMENT_TYPES = new Set<AttachmentType>([
  'diagnostics',
  'token_usage',
  'budget_usd',
  'output_token_usage',
  'context_efficiency',
  'bagel_console',
])

const NON_MODEL_VISIBLE_ATTACHMENT_TYPES = new Set<AttachmentType>([
  'already_read_file',
  'command_permissions',
  'dynamic_skill',
  'edited_image_file',
  'hook_cancelled',
  'hook_error_during_execution',
  'hook_non_blocking_error',
  'hook_permission_decision',
  'hook_system_message',
  'max_turns_reached',
  'structured_output',
  'bagel_console',
])

const HOST_VISIBLE_CONTEXT_SOURCES = new Set<KernelContextSource>([
  'memory',
  'skill',
  'task',
  'tool',
  'agent',
])

export function createAttachmentContextAssembly(
  attachments: readonly Attachment[],
  attachedQueuedCommands: readonly QueuedCommand[],
): KernelContextAssembly {
  return {
    modelVisible: attachments
      .filter(isModelVisibleAttachment)
      .map(toModelVisibleEntry),
    hostVisible: createHostVisibleEntries(attachments, attachedQueuedCommands),
    operatorDebug: createOperatorDebugEntries(attachments, attachedQueuedCommands),
  }
}

function isModelVisibleAttachment(attachment: Attachment): boolean {
  if (NON_MODEL_VISIBLE_ATTACHMENT_TYPES.has(attachment.type)) {
    return false
  }
  if (attachment.type === 'hook_success') {
    return (
      attachment.content !== '' &&
      (attachment.hookEvent === 'SessionStart' ||
        attachment.hookEvent === 'UserPromptSubmit')
    )
  }
  if (attachment.type === 'hook_additional_context') {
    return attachment.content.length > 0
  }
  if (attachment.type === 'diagnostics') {
    return attachment.files.length > 0
  }
  if (attachment.type === 'skill_discovery') {
    return attachment.skills.length > 0
  }
  if (attachment.type === 'mcp_resource') {
    return attachment.content.contents.length > 0
  }
  return true
}

function toModelVisibleEntry(
  attachment: Attachment,
  index: number,
): KernelContextEntry {
  return {
    id: getAttachmentId(attachment, index),
    type: attachment.type,
    category: 'model_visible',
    source: getAttachmentSource(attachment.type),
    metadata: getAttachmentMetadata(attachment, index),
  }
}

function createHostVisibleEntries(
  attachments: readonly Attachment[],
  attachedQueuedCommands: readonly QueuedCommand[],
): KernelContextEntry[] {
  const entries: KernelContextEntry[] = []
  for (const attachment of attachments) {
    if (attachment.type !== 'queued_command') {
      continue
    }
    const entry: KernelContextEntry = {
      type: 'queued_command.consumed',
      category: 'host_visible',
      source: 'queued_command',
      metadata: {
        commandMode: attachment.commandMode,
        origin: attachment.origin,
        isMeta: attachment.isMeta,
        imagePasteIds: attachment.imagePasteIds,
      },
    }
    if (attachment.source_uuid) {
      entries.push({ ...entry, id: attachment.source_uuid })
    } else {
      entries.push(entry)
    }
  }
  for (const [index, attachment] of attachments.entries()) {
    const entry = toHostVisibleEntry(attachment, index)
    if (entry) {
      entries.push(entry)
    }
  }
  if (attachedQueuedCommands.length > 0) {
    entries.push({
      type: 'queued_command.batch',
      category: 'host_visible',
      source: 'queued_command',
      metadata: {
        count: attachedQueuedCommands.length,
        uuids: attachedQueuedCommands.map(command => command.uuid),
        modes: attachedQueuedCommands.map(command => command.mode),
      },
    })
  }
  return entries
}

function createOperatorDebugEntries(
  attachments: readonly Attachment[],
  attachedQueuedCommands: readonly QueuedCommand[],
): KernelContextEntry[] {
  const countsByType: Record<string, number> = {}
  const countsBySource: Record<string, number> = {}
  for (const attachment of attachments) {
    countsByType[attachment.type] = (countsByType[attachment.type] ?? 0) + 1
    const source = getAttachmentSource(attachment.type)
    countsBySource[source] = (countsBySource[source] ?? 0) + 1
  }

  const entries: KernelContextEntry[] = [
    {
      type: 'context_assembly.summary',
      category: 'operator_debug',
      source: 'runtime',
      metadata: {
        attachmentCount: attachments.length,
        attachedQueuedCommandCount: attachedQueuedCommands.length,
        countsByType,
        countsBySource,
      },
    },
  ]

  for (const attachment of attachments) {
    if (!OPERATOR_ATTACHMENT_TYPES.has(attachment.type)) {
      continue
    }
    entries.push({
      id: getAttachmentId(attachment, entries.length),
      type: attachment.type,
      category: 'operator_debug',
      source: getAttachmentSource(attachment.type),
      metadata: { attachmentType: attachment.type },
    })
  }

  return entries
}

function toHostVisibleEntry(
  attachment: Attachment,
  index: number,
): KernelContextEntry | undefined {
  const source = getAttachmentSource(attachment.type)
  if (!HOST_VISIBLE_CONTEXT_SOURCES.has(source)) {
    return undefined
  }
  return {
    id: getAttachmentId(attachment, index),
    type: `${source}.${attachment.type}`,
    category: 'host_visible',
    source,
    metadata: getAttachmentMetadata(attachment, index),
  }
}

function getAttachmentMetadata(
  attachment: Attachment,
  index: number,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    attachmentType: attachment.type,
    index,
  }
  switch (attachment.type) {
    case 'nested_memory':
      return {
        ...metadata,
        path: attachment.path,
        displayPath: attachment.displayPath,
      }
    case 'relevant_memories':
      return {
        ...metadata,
        memoryCount: attachment.memories.length,
        paths: attachment.memories.map(memory => memory.path),
      }
    case 'current_session_memory':
      return {
        ...metadata,
        path: attachment.path,
        tokenCount: attachment.tokenCount,
      }
    case 'dynamic_skill':
      return {
        ...metadata,
        skillDir: attachment.skillDir,
        displayPath: attachment.displayPath,
        skillNames: attachment.skillNames,
        skillCount: attachment.skillNames.length,
      }
    case 'skill_listing':
      return {
        ...metadata,
        skillCount: attachment.skillCount,
        isInitial: attachment.isInitial,
      }
    case 'skill_discovery':
      return {
        ...metadata,
        skillCount: attachment.skills.length,
        skillNames: attachment.skills.map(skill => skill.name),
        discoverySource: attachment.source,
      }
    case 'invoked_skills':
      return {
        ...metadata,
        skillCount: attachment.skills.length,
        skillNames: attachment.skills.map(skill => skill.name),
        paths: attachment.skills.map(skill => skill.path),
      }
    case 'task_reminder':
      return { ...metadata, itemCount: attachment.itemCount }
    case 'task_status':
      return {
        ...metadata,
        taskId: attachment.taskId,
        taskType: attachment.taskType,
        status: attachment.status,
        linkedTaskId: attachment.linkedTaskId,
        linkedTaskStatus: attachment.linkedTaskStatus,
      }
    case 'active_task_completion_reminder':
      return {
        ...metadata,
        taskId: attachment.taskId,
        subject: attachment.subject,
      }
    case 'teammate_mailbox':
      return {
        ...metadata,
        messageCount: attachment.messages.length,
        from: attachment.messages.map(message => message.from),
      }
    case 'team_context':
      return {
        ...metadata,
        agentId: attachment.agentId,
        agentName: attachment.agentName,
        teamName: attachment.teamName,
        teamConfigPath: attachment.teamConfigPath,
        taskListPath: attachment.taskListPath,
      }
    case 'teammate_shutdown_batch':
      return { ...metadata, count: attachment.count }
    case 'agent_listing_delta':
      return {
        ...metadata,
        addedTypes: attachment.addedTypes,
        removedTypes: attachment.removedTypes,
        isInitial: attachment.isInitial,
      }
    case 'agent_mention':
      return { ...metadata, agentType: attachment.agentType }
    case 'command_permissions':
      return {
        ...metadata,
        allowedTools: attachment.allowedTools,
        model: attachment.model,
      }
    case 'deferred_tools_delta':
      return {
        ...metadata,
        addedNames: attachment.addedNames,
        removedNames: attachment.removedNames,
      }
    case 'mcp_instructions_delta':
      return {
        ...metadata,
        addedNames: attachment.addedNames,
        removedNames: attachment.removedNames,
      }
    default:
      return metadata
  }
}

function getAttachmentId(attachment: Attachment, index: number): string {
  if ('source_uuid' in attachment && attachment.source_uuid) {
    return attachment.source_uuid
  }
  if ('taskId' in attachment && typeof attachment.taskId === 'string') {
    return attachment.taskId
  }
  if ('path' in attachment && typeof attachment.path === 'string') {
    return attachment.path
  }
  if ('filename' in attachment && typeof attachment.filename === 'string') {
    return attachment.filename
  }
  return `${attachment.type}:${index}`
}

function getAttachmentSource(type: AttachmentType): KernelContextSource {
  if (type === 'queued_command') {
    return 'queued_command'
  }
  if (MEMORY_ATTACHMENT_TYPES.has(type)) {
    return 'memory'
  }
  if (SKILL_ATTACHMENT_TYPES.has(type)) {
    return 'skill'
  }
  if (TASK_ATTACHMENT_TYPES.has(type)) {
    return 'task'
  }
  if (TOOL_ATTACHMENT_TYPES.has(type)) {
    return 'tool'
  }
  if (type === 'agent_listing_delta' || type === 'agent_mention') {
    return 'agent'
  }
  if (OPERATOR_ATTACHMENT_TYPES.has(type)) {
    return 'operator'
  }
  return 'attachment'
}
