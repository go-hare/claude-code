import { jsonStringify } from '../../../utils/slowOperations.js'
import { errorMessage } from '../../../utils/errors.js'
import {
  registerProcessOutputErrorHandlers,
  writeToStdout,
} from '../../../utils/process.js'
import type {
  ProtocolMessage,
  ProtocolResultMessage,
} from 'src/types/protocol/index.js'
import type {
  DirectConnectConfig,
  ServerConfig,
} from '../../../server/types.js'
import type { SessionManager } from './SessionManager.js'
import type { SessionLogger } from './contracts.js'
import {
  DirectConnectSessionManager,
} from '../../../server/directConnectManager.js'
import type { RemotePermissionResponse } from '../../../remote/RemoteSessionManager.js'
import {
  getKernelRuntimeFailedError,
  handleKernelRuntimeHostEvent,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeProtocolMessageDedupe,
} from '../../../remote/kernelRuntimeHostEvents.js'
import { projectProtocolMessageToLegacyStreamJsonMessages } from '../../core/events/compatProjection.js'

type ServerSocketData = {
  sessionId: string
}

function isAuthorized(req: Request, authToken?: string): boolean {
  if (!authToken) {
    return true
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${authToken}`) {
    return true
  }

  const url = new URL(req.url)
  return url.searchParams.get('auth') === authToken
}

function buildWsUrl(req: Request, sessionId: string, unixSocket?: string): string {
  if (unixSocket) {
    return `ws://localhost/sessions/${sessionId}/ws`
  }

  const url = new URL(req.url)
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${url.host}/sessions/${sessionId}/ws`
}

async function readPromptFromStdin(): Promise<string> {
  let content = ''
  for await (const chunk of process.stdin) {
    content += chunk.toString()
  }
  return content.trim()
}

function normalizeWebSocketMessage(
  message: string | Buffer | ArrayBuffer | Uint8Array,
): string {
  if (typeof message === 'string') {
    return message
  }
  if (message instanceof ArrayBuffer) {
    return Buffer.from(message).toString('utf8')
  }
  return Buffer.from(message).toString('utf8')
}

export function startServerRuntimeHost(
  config: ServerConfig,
  sessionManager: SessionManager,
  logger: SessionLogger,
): { port?: number; stop: (closeActiveConnections: boolean) => void } {
  const server = Bun.serve<ServerSocketData>({
    ...(config.unix
      ? { unix: config.unix }
      : {
          port: config.port,
          hostname: config.host,
        }),
    fetch(req, bunServer) {
      const url = new URL(req.url)
      const path = url.pathname

      if (path === '/health') {
        return Response.json({ status: 'ok' })
      }

      if (path === '/sessions' && req.method === 'POST') {
        if (!isAuthorized(req, config.authToken)) {
          return new Response('Unauthorized', { status: 401 })
        }

        return (async () => {
          let payload: { cwd?: string; dangerously_skip_permissions?: boolean }
          try {
            payload = (await req.json()) as {
              cwd?: string
              dangerously_skip_permissions?: boolean
            }
          } catch {
            return new Response('Invalid JSON body', { status: 400 })
          }

          try {
            const cwd = payload.cwd || config.workspace || process.cwd()
            const session = await sessionManager.createSession({
              cwd,
              dangerouslySkipPermissions:
                payload.dangerously_skip_permissions === true,
            })
            return Response.json({
              session_id: session.sessionId,
              ws_url: buildWsUrl(req, session.sessionId, config.unix),
              work_dir: session.workDir,
            })
          } catch (error) {
            logger.warn('Failed to create direct-connect session', {
              error: errorMessage(error),
            })
            return new Response(errorMessage(error), { status: 400 })
          }
        })()
      }

      const wsMatch = path.match(/^\/sessions\/([^/]+)\/ws$/)
      if (req.method === 'GET' && wsMatch) {
        if (!isAuthorized(req, config.authToken)) {
          return new Response('Unauthorized', { status: 401 })
        }

        const sessionId = wsMatch[1]!
        if (!sessionManager.hasSession(sessionId)) {
          return new Response('Session not found', { status: 404 })
        }

        if (
          bunServer.upgrade(req, {
            data: { sessionId },
          })
        ) {
          return
        }

        return new Response('Failed to upgrade WebSocket', { status: 500 })
      }

      return new Response('Not found', { status: 404 })
    },
    websocket: {
      open(ws) {
        const session = sessionManager.attachSink(ws.data.sessionId, ws)
        if (!session) {
          ws.close(1008, 'Session not found')
        }
      },
      message(ws, message) {
        const rawMessage = normalizeWebSocketMessage(message)
        const handled = sessionManager.handleSessionInput(
          ws.data.sessionId,
          rawMessage,
        )
        if (!handled) {
          ws.close(1011, 'Session is not accepting messages')
        }
      },
      close(ws) {
        sessionManager.detachSink(ws.data.sessionId, ws)
      },
    },
  })

  return {
    port: server.port,
    stop(closeActiveConnections: boolean) {
      server.stop(closeActiveConnections)
    },
  }
}

export async function runConnectHeadlessRuntime(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat = 'text',
  interactive = false,
): Promise<void> {
  registerProcessOutputErrorHandlers()

  let connected = false
  let settled = false
  let connectError: Error | null = null
  let finalResult: ProtocolResultMessage | null = null
  let semanticOutput = ''
  const protocolMessageDedupe = new KernelRuntimeProtocolMessageDedupe()
  const outputDeltaDedupe = new KernelRuntimeOutputDeltaDedupe()

  let connectedResolve!: () => void
  let connectedReject!: (error: Error) => void
  let doneResolve!: () => void

  const connectedPromise = new Promise<void>((resolve, reject) => {
    connectedResolve = resolve
    connectedReject = reject
  })
  const donePromise = new Promise<void>(resolve => {
    doneResolve = resolve
  })

  const settle = (): void => {
    if (settled) {
      return
    }
    settled = true
    doneResolve()
  }

  const handleProtocolMessage = (protocolMessage: ProtocolMessage): void => {
    if (!protocolMessageDedupe.shouldProcess(protocolMessage)) {
      return
    }

    if (outputFormat === 'stream-json') {
      for (const message of projectProtocolMessageToLegacyStreamJsonMessages(
        protocolMessage,
      )) {
        writeToStdout(`${jsonStringify(message)}\n`)
      }
    }

    if (protocolMessage.type === 'result') {
      finalResult = protocolMessage as ProtocolResultMessage
      settle()
    }
  }

  const manager = new DirectConnectSessionManager(config, {
    onMessage: handleProtocolMessage,
    onPermissionRequest: (request, requestId) => {
      const response: RemotePermissionResponse = {
        behavior: 'deny',
        message:
          request.description ??
          'Headless direct-connect does not support interactive permission prompts',
      }
      manager.respondToPermissionRequest(requestId, response)
    },
    onConnected: () => {
      connected = true
      connectedResolve()
    },
    onDisconnected: () => {
      if (!settled) {
        settle()
      }
    },
    onError: error => {
      connectError = error
      if (!connected) {
        connectedReject(error)
      } else if (!settled) {
        settle()
      }
    },
    onRuntimeEvent: envelope => {
      handleKernelRuntimeHostEvent(envelope, {
        onProtocolMessage: handleProtocolMessage,
        onOutputDelta: delta => {
          if (!outputDeltaDedupe.shouldProcess(envelope)) {
            return
          }
          semanticOutput += delta.text
        },
        onTurnTerminal: (_terminalEnvelope, event, projection) => {
          if (!finalResult && semanticOutput) {
            finalResult = {
              type: 'result',
              subtype: projection.isError ? 'error' : 'success',
              is_error: projection.isError,
              result: semanticOutput,
              errors: projection.isError
                ? [
                    errorMessage(
                      getKernelRuntimeFailedError(event) ?? event.payload,
                    ),
                  ]
                : undefined,
            } as ProtocolResultMessage
          }
          settle()
        },
      })
    },
  })

  try {
    manager.connect()
    await connectedPromise

    const effectivePrompt = interactive ? await readPromptFromStdin() : prompt
    if (!effectivePrompt) {
      throw new Error(
        interactive
          ? 'Headless direct-connect requires stdin input when --print is used without a prompt'
          : 'No prompt provided for direct-connect print mode',
      )
    }

    const sent = manager.sendMessage(effectivePrompt)
    if (!sent) {
      throw new Error('Failed to send prompt to direct-connect server')
    }

    await donePromise
  } finally {
    manager.disconnect()
  }

  if (outputFormat === 'stream-json') {
    return
  }

  if (!finalResult) {
    if (connectError) {
      throw connectError
    }
    throw new Error('Direct-connect session ended without a result')
  }

  if (outputFormat === 'json') {
    writeToStdout(`${jsonStringify(finalResult)}\n`)
    return
  }

  const resultMessage = finalResult as {
    subtype?: string
    errors?: string[]
    result?: string
  }

  if (resultMessage.subtype !== 'success') {
    throw new Error(resultMessage.errors?.join('\n') ?? 'Direct-connect failed')
  }

  if (resultMessage.result) {
    writeToStdout(
      resultMessage.result.endsWith('\n')
        ? resultMessage.result
        : `${resultMessage.result}\n`,
    )
  }
}
