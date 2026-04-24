import type { UUID } from 'crypto'
import type { AppState } from 'src/state/AppStateStore.js'
import type { ToolPermissionContext } from 'src/Tool.js'
import type { Stream } from 'src/utils/stream.js'
import type { PermissionResult } from 'src/entrypoints/agentSdkTypes.js'
import type { SDKControlResponse, StdoutMessage } from 'src/entrypoints/sdk/controlTypes.js'
import type { InternalPermissionMode } from 'src/types/permissions.js'
import type { MCPServerConnection } from 'src/services/mcp/types.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from 'src/services/analytics/index.js'
import type {
  IndexedRuntimeSession,
  RuntimeSessionIndexStore,
} from '../../../contracts/session.js'
import type {
  RuntimeAllowedChannelEntry,
  RuntimeBootstrapStateProvider,
} from '../../../core/state/providers.js'
import { feature } from 'bun:bundle'
import { logForDebugging } from 'src/utils/debug.js'
import { logMCPDebug } from 'src/utils/log.js'
import { findUnresolvedToolUse } from 'src/utils/sessionStorage.js'
import { enqueue } from 'src/utils/messageQueueManager.js'
import { logEvent } from 'src/services/analytics/index.js'
import {
  ChannelMessageNotificationSchema,
  findChannelEntry,
  gateChannelServer,
  wrapChannelMessage,
} from 'src/services/mcp/channelNotification.js'
import { parsePluginIdentifier } from 'src/utils/plugins/pluginIdentifier.js'
import {
  getAutoModeUnavailableNotification,
  getAutoModeUnavailableReason,
  isAutoModeGateEnabled,
  isBypassPermissionsModeDisabled,
  transitionPermissionMode,
} from 'src/utils/permissions/permissionSetup.js'
import {
  createHeadlessSessionBootstrap,
  type HeadlessSessionBootstrap,
} from './headlessSessionBootstrap.js'
import { RuntimeSessionRegistry } from '../../../core/session/RuntimeSessionRegistry.js'

const MAX_RECEIVED_UUIDS = 10_000

export type HeadlessSessionControl = {
  trackReceivedMessageUuid(uuid: UUID): boolean
  hasReceivedMessageUuid(uuid: UUID): boolean
  handleOrphanedPermissionResponse(args: {
    message: SDKControlResponse
    setAppState: (f: (prev: AppState) => AppState) => void
    onEnqueued?: () => void
  }): Promise<boolean>
}

export type HeadlessSessionContext = {
  control: HeadlessSessionControl
  bootstrapStateProvider: RuntimeBootstrapStateProvider
  bootstrap: HeadlessSessionBootstrap
  getIndexedSession(sessionId: string): IndexedRuntimeSession | null
  listIndexedSessions(): IndexedRuntimeSession[]
  liveIndexedSessionCount(): number
  registerIndexedSession(session: IndexedRuntimeSession): Promise<void>
  syncIndexedSession(session: IndexedRuntimeSession): void
  removeIndexedSession(sessionId: string): Promise<void>
  registerCleanup(cleanup: () => void | Promise<void>): void
  cleanup(): Promise<void>
}

export function createHeadlessSessionContext(
  bootstrapStateProvider: RuntimeBootstrapStateProvider,
  options: {
    indexStore?: RuntimeSessionIndexStore
  } = {},
): HeadlessSessionContext {
  const receivedMessageUuids = new Set<UUID>()
  const receivedMessageUuidsOrder: UUID[] = []
  const handledOrphanedToolUseIds = new Set<string>()
  const cleanupStack: Array<() => void | Promise<void>> = []
  const registry = new RuntimeSessionRegistry<IndexedRuntimeSession>(
    options.indexStore,
  )

  const control: HeadlessSessionControl = {
    trackReceivedMessageUuid(uuid: UUID): boolean {
      if (receivedMessageUuids.has(uuid)) {
        return false
      }
      receivedMessageUuids.add(uuid)
      receivedMessageUuidsOrder.push(uuid)
      if (receivedMessageUuidsOrder.length > MAX_RECEIVED_UUIDS) {
        const toEvict = receivedMessageUuidsOrder.splice(
          0,
          receivedMessageUuidsOrder.length - MAX_RECEIVED_UUIDS,
        )
        for (const old of toEvict) {
          receivedMessageUuids.delete(old)
        }
      }
      return true
    },

    hasReceivedMessageUuid(uuid: UUID): boolean {
      return receivedMessageUuids.has(uuid)
    },

    handleOrphanedPermissionResponse(args) {
      return handleOrphanedPermissionResponse({
        ...args,
        handledToolUseIds: handledOrphanedToolUseIds,
      })
    },
  }

  return {
    control,
    bootstrapStateProvider,
    bootstrap: createHeadlessSessionBootstrap(bootstrapStateProvider),
    getIndexedSession(sessionId) {
      return registry.get(sessionId)
    },
    listIndexedSessions() {
      return [...registry.values()]
    },
    liveIndexedSessionCount() {
      return registry.liveCount()
    },
    registerIndexedSession(session) {
      return registry.add(session)
    },
    syncIndexedSession(session) {
      registry.sync(session)
    },
    removeIndexedSession(sessionId) {
      return registry.remove(sessionId)
    },
    registerCleanup(cleanup) {
      cleanupStack.push(cleanup)
    },
    async cleanup() {
      while (cleanupStack.length > 0) {
        const cleanup = cleanupStack.pop()
        if (cleanup) {
          await cleanup()
        }
      }
    },
  }
}

