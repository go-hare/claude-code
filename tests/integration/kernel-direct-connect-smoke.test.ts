import { describe, expect, test } from 'bun:test'
import type { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PassThrough } from 'stream'

import {
  createDirectConnectSession,
  startServer,
} from '../../src/kernel/serverHost.js'
import { DirectConnectSessionManager } from '../../src/server/directConnectManager.js'
import { SessionManager } from '../../src/server/sessionManager.js'
import type {
  SessionRuntimeBackend,
  SessionRuntimeHandle,
} from '../../src/runtime/capabilities/server/contracts.js'
import { noopSessionLogger } from '../../src/runtime/capabilities/server/contracts.js'
import type { KernelRuntimeEnvelopeBase } from '../../src/runtime/contracts/events.js'
import type { SDKMessage } from '../../src/entrypoints/agentSdkTypes.js'

class FakeDirectConnectBackend implements SessionRuntimeBackend {
  readonly runtimes = new Map<string, FakeDirectConnectRuntime>()

  createSessionRuntime(options: {
    cwd: string
    sessionId: string
  }): SessionRuntimeHandle {
    const runtime = new FakeDirectConnectRuntime(options.cwd, options.sessionId)
    this.runtimes.set(options.sessionId, runtime)
    return runtime.handle
  }
}

class FakeDirectConnectRuntime {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly process = new EventEmitter() as unknown as ChildProcess
  readonly inputs: unknown[] = []
  readonly handle: SessionRuntimeHandle
  private closed = false
  private readonly cwd: string
  private readonly sessionId: string

  constructor(cwd: string, sessionId: string) {
    this.cwd = cwd
    this.sessionId = sessionId
    this.handle = {
      sessionId,
      workDir: cwd,
      process: this.process,
      stdout: this.stdout as SessionRuntimeHandle['stdout'],
      stderr: this.stderr as SessionRuntimeHandle['stderr'],
      writeLine: data => this.writeLine(data),
      terminate: () => this.close(0, null),
      forceKill: () => this.close(0, 'SIGKILL'),
    }
  }

  private writeLine(data: string): boolean {
    this.inputs.push(JSON.parse(data))
    queueMicrotask(() => this.emitTurn())
    return true
  }

  private emitTurn(): void {
    this.writeStdout(createRuntimeEvent(1, 'turn.started', { state: 'running' }))
    this.writeStdout({
      type: 'assistant',
      uuid: 'assistant-1',
      session_id: this.sessionId,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'direct ' }],
      },
    })
    this.writeStdout(createRuntimeEvent(2, 'turn.output_delta', { text: 'direct ' }))
    this.writeStdout(createRuntimeEvent(3, 'turn.output_delta', { text: 'connect' }))
    this.writeStdout({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'direct connect',
      session_id: this.sessionId,
    })
    this.writeStdout(
      createRuntimeEvent(4, 'turn.completed', {
        state: 'completed',
        stopReason: 'end_turn',
      }),
    )
    setTimeout(() => this.close(0, null), 10)
  }

  private writeStdout(message: unknown): void {
    this.stdout.write(`${JSON.stringify(message)}\n`)
  }

  private close(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.stdout.end()
    this.stderr.end()
    this.process.emit('close', code, signal)
  }
}

