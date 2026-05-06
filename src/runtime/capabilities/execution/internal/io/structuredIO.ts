import { feature } from 'bun:bundle'
import type {
  ElicitResult,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'crypto'
import type { AssistantMessage } from 'src//types/message.js'
import type {
  HookInput,
  HookJSONOutput,
  PermissionUpdate as ProtocolPermissionUpdate,
  ProtocolMessage,
  ProtocolUserMessage,
} from 'src/types/protocol/index.js'
import { ProtocolControlElicitationResponseSchema } from 'src/types/protocol/controlSchemas.js'
import type {
  ProtocolControlRequest,
  ProtocolControlResponse,
  ProtocolStdinMessage,
  ProtocolStdoutMessage,
} from 'src/types/protocol/controlTypes.js'
import type { PermissionUpdate as InternalPermissionUpdate } from 'src/types/permissions.js'
import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import type { Tool, ToolUseContext } from 'src/Tool.js'
import { type HookCallback, hookJSONOutputSchema } from 'src/types/hooks.js'
import { logForDebugging } from 'src/utils/debug.js'
import { logForDiagnosticsNoPII } from 'src/utils/diagLogs.js'
import { AbortError } from 'src/utils/errors.js'
import {
  type Output as PermissionToolOutput,
  permissionPromptToolResultToPermissionDecision,
  outputSchema as permissionToolOutputSchema,
} from 'src/utils/permissions/PermissionPromptToolResultSchema.js'
import type {
  PermissionDecision,
  PermissionDecisionReason,
} from 'src/utils/permissions/PermissionResult.js'
import { hasPermissionsToUseTool } from 'src/utils/permissions/permissions.js'
import { createToolPermissionRuntimeContext } from 'src/utils/permissions/runtimePermissionBroker.js'
import type {
  KernelPermissionDecision,
  KernelPermissionRequest,
  KernelPermissionRisk,
} from 'src/runtime/contracts/permissions.js'
import type { RuntimePermissionBroker } from 'src/runtime/capabilities/permissions/RuntimePermissionBroker.js'
import { writeToStdout } from 'src/utils/process.js'
import { jsonStringify } from 'src/utils/slowOperations.js'
import { z } from 'zod/v4'
import { notifyCommandLifecycle } from 'src/utils/commandLifecycle.js'
import { normalizeControlMessageKeys } from 'src/utils/controlMessageCompat.js'
import { executePermissionRequestHooks } from 'src/utils/hooks.js'
import {
  applyPermissionUpdates,
  persistPermissionUpdates,
} from 'src/utils/permissions/PermissionUpdate.js'
import {
  notifySessionStateChanged,
  type RequiresActionDetails,
  type SessionExternalMetadata,
} from 'src/utils/sessionState.js'
import { jsonParse } from 'src/utils/slowOperations.js'
import { Stream } from 'src/utils/stream.js'
import { ndjsonSafeStringify } from './ndjsonSafeStringify.js'

/**
 * Synthetic tool name used when forwarding sandbox network permission
 * requests via the can_use_tool control_request protocol. SDK hosts
 * see this as a normal tool permission prompt.
 */
export const SANDBOX_NETWORK_ACCESS_TOOL_NAME = 'SandboxNetworkAccess'

function serializeDecisionReason(
  reason: PermissionDecisionReason | undefined,
): string | undefined {
  if (!reason) {
    return undefined
  }

  if (
    (feature('BASH_CLASSIFIER') || feature('TRANSCRIPT_CLASSIFIER')) &&
    reason.type === 'classifier'
  ) {
    return reason.reason
  }
  switch (reason.type) {
    case 'rule':
    case 'mode':
    case 'subcommandResults':
    case 'permissionPromptTool':
      return undefined
    case 'hook':
    case 'asyncAgent':
    case 'sandboxOverride':
    case 'workingDir':
    case 'safetyCheck':
    case 'other':
      return reason.reason
  }
}

function buildRequiresActionDetails(
  tool: Tool,
  input: Record<string, unknown>,
  toolUseID: string,
  requestId: string,
): RequiresActionDetails {
  // Per-tool summary methods may throw on malformed input; permission
  // handling must not break because of a bad description.
  let description: string
  try {
    description =
      tool.getActivityDescription?.(input) ??
      tool.getToolUseSummary?.(input) ??
      tool.userFacingName(input)
  } catch {
    description = tool.name
  }
  return {
    tool_name: tool.name,
    action_description: description,
    tool_use_id: toolUseID,
    request_id: requestId,
    input,
  }
}

type PendingRequest<T> = {
  resolve: (result: T) => void
  reject: (error: unknown) => void
  schema?: z.Schema
  request: ProtocolControlRequest
}

export type StructuredIOPermissionBroker = Pick<
  RuntimePermissionBroker,
  'requestPermission' | 'decide'
>

export type StructuredIOPermissionOptions = {
  permissionBroker?: StructuredIOPermissionBroker
  getConversationId?: () => string
  getTurnId?: () => string | undefined
}

function mergeStructuredIOPermissionOptions(
  current: StructuredIOPermissionOptions,
  next: StructuredIOPermissionOptions,
): StructuredIOPermissionOptions {
  return {
    permissionBroker: next.permissionBroker ?? current.permissionBroker,
    getConversationId: next.getConversationId ?? current.getConversationId,
    getTurnId: next.getTurnId ?? current.getTurnId,
  }
}

/**
 * Provides a structured way to read and write protocol messages from stdio,
 * capturing the SDK protocol.
 */
// Maximum number of resolved tool_use IDs to track. Once exceeded, the oldest
// entry is evicted. This bounds memory in very long sessions while keeping
// enough history to catch duplicate control_response deliveries.
const MAX_RESOLVED_TOOL_USE_IDS = 1000

export class StructuredIO {
  readonly structuredInput: AsyncGenerator<ProtocolStdinMessage | ProtocolMessage>
  private readonly pendingRequests = new Map<string, PendingRequest<unknown>>()

  // CCR external_metadata read back on worker start; null when the
  // transport doesn't restore. Assigned by RemoteIO.
  restoredWorkerState: Promise<SessionExternalMetadata | null> =
    Promise.resolve(null)

  private inputClosed = false
  private unexpectedResponseCallback?: (
    response: ProtocolControlResponse,
  ) => Promise<void>

  // Tracks tool_use IDs that have been resolved through the normal permission
  // flow (or aborted by a hook). When a duplicate control_response arrives
  // after the original was already handled, this Set prevents the orphan
  // handler from re-processing it — which would push duplicate assistant
  // messages into mutableMessages and cause a 400 "tool_use ids must be unique"
  // error from the API.
  private readonly resolvedToolUseIds = new Set<string>()
  private prependedLines: string[] = []
  private onControlRequestSent?: (request: ProtocolControlRequest) => void
  private onControlRequestResolved?: (requestId: string) => void
  private permissionOptions: StructuredIOPermissionOptions = {}

  // sendRequest() and print.ts both enqueue here; the drain loop is the
  // only writer. Prevents control_request from overtaking queued stream_events.
  readonly outbound = new Stream<ProtocolStdoutMessage>()

  constructor(
    private readonly input: AsyncIterable<string>,
    private readonly replayUserMessages?: boolean,
  ) {
    this.input = input
    this.structuredInput = this.read()
  }

  /**
   * Records a tool_use ID as resolved so that late/duplicate control_response
   * messages for the same tool are ignored by the orphan handler.
   */
  private trackResolvedToolUseId(request: ProtocolControlRequest): void {
    const inner = request.request as { subtype?: string; tool_use_id?: string }
    if (inner.subtype === 'can_use_tool') {
      this.resolvedToolUseIds.add(inner.tool_use_id as string)
      if (this.resolvedToolUseIds.size > MAX_RESOLVED_TOOL_USE_IDS) {
        // Evict the oldest entry (Sets iterate in insertion order)
        const first = this.resolvedToolUseIds.values().next().value
        if (first !== undefined) {
          this.resolvedToolUseIds.delete(first)
        }
      }
    }
  }

  /** Flush pending internal events. No-op for non-remote IO. Overridden by RemoteIO. */
  flushInternalEvents(): Promise<void> {
    return Promise.resolve()
  }

  /** Internal-event queue depth. Overridden by RemoteIO; zero otherwise. */
  get internalEventsPending(): number {
    return 0
  }

  /**
   * Queue a user turn to be yielded before the next message from this.input.
   * Works before iteration starts and mid-stream — read() re-checks
   * prependedLines between each yielded message.
   */
  prependUserMessage(content: string): void {
    this.prependedLines.push(
      jsonStringify({
        type: 'user',
        content,
        uuid: '',
        session_id: '',
        message: { role: 'user', content },
        parent_tool_use_id: null,
      } satisfies ProtocolUserMessage) + '\n',
    )
  }

  private async *read() {
    let content = ''

    // Called once before for-await (an empty this.input otherwise skips the
    // loop body entirely), then again per block. prependedLines re-check is
    // inside the while so a prepend pushed between two messages in the SAME
    // block still lands first.
    const splitAndProcess = async function* (this: StructuredIO) {
      for (;;) {
        if (this.prependedLines.length > 0) {
          content = this.prependedLines.join('') + content
          this.prependedLines = []
        }
        const newline = content.indexOf('\n')
        if (newline === -1) break
        const line = content.slice(0, newline)
        content = content.slice(newline + 1)
        const message = await this.processLine(line)
        if (message) {
          logForDiagnosticsNoPII('info', 'cli_stdin_message_parsed', {
            type: message.type,
          })
          yield message
        }
      }
    }.bind(this)

    yield* splitAndProcess()

    for await (const block of this.input) {
      content += block
      yield* splitAndProcess()
    }
    if (content) {
      const message = await this.processLine(content)
      if (message) {
        yield message
      }
    }
    this.inputClosed = true
    for (const request of this.pendingRequests.values()) {
      // Reject all pending requests if the input stream
      request.reject(
        new Error('Tool permission stream closed before response received'),
      )
    }
  }

  getPendingPermissionRequests() {
    return Array.from(this.pendingRequests.values())
      .map(entry => entry.request)
      .filter(
        pr => (pr.request as { subtype?: string }).subtype === 'can_use_tool',
      )
  }

  setUnexpectedResponseCallback(
    callback: (response: ProtocolControlResponse) => Promise<void>,
  ): void {
    this.unexpectedResponseCallback = callback
  }

  /**
   * Inject a control_response message to resolve a pending permission request.
   * Used by the bridge to feed permission responses from claude.ai into the
   * SDK permission flow.
   *
   * Also sends a control_cancel_request to the SDK consumer so its canUseTool
   * callback is aborted via the signal — otherwise the callback hangs.
   */
  injectControlResponse(response: ProtocolControlResponse): void {
    const responseInner = response.response as
      | {
          request_id?: string
          subtype?: string
          error?: string
          response?: unknown
        }
      | undefined
    const requestId = responseInner?.request_id
    if (!requestId) return
    const request = this.pendingRequests.get(requestId as string)
    if (!request) return
    this.trackResolvedToolUseId(request.request)
    this.pendingRequests.delete(requestId as string)
    // Cancel the SDK consumer's canUseTool callback — the bridge won.
    void this.write({
      type: 'control_cancel_request',
      request_id: requestId,
    })
    if (responseInner.subtype === 'error') {
      request.reject(new Error(responseInner.error as string))
    } else {
      const result = responseInner.response
      if (request.schema) {
        try {
          request.resolve(request.schema.parse(result))
        } catch (error) {
          request.reject(error)
        }
      } else {
        request.resolve({})
      }
    }
  }

  /**
   * Register a callback invoked whenever a can_use_tool control_request
   * is written to stdout. Used by the bridge to forward permission
   * requests to claude.ai.
   */
  setOnControlRequestSent(
    callback: ((request: ProtocolControlRequest) => void) | undefined,
  ): void {
    this.onControlRequestSent = callback
  }

  /**
   * Register a callback invoked when a can_use_tool control_response arrives
   * from the SDK consumer (via stdin). Used by the bridge to cancel the
   * stale permission prompt on claude.ai when the SDK consumer wins the race.
   */
  setOnControlRequestResolved(
    callback: ((requestId: string) => void) | undefined,
  ): void {
    this.onControlRequestResolved = callback
  }

  private async processLine(
    line: string,
  ): Promise<ProtocolStdinMessage | ProtocolMessage | undefined> {
    // Skip empty lines (e.g. from double newlines in piped stdin)
    if (!line) {
      return undefined
    }
    try {
      const message = normalizeControlMessageKeys(jsonParse(line)) as
        | ProtocolStdinMessage
        | ProtocolMessage
      if (message.type === 'keep_alive') {
        // Silently ignore keep-alive messages
        return undefined
      }
      if (message.type === 'update_environment_variables') {
        // Apply environment variable updates directly to process.env.
        // Used by bridge session runner for auth token refresh
        // (CLAUDE_CODE_SESSION_ACCESS_TOKEN) which must be readable
        // by the REPL process itself, not just child Bash commands.
        const variables = message.variables ?? {}
        const keys = Object.keys(variables)
        for (const [key, value] of Object.entries(variables)) {
          process.env[key] = value
        }
        logForDebugging(
          `[structuredIO] applied update_environment_variables: ${keys.join(', ')}`,
        )
        return undefined
      }
      if (message.type === 'control_response') {
        // Close lifecycle for every control_response, including duplicates
        // and orphans — orphans don't yield to print.ts's main loop, so this
        // is the only path that sees them. uuid is server-injected into the
        // payload.
        const uuid =
          'uuid' in message && typeof message.uuid === 'string'
            ? message.uuid
            : undefined
        if (uuid) {
          notifyCommandLifecycle(uuid, 'completed')
        }
        const resp = message.response as {
          request_id: string
          subtype: string
          response?: Record<string, unknown>
          error?: string
        }
        const request = this.pendingRequests.get(resp.request_id)
        if (!request) {
          // Check if this tool_use was already resolved through the normal
          // permission flow. Duplicate control_response deliveries (e.g. from
          // WebSocket reconnects) arrive after the original was handled, and
          // re-processing them would push duplicate assistant messages into
          // the conversation, causing API 400 errors.
          const responsePayload =
            resp.subtype === 'success' ? resp.response : undefined
          const toolUseID = responsePayload?.toolUseID
          if (
            typeof toolUseID === 'string' &&
            this.resolvedToolUseIds.has(toolUseID)
          ) {
            logForDebugging(
              `Ignoring duplicate control_response for already-resolved toolUseID=${toolUseID} request_id=${resp.request_id}`,
            )
            return undefined
          }
          if (this.unexpectedResponseCallback) {
            await this.unexpectedResponseCallback(
              message as ProtocolControlResponse & { uuid?: string },
            )
          }
          return undefined // Ignore responses for requests we don't know about
        }
        this.trackResolvedToolUseId(request.request)
        this.pendingRequests.delete(resp.request_id)
        // Notify the bridge when the SDK consumer resolves a can_use_tool
        // request, so it can cancel the stale permission prompt on claude.ai.
        if (
          (request.request.request as { subtype?: string }).subtype ===
            'can_use_tool' &&
          this.onControlRequestResolved
        ) {
          this.onControlRequestResolved(resp.request_id)
        }

        if (resp.subtype === 'error') {
          request.reject(new Error(resp.error ?? 'Unknown error'))
          return undefined
        }
        const result = resp.response
        if (request.schema) {
          try {
            request.resolve(request.schema.parse(result))
          } catch (error) {
            request.reject(error)
          }
        } else {
          request.resolve({})
        }
        // Propagate control responses when replay is enabled
        if (this.replayUserMessages) {
          return message
        }
        return undefined
      }
      if (
        message.type !== 'user' &&
        message.type !== 'control_request' &&
        message.type !== 'assistant' &&
        message.type !== 'system'
      ) {
        logForDebugging(`Ignoring unknown message type: ${message.type}`, {
          level: 'warn',
        })
        return undefined
      }
      if (message.type === 'control_request') {
        if (!message.request) {
          exitWithMessage(`Error: Missing request on control_request`)
        }
        return message
      }
      if (message.type === 'assistant' || message.type === 'system') {
        return message
      }
      if (
        (message as { message?: { role?: string } }).message?.role !== 'user'
      ) {
        exitWithMessage(
          `Error: Expected message role 'user', got '${(message as { message?: { role?: string } }).message?.role}'`,
        )
      }
      return message
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.error(`Error parsing streaming input line: ${line}: ${error}`)
      // eslint-disable-next-line custom-rules/no-process-exit
      process.exit(1)
    }
  }

  async write(message: ProtocolStdoutMessage): Promise<void> {
    writeToStdout(ndjsonSafeStringify(message) + '\n')
  }

  private async sendRequest<Response>(
    request: ProtocolControlRequest['request'],
    schema: z.Schema,
    signal?: AbortSignal,
    requestId: string = randomUUID(),
  ): Promise<Response> {
    const message: ProtocolControlRequest = {
      type: 'control_request',
      request_id: requestId,
      request,
    }
    if (this.inputClosed) {
      throw new Error('Stream closed')
    }
    if (signal?.aborted) {
      throw new Error('Request aborted')
    }
    const promise = new Promise<Response>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        request: {
          type: 'control_request',
          request_id: requestId,
          request,
        },
        resolve: result => {
          resolve(result as Response)
        },
        reject,
        schema,
      })
    })
    const aborted = () => {
      this.outbound.enqueue({
        type: 'control_cancel_request',
        request_id: requestId,
      })
      // Immediately reject the outstanding promise, without
      // waiting for the host to acknowledge the cancellation.
      const request = this.pendingRequests.get(requestId)
      if (request) {
        // Track the tool_use ID as resolved before rejecting, so that a
        // late response from the host is ignored by the orphan handler.
        this.trackResolvedToolUseId(request.request)
        request.reject(new AbortError())
      }
    }
    if (signal) {
      signal.addEventListener('abort', aborted, {
        once: true,
      })
    }
    if (signal?.aborted) {
      aborted()
    } else {
      this.outbound.enqueue(message)
      if (
        (request as { subtype?: string }).subtype === 'can_use_tool' &&
        this.onControlRequestSent
      ) {
        this.onControlRequestSent(message)
      }
    }
    try {
      return await promise
    } finally {
      if (signal) {
        signal.removeEventListener('abort', aborted)
      }
      this.pendingRequests.delete(requestId)
    }
  }

  createCanUseTool(
    onPermissionPrompt?: (details: RequiresActionDetails) => void,
    permissionOptions: StructuredIOPermissionOptions = {},
  ): CanUseToolFn {
    const effectivePermissionOptions =
      this.rememberPermissionOptions(permissionOptions)
    return async (
      tool: Tool,
      input: { [key: string]: unknown },
      toolUseContext: ToolUseContext,
      assistantMessage: AssistantMessage,
      toolUseID: string,
      forceDecision?: PermissionDecision,
    ): Promise<PermissionDecision> => {
      const permissionToolUseContext =
        effectivePermissionOptions.permissionBroker &&
        !toolUseContext.runtimePermission
          ? {
              ...toolUseContext,
              runtimePermission: createToolPermissionRuntimeContext({
                permissionBroker: effectivePermissionOptions.permissionBroker,
                getConversationId: effectivePermissionOptions.getConversationId,
                getTurnId: effectivePermissionOptions.getTurnId,
              }),
            }
          : toolUseContext
      const mainPermissionResult =
        forceDecision ??
        (await hasPermissionsToUseTool(
          tool,
          input,
          permissionToolUseContext,
          assistantMessage,
          toolUseID,
        ))
      // If the tool is allowed or denied, return the result
      if (
        mainPermissionResult.behavior === 'allow' ||
        mainPermissionResult.behavior === 'deny'
      ) {
        recordResolvedPermissionDecision({
          broker: effectivePermissionOptions.permissionBroker,
          tool,
          input,
          toolUseContext: permissionToolUseContext,
          toolUseID,
          permissionResult: mainPermissionResult,
          permissionOptions: effectivePermissionOptions,
        })
        return mainPermissionResult
      }

      const permissionBroker = effectivePermissionOptions.permissionBroker
      if (permissionBroker) {
        return await this.resolvePermissionWithBroker({
          tool,
          input,
          toolUseContext: permissionToolUseContext,
          toolUseID,
          mainPermissionResult,
          onPermissionPrompt,
          permissionOptions: {
            ...effectivePermissionOptions,
            permissionBroker,
          },
        })
      }

      // Run PermissionRequest hooks in parallel with the SDK permission
      // prompt.  In the terminal CLI, hooks race against the interactive
      // prompt so that e.g. a hook with --delay 20 doesn't block the UI.
      // We need the same behavior here: the SDK host (VS Code, etc.) shows
      // its permission dialog immediately while hooks run in the background.
      // Whichever resolves first wins; the loser is cancelled/ignored.

      // AbortController used to cancel the SDK request if a hook decides first
      const hookAbortController = new AbortController()
      const parentSignal = toolUseContext.abortController.signal
      // Forward parent abort to our local controller
      const onParentAbort = () => hookAbortController.abort()
      parentSignal.addEventListener('abort', onParentAbort, { once: true })

      try {
        // Start the hook evaluation (runs in background)
        const hookPromise = executePermissionRequestHooksForSDK(
          tool.name,
          toolUseID,
          input,
          toolUseContext,
          mainPermissionResult.suggestions,
        ).then(decision => ({ source: 'hook' as const, decision }))

        // Start the SDK permission prompt immediately (don't wait for hooks)
        const requestId = randomUUID()
        onPermissionPrompt?.(
          buildRequiresActionDetails(tool, input, toolUseID, requestId),
        )
        const clientPromise = this.sendRequest<PermissionToolOutput>(
          {
            subtype: 'can_use_tool',
            tool_name: tool.name,
            input,
            permission_suggestions: mainPermissionResult.suggestions,
            blocked_path: mainPermissionResult.blockedPath,
            decision_reason: serializeDecisionReason(
              mainPermissionResult.decisionReason,
            ),
            tool_use_id: toolUseID,
            agent_id: toolUseContext.agentId,
          },
          permissionToolOutputSchema(),
          hookAbortController.signal,
          requestId,
        ).then(result => ({ source: 'sdk' as const, result }))

        // Race: hook completion vs SDK prompt response.
        // The hook promise always resolves (never rejects), returning
        // undefined if no hook made a decision.
        const winner = await Promise.race([hookPromise, clientPromise])

        if (winner.source === 'hook') {
          if (winner.decision) {
            // Hook decided — abort the pending SDK request.
            // Suppress the expected AbortError rejection from clientPromise.
            clientPromise.catch(() => {})
            hookAbortController.abort()
            return winner.decision
          }
          // Hook passed through (no decision) — wait for the SDK prompt
          const protocolResult = await clientPromise
          return permissionPromptToolResultToPermissionDecision(
            protocolResult.result,
            tool,
            input,
            toolUseContext,
          )
        }

        // SDK prompt responded first — use its result (hook still running
        // in background but its result will be ignored)
        return permissionPromptToolResultToPermissionDecision(
          winner.result,
          tool,
          input,
          toolUseContext,
        )
      } catch (error) {
        return permissionPromptToolResultToPermissionDecision(
          {
            behavior: 'deny',
            message: `Tool permission request failed: ${error}`,
            toolUseID,
          },
          tool,
          input,
          toolUseContext,
        )
      } finally {
        // Only transition back to 'running' if no other permission prompts
        // are pending (concurrent tool execution can have multiple in-flight).
        if (this.getPendingPermissionRequests().length === 0) {
          notifySessionStateChanged('running')
        }
        parentSignal.removeEventListener('abort', onParentAbort)
      }
    }
  }

  private rememberPermissionOptions(
    permissionOptions: StructuredIOPermissionOptions,
  ): StructuredIOPermissionOptions {
    this.permissionOptions = mergeStructuredIOPermissionOptions(
      this.permissionOptions,
      permissionOptions,
    )
    return this.permissionOptions
  }

  private async resolvePermissionWithBroker(args: {
    tool: Tool
    input: Record<string, unknown>
    toolUseContext: ToolUseContext
    toolUseID: string
    mainPermissionResult: PermissionDecision & { behavior: 'ask' }
    onPermissionPrompt?: (details: RequiresActionDetails) => void
    permissionOptions: StructuredIOPermissionOptions & {
      permissionBroker: StructuredIOPermissionBroker
    }
  }): Promise<PermissionDecision> {
    const {
      tool,
      input,
      toolUseContext,
      toolUseID,
      mainPermissionResult,
      onPermissionPrompt,
      permissionOptions,
    } = args
    const { permissionBroker } = permissionOptions
    const requestId = randomUUID()
    const permissionRequest = createStructuredPermissionRequest({
      tool,
      input,
      toolUseContext,
      toolUseID,
      requestId,
      permissionResult: mainPermissionResult,
      permissionOptions,
    })
    const brokerPromise = permissionBroker.requestPermission(permissionRequest)

    const hookAbortController = new AbortController()
    const parentSignal = toolUseContext.abortController.signal
    const onParentAbort = () => hookAbortController.abort()
    parentSignal.addEventListener('abort', onParentAbort, { once: true })

    try {
      const hookPromise = executePermissionRequestHooksForSDK(
        tool.name,
        toolUseID,
        input,
        toolUseContext,
        mainPermissionResult.suggestions,
      ).then(decision => {
        if (decision) {
          decidePermissionSafely(
            permissionBroker,
            kernelDecisionFromPermissionDecision(
              decision,
              permissionRequest.permissionRequestId,
              'structured_io_hook',
            ),
          )
        }
        return { source: 'hook' as const, decision }
      })

      onPermissionPrompt?.(
        buildRequiresActionDetails(tool, input, toolUseID, requestId),
      )
      const clientPromise = this.sendRequest<PermissionToolOutput>(
        {
          subtype: 'can_use_tool',
          tool_name: tool.name,
          input,
          permission_suggestions: mainPermissionResult.suggestions,
          blocked_path: mainPermissionResult.blockedPath,
          decision_reason: serializeDecisionReason(
            mainPermissionResult.decisionReason,
          ),
          tool_use_id: toolUseID,
          agent_id: toolUseContext.agentId,
        },
        permissionToolOutputSchema(),
        hookAbortController.signal,
        requestId,
      ).then(result => {
        const decision = kernelDecisionFromPermissionToolOutput(
          result,
          permissionRequest.permissionRequestId,
          'structured_io_sdk',
        )
        decidePermissionSafely(permissionBroker, decision)
        return { source: 'sdk' as const, decision }
      })

      const brokerDecisionPromise = brokerPromise.then(decision => ({
        source: 'broker' as const,
        decision,
      }))

      const winner = await Promise.race([
        hookPromise,
        clientPromise,
        brokerDecisionPromise,
      ])

      if (winner.source === 'hook') {
        if (winner.decision) {
          clientPromise.catch(() => {})
          hookAbortController.abort()
          return winner.decision
        }
        const finalDecision = await brokerPromise
        cancelPendingTransportIfExternal(
          finalDecision,
          hookAbortController,
          'structured_io_sdk',
        )
        return permissionDecisionFromKernelDecision(
          finalDecision,
          tool,
          input,
          toolUseContext,
          toolUseID,
        )
      }

      if (winner.source === 'broker') {
        clientPromise.catch(() => {})
        cancelPendingTransportIfExternal(
          winner.decision,
          hookAbortController,
          'structured_io_sdk',
        )
        return permissionDecisionFromKernelDecision(
          winner.decision,
          tool,
          input,
          toolUseContext,
          toolUseID,
        )
      }

      return permissionDecisionFromKernelDecision(
        winner.decision,
        tool,
        input,
        toolUseContext,
        toolUseID,
      )
    } catch (error) {
      const failureDecision = kernelDecisionFromPermissionToolOutput(
        {
          behavior: 'deny',
          message: `Tool permission request failed: ${error}`,
          toolUseID,
        },
        permissionRequest.permissionRequestId,
        'structured_io_error',
      )
      decidePermissionSafely(permissionBroker, failureDecision)
      return permissionDecisionFromKernelDecision(
        failureDecision,
        tool,
        input,
        toolUseContext,
        toolUseID,
      )
    } finally {
      if (this.getPendingPermissionRequests().length === 0) {
        notifySessionStateChanged('running')
      }
      parentSignal.removeEventListener('abort', onParentAbort)
    }
  }

  createHookCallback(callbackId: string, timeout?: number): HookCallback {
    return {
      type: 'callback',
      timeout,
      callback: async (
        input: HookInput,
        toolUseID: string | null,
        abort: AbortSignal | undefined,
      ): Promise<HookJSONOutput> => {
        try {
          const result = await this.sendRequest<HookJSONOutput>(
            {
              subtype: 'hook_callback',
              callback_id: callbackId,
              input: input as any,
              tool_use_id: toolUseID || undefined,
            },
            hookJSONOutputSchema(),
            abort,
          )
          return result
        } catch (error) {
          // biome-ignore lint/suspicious/noConsole:: intentional console output
          console.error(`Error in hook callback ${callbackId}:`, error)
          return {}
        }
      },
    }
  }

  /**
   * Sends an elicitation request to the SDK consumer and returns the response.
   */
  async handleElicitation(
    serverName: string,
    message: string,
    requestedSchema?: Record<string, unknown>,
    signal?: AbortSignal,
    mode?: 'form' | 'url',
    url?: string,
    elicitationId?: string,
  ): Promise<ElicitResult> {
    try {
      const result = await this.sendRequest<ElicitResult>(
        {
          subtype: 'elicitation',
          mcp_server_name: serverName,
          message,
          mode,
          url,
          elicitation_id: elicitationId,
          requested_schema: requestedSchema,
        },
        ProtocolControlElicitationResponseSchema(),
        signal,
      )
      return result
    } catch {
      return { action: 'cancel' as const }
    }
  }

  /**
   * Creates a SandboxAskCallback that forwards sandbox network permission
   * requests to the SDK host as can_use_tool control_requests.
   *
   * This piggybacks on the existing can_use_tool protocol with a synthetic
   * tool name so that SDK hosts (VS Code, CCR, etc.) can prompt the user
   * for network access without requiring a new protocol subtype.
   */
  createSandboxAskCallback(
    permissionOptions: StructuredIOPermissionOptions = {},
  ): (hostPattern: { host: string; port?: number }) => Promise<boolean> {
    this.rememberPermissionOptions(permissionOptions)
    return async (hostPattern): Promise<boolean> => {
      const effectivePermissionOptions = this.permissionOptions
      try {
        const permissionBroker = effectivePermissionOptions.permissionBroker
        if (permissionBroker) {
          const permissionOptionsWithBroker: StructuredIOPermissionOptions & {
            permissionBroker: StructuredIOPermissionBroker
          } = {
            ...effectivePermissionOptions,
            permissionBroker,
          }
          return await this.resolveSandboxPermissionWithBroker({
            hostPattern,
            permissionOptions: permissionOptionsWithBroker,
            permissionBroker,
          })
        }
        const result = await this.sendRequest<PermissionToolOutput>(
          {
            subtype: 'can_use_tool',
            tool_name: SANDBOX_NETWORK_ACCESS_TOOL_NAME,
            input: { host: hostPattern.host },
            tool_use_id: randomUUID(),
            description: `Allow network connection to ${hostPattern.host}?`,
          },
          permissionToolOutputSchema(),
        )
        return result.behavior === 'allow'
      } catch {
        // If the request fails (stream closed, abort, etc.), deny the connection
        return false
      }
    }
  }

  private async resolveSandboxPermissionWithBroker(args: {
    hostPattern: {
      host: string
      port?: number
    }
    permissionOptions: StructuredIOPermissionOptions & {
      permissionBroker: StructuredIOPermissionBroker
    }
    permissionBroker: StructuredIOPermissionBroker
  }): Promise<boolean> {
    const { hostPattern, permissionOptions, permissionBroker } = args
    const requestId = randomUUID()
    const toolUseID = randomUUID()
    const permissionRequest = createSandboxPermissionRequest({
      hostPattern,
      requestId,
      toolUseID,
      permissionOptions,
    })
    const brokerPromise = permissionBroker.requestPermission(permissionRequest)
    const transportAbortController = new AbortController()

    try {
      const clientPromise = this.sendRequest<PermissionToolOutput>(
        {
          subtype: 'can_use_tool',
          tool_name: SANDBOX_NETWORK_ACCESS_TOOL_NAME,
          input: { host: hostPattern.host },
          tool_use_id: toolUseID,
          description: `Allow network connection to ${hostPattern.host}?`,
        },
        permissionToolOutputSchema(),
        transportAbortController.signal,
        requestId,
      ).then(result => {
        const decision = kernelDecisionFromPermissionToolOutput(
          result,
          permissionRequest.permissionRequestId,
          'structured_io_sandbox_sdk',
        )
        decidePermissionSafely(permissionBroker, decision)
        return { source: 'sdk' as const, decision }
      })

      const brokerDecisionPromise = brokerPromise.then(decision => ({
        source: 'broker' as const,
        decision,
      }))

      const winner = await Promise.race([clientPromise, brokerDecisionPromise])
      if (winner.source === 'broker') {
        clientPromise.catch(() => {})
        cancelPendingTransportIfExternal(
          winner.decision,
          transportAbortController,
          'structured_io_sandbox_sdk',
        )
      }
      return isKernelPermissionAllowed(winner.decision)
    } catch (error) {
      const failureDecision: KernelPermissionDecision = {
        permissionRequestId: permissionRequest.permissionRequestId,
        decision: 'deny',
        decidedBy: 'runtime',
        reason: `Sandbox permission request failed: ${error}`,
        metadata: {
          resolvedBy: 'structured_io_sandbox_error',
        },
      }
      decidePermissionSafely(permissionBroker, failureDecision)
      return false
    }
  }

  /**
   * Sends an MCP message to an SDK server and waits for the response
   */
  async sendMcpMessage(
    serverName: string,
    message: JSONRPCMessage,
  ): Promise<JSONRPCMessage> {
    const response = await this.sendRequest<{ mcp_response: JSONRPCMessage }>(
      {
        subtype: 'mcp_message',
        server_name: serverName,
        message,
      },
      z.object({
        mcp_response: z.any() as z.Schema<JSONRPCMessage>,
      }),
    )
    return response.mcp_response
  }
}