export function handleSetPermissionMode(
  request: { mode: InternalPermissionMode },
  requestId: string,
  toolPermissionContext: ToolPermissionContext,
  output: Stream<StdoutMessage>,
): ToolPermissionContext {
  if (request.mode === 'bypassPermissions') {
    if (isBypassPermissionsModeDisabled()) {
      output.enqueue({
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: requestId,
          error:
            'Cannot set permission mode to bypassPermissions because it is disabled by settings or configuration',
        },
      })
      return toolPermissionContext
    }
    if (!toolPermissionContext.isBypassPermissionsModeAvailable) {
      output.enqueue({
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: requestId,
          error:
            'Cannot set permission mode to bypassPermissions because the session was not launched with --dangerously-skip-permissions',
        },
      })
      return toolPermissionContext
    }
  }

  if (
    feature('TRANSCRIPT_CLASSIFIER') &&
    request.mode === 'auto' &&
    !isAutoModeGateEnabled()
  ) {
    const reason = getAutoModeUnavailableReason()
    output.enqueue({
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: requestId,
        error: reason
          ? `Cannot set permission mode to auto: ${getAutoModeUnavailableNotification(reason)}`
          : 'Cannot set permission mode to auto',
      },
    })
    return toolPermissionContext
  }

  output.enqueue({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response: {
        mode: request.mode,
      },
    },
  })

  return {
    ...transitionPermissionMode(
      toolPermissionContext.mode,
      request.mode,
      toolPermissionContext,
    ),
    mode: request.mode,
  }
}

export async function handleOrphanedPermissionResponse({
  message,
  onEnqueued,
  handledToolUseIds,
}: {
  message: SDKControlResponse
  setAppState: (f: (prev: AppState) => AppState) => void
  onEnqueued?: () => void
  handledToolUseIds: Set<string>
}): Promise<boolean> {
  const responseInner = message.response as
    | {
        subtype?: string
        response?: Record<string, unknown>
        request_id?: string
      }
    | undefined
  if (
    responseInner?.subtype === 'success' &&
    responseInner.response?.toolUseID &&
    typeof responseInner.response.toolUseID === 'string'
  ) {
    const permissionResult = responseInner.response as PermissionResult & {
      toolUseID?: string
    }
    const toolUseID = permissionResult.toolUseID
    if (!toolUseID) {
      return false
    }

    logForDebugging(
      `handleOrphanedPermissionResponse: received orphaned control_response for toolUseID=${toolUseID} request_id=${responseInner.request_id}`,
    )

    if (handledToolUseIds.has(toolUseID)) {
      logForDebugging(
        `handleOrphanedPermissionResponse: skipping duplicate orphaned permission for toolUseID=${toolUseID} (already handled)`,
      )
      return false
    }

    const assistantMessage = await findUnresolvedToolUse(toolUseID)
    if (!assistantMessage) {
      logForDebugging(
        `handleOrphanedPermissionResponse: no unresolved tool_use found for toolUseID=${toolUseID} (already resolved in transcript)`,
      )
      return false
    }

    handledToolUseIds.add(toolUseID)
    logForDebugging(
      `handleOrphanedPermissionResponse: enqueuing orphaned permission for toolUseID=${toolUseID} messageID=${assistantMessage.message.id}`,
    )
    enqueue({
      mode: 'orphaned-permission' as const,
      value: [],
      orphanedPermission: {
        permissionResult,
        assistantMessage,
      },
    })

    onEnqueued?.()
    return true
  }
  return false
}