describe('kernel direct-connect smoke', () => {
  test(
    'runs real HTTP and WebSocket transport without duplicate runtime projection',
    async () => {
      const cwd = mkdtempSync(join(tmpdir(), 'kernel-direct-connect-'))
      const backend = new FakeDirectConnectBackend()
      const sessionManager = new SessionManager(backend, {
        logger: noopSessionLogger,
      })
      const server = startServer(
        {
          port: 0,
          host: '127.0.0.1',
          authToken: 'direct-smoke-token',
          idleTimeoutMs: 0,
          maxSessions: 4,
        },
        sessionManager,
        noopSessionLogger,
      )

      try {
        expect(typeof server.port).toBe('number')
        const directSession = await createDirectConnectSession({
          serverUrl: `http://127.0.0.1:${server.port}`,
          authToken: 'direct-smoke-token',
          cwd,
          dangerouslySkipPermissions: true,
        })
        const sdkMessages: SDKMessage[] = []
        const runtimeEnvelopes: KernelRuntimeEnvelopeBase[] = []
        let connectedResolve!: () => void
        let connectedReject!: (error: Error) => void
        let doneResolve!: () => void
        let doneReject!: (error: Error) => void
        const connected = new Promise<void>((resolve, reject) => {
          connectedResolve = resolve
          connectedReject = reject
        })
        const done = new Promise<void>((resolve, reject) => {
          doneResolve = resolve
          doneReject = reject
        })

        const client = new DirectConnectSessionManager({
          ...directSession.config,
          wsUrl: `${directSession.config.wsUrl}?auth=direct-smoke-token`,
        }, {
          onMessage: message => {
            sdkMessages.push(message)
            if (message.type === 'result' && runtimeEnvelopes.length >= 4) {
              doneResolve()
            }
          },
          onPermissionRequest: () => {},
          onRuntimeEvent: envelope => {
            runtimeEnvelopes.push(envelope)
            if (
              sdkMessages.some(message => message.type === 'result') &&
              runtimeEnvelopes.length >= 4
            ) {
              doneResolve()
            }
          },
          onConnected: connectedResolve,
          onError: error => {
            connectedReject(error)
            doneReject(error)
          },
        })

        client.connect()
        await connected
        expect(client.sendMessage('ping direct-connect')).toBe(true)
        await Promise.race([
          done,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('direct-connect smoke timed out')),
              5_000,
            ),
          ),
        ])

        client.disconnect()

        const runtime = backend.runtimes.get(directSession.config.sessionId)
        expect(runtime?.inputs).toHaveLength(1)
        expect(runtime?.inputs[0]).toMatchObject({
          type: 'user',
          message: {
            role: 'user',
            content: 'ping direct-connect',
          },
        })
        expect(sdkMessages.map(message => message.type)).toEqual([
          'assistant',
          'result',
        ])
        expect(
          sdkMessages.find(
            (message): message is SDKMessage & { type: 'result'; result: string } =>
              message.type === 'result',
          )?.result,
        ).toBe('direct connect')

        const runtimeEventTypes = runtimeEnvelopes.map(
          envelope => (envelope.payload as { type: string }).type,
        )
        expect(runtimeEventTypes).toEqual([
          'turn.started',
          'turn.output_delta',
          'turn.output_delta',
          'turn.completed',
        ])
        expect(runtimeEnvelopes.map(envelope => envelope.sequence)).toEqual([
          1,
          2,
          3,
          4,
        ])
        const runtimeEventIds = runtimeEnvelopes.map(
          envelope => envelope.eventId ?? '',
        )
        expect(runtimeEventIds.every(Boolean)).toBe(true)
        expect(new Set(runtimeEventIds).size).toBe(runtimeEventIds.length)
        expect(hasAdjacentDuplicate(runtimeEventIds)).toBe(false)
      } finally {
        server.stop(true)
        await sessionManager.destroyAll()
        rmSync(cwd, { recursive: true, force: true })
      }
    },
    { timeout: 10_000 },
  )
})

function createRuntimeEvent(
  sequence: number,
  type: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: 'kernel_runtime_event',
    uuid: `runtime-message-${sequence}`,
    session_id: 'session-1',
    envelope: {
      schemaVersion: 'kernel.runtime.v1',
      messageId: `runtime-message-${sequence}`,
      eventId: `runtime-event-${sequence}`,
      sequence,
      timestamp: '2026-05-04T00:00:00.000Z',
      source: 'kernel_runtime',
      kind: 'event',
      runtimeId: 'direct-connect-smoke',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      payload: {
        type,
        replayable: true,
        payload,
      },
    },
  }
}

function hasAdjacentDuplicate(values: readonly string[]): boolean {
  return values.some((value, index) => index > 0 && values[index - 1] === value)
}