export function createStructuredPermissionRequest(args: {
  tool: Tool
  input: Record<string, unknown>
  toolUseContext: ToolUseContext
  toolUseID: string
  requestId: string
  permissionResult?: PermissionDecision
  permissionOptions: StructuredIOPermissionOptions
}): KernelPermissionRequest {
  const metadata: Record<string, unknown> = {
    sdkRequestId: args.requestId,
    isMcp: args.tool.isMcp ?? false,
    isLsp: args.tool.isLsp ?? false,
  }
  if (args.permissionResult?.behavior === 'ask') {
    if (args.permissionResult.suggestions !== undefined) {
      metadata.permission_suggestions = args.permissionResult.suggestions
    }
    if (args.permissionResult.blockedPath !== undefined) {
      metadata.blocked_path = args.permissionResult.blockedPath
    }
    const serializedReason = serializeDecisionReason(
      args.permissionResult.decisionReason,
    )
    if (serializedReason !== undefined) {
      metadata.decision_reason = serializedReason
    }
  }
  if (args.toolUseContext.agentId !== undefined) {
    metadata.agent_id = args.toolUseContext.agentId
  }

  const request: KernelPermissionRequest = {
    permissionRequestId: args.toolUseID,
    conversationId:
      args.permissionOptions.getConversationId?.() ??
      args.toolUseContext.agentId ??
      'headless',
    toolName: args.tool.name,
    action: 'tool.call',
    argumentsPreview: args.input,
    risk: inferStructuredPermissionRisk(args.tool, args.input),
    policySnapshot: structuredPolicySnapshot(args.toolUseContext),
    metadata,
  }
  const turnId = args.permissionOptions.getTurnId?.()
  if (turnId !== undefined) {
    request.turnId = turnId
  }
  return request
}

