import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type { RemotePermissionResponse } from '../remote/RemoteSessionManager.js'
import {
  createSyntheticAssistantMessage,
  createToolStub,
} from '../remote/remotePermissionBridge.js'
import {
  handleKernelRuntimeHostEvent,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeProtocolMessageDedupe,
} from '../remote/kernelRuntimeHostEvents.js'
import {
  convertProtocolMessage,
  isSessionEndMessage,
} from '../remote/protocolMessageAdapter.js'
import {
  type DirectConnectConfig,
  DirectConnectSessionManager,
} from '../server/directConnectManager.js'
import type { KernelRuntimeEventSink } from '../runtime/contracts/events.js'
import type { Tool } from '../Tool.js'
import { findToolByName } from '../Tool.js'
import type { Message as MessageType } from '../types/message.js'
import type {
  PermissionAskDecision,
  PermissionUpdate,
} from '../types/permissions.js'
import { logForDebugging } from '../utils/debug.js'
import { gracefulShutdown } from '../utils/gracefulShutdown.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'

type UseDirectConnectResult = {
  isRemoteMode: boolean
  sendMessage: (content: RemoteMessageContent) => Promise<boolean>
  cancelRequest: () => void
  disconnect: () => void
}

type UseDirectConnectProps = {
  config: DirectConnectConfig | undefined
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  setIsLoading: (loading: boolean) => void
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>
  tools: Tool[]
  onRuntimeEvent?: KernelRuntimeEventSink
  onRuntimeOutputDelta?: (text: string) => void
  onRuntimeTurnTerminal?: (envelope: Parameters<KernelRuntimeEventSink>[0]) => void
}

