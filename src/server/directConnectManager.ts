/* eslint-disable eslint-plugin-n/no-unsupported-features/node-builtins */

import type { ProtocolMessage } from 'src/types/protocol/index.js'
import type {
  ProtocolControlPermissionRequest,
  ProtocolStdoutMessage,
} from 'src/types/protocol/controlTypes.js'
import type { RemotePermissionResponse } from '../remote/RemoteSessionManager.js'
import type { KernelRuntimeEventSink } from '../runtime/contracts/events.js'
import { consumeKernelRuntimeEventMessage } from '../utils/kernelRuntimeEventMessage.js'
import { logForDebugging } from '../utils/debug.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'

export type DirectConnectConfig = {
  serverUrl: string
  sessionId: string
  wsUrl: string
  authToken?: string
  unixSocket?: string
}

export type DirectConnectCallbacks = {
  onMessage: (message: ProtocolMessage) => void
  onPermissionRequest: (
    request: ProtocolControlPermissionRequest,
    requestId: string,
  ) => void
  onPermissionCancelled?: (
    requestId: string,
    toolUseId: string | undefined,
  ) => void
  onRuntimeEvent?: KernelRuntimeEventSink
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (error: Error) => void
}

function isProtocolStdoutMessage(value: unknown): value is ProtocolStdoutMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

export class DirectConnectSessionManager {
  private ws: WebSocket | null = null
  private config: DirectConnectConfig
  private callbacks: DirectConnectCallbacks
  private pendingPermissionRequests = new Map<
    string,
    ProtocolControlPermissionRequest
  >()

  constructor(config: DirectConnectConfig, callbacks: DirectConnectCallbacks) {
    this.config = config
    this.callbacks = callbacks
  }

  connect(): void {
    const headers: Record<string, string> = {}
    if (this.config.authToken) {
      headers['authorization'] = `Bearer ${this.config.authToken}`
    }
    // Bun's WebSocket supports headers option but the DOM typings don't
    this.ws = new WebSocket(this.config.wsUrl, {
      headers,
      ...(this.config.unixSocket ? { unix: this.config.unixSocket } : {}),
    } as unknown as string[])

    this.ws.addEventListener('open', () => {
      this.callbacks.onConnected?.()
    })

    this.ws.addEventListener('message', event => {
      const data = typeof event.data === 'string' ? event.data : ''
      const lines = data.split('\n').filter((l: string) => l.trim())

      for (const line of lines) {
        let raw: unknown
        try {
          raw = jsonParse(line)
        } catch {
          continue
        }

        if (!isProtocolStdoutMessage(raw)) {
          continue
        }
        const parsed = raw

        if (
          consumeKernelRuntimeEventMessage(
            parsed,
            this.callbacks.onRuntimeEvent,
          )
        ) {
          continue
        }

        // Handle control requests (permission requests)
        if (parsed.type === 'control_request') {
          if (parsed.request.subtype === 'can_use_tool') {
            this.pendingPermissionRequests.set(
              parsed.request_id,
              parsed.request,
            )
            this.callbacks.onPermissionRequest(
              parsed.request,
              parsed.request_id,
            )
          } else {
            // Send an error response for unrecognized subtypes so the
            // server doesn't hang waiting for a reply that never comes.
            logForDebugging(
              `[DirectConnect] Unsupported control request subtype: ${parsed.request.subtype}`,
            )
            this.sendErrorResponse(
              parsed.request_id,
              `Unsupported control request subtype: ${parsed.request.subtype}`,
            )
          }
          continue
        }

        if (parsed.type === 'control_cancel_request') {
          const pendingRequest = this.pendingPermissionRequests.get(
            parsed.request_id,
          )
          this.pendingPermissionRequests.delete(parsed.request_id)
          this.callbacks.onPermissionCancelled?.(
            parsed.request_id,
            pendingRequest?.tool_use_id,
          )
          continue
        }

        // Forward protocol messages (assistant, result, system, etc.)
        if (
          parsed.type !== 'control_response' &&
          parsed.type !== 'keep_alive' &&
          parsed.type !== 'streamlined_text' &&
          parsed.type !== 'streamlined_tool_use_summary' &&
          !(parsed.type === 'system' && parsed.subtype === 'post_turn_summary')
        ) {
          this.callbacks.onMessage(parsed)
        }
      }
    })

    this.ws.addEventListener('close', () => {
      this.callbacks.onDisconnected?.()
    })

    this.ws.addEventListener('error', () => {
      this.callbacks.onError?.(new Error('WebSocket connection error'))
    })
  }

  sendMessage(content: RemoteMessageContent): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false
    }

    // Must match ProtocolUserMessage format expected by `--input-format stream-json`
    const message = jsonStringify({
      type: 'user',
      message: {
        role: 'user',
        content: content,
      },
      parent_tool_use_id: null,
      session_id: '',
    })
    this.ws.send(message)
    return true
  }

  respondToPermissionRequest(
    requestId: string,
    result: RemotePermissionResponse,
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    const pendingRequest = this.pendingPermissionRequests.get(requestId)
    if (!pendingRequest) {
      logForDebugging(
        `[DirectConnect] No pending permission request with ID: ${requestId}`,
      )
      return
    }

    this.pendingPermissionRequests.delete(requestId)

    // Must match ProtocolControlResponse format expected by StructuredIO
    const response = jsonStringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: result.behavior,
          ...(result.behavior === 'allow'
            ? {
                updatedInput: result.updatedInput,
                ...(result.updatedPermissions !== undefined && {
                  updatedPermissions: result.updatedPermissions,
                }),
                ...(result.toolUseID !== undefined && {
                  toolUseID: result.toolUseID,
                }),
                ...(result.toolUseID === undefined && {
                  toolUseID: pendingRequest.tool_use_id,
                }),
                decisionClassification:
                  result.decisionClassification ?? 'user_temporary',
              }
            : {
                message: result.message,
                ...(result.toolUseID !== undefined && {
                  toolUseID: result.toolUseID,
                }),
                ...(result.toolUseID === undefined && {
                  toolUseID: pendingRequest.tool_use_id,
                }),
                decisionClassification:
                  result.decisionClassification ?? 'user_reject',
              }),
        },
      },
    })
    this.ws.send(response)
  }

  /**
   * Send an interrupt signal to cancel the current request
   */
  sendInterrupt(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    // Must match ProtocolControlRequest format expected by StructuredIO
    const request = jsonStringify({
      type: 'control_request',
      request_id: crypto.randomUUID(),
      request: {
        subtype: 'interrupt',
      },
    })
    this.ws.send(request)
  }

  private sendErrorResponse(requestId: string, error: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    const response = jsonStringify({
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: requestId,
        error,
      },
    })
    this.ws.send(response)
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.pendingPermissionRequests.clear()
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