export function recordResolvedPermissionDecision(args: {
  broker?: StructuredIOPermissionBroker
  tool: Tool
  input: Record<string, unknown>
  toolUseContext: ToolUseContext
  toolUseID: string
  permissionResult: PermissionDecision
  permissionOptions: StructuredIOPermissionOptions
}): void {
  if (!args.broker) {
    return
  }
  const request = createStructuredPermissionRequest({
    tool: args.tool,
    input: args.input,
    toolUseContext: args.toolUseContext,
    toolUseID: args.toolUseID,
    requestId: args.toolUseID,
    permissionResult: args.permissionResult,
    permissionOptions: args.permissionOptions,
  })
  try {
    void args.broker.requestPermission(request)
    args.broker.decide(
      kernelDecisionFromPermissionDecision(
        args.permissionResult,
        request.permissionRequestId,
        'structured_io_policy',
      ),
    )
  } catch {
    // Permission audit must not alter the legacy canUseTool result.
  }
}

export function kernelDecisionFromPermissionToolOutput(
  result: PermissionToolOutput,
  permissionRequestId: string,
  resolvedBy: string,
): KernelPermissionDecision {
  const metadata = {
    resolvedBy,
    permissionToolOutput: result,
  }
  if (result.behavior === 'allow') {
    return {
      permissionRequestId,
      decision:
        result.decisionClassification === 'user_permanent'
          ? 'allow_session'
          : 'allow_once',
      decidedBy: 'host',
      metadata,
    }
  }
  return {
    permissionRequestId,
    decision: result.interrupt ? 'abort' : 'deny',
    decidedBy: 'host',
    reason: result.message,
    metadata,
  }
}

