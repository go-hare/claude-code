import { describe, expect, test } from 'bun:test'

import {
  createKernelHeadlessController,
  normalizeKernelHeadlessEvent,
  type KernelHeadlessEvent,
} from '../index.js'
import { createKernelHeadlessInputQueue } from '../headlessInputQueue.js'

function createDeferred(): {
  promise: Promise<void>
  resolve(): void
} {
  let resolve!: () => void
  const promise = new Promise<void>(next => {
    resolve = next
  })
  return { promise, resolve }
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for condition')
}

describe('createKernelHeadlessController', () => {
  test('normalizes runtime events through the controller facade', async () => {
    const controller = await createKernelHeadlessController({
      workspacePath: '/tmp/kernel-headless-controller-test',
      runtimeOptions: {
        eventJournalPath: false,
      },
      conversationOptions: {
        conversationJournalPath: false,
      },
      runTurnExecutor: async function* ({ request }) {
        yield {
          type: 'output',
          payload: { text: `echo:${String(request.prompt)}` },
        }
        yield {
          type: 'event',
          event: {
            type: 'headless.protocol_message',
            replayable: true,
            payload: {
              type: 'assistant',
              text: `sdk:${String(request.prompt)}`,
            },
          },
        }
        yield {
          type: 'completed',
          stopReason: 'success',
        }
      },
      sessionId: 'session-controller-1',
      conversationId: 'conversation-controller-1',
    })
    const seen: KernelHeadlessEvent[] = []
    controller.onEvent(event => {
      seen.push(event)
    })

    await controller.start()
    expect(controller.state.status).toBe('ready')

    const started = await controller.runTurn({
      prompt: 'hello',
      turnId: 'turn-1',
    })

    expect(started).toEqual({
      sessionId: 'session-controller-1',
      conversationId: 'conversation-controller-1',
      turnId: 'turn-1',
    })

    await waitFor(() => seen.some(event => event.type === 'turn.completed'))

    expect(
      seen.some(
        event => event.type === 'turn.output' && event.text === 'echo:hello',
      ),
    ).toBe(true)
    expect(
      seen.some(
        event =>
          event.type === 'compat.protocol_message' &&
          (event.message as { text?: string }).text === 'sdk:hello',
      ),
    ).toBe(true)
    expect(controller.state.status).toBe('ready')
    await controller.dispose()
  })

  test('rejects concurrent turns and drains queued input turns sequentially', async () => {
    const firstTurn = createDeferred()
    const queue = createKernelHeadlessInputQueue()
    const controller = await createKernelHeadlessController({
      workspacePath: '/tmp/kernel-headless-controller-queue-test',
      runtimeOptions: {
        eventJournalPath: false,
      },
      conversationOptions: {
        conversationJournalPath: false,
      },
      inputQueue: queue,
      sessionId: 'session-controller-2',
      conversationId: 'conversation-controller-2',
      runTurnExecutor: async function* ({ request }) {
        yield {
          type: 'output',
          payload: { text: `echo:${String(request.prompt)}` },
        }
        if (request.turnId === 'turn-1') {
          await firstTurn.promise
        }
        yield {
          type: 'completed',
          stopReason: 'end_turn',
        }
      },
    })
    const outputs: string[] = []
    controller.onEvent(event => {
      if (event.type === 'turn.output' && event.text) {
        outputs.push(event.text)
      }
    })

    await controller.start()
    await controller.runTurn({
      prompt: 'first',
      turnId: 'turn-1',
    })

    await expect(
      controller.runTurn({
        prompt: 'second',
        turnId: 'turn-2',
      }),
    ).rejects.toThrow('Kernel headless controller already has active turn')

    queue.pushUserTurn({
      prompt: 'queued',
      turnId: 'turn-queued',
    })
    firstTurn.resolve()

    await waitFor(() => outputs.includes('echo:queued'))
    expect(controller.state.status).toBe('ready')
    await controller.dispose()
  })
})

describe('normalizeKernelHeadlessEvent', () => {
  test('maps runtime envelopes into stable headless events', () => {
    expect(
      normalizeKernelHeadlessEvent({
        schemaVersion: 'kernel.runtime.v1',
        messageId: 'message-1',
        sequence: 1,
        timestamp: '2026-04-30T00:00:00.000Z',
        source: 'kernel_runtime',
        kind: 'event',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        payload: {
          type: 'turn.output_delta',
          replayable: true,
          payload: {
            text: 'hello',
          },
        },
      }),
    ).toMatchObject({
      type: 'turn.output',
      text: 'hello',
    })
  })

  test('normalizes terminal and compatibility projections with shared helpers', () => {
    expect(
      normalizeKernelHeadlessEvent({
        schemaVersion: 'kernel.runtime.v1',
        messageId: 'message-2',
        sequence: 2,
        timestamp: '2026-04-30T00:00:00.000Z',
        source: 'kernel_runtime',
        kind: 'event',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        payload: {
          type: 'turn.completed',
          replayable: true,
          payload: {
            stopReason: 'max_tokens',
          },
        },
      }),
    ).toMatchObject({
      type: 'turn.completed',
      stopReason: 'max_tokens',
    })

    expect(
      normalizeKernelHeadlessEvent({
        schemaVersion: 'kernel.runtime.v1',
        messageId: 'message-3',
        sequence: 3,
        timestamp: '2026-04-30T00:00:00.000Z',
        source: 'kernel_runtime',
        kind: 'event',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        payload: {
          type: 'turn.failed',
          replayable: true,
          payload: {
            error: 'boom',
          },
        },
      }),
    ).toMatchObject({
      type: 'turn.failed',
      error: 'boom',
    })

    const protocolPayload = {
      type: 'assistant',
      text: 'sdk text',
    }
    expect(
      normalizeKernelHeadlessEvent({
        schemaVersion: 'kernel.runtime.v1',
        messageId: 'message-4',
        sequence: 4,
        timestamp: '2026-04-30T00:00:00.000Z',
        source: 'kernel_runtime',
        kind: 'event',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        payload: {
          type: 'headless.protocol_message',
          replayable: true,
          payload: protocolPayload,
        },
      }),
    ).toMatchObject({
      type: 'compat.protocol_message',
      message: protocolPayload,
      compatibilitySource: 'legacy_headless_protocol',
    })
  })
})
