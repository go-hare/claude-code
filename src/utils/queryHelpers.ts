import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import last from 'lodash-es/last.js'
import {
  getSessionId,
  isSessionPersistenceDisabled,
} from 'src/bootstrap/state.js'
import type { SDKMessage } from 'src/entrypoints/agentSdkTypes.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import { runTools } from '../services/tools/toolOrchestration.js'
import { findToolByName, type Tool, type Tools } from '../Tool.js'
import { BASH_TOOL_NAME } from '@go-hare/builtin-tools/tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '@go-hare/builtin-tools/tools/FileEditTool/constants.js'
import type { Input as FileReadInput } from '@go-hare/builtin-tools/tools/FileReadTool/FileReadTool.js'
import {
  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB,
} from '@go-hare/builtin-tools/tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '@go-hare/builtin-tools/tools/FileWriteTool/prompt.js'
import type {
  AssistantMessage,
  Message,
  UserMessage,
} from '../types/message.js'
import type { OrphanedPermission } from '../types/textInputTypes.js'
import { logForDebugging } from './debug.js'
import { isEnvTruthy } from './envUtils.js'
import { isFsInaccessible } from './errors.js'
import { getFileModificationTime, stripLineNumberPrefix } from './file.js'
import { readFileSyncWithMetadata } from './fileRead.js'
import {
  createFileStateCacheWithSizeLimit,
  type FileStateCache,
} from './fileStateCache.js'
import { isNotEmptyMessage, normalizeMessages } from './messages.js'
import { expandPath } from './path.js'
import type {
  inputSchema as permissionToolInputSchema,
  outputSchema as permissionToolOutputSchema,
} from './permissions/PermissionPromptToolResultSchema.js'
import type { ProcessUserInputContext } from './processUserInput/processUserInput.js'
import { recordTranscript } from './sessionStorage.js'

export type PermissionPromptTool = Tool<
  ReturnType<typeof permissionToolInputSchema>,
  ReturnType<typeof permissionToolOutputSchema>
>

// Small cache size for ask operations which typically access few files
// during permission prompts or limited tool operations
const ASK_READ_FILE_STATE_CACHE_SIZE = 10

/** Transcript JSON may deserialize Write tool `content` as a nested object — LRU needs strings. */
function coerceToolContentToString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Checks if the result should be considered successful based on the last message.
 * Returns true if:
 * - Last message is assistant with text/thinking content
 * - Last message is user with only tool_result blocks
 * - Last message is the user prompt but the API completed with end_turn
 *   (model chose to emit no content blocks)
 */
export function isResultSuccessful(
  message: Message | undefined,
  stopReason: string | null = null,
): message is Message {
  if (!message) return false

  if (message.type === 'assistant') {
    const content = message.message!.content
    const lastContent = Array.isArray(content) ? content[content.length - 1] : undefined
    return (
      lastContent?.type === 'text' ||
      lastContent?.type === 'thinking' ||
      lastContent?.type === 'redacted_thinking'
    )
  }

  if (message.type === 'user') {
    // Check if all content blocks are tool_result type
    const content = message.message!.content
    if (
      Array.isArray(content) &&
      content.length > 0 &&
      content.every(block => 'type' in block && block.type === 'tool_result')
    ) {
      return true
    }
  }

  // Carve-out: API completed (message_delta set stop_reason) but yielded
  // no assistant content — last(messages) is still this turn's prompt.
  // claude.ts:2026 recognizes end_turn-with-zero-content-blocks as
  // legitimate and passes through without throwing. Observed on
  // task_notification drain turns: model returns stop_reason=end_turn,
  // outputTokens=4, textContentLength=0 — it saw the subagent result
  // and decided nothing needed saying. Without this, QueryEngine emits
  // error_during_execution with errors[] = the entire process's
  // accumulated logError() buffer. Covers both string-content and
  // text-block-content user prompts, and any other non-passing shape.
  return stopReason === 'end_turn'
}

// Track last sent time for tool progress messages per tool use ID
// Keep only the last 100 entries to prevent unbounded growth
const MAX_TOOL_PROGRESS_TRACKING_ENTRIES = 100
const TOOL_PROGRESS_THROTTLE_MS = 30000
const toolProgressLastSentTime = new Map<string, number>()

export type ToolProgressTrackingState = {
  lastSentTimeByParentToolUseId: Map<string, number>
}

export type ProjectProgressMessageOptions = {
  now?: number
  remoteEnabled?: boolean
  sessionId?: string
  trackingState?: ToolProgressTrackingState
}

export type ToolProgressTrackingUpdate = {
  trackingKey: string
  sentAt: number
}