function kernelDecisionFromPermissionDecision(
  decision: PermissionDecision,
  permissionRequestId: string,
  resolvedBy: string,
): KernelPermissionDecision {
  const decidedBy =
    decision.decisionReason?.type === 'permissionPromptTool'
      ? 'host'
      : decision.decisionReason?.type === 'mode' ||
          decision.decisionReason?.type === 'rule'
        ? 'policy'
        : 'runtime'
  if (decision.behavior === 'allow') {
    return {
      permissionRequestId,
      decision: 'allow',
      decidedBy,
      reason: formatPermissionDecisionReason(decision.decisionReason),
      metadata: {
        resolvedBy,
        updatedInput: decision.updatedInput,
      },
    }
  }
  if (decision.behavior === 'deny') {
    return {
      permissionRequestId,
      decision: 'deny',
      decidedBy,
      reason:
        decision.message ??
        formatPermissionDecisionReason(decision.decisionReason),
      metadata: { resolvedBy },
    }
  }
  return {
    permissionRequestId,
    decision: 'abort',
    decidedBy: 'runtime',
    reason: decision.message,
    metadata: { resolvedBy },
  }
}

export function permissionDecisionFromKernelDecision(
  decision: KernelPermissionDecision,
  tool: Tool,
  input: Record<string, unknown>,
  toolUseContext: ToolUseContext,
  toolUseID: string,
): PermissionDecision {
  return permissionPromptToolResultToPermissionDecision(
    permissionToolOutputFromKernelDecision(decision, input, toolUseID),
    tool,
    input,
    toolUseContext,
  )
}