export function useDirectConnect({
  config,
  setMessages,
  setIsLoading,
  setToolUseConfirmQueue,
  tools,
  onRuntimeEvent,
  onRuntimeOutputDelta,
  onRuntimeTurnTerminal,
}: UseDirectConnectProps): UseDirectConnectResult {
  const isRemoteMode = !!config

  const managerRef = useRef<DirectConnectSessionManager | null>(null)
  const hasReceivedInitRef = useRef(false)
  const isConnectedRef = useRef(false)
  const protocolMessageDedupeRef = useRef(new KernelRuntimeProtocolMessageDedupe())
  const outputDeltaDedupeRef = useRef(new KernelRuntimeOutputDeltaDedupe())

  // Keep a ref to tools so the WebSocket callback doesn't go stale
  const toolsRef = useRef(tools)
  useEffect(() => {
    toolsRef.current = tools
  }, [tools])

  useEffect(() => {
    if (!config) {
      return
    }

    hasReceivedInitRef.current = false
    protocolMessageDedupeRef.current.clear()
    outputDeltaDedupeRef.current.clear()
    logForDebugging(`[useDirectConnect] Connecting to ${config.wsUrl}`)

    const handleProtocolMessage = (protocolMessage: Parameters<typeof convertProtocolMessage>[0]) => {
      if (!protocolMessageDedupeRef.current.shouldProcess(protocolMessage)) {
        return
      }

      if (isSessionEndMessage(protocolMessage)) {
        setIsLoading(false)
      }

      // Skip duplicate init messages (server sends one per turn)
      if (protocolMessage.type === 'system' && protocolMessage.subtype === 'init') {
        if (hasReceivedInitRef.current) {
          return
        }
        hasReceivedInitRef.current = true
      }

      const converted = convertProtocolMessage(protocolMessage, {
        convertToolResults: true,
      })
      if (converted.type === 'message') {
        setMessages(prev => [...prev, converted.message])
      }
    }

    const manager = new DirectConnectSessionManager(config, {
      onMessage: handleProtocolMessage,
      onPermissionRequest: (request, requestId) => {
        logForDebugging(
          `[useDirectConnect] Permission request for tool: ${request.tool_name}`,
        )

        const tool =
          findToolByName(toolsRef.current, request.tool_name) ??
          createToolStub(request.tool_name)

        const syntheticMessage = createSyntheticAssistantMessage(
          request,
          requestId,
        )

        const permissionResult: PermissionAskDecision = {
          behavior: 'ask',
          message:
            request.description ?? `${request.tool_name} requires permission`,
          suggestions: request.permission_suggestions as PermissionUpdate[],
          blockedPath: request.blocked_path,
        }

        const toolUseConfirm: ToolUseConfirm = {
          assistantMessage: syntheticMessage,
          tool,
          description:
            request.description ?? `${request.tool_name} requires permission`,
          input: request.input,
          toolUseContext: {} as ToolUseConfirm['toolUseContext'],
          toolUseID: request.tool_use_id,
          permissionResult,
          permissionPromptStartTimeMs: Date.now(),
          onUserInteraction() {
            // No-op for remote
          },
          onAbort() {
            const response: RemotePermissionResponse = {
              behavior: 'deny',
              message: 'User aborted',
              toolUseID: request.tool_use_id,
              decisionClassification: 'user_reject',
            }
            manager.respondToPermissionRequest(requestId, response)
            setToolUseConfirmQueue(queue =>
              queue.filter(item => item.toolUseID !== request.tool_use_id),
            )
          },
          onAllow(updatedInput, permissionUpdates, _feedback) {
            const response: RemotePermissionResponse = {
              behavior: 'allow',
              updatedInput,
              updatedPermissions: permissionUpdates,
              toolUseID: request.tool_use_id,
              decisionClassification:
                permissionUpdates.length > 0
                  ? 'user_permanent'
                  : 'user_temporary',
            }
            manager.respondToPermissionRequest(requestId, response)
            setToolUseConfirmQueue(queue =>
              queue.filter(item => item.toolUseID !== request.tool_use_id),
            )
            setIsLoading(true)
          },
          onReject(feedback?: string) {
            const response: RemotePermissionResponse = {
              behavior: 'deny',
              message: feedback ?? 'User denied permission',
              toolUseID: request.tool_use_id,
              decisionClassification: 'user_reject',
            }
            manager.respondToPermissionRequest(requestId, response)
            setToolUseConfirmQueue(queue =>
              queue.filter(item => item.toolUseID !== request.tool_use_id),
            )
          },
          async recheckPermission() {
            // No-op for remote
          },
        }

        setToolUseConfirmQueue(queue => [...queue, toolUseConfirm])
        setIsLoading(false)
      },
      onPermissionCancelled: (_requestId, toolUseId) => {
        if (!toolUseId) {
          return
        }
        setToolUseConfirmQueue(queue =>
          queue.filter(item => item.toolUseID !== toolUseId),
        )
        setIsLoading(true)
      },
      onRuntimeEvent: envelope => {
        handleKernelRuntimeHostEvent(envelope, {
          onRuntimeEvent,
          onProtocolMessage: handleProtocolMessage,
          onOutputDelta: delta => {
            if (!outputDeltaDedupeRef.current.shouldProcess(envelope)) {
              return
            }
            onRuntimeOutputDelta?.(delta.text)
          },
          onTurnTerminal: () => {
            setIsLoading(false)
            onRuntimeTurnTerminal?.(envelope)
          },
        })
      },
      onConnected: () => {
        logForDebugging('[useDirectConnect] Connected')
        isConnectedRef.current = true
      },
      onDisconnected: () => {
        logForDebugging('[useDirectConnect] Disconnected')
        if (!isConnectedRef.current) {
          // Never connected — connection failure (e.g. auth rejected)
          process.stderr.write(
            `\nFailed to connect to server at ${config.wsUrl}\n`,
          )
        } else {
          // Was connected then lost — server process exited or network dropped
          process.stderr.write('\nServer disconnected.\n')
        }
        isConnectedRef.current = false
        void gracefulShutdown(1)
        setIsLoading(false)
      },
      onError: error => {
        logForDebugging(`[useDirectConnect] Error: ${error.message}`)
      },
    })

    managerRef.current = manager
    manager.connect()

    return () => {
      logForDebugging('[useDirectConnect] Cleanup - disconnecting')
      manager.disconnect()
      managerRef.current = null
    }
  }, [
    config,
    setMessages,
    setIsLoading,
    setToolUseConfirmQueue,
    onRuntimeEvent,
    onRuntimeOutputDelta,
    onRuntimeTurnTerminal,
  ])

  const sendMessage = useCallback(
    async (content: RemoteMessageContent): Promise<boolean> => {
      const manager = managerRef.current
      if (!manager) {
        return false
      }

      setIsLoading(true)

      return manager.sendMessage(content)
    },
    [setIsLoading],
  )

  // Cancel the current request
  const cancelRequest = useCallback(() => {
    // Send interrupt signal to the server
    managerRef.current?.sendInterrupt()

    setIsLoading(false)
  }, [setIsLoading])

  const disconnect = useCallback(() => {
    managerRef.current?.disconnect()
    managerRef.current = null
    isConnectedRef.current = false
  }, [])

  // Same stability concern as useRemoteSession — memoize so consumers
  // that depend on the result object don't see a fresh reference per render.
  return useMemo(
    () => ({ isRemoteMode, sendMessage, cancelRequest, disconnect }),
    [isRemoteMode, sendMessage, cancelRequest, disconnect],
  )
}