export type ProgressMessageSDKProjection = {
  messages: SDKMessage[]
  trackingUpdate?: ToolProgressTrackingUpdate
}

const defaultToolProgressTrackingState: ToolProgressTrackingState = {
  lastSentTimeByParentToolUseId: toolProgressLastSentTime,
}

export function createToolProgressTrackingState(
  entries?: Iterable<readonly [string, number]>,
): ToolProgressTrackingState {
  return {
    lastSentTimeByParentToolUseId: new Map(entries),
  }
}

function getProjectionSessionId(sessionId?: string): string {
  return sessionId ?? getSessionId()
}

export function projectAssistantMessageToSDKMessages(
  message: AssistantMessage,
  options: {
    parentToolUseId?: string | null
    sessionId?: string
  } = {},
): SDKMessage[] {
  return normalizeMessages([message])
    .filter(isNotEmptyMessage)
    .map(normalized => ({
      type: 'assistant',
      message: normalized.message,
      parent_tool_use_id: options.parentToolUseId ?? null,
      session_id: getProjectionSessionId(options.sessionId),
      uuid: normalized.uuid,
      error: normalized.error,
    }))
}

export function projectUserMessageToSDKMessages(
  message: UserMessage,
  options: {
    parentToolUseId?: string | null
    sessionId?: string
  } = {},
): SDKMessage[] {
  return normalizeMessages([message]).map(normalized => ({
    type: 'user',
    message: normalized.message,
    parent_tool_use_id: options.parentToolUseId ?? null,
    session_id: getProjectionSessionId(options.sessionId),
    uuid: normalized.uuid,
    timestamp: normalized.timestamp,
    isSynthetic: normalized.isMeta || normalized.isVisibleInTranscriptOnly,
    tool_use_result: normalized.mcpMeta
      ? {
          content: normalized.toolUseResult,
          ...(normalized.mcpMeta as Record<string, unknown>),
        }
      : normalized.toolUseResult,
  }))
}

function projectNestedProgressMessageToSDKMessages(
  message: Message,
  options: {
    parentToolUseId: string | null
    sessionId?: string
  },
): SDKMessage[] {
  switch (message.type) {
    case 'assistant':
      return projectAssistantMessageToSDKMessages(
        message as AssistantMessage,
        options,
      )
    case 'user':
      return projectUserMessageToSDKMessages(
        message as UserMessage,
        options,
      )
    default:
      return []
  }
}

function shouldEmitToolProgressUpdate(options: {
  now: number
  trackingKey: string
  trackingState: ToolProgressTrackingState
}): boolean {
  const lastSent =
    options.trackingState.lastSentTimeByParentToolUseId.get(
      options.trackingKey,
    ) ?? 0
  return options.now - lastSent >= TOOL_PROGRESS_THROTTLE_MS
}

export function applyToolProgressTrackingUpdate(
  trackingState: ToolProgressTrackingState,
  update: ToolProgressTrackingUpdate,
): void {
  const { lastSentTimeByParentToolUseId } = trackingState
  if (
    lastSentTimeByParentToolUseId.size >=
    MAX_TOOL_PROGRESS_TRACKING_ENTRIES
  ) {
    const firstKey = lastSentTimeByParentToolUseId.keys().next().value
    if (firstKey !== undefined) {
      lastSentTimeByParentToolUseId.delete(firstKey)
    }
  }

  lastSentTimeByParentToolUseId.set(update.trackingKey, update.sentAt)
}

function createToolProgressSDKMessage(options: {
  elapsedTimeSeconds: number
  parentToolUseId: string
  progressType: 'bash_progress' | 'powershell_progress'
  sessionId?: string
  taskId: string
  toolUseId: string
  uuid: string
}): SDKMessage {
  return {
    type: 'tool_progress',
    tool_use_id: options.toolUseId,
    tool_name: options.progressType === 'bash_progress' ? 'Bash' : 'PowerShell',
    parent_tool_use_id: options.parentToolUseId,
    elapsed_time_seconds: options.elapsedTimeSeconds,
    task_id: options.taskId,
    session_id: getProjectionSessionId(options.sessionId),
    uuid: options.uuid,
  }
}