function permissionToolOutputFromKernelDecision(
  decision: KernelPermissionDecision,
  input: Record<string, unknown>,
  toolUseID: string,
): PermissionToolOutput {
  const metadataOutput = permissionToolOutputFromMetadata(decision.metadata)
  if (metadataOutput) {
    return metadataOutput
  }

  if (
    decision.decision === 'allow' ||
    decision.decision === 'allow_once' ||
    decision.decision === 'allow_session'
  ) {
    return {
      behavior: 'allow',
      updatedInput: input,
      toolUseID,
      decisionClassification:
        decision.decision === 'allow_session'
          ? 'user_permanent'
          : 'user_temporary',
    }
  }

  return {
    behavior: 'deny',
    message: decision.reason ?? 'Permission denied',
    interrupt: decision.decision === 'abort',
    toolUseID,
    decisionClassification: 'user_reject',
  }
}

function permissionToolOutputFromMetadata(
  metadata: KernelPermissionDecision['metadata'],
): PermissionToolOutput | undefined {
  const output =
    metadata &&
    typeof metadata === 'object' &&
    'permissionToolOutput' in metadata
      ? metadata.permissionToolOutput
      : undefined
  const parsed = permissionToolOutputSchema().safeParse(output)
  return parsed.success ? parsed.data : undefined
}