export function handleChannelEnable(
  requestId: string,
  serverName: string,
  connectionPool: readonly MCPServerConnection[],
  output: Stream<StdoutMessage>,
  bootstrapStateProvider: RuntimeBootstrapStateProvider,
): void {
  const respondError = (error: string) =>
    output.enqueue({
      type: 'control_response',
      response: { subtype: 'error', request_id: requestId, error },
    })

  if (!(feature('KAIROS') || feature('KAIROS_CHANNELS'))) {
    return respondError('channels feature not available in this build')
  }

  const connection = connectionPool.find(
    c => c.name === serverName && c.type === 'connected',
  )
  if (!connection || connection.type !== 'connected') {
    return respondError(`server ${serverName} is not connected`)
  }

  const pluginSource = connection.config.pluginSource
  const parsed = pluginSource ? parsePluginIdentifier(pluginSource) : undefined
  if (!parsed?.marketplace) {
    return respondError(
      `server ${serverName} is not plugin-sourced; channel_enable requires a marketplace plugin`,
    )
  }

  const entry: RuntimeAllowedChannelEntry = {
    kind: 'plugin',
    name: parsed.name,
    marketplace: parsed.marketplace,
  }
  const prior = bootstrapStateProvider.getHeadlessControlState().allowedChannels
  const already = prior.some(
    e =>
      e.kind === 'plugin' &&
      e.name === entry.name &&
      e.marketplace === entry.marketplace,
  )
  if (!already) {
    bootstrapStateProvider.patchHeadlessControlState({
      allowedChannels: [...prior, entry],
    })
  }

  const gate = gateChannelServer(
    serverName,
    connection.capabilities,
    pluginSource,
    already ? prior : [...prior, entry],
  )
  if (gate.action === 'skip') {
    if (!already) {
      bootstrapStateProvider.patchHeadlessControlState({
        allowedChannels: prior,
      })
    }
    return respondError(gate.reason)
  }

  const pluginId =
    `${entry.name}@${entry.marketplace}` as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
  logMCPDebug(serverName, 'Channel notifications registered')
  logEvent('tengu_mcp_channel_enable', { plugin: pluginId })

  connection.client.setNotificationHandler(
    ChannelMessageNotificationSchema(),
    async notification => {
      const { content, meta } = notification.params
      logMCPDebug(
        serverName,
        `notifications/claude/channel: ${content.slice(0, 80)}`,
      )
      logEvent('tengu_mcp_channel_message', {
        content_length: content.length,
        meta_key_count: Object.keys(meta ?? {}).length,
        entry_kind:
          'plugin' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        is_dev: false,
        plugin: pluginId,
      })
      enqueue({
        mode: 'prompt',
        value: wrapChannelMessage(serverName, content, meta),
        priority: 'next',
        isMeta: true,
        origin: { kind: 'channel', server: serverName } as unknown as string,
        skipSlashCommands: true,
      })
    },
  )

  output.enqueue({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response: undefined,
    },
  })
}

export function reregisterChannelHandlerAfterReconnect(
  connection: MCPServerConnection,
  bootstrapStateProvider: RuntimeBootstrapStateProvider,
): void {
  if (connection.type !== 'connected') return

  const allowedChannels =
    bootstrapStateProvider.getHeadlessControlState().allowedChannels

  const gate = gateChannelServer(
    connection.name,
    connection.capabilities,
    connection.config.pluginSource,
    allowedChannels,
  )
  if (gate.action !== 'register') return

  const entry = findChannelEntry(connection.name, allowedChannels)
  const pluginId =
    entry?.kind === 'plugin'
      ? (`${entry.name}@${entry.marketplace}` as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
      : undefined

  logMCPDebug(
    connection.name,
    'Channel notifications re-registered after reconnect',
  )
  connection.client.setNotificationHandler(
    ChannelMessageNotificationSchema(),
    async notification => {
      const { content, meta } = notification.params
      logMCPDebug(
        connection.name,
        `notifications/claude/channel: ${content.slice(0, 80)}`,
      )
      logEvent('tengu_mcp_channel_message', {
        content_length: content.length,
        meta_key_count: Object.keys(meta ?? {}).length,
        entry_kind:
          entry?.kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        is_dev: entry?.dev ?? false,
        plugin: pluginId,
      })
      enqueue({
        mode: 'prompt',
        value: wrapChannelMessage(connection.name, content, meta),
        priority: 'next',
        isMeta: true,
        origin: {
          kind: 'channel',
          server: connection.name,
        } as unknown as string,
        skipSlashCommands: true,
      })
    },
  )
}