export function projectProgressMessageToSDKMessageProjection(
  message: Message,
  options: Required<ProjectProgressMessageOptions>,
): ProgressMessageSDKProjection {
  if (message.type !== 'progress') {
    return { messages: [] }
  }

  const progressData = message.data as {
    type: string
    message: Message
    elapsedTimeSeconds: number
    taskId: string
  }
  if (
    progressData.type === 'agent_progress' ||
    progressData.type === 'skill_progress'
  ) {
    return {
      messages: projectNestedProgressMessageToSDKMessages(
        progressData.message,
        {
          parentToolUseId: message.parentToolUseID as string | null,
          sessionId: options.sessionId,
        },
      ),
    }
  }

  if (
    progressData.type !== 'bash_progress' &&
    progressData.type !== 'powershell_progress'
  ) {
    return { messages: [] }
  }

  if (!options.remoteEnabled) {
    return { messages: [] }
  }

  const trackingKey = message.parentToolUseID as string
  if (
    !shouldEmitToolProgressUpdate({
      now: options.now,
      trackingKey,
      trackingState: options.trackingState,
    })
  ) {
    return { messages: [] }
  }

  return {
    messages: [
      createToolProgressSDKMessage({
        elapsedTimeSeconds: progressData.elapsedTimeSeconds,
        parentToolUseId: message.parentToolUseID as string,
        progressType: progressData.type,
        sessionId: options.sessionId,
        taskId: progressData.taskId,
        toolUseId: message.toolUseID as string,
        uuid: message.uuid,
      }),
    ],
    trackingUpdate: {
      trackingKey,
      sentAt: options.now,
    },
  }
}

function resolveProjectProgressMessageOptions(
  options: ProjectProgressMessageOptions,
): Required<ProjectProgressMessageOptions> {
  return {
    now: options.now ?? Date.now(),
    remoteEnabled:
      options.remoteEnabled ??
      (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ||
        Boolean(process.env.CLAUDE_CODE_CONTAINER_ID)),
    sessionId: getProjectionSessionId(options.sessionId),
    trackingState:
      options.trackingState ?? defaultToolProgressTrackingState,
  }
}

export function projectProgressMessageToSDKMessages(
  message: Message,
  options: ProjectProgressMessageOptions = {},
): SDKMessage[] {
  const resolvedOptions = resolveProjectProgressMessageOptions(options)
  const projection = projectProgressMessageToSDKMessageProjection(
    message,
    resolvedOptions,
  )
  if (projection.trackingUpdate) {
    applyToolProgressTrackingUpdate(
      resolvedOptions.trackingState,
      projection.trackingUpdate,
    )
  }
  return projection.messages
}

export function* normalizeMessage(message: Message): Generator<SDKMessage> {
  switch (message.type) {
    case 'assistant':
      yield* projectAssistantMessageToSDKMessages(
        message as AssistantMessage,
      )
      return
    case 'progress': {
      yield* projectProgressMessageToSDKMessages(message)
      break
    }
    case 'user':
      yield* projectUserMessageToSDKMessages(message as UserMessage)
      return
    default:
    // yield nothing
  }
}

export async function* handleOrphanedPermission(
  orphanedPermission: OrphanedPermission,
  tools: Tools,
  mutableMessages: Message[],
  processUserInputContext: ProcessUserInputContext,
): AsyncGenerator<Message, void, unknown> {
  const persistSession = !isSessionPersistenceDisabled()
  const { permissionResult, assistantMessage } = orphanedPermission
  const toolUseID = (permissionResult as { toolUseID?: string }).toolUseID

  if (!toolUseID) {
    return
  }

  const content = assistantMessage.message.content
  let toolUseBlock: ToolUseBlock | undefined
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'tool_use' && block.id === toolUseID) {
        toolUseBlock = block as ToolUseBlock
        break
      }
    }
  }

  if (!toolUseBlock) {
    return
  }

  const toolName = toolUseBlock.name
  const toolInput = toolUseBlock.input

  const toolDefinition = findToolByName(tools, toolName)
  if (!toolDefinition) {
    return
  }

  // Create ToolUseBlock with the updated input if permission was allowed
  let finalInput = toolInput
  if (permissionResult.behavior === 'allow') {
    const allowResult = permissionResult as { behavior: 'allow'; updatedInput?: unknown }
    if (allowResult.updatedInput !== undefined) {
      finalInput = allowResult.updatedInput
    } else {
      logForDebugging(
        `Orphaned permission for ${toolName}: updatedInput is undefined, falling back to original tool input`,
        { level: 'warn' },
      )
    }
  }
  const finalToolUseBlock: ToolUseBlock = {
    ...toolUseBlock,
    input: finalInput,
  }

  const canUseTool: CanUseToolFn = (async () => {
    if (permissionResult.behavior === 'allow') {
      return {
        behavior: 'allow' as const,
        updatedInput: (permissionResult as { updatedInput?: Record<string, unknown> }).updatedInput,
        decisionReason: {
          type: 'mode' as const,
          mode: 'default' as const,
        },
      }
    }
    return {
      behavior: 'deny' as const,
      message: (permissionResult as { message?: string }).message,
      decisionReason: {
        type: 'mode' as const,
        mode: 'default' as const,
      },
    }
  }) as CanUseToolFn

  // Add the assistant message with tool_use to messages BEFORE executing
  // so the conversation history is complete (tool_use -> tool_result).
  //
  // On CCR resume, mutableMessages is seeded from the transcript and may already
  // contain this tool_use. Pushing again would make normalizeMessagesForAPI merge
  // same-ID assistants (concatenating content) and produce a duplicate tool_use
  // ID, which the API rejects with "tool_use ids must be unique".
  //
  // Check for the specific tool_use_id rather than message.id: streaming yields
  // each content block as a separate AssistantMessage sharing one message.id, so
  // a [text, tool_use] response lands as two entries. filterUnresolvedToolUses may
  // strip the tool_use entry but keep the text one; an id-based check would then
  // wrongly skip the push while runTools below still executes, orphaning the result.
  const alreadyPresent = mutableMessages.some(
    m =>
      m.type === 'assistant' &&
      Array.isArray(m.message!.content) &&
      m.message!.content.some(
        b => b.type === 'tool_use' && 'id' in b && b.id === toolUseID,
      ),
  )
  if (!alreadyPresent) {
    mutableMessages.push(assistantMessage)
    if (persistSession) {
      await recordTranscript(mutableMessages)
    }
  }

  yield assistantMessage

  // Execute the tool - errors are handled internally by runToolUse
  for await (const update of runTools(
    [finalToolUseBlock],
    [assistantMessage],
    canUseTool,
    processUserInputContext,
  )) {
    if (update.message) {
      mutableMessages.push(update.message)
      if (persistSession) {
        await recordTranscript(mutableMessages)
      }

      yield update.message
    }
  }
}