export function decidePermissionSafely(
  broker: StructuredIOPermissionBroker,
  decision: KernelPermissionDecision,
): void {
  try {
    broker.decide(decision)
  } catch {
    // Another racer may already have resolved this permission request.
  }
}

function cancelPendingTransportIfExternal(
  decision: KernelPermissionDecision,
  abortController: AbortController,
  transportResolvedBy: string,
): void {
  const resolvedBy =
    decision.metadata &&
    typeof decision.metadata === 'object' &&
    'resolvedBy' in decision.metadata
      ? decision.metadata.resolvedBy
      : undefined
  if (resolvedBy !== transportResolvedBy) {
    abortController.abort()
  }
}

function createSandboxPermissionRequest(args: {
  hostPattern: {
    host: string
    port?: number
  }
  requestId: string
  toolUseID: string
  permissionOptions: StructuredIOPermissionOptions
}): KernelPermissionRequest {
  const request: KernelPermissionRequest = {
    permissionRequestId: args.toolUseID,
    conversationId: args.permissionOptions.getConversationId?.() ?? 'headless',
    toolName: SANDBOX_NETWORK_ACCESS_TOOL_NAME,
    action: 'network.connect',
    argumentsPreview: {
      host: args.hostPattern.host,
      port: args.hostPattern.port,
    },
    risk: 'high',
    policySnapshot: {
      syntheticTool: SANDBOX_NETWORK_ACCESS_TOOL_NAME,
      source: 'sandbox',
    },
    metadata: {
      sdkRequestId: args.requestId,
      syntheticSubtype: 'sandbox_network_access',
      host: args.hostPattern.host,
      port: args.hostPattern.port,
    },
  }
  const turnId = args.permissionOptions.getTurnId?.()
  if (turnId !== undefined) {
    request.turnId = turnId
  }
  return request
}

