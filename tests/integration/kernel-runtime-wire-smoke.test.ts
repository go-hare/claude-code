import { describe, expect, test } from 'bun:test'
import { spawn } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION } from '../../src/kernel/wireProtocol.js'

const repoRoot = join(import.meta.dir, '../..')

type WireEnvelope = {
  kind: string
  requestId?: string
  eventId?: string
  conversationId?: string
  turnId?: string
  payload?: {
    type?: string
    payload?: Record<string, unknown>
    state?: string
  }
  error?: {
    code: string
  }
}

function command(input: Record<string, unknown>): string {
  return `${JSON.stringify({
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    ...input,
  })}\n`
}

describe('kernel runtime wire smoke', () => {
  test(
    'runs ping, conversation, turn, abort, and replay over NDJSON',
    async () => {
      const child = spawn('bun', ['run', 'src/entrypoints/kernel-runtime.ts'], {
        cwd: repoRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const stderr: string[] = []
      const envelopes: WireEnvelope[] = []
      const waiters = new Set<() => void>()

      child.stderr.setEncoding('utf8')
      child.stderr.on('data', chunk => {
        stderr.push(chunk)
      })
      child.stdout.setEncoding('utf8')
      let buffer = ''
      child.stdout.on('data', chunk => {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.trim().length > 0) {
            envelopes.push(JSON.parse(line) as WireEnvelope)
          }
        }
        for (const waiter of waiters) {
          waiter()
        }
      })

      try {
        child.stdin.write(command({ type: 'ping', requestId: 'ping-1' }))
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope =>
            envelope.kind === 'pong' && envelope.requestId === 'ping-1',
        )

        child.stdin.write(
          command({
            type: 'connect_host',
            requestId: 'connect-1',
            host: {
              kind: 'desktop',
              id: 'desktop-host-1',
              transport: 'stdio',
              trustLevel: 'local',
              declaredCapabilities: ['events'],
            },
          }),
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope => envelope.payload?.type === 'host.connected',
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope =>
            envelope.kind === 'ack' && envelope.requestId === 'connect-1',
        )

        child.stdin.write(
          command({
            type: 'create_conversation',
            requestId: 'create-1',
            conversationId: 'conversation-1',
            workspacePath: repoRoot,
          }),
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope => envelope.payload?.type === 'conversation.ready',
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope =>
            envelope.kind === 'ack' && envelope.requestId === 'create-1',
        )

        child.stdin.write(
          command({
            type: 'run_turn',
            requestId: 'run-1',
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            prompt: 'hello',
          }),
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope => envelope.payload?.type === 'turn.started',
        )

        child.stdin.write(
          command({
            type: 'abort_turn',
            requestId: 'abort-1',
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            reason: 'interrupt',
          }),
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope => envelope.payload?.type === 'turn.abort_requested',
        )

        child.stdin.write(
          command({
            type: 'subscribe_events',
            requestId: 'subscribe-1',
            conversationId: 'conversation-1',
          }),
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope =>
            envelope.kind === 'ack' && envelope.requestId === 'subscribe-1',
        )

        expect(
          envelopes
            .filter(envelope => envelope.kind === 'event')
            .map(envelope => envelope.payload?.type),
        ).toContain('turn.abort_requested')

        child.stdin.write(
          command({
            type: 'reload_capabilities',
            requestId: 'reload-1',
            scope: { type: 'capability', name: 'tools' },
          }),
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope =>
            envelope.kind === 'ack' && envelope.requestId === 'reload-1',
        )

        child.stdin.write(
          command({
            type: 'publish_host_event',
            requestId: 'host-event-1',
            event: {
              conversationId: 'conversation-1',
              type: 'host.focus_changed',
              replayable: true,
              payload: { focused: true },
            },
          }),
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope => envelope.payload?.type === 'host.focus_changed',
        )

        child.stdin.write(
          command({
            type: 'disconnect_host',
            requestId: 'disconnect-1',
            hostId: 'desktop-host-1',
            policy: 'detach',
            reason: 'smoke_complete',
          }),
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope => envelope.payload?.type === 'host.disconnected',
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope =>
            envelope.kind === 'ack' && envelope.requestId === 'disconnect-1',
        )
      } finally {
        child.stdin.end()
      }

      const exitCode = await new Promise<number | null>(resolve => {
        child.on('exit', code => resolve(code))
      })
      expect(exitCode).toBe(0)
      expect(stderr.join('')).toBe('')
    },
    { timeout: 30_000 },
  )

  test(
    'can enable the process-backed headless executor through runner env',
    async () => {
      const fakeHeadlessScript = `
        let input = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => {
          input += chunk;
        });
        process.stdin.on("end", () => {
          const text = input.trim();
          console.log(JSON.stringify({
            type: "assistant",
            uuid: "assistant-1",
            session_id: "session-1",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "echo:" + text }],
            },
          }));
          console.log(JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: "final:" + text,
            session_id: "session-1",
          }));
        });
      `
      const nodeCommand = existsSync('/usr/local/bin/node')
        ? '/usr/local/bin/node'
        : 'node'
      const child = spawn('bun', ['run', 'src/entrypoints/kernel-runtime.ts'], {
        cwd: repoRoot,
        env: {
          ...process.env,
          HARE_KERNEL_RUNTIME_HEADLESS_EXECUTOR: 'process',
          HARE_KERNEL_RUNTIME_HEADLESS_COMMAND: nodeCommand,
          HARE_KERNEL_RUNTIME_HEADLESS_ARGS_JSON: JSON.stringify([
            '-e',
            fakeHeadlessScript,
          ]),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const stderr: string[] = []
      const envelopes: WireEnvelope[] = []
      const waiters = new Set<() => void>()

      child.stderr.setEncoding('utf8')
      child.stderr.on('data', chunk => {
        stderr.push(chunk)
      })
      child.stdout.setEncoding('utf8')
      let buffer = ''
      child.stdout.on('data', chunk => {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.trim().length > 0) {
            envelopes.push(JSON.parse(line) as WireEnvelope)
          }
        }
        for (const waiter of waiters) {
          waiter()
        }
      })

      try {
        child.stdin.write(
          command({
            type: 'create_conversation',
            requestId: 'create-1',
            conversationId: 'conversation-1',
            workspacePath: repoRoot,
          }),
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope =>
            envelope.kind === 'ack' && envelope.requestId === 'create-1',
        )

        child.stdin.write(
          command({
            type: 'run_turn',
            requestId: 'run-1',
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            prompt: 'hello process',
          }),
        )
        await waitForEnvelope(
          envelopes,
          waiters,
          envelope => envelope.payload?.type === 'headless.protocol_message',
        )
        const output = await waitForEnvelope(envelopes, waiters, envelope => {
          return (
            envelope.payload?.type === 'turn.output_delta' &&
            (envelope.payload.payload as { text?: string } | undefined)
              ?.text === 'final:hello process'
          )
        })
        const completed = await waitForEnvelope(
          envelopes,
          waiters,
          envelope => envelope.payload?.type === 'turn.completed',
        )

        expect(output).toMatchObject({
          kind: 'event',
          payload: {
            type: 'turn.output_delta',
          },
        })
        expect(completed).toMatchObject({
          kind: 'event',
          payload: {
            type: 'turn.completed',
          },
        })
      } finally {
        child.stdin.end()
      }

      const exitCode = await new Promise<number | null>(resolve => {
        child.on('exit', code => resolve(code))
      })
      expect(exitCode).toBe(0)
      expect(stderr.join('')).toBe('')
    },
    { timeout: 30_000 },
  )

  test(
    'resumes a transcript-backed conversation and preserves process-backed headless output over NDJSON',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'kernel-runtime-resume-output-'))
      const transcriptPath = join(dir, 'resume-session.jsonl')
      const sessionId = '550e8400-e29b-41d4-a716-446655440000'
      const fakeHeadlessScript = `
        const resumeIndex = process.argv.findIndex(arg => arg === "--resume");
        const resumed = resumeIndex >= 0 ? process.argv[resumeIndex + 1] : "missing";
        let input = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => {
          input += chunk;
        });
        process.stdin.on("end", () => {
          const text = input.trim();
          console.log(JSON.stringify({
            type: "assistant",
            uuid: "assistant-after-resume",
            session_id: resumed,
            message: {
              role: "assistant",
              content: [{ type: "text", text: "echo:" + resumed }],
            },
          }));
          console.log(JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: "resume:" + resumed + ";prompt:" + text,
            session_id: resumed,
          }));
        });
      `
      const nodeCommand = existsSync('/usr/local/bin/node')
        ? '/usr/local/bin/node'
        : 'node'
      const child = spawn('bun', ['run', 'src/entrypoints/kernel-runtime.ts'], {
        cwd: repoRoot,
        env: {
          ...process.env,
          HARE_KERNEL_RUNTIME_HEADLESS_EXECUTOR: 'process',
          HARE_KERNEL_RUNTIME_HEADLESS_COMMAND: nodeCommand,
          HARE_KERNEL_RUNTIME_HEADLESS_ARGS_JSON: JSON.stringify([
            '-e',
            fakeHeadlessScript,
            '--',
          ]),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const stderr: string[] = []
      const envelopes: WireEnvelope[] = []
      const waiters = new Set<() => void>()

      writeFileSync(
        transcriptPath,
        `${[
          {
            type: 'user',
            uuid: 'resume-user-1',
            parentUuid: null,
            sessionId,
            cwd: dir,
            timestamp: '2026-05-01T00:00:00.000Z',
            version: '1.0.0',
            message: {
              role: 'user',
              content: 'Hello from transcript',
            },
          },
          {
            type: 'assistant',
            uuid: 'resume-assistant-1',
            parentUuid: 'resume-user-1',
            sessionId,
            cwd: dir,
            timestamp: '2026-05-01T00:00:01.000Z',
            version: '1.0.0',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Hi from transcript',
                },
              ],
            },
          },
        ].map(entry => JSON.stringify(entry)).join('\n')}\n`,
        'utf8',
      )
      collectChildOutput(child, stderr, envelopes, waiters)

      try {
        try {
          child.stdin.write(
            command({
              type: 'resume_session',
              requestId: 'resume-1',
              sessionId: transcriptPath,
              conversationId: 'conversation-resume-1',
              resumeSessionAt: 'resume-user-1',
            }),
          )
          await waitForEnvelope(
            envelopes,
            waiters,
            envelope =>
              envelope.kind === 'ack' && envelope.requestId === 'resume-1',
          )
          await waitForEnvelope(envelopes, waiters, envelope => {
            return (
              envelope.payload?.type === 'conversation.transcript_message' &&
              (
                envelope.payload.payload as
                  | { message?: { uuid?: string } }
                  | undefined
              )?.message?.uuid === 'resume-user-1'
            )
          })
          expect(
            envelopes.some(envelope => {
              return (
                envelope.payload?.type === 'conversation.transcript_message' &&
                (
                  envelope.payload.payload as
                    | { message?: { uuid?: string } }
                    | undefined
                )?.message?.uuid === 'resume-assistant-1'
              )
            }),
          ).toBe(false)

          child.stdin.write(
            command({
              type: 'run_turn',
              requestId: 'run-1',
              conversationId: 'conversation-resume-1',
              turnId: 'turn-1',
              prompt: 'after resume',
            }),
          )
          await waitForEnvelope(
            envelopes,
            waiters,
            envelope => envelope.payload?.type === 'headless.protocol_message',
          )
          const output = await waitForEnvelope(envelopes, waiters, envelope => {
            return (
              envelope.payload?.type === 'turn.output_delta' &&
              (envelope.payload.payload as { text?: string } | undefined)
                ?.text === `resume:${transcriptPath};prompt:after resume`
            )
          })
          const completed = await waitForEnvelope(
            envelopes,
            waiters,
            envelope => envelope.payload?.type === 'turn.completed',
          )

          expect(output).toMatchObject({
            kind: 'event',
            conversationId: 'conversation-resume-1',
            turnId: 'turn-1',
            payload: {
              type: 'turn.output_delta',
              payload: {
                text: `resume:${transcriptPath};prompt:after resume`,
              },
            },
          })
          expect(completed).toMatchObject({
            kind: 'event',
            conversationId: 'conversation-resume-1',
            turnId: 'turn-1',
            payload: {
              type: 'turn.completed',
            },
          })
        } finally {
          child.stdin.end()
        }

        const exitCode = await new Promise<number | null>(resolve => {
          child.on('exit', code => resolve(code))
        })
        expect(exitCode).toBe(0)
        expect(stderr.join('')).toBe('')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    { timeout: 30_000 },
  )

  test(
    'recovers replayable events from an event journal after process restart',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'kernel-runtime-journal-'))
      const journalPath = join(dir, 'events.ndjson')

      try {
        const first = spawn(
          'bun',
          ['run', 'src/entrypoints/kernel-runtime.ts'],
          {
            cwd: repoRoot,
            env: {
              ...process.env,
              HARE_KERNEL_RUNTIME_EVENT_JOURNAL: journalPath,
            },
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        )
        const firstStderr: string[] = []
        const firstEnvelopes: WireEnvelope[] = []
        const firstWaiters = new Set<() => void>()
        collectChildOutput(first, firstStderr, firstEnvelopes, firstWaiters)

        first.stdin.write(
          command({
            type: 'create_conversation',
            requestId: 'create-1',
            conversationId: 'conversation-1',
            workspacePath: repoRoot,
          }),
        )
        const ready = await waitForEnvelope(
          firstEnvelopes,
          firstWaiters,
          envelope => envelope.payload?.type === 'conversation.ready',
        )
        first.stdin.write(
          command({
            type: 'run_turn',
            requestId: 'run-1',
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            prompt: 'hello journal',
          }),
        )
        await waitForEnvelope(
          firstEnvelopes,
          firstWaiters,
          envelope => envelope.payload?.type === 'turn.started',
        )
        first.stdin.end()

        const firstExitCode = await new Promise<number | null>(resolve => {
          first.on('exit', code => resolve(code))
        })
        expect(firstExitCode).toBe(0)
        expect(firstStderr.join('')).toBe('')

        const second = spawn(
          'bun',
          ['run', 'src/entrypoints/kernel-runtime.ts'],
          {
            cwd: repoRoot,
            env: {
              ...process.env,
              HARE_KERNEL_RUNTIME_EVENT_JOURNAL: journalPath,
            },
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        )
        const secondStderr: string[] = []
        const secondEnvelopes: WireEnvelope[] = []
        const secondWaiters = new Set<() => void>()
        collectChildOutput(second, secondStderr, secondEnvelopes, secondWaiters)

        second.stdin.write(
          command({
            type: 'subscribe_events',
            requestId: 'subscribe-1',
            conversationId: 'conversation-1',
            sinceEventId: ready.eventId,
          }),
        )
        await waitForEnvelope(
          secondEnvelopes,
          secondWaiters,
          envelope =>
            envelope.kind === 'ack' && envelope.requestId === 'subscribe-1',
        )
        const replayed = await waitForEnvelope(
          secondEnvelopes,
          secondWaiters,
          envelope => envelope.payload?.type === 'turn.started',
        )

        expect(replayed).toMatchObject({
          kind: 'event',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          payload: {
            type: 'turn.started',
          },
        })

        second.stdin.end()
        const secondExitCode = await new Promise<number | null>(resolve => {
          second.on('exit', code => resolve(code))
        })
        expect(secondExitCode).toBe(0)
        expect(secondStderr.join('')).toBe('')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    { timeout: 30_000 },
  )
})

function collectChildOutput(
  child: ReturnType<typeof spawn>,
  stderr: string[],
  envelopes: WireEnvelope[],
  waiters: Set<() => void>,
): void {
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    stderr.push(chunk)
  })
  child.stdout.setEncoding('utf8')
  let buffer = ''
  child.stdout.on('data', chunk => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim().length > 0) {
        envelopes.push(JSON.parse(line) as WireEnvelope)
      }
    }
    for (const waiter of waiters) {
      waiter()
    }
  })
}

async function waitForEnvelope(
  envelopes: readonly WireEnvelope[],
  waiters: Set<() => void>,
  predicate: (envelope: WireEnvelope) => boolean,
): Promise<WireEnvelope> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const existing = envelopes.find(predicate)
    if (existing) {
      return existing
    }
    await new Promise<void>(resolve => {
      const waiter = (): void => {
        waiters.delete(waiter)
        resolve()
      }
      waiters.add(waiter)
      setTimeout(waiter, 50)
    })
  }
  throw new Error('Timed out waiting for kernel runtime envelope')
}