// Create a function to extract read files from messages
export function extractReadFilesFromMessages(
  messages: Message[],
  cwd: string,
  maxSize: number = ASK_READ_FILE_STATE_CACHE_SIZE,
): FileStateCache {
  const cache = createFileStateCacheWithSizeLimit(maxSize)

  // First pass: find all FileReadTool/FileWriteTool/FileEditTool uses in assistant messages
  const fileReadToolUseIds = new Map<string, string>() // toolUseId -> filePath
  const fileWriteToolUseIds = new Map<
    string,
    { filePath: string; content: string }
  >() // toolUseId -> { filePath, content }
  const fileEditToolUseIds = new Map<string, string>() // toolUseId -> filePath

  for (const message of messages) {
    if (
      message.type === 'assistant' &&
      Array.isArray(message.message!.content)
    ) {
      for (const content of message.message!.content) {
        if (
          content.type === 'tool_use' &&
          content.name === FILE_READ_TOOL_NAME
        ) {
          // Extract file_path from the tool use input
          const input = content.input as FileReadInput | undefined
          // Ranged reads are not added to the cache.
          if (
            input?.file_path &&
            input?.offset === undefined &&
            input?.limit === undefined
          ) {
            // Normalize to absolute path for consistent cache lookups
            const absolutePath = expandPath(input.file_path, cwd)
            fileReadToolUseIds.set(content.id, absolutePath)
          }
        } else if (
          content.type === 'tool_use' &&
          content.name === FILE_WRITE_TOOL_NAME
        ) {
          // Extract file_path and content from the Write tool use input
          const input = content.input as
            | { file_path?: string; content?: unknown }
            | undefined
          if (
            input?.file_path &&
            input.content !== undefined &&
            input.content !== null
          ) {
            // Normalize to absolute path for consistent cache lookups
            const absolutePath = expandPath(input.file_path, cwd)
            fileWriteToolUseIds.set(content.id, {
              filePath: absolutePath,
              content: coerceToolContentToString(input.content),
            })
          }
        } else if (
          content.type === 'tool_use' &&
          content.name === FILE_EDIT_TOOL_NAME
        ) {
          // Edit's input has old_string/new_string, not the resulting content.
          // Track the path so the second pass can read current disk state.
          const input = content.input as { file_path?: string } | undefined
          if (input?.file_path) {
            const absolutePath = expandPath(input.file_path, cwd)
            fileEditToolUseIds.set(content.id, absolutePath)
          }
        }
      }
    }
  }

  // Second pass: find corresponding tool results and extract content
  for (const message of messages) {
    if (message.type === 'user' && Array.isArray(message.message!.content)) {
      for (const content of message.message!.content) {
        if (content.type === 'tool_result' && content.tool_use_id) {
          // Handle Read tool results
          const readFilePath = fileReadToolUseIds.get(content.tool_use_id)
          if (
            readFilePath &&
            typeof content.content === 'string' &&
            // Dedup stubs contain no file content — the earlier real Read
            // already cached it. Chronological last-wins would otherwise
            // overwrite the real entry with stub text.
            !content.content.startsWith(FILE_UNCHANGED_STUB)
          ) {
            // Remove system-reminder blocks from the content
            const processedContent = content.content.replace(
              /<system-reminder>[\s\S]*?<\/system-reminder>/g,
              '',
            )

            // Extract the actual file content from the tool result
            // Tool results for text files contain line numbers, we need to strip those
            const fileContent = processedContent
              .split('\n')
              .map(stripLineNumberPrefix)
              .join('\n')
              .trim()

            // Cache the file content with the message timestamp
            if (message.timestamp) {
              const timestamp = new Date(message.timestamp as string | number).getTime()
              cache.set(readFilePath, {
                content: fileContent,
                timestamp,
                offset: undefined,
                limit: undefined,
              })
            }
          }

          // Handle Write tool results - use content from the tool input
          const writeToolData = fileWriteToolUseIds.get(content.tool_use_id)
          if (writeToolData && message.timestamp) {
            const timestamp = new Date(message.timestamp as string | number).getTime()
            cache.set(writeToolData.filePath, {
              content: writeToolData.content,
              timestamp,
              offset: undefined,
              limit: undefined,
            })
          }

          // Handle Edit tool results — post-edit content isn't in the
          // tool_use input (only old_string/new_string) nor fully in the
          // result (only a snippet). Read from disk now, using actual mtime
          // so getChangedFiles's mtime check passes on the next turn.
          //
          // Callers seed the cache once at process start (print.ts --resume,
          // Cowork cold-restart per turn), so disk content at extraction time
          // IS the post-edit state. No dedup: processing every Edit preserves
          // last-wins semantics when Read/Write interleave (Edit→Read→Edit).
          const editFilePath = fileEditToolUseIds.get(content.tool_use_id)
          if (editFilePath && content.is_error !== true) {
            try {
              const { content: diskContent } =
                readFileSyncWithMetadata(editFilePath)
              cache.set(editFilePath, {
                content: diskContent,
                timestamp: getFileModificationTime(editFilePath),
                offset: undefined,
                limit: undefined,
              })
            } catch (e: unknown) {
              if (!isFsInaccessible(e)) {
                throw e
              }
              // File deleted or inaccessible since the Edit — skip
            }
          }
        }
      }
    }
  }

  return cache
}