function isKernelPermissionAllowed(
  decision: KernelPermissionDecision,
): boolean {
  return (
    decision.decision === 'allow' ||
    decision.decision === 'allow_once' ||
    decision.decision === 'allow_session'
  )
}

function inferStructuredPermissionRisk(
  tool: Tool,
  input: Record<string, unknown>,
): KernelPermissionRisk {
  if (safeToolPredicate(() => tool.isDestructive?.(input) ?? false)) {
    return 'destructive'
  }
  if (safeToolPredicate(() => tool.isOpenWorld?.(input) ?? false)) {
    return 'high'
  }
  if (!safeToolPredicate(() => tool.isReadOnly(input))) {
    return 'medium'
  }
  return 'low'
}

function safeToolPredicate(predicate: () => boolean): boolean {
  try {
    return predicate()
  } catch {
    return false
  }
}

function structuredPolicySnapshot(
  toolUseContext: ToolUseContext,
): Record<string, unknown> {
  const context = toolUseContext.getAppState().toolPermissionContext
  return {
    mode: context.mode,
    isBypassPermissionsModeAvailable: context.isBypassPermissionsModeAvailable,
    shouldAvoidPermissionPrompts: context.shouldAvoidPermissionPrompts ?? false,
    awaitAutomatedChecksBeforeDialog:
      context.awaitAutomatedChecksBeforeDialog ?? false,
  }
}

