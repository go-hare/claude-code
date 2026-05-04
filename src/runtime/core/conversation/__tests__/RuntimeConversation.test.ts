import { describe, expect, test } from 'bun:test'

import {
  RuntimeConversation,
  RuntimeConversationBusyError,
  RuntimeConversationDisposedError,
  RuntimeConversationScopeError,
} from '../RuntimeConversation.js'

function createClock(): () => string {
  let tick = 0
  return () => `2026-04-26T00:00:0${tick++}.000Z`
}

function createConversation(): RuntimeConversation {
  return new RuntimeConversation({
    runtimeId: 'runtime-1',
    conversationId: 'conversation-1',
    workspacePath: '/tmp/workspace',
    now: createClock(),
  })
}

describe('RuntimeConversation', () => {
  test('starts one active turn and rejects a different concurrent turn', () => {
    const conversation = createConversation()

    const firstTurn = conversation.startTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })

    expect(firstTurn.state).toBe('running')
    expect(conversation.snapshot()).toMatchObject({
      state: 'running',
      activeTurnId: 'turn-1',
    })

    expect(
      conversation.startTurn({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        prompt: 'hello again',
      }),
    ).toBe(firstTurn)

    expect(() =>
      conversation.startTurn({
        conversationId: 'conversation-1',
        turnId: 'turn-2',
        prompt: 'parallel',
      }),
    ).toThrow(RuntimeConversationBusyError)
  })

  test('releases the active turn lock after completion', () => {
    const conversation = createConversation()

    conversation.startTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    expect(conversation.completeActiveTurn('turn-1', 'end_turn')).toMatchObject(
      {
        state: 'completed',
        stopReason: 'end_turn',
      },
    )
    expect(conversation.snapshot()).toMatchObject({
      state: 'ready',
      activeTurnId: undefined,
    })

    expect(
      conversation.startTurn({
        conversationId: 'conversation-1',
        turnId: 'turn-2',
        prompt: 'next',
      }).state,
    ).toBe('running')
  })

  test('stores canonical turn input contract on turn snapshots', () => {
    const conversation = createConversation()

    const turn = conversation.startTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
      executionMode: 'headless',
      contextAssembly: {
        modelVisible: [
          {
            type: 'turn.prompt',
            category: 'model_visible',
            source: 'user_input',
          },
        ],
        hostVisible: [],
        operatorDebug: [],
      },
      capabilityPlane: {
        runtimeSupports: ['tool:Read'],
        hostGrants: ['tool:Read'],
        modePermits: ['tool:Read'],
        toolRequires: ['tool:Read'],
      },
      metadata: { source: 'test' },
    })

    expect(turn.snapshot().input).toEqual({
      executionMode: 'headless',
      contextAssembly: {
        modelVisible: [
          {
            type: 'turn.prompt',
            category: 'model_visible',
            source: 'user_input',
          },
        ],
        hostVisible: [],
        operatorDebug: [],
      },
      capabilityPlane: {
        runtimeSupports: ['tool:Read'],
        hostGrants: ['tool:Read'],
        modePermits: ['tool:Read'],
        toolRequires: ['tool:Read'],
      },
      metadata: { source: 'test' },
    })
  })

  test('keeps abort-before-start and abort-after-complete stable', () => {
    const conversation = createConversation()

    expect(
      conversation.abortTurn({
        conversationId: 'conversation-1',
        turnId: 'turn-0',
        reason: 'early_abort',
      }),
    ).toMatchObject({
      state: 'idle',
      stopReason: 'not_started',
    })

    conversation.startTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    const completed = conversation.completeActiveTurn('turn-1', 'end_turn')

    expect(
      conversation.abortTurn({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        reason: 'late_abort',
      }),
    ).toEqual(completed)
  })

  test('marks active turn and conversation as aborting idempotently', () => {
    const conversation = createConversation()

    conversation.startTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })

    const firstAbort = conversation.abortTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'user_interrupt',
    })
    const duplicateAbort = conversation.abortTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'different_reason',
    })

    expect(firstAbort).toMatchObject({
      state: 'aborting',
      stopReason: 'user_interrupt',
    })
    expect(duplicateAbort).toEqual(firstAbort)
    expect(conversation.snapshot()).toMatchObject({
      state: 'aborting',
      activeTurnId: 'turn-1',
    })
  })

  test('rejects requests outside the conversation scope and after disposal', async () => {
    const conversation = createConversation()

    expect(() =>
      conversation.startTurn({
        conversationId: 'other-conversation',
        turnId: 'turn-1',
        prompt: 'wrong scope',
      }),
    ).toThrow(RuntimeConversationScopeError)

    await conversation.dispose()

    expect(() =>
      conversation.startTurn({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        prompt: 'after dispose',
      }),
    ).toThrow(RuntimeConversationDisposedError)
  })

  test('hydrates recovered snapshots and preserves the active turn lock', () => {
    const conversation = new RuntimeConversation({
      runtimeId: 'runtime-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
      now: createClock(),
      initialSnapshot: {
        runtimeId: 'runtime-1',
        conversationId: 'conversation-1',
        workspacePath: '/tmp/workspace',
        state: 'detached',
        activeTurnId: 'turn-1',
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:01.000Z',
      },
      initialActiveTurnSnapshot: {
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        state: 'running',
        startedAt: '2026-04-26T00:00:00.500Z',
      },
    })

    expect(conversation.snapshot()).toMatchObject({
      state: 'detached',
      activeTurnId: 'turn-1',
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:00:01.000Z',
    })
    expect(() =>
      conversation.startTurn({
        conversationId: 'conversation-1',
        turnId: 'turn-2',
        prompt: 'parallel',
      }),
    ).toThrow(RuntimeConversationBusyError)

    expect(
      conversation.abortTurn({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        reason: 'after_recovery',
      }),
    ).toMatchObject({
      state: 'aborting',
      stopReason: 'after_recovery',
    })
  })
})