export function extractLoadedNestedMemoryPathsFromMessages(
  messages: Message[],
): Set<string> {
  const paths = new Set<string>()

  for (const message of messages) {
    if (message.type !== 'attachment') {
      continue
    }

    const attachment = message.attachment as
      | { type?: string; path?: unknown }
      | undefined
    if (attachment?.type !== 'nested_memory') {
      continue
    }

    if (
      typeof attachment.path === 'string' &&
      attachment.path.trim().length > 0
    ) {
      paths.add(attachment.path)
    }
  }

  return paths
}

/**
 * Extract the top-level CLI tools used in BashTool calls from message history.
 * Returns a deduplicated set of command names (e.g. 'vercel', 'aws', 'git').
 */
export function extractBashToolsFromMessages(messages: Message[]): Set<string> {
  const tools = new Set<string>()
  for (const message of messages) {
    if (
      message.type === 'assistant' &&
      Array.isArray(message.message!.content)
    ) {
      for (const content of message.message!.content) {
        if (content.type === 'tool_use' && content.name === BASH_TOOL_NAME) {
          const { input } = content
          if (
            typeof input !== 'object' ||
            input === null ||
            !('command' in input)
          )
            continue
          const cmd = extractCliName(
            typeof input.command === 'string' ? input.command : undefined,
          )
          if (cmd) {
            tools.add(cmd)
          }
        }
      }
    }
  }
  return tools
}

const STRIPPED_COMMANDS = new Set(['sudo'])

/**
 * Extract the actual CLI name from a bash command string, skipping
 * env var assignments (e.g. `FOO=bar vercel` → `vercel`) and prefixes
 * in STRIPPED_COMMANDS.
 */
function extractCliName(command: string | undefined): string | undefined {
  if (!command) return undefined
  const tokens = command.trim().split(/\s+/)
  for (const token of tokens) {
    if (/^[A-Za-z_]\w*=/.test(token)) continue
    if (STRIPPED_COMMANDS.has(token)) continue
    return token
  }
  return undefined
}