function formatPermissionDecisionReason(
  reason: PermissionDecisionReason | undefined,
): string | undefined {
  if (!reason) {
    return undefined
  }
  switch (reason.type) {
    case 'mode':
      return `Permission mode ${reason.mode}`
    case 'rule':
      return `Permission rule ${reason.rule.ruleBehavior}`
    case 'permissionPromptTool':
      return `Permission prompt tool ${reason.permissionPromptToolName}`
    case 'hook':
      return reason.reason ?? `Permission hook ${reason.hookName}`
    case 'classifier':
      return reason.reason
    case 'asyncAgent':
    case 'sandboxOverride':
    case 'workingDir':
    case 'safetyCheck':
    case 'other':
      return reason.reason
    case 'subcommandResults':
      return 'Subcommand permission results'
  }
}

function exitWithMessage(message: string): never {
  // biome-ignore lint/suspicious/noConsole:: intentional console output
  console.error(message)
  // eslint-disable-next-line custom-rules/no-process-exit
  process.exit(1)
}

/**
 * Execute PermissionRequest hooks and return a decision if one is made.
 * Returns undefined if no hook made a decision.
 */
async function executePermissionRequestHooksForSDK(
  toolName: string,
  toolUseID: string,
  input: Record<string, unknown>,
  toolUseContext: ToolUseContext,
  suggestions: InternalPermissionUpdate[] | undefined,
): Promise<PermissionDecision | undefined> {
  const appState = toolUseContext.getAppState()
  const permissionMode = appState.toolPermissionContext.mode

  // Iterate directly over the generator instead of using `all`
  const hookGenerator = executePermissionRequestHooks(
    toolName,
    toolUseID,
    input,
    toolUseContext,
    permissionMode,
    suggestions as unknown as ProtocolPermissionUpdate[] | undefined,
    toolUseContext.abortController.signal,
  )

  for await (const hookResult of hookGenerator) {
    if (
      hookResult.permissionRequestResult &&
      (hookResult.permissionRequestResult.behavior === 'allow' ||
        hookResult.permissionRequestResult.behavior === 'deny')
    ) {
      const decision = hookResult.permissionRequestResult
      if (decision.behavior === 'allow') {
        const finalInput = decision.updatedInput || input

        // Apply permission updates if provided by hook ("always allow")
        const permissionUpdates = (decision.updatedPermissions ??
          []) as unknown as InternalPermissionUpdate[]
        if (permissionUpdates.length > 0) {
          persistPermissionUpdates(permissionUpdates)
          const currentAppState = toolUseContext.getAppState()
          const updatedContext = applyPermissionUpdates(
            currentAppState.toolPermissionContext,
            permissionUpdates,
          )
          // Update permission context via setAppState
          toolUseContext.setAppState(prev => {
            if (prev.toolPermissionContext === updatedContext) return prev
            return { ...prev, toolPermissionContext: updatedContext }
          })
        }

        return {
          behavior: 'allow',
          updatedInput: finalInput,
          userModified: false,
          decisionReason: {
            type: 'hook',
            hookName: 'PermissionRequest',
          },
        }
      } else {
        // Hook denied the permission
        return {
          behavior: 'deny',
          message:
            decision.message || 'Permission denied by PermissionRequest hook',
          decisionReason: {
            type: 'hook',
            hookName: 'PermissionRequest',
          },
        }
      }
    }
  }

  return undefined
}
