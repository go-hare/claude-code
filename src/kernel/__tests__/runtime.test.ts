import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import type {
  KernelCapabilityDescriptor,
  KernelCapabilityReloadScope,
} from '../../runtime/contracts/capability.js'
import type { RuntimeCommandGraphEntry } from '../../runtime/contracts/command.js'
import type { KernelRuntimeEnvelopeBase } from '../../runtime/contracts/events.js'
import type { RuntimeToolDescriptor } from '../../runtime/contracts/tool.js'
import * as kernel from '../index.js'
import { createKernelRuntime, KernelRuntimeRequestError } from '../runtime.js'
import {
  createDefaultKernelRuntimeAgentRegistry,
  type KernelRuntimeAgentRegistryOptions,
} from '../runtimeAgentTaskRegistries.js'
import * as runtimeEvents from '../runtimeEvents.js'
import type { KernelRuntimeWireTurnExecutor } from '../wireProtocol.js'

const repoRoot = join(import.meta.dir, '../../..')

describe('createKernelRuntime', () => {
  test('classifies typed turn events without accepting unknown envelopes', () => {
    const outputEnvelope = createEventEnvelope({
      messageId: 'message-output',
      payload: {
        type: 'turn.output_delta',
        replayable: true,
        payload: { text: 'hello' },
      },
    })
    const completedEnvelope = createEventEnvelope({
      messageId: 'message-completed',
      payload: {
        type: 'turn.completed',
        replayable: true,
        payload: {
          conversationId: 'conversation-test',
          turnId: 'turn-test',
          state: 'completed',
        },
      },
    })
    const permissionRequestedEnvelope = createEventEnvelope({
      messageId: 'message-permission-requested',
      conversationId: 'conversation-test',
      turnId: 'turn-test',
      payload: {
        type: 'permission.requested',
        replayable: true,
        payload: {
          permissionRequestId: 'permission-1',
          conversationId: 'conversation-test',
          turnId: 'turn-test',
          toolName: 'Bash',
          action: 'tool.call',
          argumentsPreview: { command: 'pwd' },
          risk: 'medium',
          policySnapshot: { mode: 'default' },
        },
      },
    })
    const permissionResolvedEnvelope = createEventEnvelope({
      messageId: 'message-permission-resolved',
      conversationId: 'conversation-test',
      turnId: 'turn-test',
      payload: {
        type: 'permission.resolved',
        replayable: true,
        payload: {
          permissionRequestId: 'permission-1',
          conversationId: 'conversation-test',
          turnId: 'turn-test',
          toolName: 'Bash',
          action: 'tool.call',
          argumentsPreview: { command: 'pwd' },
          risk: 'medium',
          policySnapshot: { mode: 'default' },
          decision: 'allow_once',
          decidedBy: 'host',
          reason: 'approved',
        },
      },
    })
    const hooksReloadedEnvelope = createEventEnvelope({
      messageId: 'message-hooks-reloaded',
      payload: {
        type: 'hooks.reloaded',
        replayable: true,
        payload: {
          hooks: [
            {
              event: 'PreToolUse',
              type: 'command',
              source: 'projectSettings',
            },
          ],
        },
      },
    })
    const hooksRanEnvelope = createEventEnvelope({
      messageId: 'message-hooks-ran',
      payload: {
        type: 'hooks.ran',
        replayable: true,
        payload: {
          event: 'PreToolUse',
          handled: true,
          outputs: [{ matcher: 'Bash' }],
        },
      },
    })
    const hooksRegisteredEnvelope = createEventEnvelope({
      messageId: 'message-hooks-registered',
      payload: {
        type: 'hooks.registered',
        replayable: true,
        payload: {
          hook: {
            event: 'SessionEnd',
            type: 'callback',
            source: 'sessionHook',
          },
          registered: true,
          handlerRef: 'session-end',
        },
      },
    })
    const unknownEnvelope = createEventEnvelope({
      messageId: 'message-unknown',
      payload: {
        type: 'unknown.event',
        replayable: true,
      },
    })
    const ackEnvelope = createEventEnvelope({
      messageId: 'message-ack',
      kind: 'ack',
      payload: {
        type: 'turn.completed',
        replayable: true,
      },
    })

    expect(runtimeEvents.getKernelRuntimeEventType(outputEnvelope)).toBe(
      'turn.output_delta',
    )
    expect(runtimeEvents.getKernelRuntimeEventType(completedEnvelope)).toBe(
      'turn.completed',
    )
    expect(runtimeEvents.getKernelRuntimeEventCategory(outputEnvelope)).toBe(
      'turn',
    )
    expect(
      runtimeEvents.isKnownKernelRuntimeEventType('turn.output_delta'),
    ).toBe(true)
    expect(
      runtimeEvents.isKnownKernelRuntimeEventType('headless.protocol_message'),
    ).toBe(false)
    expect(
      runtimeEvents.getKernelRuntimeEventCategory('headless.protocol_message'),
    ).toBe('compatibility')
    expect(
      runtimeEvents.isKernelRuntimeEventOfType(
        outputEnvelope,
        'turn.output_delta',
      ),
    ).toBe(true)
    expect(
      runtimeEvents.isKernelRuntimeEventOfType(
        completedEnvelope,
        'turn.completed',
      ),
    ).toBe(true)
    expect(runtimeEvents.isKernelTurnTerminalEvent(completedEnvelope)).toBe(
      true,
    )
    expect(runtimeEvents.isKernelTurnTerminalEvent(outputEnvelope)).toBe(false)
    expect(runtimeEvents.getKernelTurnOutputText(outputEnvelope)).toBe('hello')
    expect(runtimeEvents.getKernelTurnTerminalSnapshot(completedEnvelope)).toEqual(
      {
        conversationId: 'conversation-test',
        turnId: 'turn-test',
        state: 'completed',
      },
    )
    expect(
      runtimeEvents.isKernelPermissionRequestedEvent(
        permissionRequestedEnvelope,
      ),
    ).toBe(true)
    expect(
      runtimeEvents.isKernelPermissionResolvedEvent(permissionResolvedEnvelope),
    ).toBe(true)
    expect(
      runtimeEvents.getKernelPermissionRequest(permissionRequestedEnvelope),
    ).toMatchObject({
      permissionRequestId: 'permission-1',
      toolName: 'Bash',
      argumentsPreview: { command: 'pwd' },
    })
    expect(
      runtimeEvents.getKernelPermissionDecision(permissionResolvedEnvelope),
    ).toMatchObject({
      permissionRequestId: 'permission-1',
      decision: 'allow_once',
      decidedBy: 'host',
      reason: 'approved',
    })
    expect(
      runtimeEvents.isKernelHooksReloadedEvent(hooksReloadedEnvelope),
    ).toBe(true)
    expect(runtimeEvents.isKernelHooksRanEvent(hooksRanEnvelope)).toBe(true)
    expect(
      runtimeEvents.isKernelHooksRegisteredEvent(hooksRegisteredEnvelope),
    ).toBe(true)
    expect(
      runtimeEvents.getKernelHookRegistrySnapshot(hooksReloadedEnvelope),
    ).toEqual({
      hooks: [
        {
          event: 'PreToolUse',
          type: 'command',
          source: 'projectSettings',
        },
      ],
    })
    expect(runtimeEvents.getKernelHookRunResult(hooksRanEnvelope)).toMatchObject(
      {
        event: 'PreToolUse',
        handled: true,
        outputs: [{ matcher: 'Bash' }],
      },
    )
    expect(
      runtimeEvents.getKernelHookMutationResult(hooksRegisteredEnvelope),
    ).toMatchObject({
      hook: {
        event: 'SessionEnd',
        type: 'callback',
        source: 'sessionHook',
      },
      registered: true,
      handlerRef: 'session-end',
    })

    expect(runtimeEvents.getKernelRuntimeEventType(unknownEnvelope)).toBe(
      'unknown.event',
    )
    expect(runtimeEvents.isKnownKernelRuntimeEventType('unknown.event')).toBe(
      false,
    )
    expect(
      runtimeEvents.isKernelRuntimeEventOfType(
        unknownEnvelope,
        'turn.completed',
      ),
    ).toBe(false)
    expect(runtimeEvents.getKernelRuntimeEventType(ackEnvelope)).toBeUndefined()
    expect(runtimeEvents.isKernelRuntimeEventEnvelope(ackEnvelope)).toBe(false)
  })

  test('passes runtime default providers through init and resolves them for turns', async () => {
    const seen: Array<{
      providerSelection?: { providerId: string; kind?: string; model?: string }
      conversationProvider?: { providerId: string; kind?: string; model?: string }
    }> = []
    const runtime = await createKernelRuntime({
      id: 'runtime-default-provider-test',
      workspacePath: '/tmp/kernel-runtime-default-provider-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      defaultProvider: {
        providerId: 'default-openai',
        kind: 'openai-compatible',
        model: 'default-model',
      },
      runTurnExecutor: async function* (context) {
        seen.push({
          providerSelection: context.providerSelection,
          conversationProvider: context.conversation.snapshot().provider,
        })
        yield { type: 'completed', stopReason: 'end_turn' }
      },
    })

    try {
      await runtime.start()
      const conversation = await runtime.createConversation()
      expect(conversation.snapshot().provider).toMatchObject({
        providerId: 'default-openai',
        kind: 'openai-compatible',
        model: 'default-model',
      })

      await conversation.runTurnAndWait('hello')

      expect(seen).toEqual([
        {
          providerSelection: {
            providerId: 'default-openai',
            kind: 'openai-compatible',
            model: 'default-model',
          },
          conversationProvider: {
            providerId: 'default-openai',
            kind: 'openai-compatible',
            model: 'default-model',
          },
        },
      ])
    } finally {
      await runtime.dispose()
    }
  })

  test('creates an in-process runtime conversation facade', async () => {
    const objectTurnGate = createDeferred<void>()
    const companionEventsBus = new Set<(event: unknown) => void>()
    const kairosEventsBus = new Set<(event: unknown) => void>()
    const companionState = {
      seed: 'runtime-test-seed',
      muted: false,
      hasStoredCompanion: false,
      profile: null,
      companion: null,
    }
    const kairosQueue: Array<{ type: string; payload?: unknown }> = []
    let kairosLastTickAt: string | undefined
    let kairosSuspendedReason: string | undefined
    let systemPromptInjection: string | null = null
    const executor: KernelRuntimeWireTurnExecutor = async function* (context) {
      if (context.command.turnId === 'turn-object') {
        await objectTurnGate.promise
      }
      if (context.command.turnId === 'turn-abort') {
        await new Promise<void>((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => reject(context.signal.reason ?? new Error('aborted')),
            { once: true },
          )
        })
      }
      yield {
        type: 'output',
        payload: {
          text: `echo:${context.command.prompt}`,
        },
      }
    }
    const runtime = await createKernelRuntime({
      id: 'runtime-test',
      workspacePath: '/tmp/kernel-runtime-test',
      runTurnExecutor: executor,
      eventJournalPath: false,
      conversationJournalPath: false,
      host: {
        id: 'host-test',
        kind: 'test',
        trustLevel: 'local',
        declaredCapabilities: ['test'],
      },
      companionRuntime: {
        async getState() {
          return companionState
        },
        async dispatch(action) {
          const event =
            action.type === 'pet'
              ? { type: 'petted', note: action.note, state: companionState }
              : { type: 'state_changed', action: action.type, state: companionState }
          for (const listener of companionEventsBus) {
            listener(event)
          }
          return companionState
        },
        async reactToTurn() {
          for (const listener of companionEventsBus) {
            listener({
              type: 'reaction_skipped',
              reason: 'invalid_messages',
              state: companionState,
            })
          }
        },
        onEvent(handler) {
          companionEventsBus.add(handler)
          return () => companionEventsBus.delete(handler)
        },
      },
      kairosRuntime: {
        async getStatus() {
          return {
            enabled: true,
            runtimeEnabled: true,
            proactive: {
              active: true,
              paused: false,
              contextBlocked: false,
              shouldTick: true,
              nextTickAt: null,
              activationSource: 'test',
            },
            suspended: kairosSuspendedReason !== undefined,
            pendingEvents: kairosQueue.length,
            lastTickAt: kairosLastTickAt,
            suspendedReason: kairosSuspendedReason,
          }
        },
        async enqueueEvent(event) {
          kairosQueue.push(event)
          const status = await this.getStatus()
          for (const listener of kairosEventsBus) {
            listener({ type: 'event_enqueued', event, status })
          }
        },
        async tick(request) {
          kairosLastTickAt = new Date().toISOString()
          const drainedEvents = request?.drain === false ? [] : kairosQueue.splice(0)
          const status = await this.getStatus()
          for (const listener of kairosEventsBus) {
            listener({ type: 'tick', request, drainedEvents, status })
          }
        },
        async suspend(reason) {
          kairosSuspendedReason = reason ?? 'manual'
          const status = await this.getStatus()
          for (const listener of kairosEventsBus) {
            listener({ type: 'suspended', reason, status })
          }
        },
        async resume(reason) {
          kairosSuspendedReason = undefined
          const status = await this.getStatus()
          for (const listener of kairosEventsBus) {
            listener({ type: 'resumed', reason, status })
          }
        },
        onEvent(handler) {
          kairosEventsBus.add(handler)
          return () => kairosEventsBus.delete(handler)
        },
      },
      memoryManager: {
        async listMemory() {
          return []
        },
        async readMemory(id) {
          return {
            id,
            path: id,
            source: 'project',
            bytes: 0,
            content: '',
          }
        },
        async updateMemory(request) {
          return {
            id: request.id,
            path: request.id,
            source: 'project',
            bytes: request.content.length,
            content: request.content,
          }
        },
      },
      contextManager: {
        async readContext() {
          return {
            system: {},
            user: {},
          }
        },
        async getGitStatus() {
          return null
        },
        async getSystemPromptInjection() {
          return systemPromptInjection
        },
        async setSystemPromptInjection(value) {
          systemPromptInjection = value
          return systemPromptInjection
        },
      },
      sessionManager: {
        async listSessions() {
          return []
        },
        async resumeSession() {
          return {
            sessionId: 'unused',
            messages: [],
            turnInterruptionState: 'none' as const,
          }
        },
        async getSessionTranscript() {
          return {
            sessionId: 'unused',
            messages: [],
            turnInterruptionState: 'none' as const,
          }
        },
      },
    })
    const events: string[] = []
    const unsubscribe = runtime.onEvent(envelope => {
      if (envelope.kind === 'event') {
        const payload = envelope.payload
        if (payload && typeof payload === 'object' && 'type' in payload) {
          events.push(String(payload.type))
        }
      }
    })

    try {
      await runtime.start()
      expect(runtime.state).toBe('ready')
      expect(runtime.host.id).toBe('host-test')
      expect(typeof runtime.companion.dispatch).toBe('function')
      expect(typeof runtime.kairos.getStatus).toBe('function')
      expect(typeof runtime.memory.list).toBe('function')
      expect(typeof runtime.context.read).toBe('function')
      expect(typeof runtime.sessions.list).toBe('function')
      await runtime.context.setSystemPromptInjection(null)
      const companionEvents: string[] = []
      const kairosEvents: string[] = []
      const unsubscribeCompanion = runtime.companion.onEvent(event => {
        companionEvents.push(event.type)
      })
      const unsubscribeKairos = runtime.kairos.onEvent(event => {
        kairosEvents.push(event.type)
      })
      await runtime.companion.dispatch({ type: 'pet', note: 'sdk-test' })
      await runtime.companion.reactToTurn({ messages: [] })
      await runtime.kairos.enqueueEvent({ type: 'sdk.test' })
      expect((await runtime.kairos.getStatus()).pendingEvents).toBe(1)
      await runtime.kairos.tick()
      expect((await runtime.kairos.getStatus()).pendingEvents).toBe(0)
      expect(await runtime.memory.list()).toEqual(expect.any(Array))
      expect(await runtime.context.read()).toEqual(
        expect.objectContaining({
          system: expect.any(Object),
          user: expect.any(Object),
        }),
      )
      expect(await runtime.context.getSystemPromptInjection()).toBeNull()
      expect(
        await runtime.context.setSystemPromptInjection('sdk-test'),
      ).toBe('sdk-test')
      expect(await runtime.context.getSystemPromptInjection()).toBe('sdk-test')
      await runtime.context.setSystemPromptInjection(null)
      expect(
        await runtime.sessions.list({
          cwd: '/tmp/kernel-runtime-test',
          includeWorktrees: false,
          limit: 1,
        }),
      ).toEqual(expect.any(Array))
      const resumeTranscriptPath = join(
        repoRoot,
        'tests/fixtures/session-resume.jsonl',
      )
      const resumedConversation =
        await runtime.sessions.resume(resumeTranscriptPath)
      expect(resumedConversation.sessionId).toBe(resumeTranscriptPath)
      expect(resumedConversation.workspacePath).toBe(
        join(repoRoot, 'tests/fixtures'),
      )
      const resumedTerminal = await resumedConversation.runTurnAndWait(
        'resumed hello',
        { turnId: 'turn-resumed' },
      )
      expect(resumedTerminal.state).toBe('completed')
      await resumedConversation.dispose()
      expect(companionEvents).toContain('reaction_skipped')
      expect(kairosEvents).toContain('tick')
      unsubscribeCompanion()
      unsubscribeKairos()

      const descriptors = await runtime.reloadCapabilities()
      expect(
        descriptors.some(descriptor => descriptor.name === 'runtime'),
      ).toBe(true)
      expect(runtime.capabilities.get('runtime')?.name).toBe('runtime')

      const conversation = await runtime.createConversation({
        id: 'conversation-test',
      })
      expect(conversation.id).toBe('conversation-test')
      expect(conversation.snapshot().state).toBe('ready')

      const turn = await conversation.runTurn('hello', { turnId: 'turn-test' })
      expect(turn).toMatchObject({
        conversationId: 'conversation-test',
        turnId: 'turn-test',
        state: 'running',
      })
      const terminal = await conversation.waitForTurn('turn-test')
      expect(terminal).toMatchObject({
        conversationId: 'conversation-test',
        turnId: 'turn-test',
        state: 'completed',
        stopReason: 'end_turn',
      })
      expect(conversation.snapshot().state).toBe('ready')

      await waitFor(() => events.includes('turn.output_delta'))
      const replayed = await conversation.replayEvents()
      expect(collectTypedEventTypes(replayed)).toContain('turn.output_delta')
      expect(
        replayed.some(envelope => {
          const payload = envelope.payload
          return (
            payload &&
            typeof payload === 'object' &&
            'type' in payload &&
            payload.type === 'turn.output_delta'
          )
        }),
      ).toBe(true)

      const secondTerminal = await conversation.runTurnAndWait('again', {
        turnId: 'turn-second',
      })
      expect(secondTerminal).toMatchObject({
        conversationId: 'conversation-test',
        turnId: 'turn-second',
        state: 'completed',
        stopReason: 'end_turn',
      })

      const objectTurn = await conversation.startTurn('object', {
        turnId: 'turn-object',
      })
      expect(objectTurn.id).toBe('turn-object')
      expect(objectTurn.conversationId).toBe('conversation-test')
      expect(objectTurn.snapshot().state).toBe('running')
      const objectTurnEvents: string[] = []
      const unsubscribeTurn = objectTurn.onEvent(envelope => {
        objectTurnEvents.push(envelope.payload.type)
      })
      objectTurnGate.resolve()
      const objectTerminal = await objectTurn.wait()
      unsubscribeTurn()
      expect(objectTerminal).toMatchObject({
        conversationId: 'conversation-test',
        turnId: 'turn-object',
        state: 'completed',
      })
      expect(objectTurn.snapshot().state).toBe('completed')
      expect(objectTurnEvents).toContain('turn.output_delta')
      const objectReplay = await objectTurn.replayEvents()
      expect(collectTypedEventTypes(objectReplay)).toContain('turn.completed')
      expect(
        objectReplay.some(
          envelope => envelope.payload.type === 'turn.completed',
        ),
      ).toBe(true)

      const abortTurn = await conversation.startTurn('abort', {
        turnId: 'turn-abort',
      })
      const aborting = await abortTurn.abort({ reason: 'sdk_abort' })
      expect(aborting).toMatchObject({
        conversationId: 'conversation-test',
        turnId: 'turn-abort',
        state: 'aborting',
        stopReason: 'sdk_abort',
      })
      const aborted = await abortTurn.wait()
      expect(aborted).toMatchObject({
        conversationId: 'conversation-test',
        turnId: 'turn-abort',
        state: 'completed',
        stopReason: 'sdk_abort',
      })
      expect(conversation.snapshot().state).toBe('ready')

      await conversation.dispose()
      expect(conversation.snapshot().state).toBe('disposed')
    } finally {
      unsubscribe()
      await runtime.dispose()
    }
  })

  test('surfaces typed permission events, replay, and richer transcript state', async () => {
    const transcript = {
      sessionId: 'session-1',
      fullPath: '/tmp/kernel-runtime-permission/session-1.jsonl',
      messages: [{ type: 'summary', text: 'resume fixture' }],
      turnInterruptionState: 'none' as const,
      taskSnapshot: { id: 'task-1' },
      todoSnapshot: { todos: ['a'] },
      nestedMemorySnapshot: { docs: ['CLAUDE.md'] },
      attributionSnapshots: [{ id: 'attr-1' }],
      fileHistorySnapshots: [{ path: 'foo.ts' }],
      contentReplacements: [{ id: 'replacement-1' }],
      contextCollapseCommits: [{ sha: 'abc123' }],
      contextCollapseSnapshot: { id: 'collapse-1' },
    }
    const runtime = await createKernelRuntime({
      id: 'runtime-permission-events-test',
      workspacePath: '/tmp/kernel-runtime-permission',
      eventJournalPath: false,
      conversationJournalPath: false,
      sessionManager: {
        listSessions: async () => [],
        resumeSession: async () => transcript,
        getSessionTranscript: async () => transcript,
      },
      runTurnExecutor: async function* (context) {
        const decision = await context.permissionBroker!.requestPermission({
          permissionRequestId: 'permission-1',
          conversationId: context.command.conversationId,
          turnId: context.command.turnId,
          toolName: 'Bash',
          action: 'tool.call',
          argumentsPreview: { command: 'pwd' },
          risk: 'medium',
          policySnapshot: { mode: 'default' },
        })
        yield {
          type: 'output',
          payload: { text: `decision:${decision.decision}` },
        }
        yield { type: 'completed', stopReason: 'end_turn' }
      },
    })

    const permissionEvents: runtimeEvents.KernelRuntimePermissionEvent[] = []
    const unsubscribe = runtime.permissions.onEvent(event => {
      permissionEvents.push(event)
    })

    try {
      await runtime.start()
      const transcriptResult = await runtime.sessions.getTranscript('session-1')
      expect(transcriptResult).toMatchObject({
        taskSnapshot: { id: 'task-1' },
        todoSnapshot: { todos: ['a'] },
        nestedMemorySnapshot: { docs: ['CLAUDE.md'] },
        attributionSnapshots: [{ id: 'attr-1' }],
        fileHistorySnapshots: [{ path: 'foo.ts' }],
        contentReplacements: [{ id: 'replacement-1' }],
        contextCollapseCommits: [{ sha: 'abc123' }],
        contextCollapseSnapshot: { id: 'collapse-1' },
      })

      const conversation = await runtime.createConversation()
      const turn = await conversation.startTurn('hello')

      await waitFor(() =>
        permissionEvents.some(event =>
          runtimeEvents.isKernelPermissionRequestedEvent(event),
        ),
      )

      const request = runtimeEvents.getKernelPermissionRequest(
        permissionEvents[0]!,
      )
      expect(request).toMatchObject({
        permissionRequestId: 'permission-1',
        conversationId: conversation.id,
        turnId: turn.id,
        argumentsPreview: { command: 'pwd' },
      })

      await runtime.decidePermission({
        permissionRequestId: 'permission-1',
        decision: 'allow_once',
        decidedBy: 'host',
        reason: 'approved',
      })

      const terminal = await turn.wait()
      expect(terminal.state).toBe('completed')

      await waitFor(() =>
        permissionEvents.some(event =>
          runtimeEvents.isKernelPermissionResolvedEvent(event),
        ),
      )

      expect(
        runtimeEvents.getKernelPermissionDecision(permissionEvents[1]!),
      ).toMatchObject({
        permissionRequestId: 'permission-1',
        decision: 'allow_once',
        decidedBy: 'host',
        reason: 'approved',
      })

      const replayedPermissions = await runtime.permissions.replay({
        conversationId: conversation.id,
        turnId: turn.id,
      })
      expect(replayedPermissions.map(event => event.payload.type)).toEqual([
        'permission.requested',
        'permission.resolved',
      ])

      const replayed = await conversation.replayEvents()
      const outputEnvelope = replayed.find(envelope =>
        runtimeEvents.isKernelRuntimeEventOfType(envelope, 'turn.output_delta'),
      )
      const terminalEnvelope = replayed.find(envelope =>
        runtimeEvents.isKernelTurnTerminalEvent(envelope),
      )
      expect(runtimeEvents.getKernelTurnOutputText(outputEnvelope!)).toBe(
        'decision:allow_once',
      )
      expect(
        runtimeEvents.getKernelTurnTerminalSnapshot(terminalEnvelope!),
      ).toMatchObject({
        conversationId: conversation.id,
        turnId: turn.id,
        state: 'completed',
      })
    } finally {
      unsubscribe()
      await runtime.dispose()
    }
  })

  test('surfaces typed hook events, replay, and payload helpers', async () => {
    const hookDescriptors = [
      {
        event: 'PreToolUse',
        type: 'command',
        source: 'projectSettings',
        matcher: 'Bash',
      },
    ] as const
    const runtime = await createKernelRuntime({
      id: 'runtime-hook-events-test',
      workspacePath: '/tmp/kernel-runtime-hooks',
      eventJournalPath: false,
      conversationJournalPath: false,
      capabilityResolver: {
        listDescriptors: () => [createCapabilityDescriptor('hooks', 'ready')],
        requireCapability: async () => {},
        reloadCapabilities: async () => [],
      },
      hookCatalog: {
        listHooks: async () => hookDescriptors,
        reload: async () => ({ hooks: hookDescriptors }),
        runHook: async request => ({
          event: request.event,
          handled: true,
          outputs: [{ input: request.input, matcher: request.matcher }],
          metadata: request.metadata,
        }),
        registerHook: async request => ({
          hook: request.hook,
          registered: true,
          handlerRef: request.handlerRef,
          metadata: request.metadata,
        }),
      },
    })

    const hookEvents: runtimeEvents.KernelRuntimeHookEvent[] = []
    const unsubscribe = runtime.hooks.onEvent(event => {
      hookEvents.push(event)
    })

    try {
      await runtime.start()

      expect(await runtime.hooks.reload()).toEqual(hookDescriptors)
      expect(
        await runtime.hooks.run('PreToolUse', { tool: 'Bash' }, {
          matcher: 'Bash',
          metadata: { source: 'sdk' },
        }),
      ).toMatchObject({
        event: 'PreToolUse',
        handled: true,
        metadata: { source: 'sdk' },
      })
      expect(
        await runtime.hooks.register(
          {
            event: 'SessionEnd',
            type: 'callback',
            source: 'sessionHook',
          },
          { handlerRef: 'session-end', metadata: { source: 'sdk' } },
        ),
      ).toMatchObject({
        hook: {
          event: 'SessionEnd',
          type: 'callback',
          source: 'sessionHook',
        },
        registered: true,
        handlerRef: 'session-end',
      })

      await waitFor(() => hookEvents.length >= 3)

      expect(hookEvents.map(event => event.payload.type)).toEqual([
        'hooks.reloaded',
        'hooks.ran',
        'hooks.registered',
      ])
      expect(
        runtimeEvents.getKernelHookRegistrySnapshot(hookEvents[0]!),
      ).toEqual({
        hooks: hookDescriptors,
      })
      expect(runtimeEvents.getKernelHookRunResult(hookEvents[1]!)).toMatchObject(
        {
          event: 'PreToolUse',
          handled: true,
          outputs: [{ input: { tool: 'Bash' }, matcher: 'Bash' }],
          metadata: { source: 'sdk' },
        },
      )
      expect(
        runtimeEvents.getKernelHookMutationResult(hookEvents[2]!),
      ).toMatchObject({
        hook: {
          event: 'SessionEnd',
          type: 'callback',
          source: 'sessionHook',
        },
        registered: true,
        handlerRef: 'session-end',
        metadata: { source: 'sdk' },
      })

      const replayedHooks = await runtime.hooks.replay()
      expect(replayedHooks.map(event => event.payload.type)).toEqual([
        'hooks.reloaded',
        'hooks.ran',
        'hooks.registered',
      ])
    } finally {
      unsubscribe()
      await runtime.dispose()
    }
  })

  test('publishes host events through the public runtime facade', async () => {
    const runtime = await createKernelRuntime({
      id: 'runtime-host-event-test',
      workspacePath: '/tmp/kernel-runtime-host-event-test',
      eventJournalPath: false,
      conversationJournalPath: false,
    })

    const events: KernelRuntimeEnvelopeBase[] = []
    const unsubscribe = runtime.onEvent(event => {
      events.push(event)
    })

    try {
      await runtime.start()

      const published = await runtime.publishHostEvent(
        {
          type: 'host.focus_changed',
          replayable: true,
          payload: { focused: false },
          metadata: { source: 'sdk' },
        },
        {
          requestId: 'publish-host-event-request',
          metadata: { caller: 'runtime-test' },
        },
      )

      expect(published).toMatchObject({
        published: true,
        eventId: expect.any(String),
      })

      await waitFor(() =>
        events.some(event =>
          runtimeEvents.isKernelRuntimeEventOfType(
            event,
            'host.focus_changed',
          ),
        ),
      )

      const typedEvents = kernel.collectKernelRuntimeEventEnvelopes(events)
      expect(typedEvents.map(event => event.payload.type)).toContain(
        'host.focus_changed',
      )
      expect(
        typedEvents.find(event => event.payload.type === 'host.focus_changed'),
      ).toMatchObject({
        metadata: {
          caller: 'runtime-test',
        },
        payload: {
          metadata: {
            source: 'sdk',
            publishedBy: 'host',
            requestId: 'publish-host-event-request',
          },
          payload: { focused: false },
        },
      })

      const replayed = await runtime.replayEvents()
      expect(collectTypedEventTypes(replayed)).toContain('host.focus_changed')
    } finally {
      unsubscribe()
      await runtime.dispose()
    }
  })

  test('runs default command and tool executors through the public facade', async () => {
    const workspace = await mkdtemp(
      join(tmpdir(), 'kernel-runtime-default-executors-'),
    )
    const fixturePath = join(workspace, 'fixture.txt')
    await Bun.write(fixturePath, 'hello from default kernel tool executor')
    let runtime: Awaited<ReturnType<typeof createKernelRuntime>> | undefined

    try {
      runtime = await createKernelRuntime({
        id: 'runtime-default-executors-test',
        workspacePath: workspace,
        eventJournalPath: false,
        conversationJournalPath: false,
        headlessExecutor: false,
        agentExecutor: false,
      })
      await runtime.start()

      const commandResult = await runtime.commands.execute('provider')
      expect(commandResult.name).toBe('provider')
      expect(commandResult.kind).toBe('local')
      expect(commandResult.result.type).toBe('text')
      expect(JSON.stringify(commandResult.result)).toContain(
        'Current API provider',
      )

      const toolResult = await runtime.tools.call('Read', {
        file_path: fixturePath,
      }, {
        permissionMode: 'bypassPermissions',
      })
      expect(toolResult.toolName).toBe('Read')
      expect(toolResult.isError).not.toBe(true)
      expect(JSON.stringify(toolResult.output)).toContain(
        'hello from default kernel tool executor',
      )
    } finally {
      await runtime?.dispose()
      await rm(workspace, { recursive: true, force: true })
    }
  })

  test('exposes kernel-friendly capability list, group, filter, and reload APIs', async () => {
    const reloadScopes: KernelCapabilityReloadScope[] = []
    let descriptors = [
      createCapabilityDescriptor('runtime', 'ready', [], false),
      createCapabilityDescriptor('events', 'ready', [], false),
      createCapabilityDescriptor('tools', 'declared', ['runtime']),
      createCapabilityDescriptor('commands', 'declared', ['tools']),
      createCapabilityDescriptor('kairos', 'disabled', ['events'], true, {
        optional: true,
      }),
    ]

    const runtime = await createKernelRuntime({
      id: 'runtime-capability-api-test',
      workspacePath: '/tmp/kernel-runtime-capability-api-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      capabilityResolver: {
        listDescriptors: () => descriptors,
        reloadCapabilities: async scope => {
          reloadScopes.push(scope)
          descriptors = descriptors.map<CapabilityDescriptorForTest>(
            descriptor =>
              scope.type === 'capability' && descriptor.name === scope.name
                ? { ...descriptor, status: 'ready' }
                : descriptor,
          )
          return descriptors
        },
      },
    })

    try {
      await runtime.start()
      const capabilities =
        runtime.capabilities as unknown as KernelRuntimeCapabilitiesForTest
      const filter = expectFunction<CapabilityFilterFunction>(
        capabilities.filter,
        'runtime.capabilities.filter',
      )
      const groupByFamily = expectFunction<CapabilityGroupByFamilyFunction>(
        capabilities.groupByFamily,
        'runtime.capabilities.groupByFamily',
      )
      const listByFamily = expectFunction<CapabilityListByFamilyFunction>(
        capabilities.listByFamily,
        'runtime.capabilities.listByFamily',
      )

      const reloaded = await capabilities.reload({
        type: 'capability',
        name: 'tools',
      })

      expect(reloadScopes).toEqual([{ type: 'capability', name: 'tools' }])
      expect(namesOf(reloaded)).toEqual([
        'commands',
        'events',
        'kairos',
        'runtime',
        'tools',
      ])
      expect(runtime.capabilities.get('tools')).toMatchObject({
        name: 'tools',
        status: 'ready',
      })
      expect(capabilities.getView('tools')).toMatchObject({
        name: 'tools',
        family: 'extension',
        ready: true,
        loaded: true,
      })

      expect(namesOf(filter({ status: 'ready' }))).toEqual([
        'events',
        'runtime',
        'tools',
      ])
      expect(namesOf(filter({ family: 'extension' }))).toEqual([
        'commands',
        'tools',
      ])
      expect(namesOf(filter({ family: 'autonomy', optional: true }))).toEqual([
        'kairos',
      ])

      expect(namesOf(groupByFamily().extension)).toEqual(['commands', 'tools'])
      expect(namesOf(listByFamily('autonomy'))).toEqual(['kairos'])
      expect(namesOf(capabilities.views())).toEqual(namesOf(descriptors))
    } finally {
      await runtime.dispose()
    }
  })

  test('exposes default descriptors for family and status based consumption', async () => {
    const runtime = await createKernelRuntime({
      id: 'runtime-default-capability-descriptor-test',
      workspacePath: '/tmp/kernel-runtime-default-capability-descriptor-test',
      eventJournalPath: false,
      conversationJournalPath: false,
    })

    try {
      await runtime.start()
      const capabilities =
        runtime.capabilities as unknown as KernelRuntimeCapabilitiesForTest
      const kernelRecord = kernel as unknown as CapabilityDescriptorHelpers
      const getFamily = expectFunction<GetCapabilityFamilyFunction>(
        kernelRecord.getKernelCapabilityFamily,
        'getKernelCapabilityFamily',
      )
      const filterDescriptors =
        expectFunction<FilterKernelCapabilitiesFunction>(
          kernelRecord.filterKernelCapabilities,
          'filterKernelCapabilities',
        )
      const groupDescriptors = expectFunction<GroupKernelCapabilitiesFunction>(
        kernelRecord.groupKernelCapabilities,
        'groupKernelCapabilities',
      )
      const toView = expectFunction<ToCapabilityViewFunction>(
        kernelRecord.toKernelCapabilityView,
        'toKernelCapabilityView',
      )
      const isUnavailable = expectFunction<IsCapabilityStateFunction>(
        kernelRecord.isKernelCapabilityUnavailable,
        'isKernelCapabilityUnavailable',
      )
      const isReady = expectFunction<IsCapabilityStateFunction>(
        kernelRecord.isKernelCapabilityReady,
        'isKernelCapabilityReady',
      )
      const families = kernelRecord.KERNEL_CAPABILITY_FAMILIES
      expect(families).toEqual(
        expect.arrayContaining([
          'core',
          'execution',
          'extension',
          'security',
          'autonomy',
        ]),
      )

      const descriptors = await capabilities.reload()
      const byName = new Map(
        descriptors.map(descriptor => [descriptor.name, descriptor]),
      )

      for (const [name, family] of [
        ['runtime', 'core'],
        ['commands', 'extension'],
        ['tools', 'extension'],
        ['permissions', 'security'],
        ['mcp', 'extension'],
        ['companion', 'autonomy'],
        ['memory', 'execution'],
        ['sessions', 'execution'],
      ] as const) {
        const descriptor = byName.get(name)
        expect(descriptor).toBeDefined()
        const view = toView(descriptor!)
        expect(view).toMatchObject({ name, family })
        expect(getFamily(descriptor!)).toBe(family)
        expect(typeof descriptor!.status).toBe('string')
        expect(typeof view.ready).toBe('boolean')
        expect(typeof view.unavailable).toBe('boolean')
      }

      expect(
        namesOf(filterDescriptors(descriptors, { family: 'extension' })),
      ).toEqual(
        expect.arrayContaining([
          'agents',
          'commands',
          'hooks',
          'mcp',
          'plugins',
          'skills',
          'tasks',
          'tools',
        ]),
      )
      expect(
        namesOf(filterDescriptors(descriptors, { family: 'autonomy' })),
      ).toEqual(expect.arrayContaining(['companion', 'kairos']))

      const runtimeDescriptor = byName.get('runtime')!
      const byFamily = groupDescriptors(descriptors)
      expect(namesOf(byFamily.core)).toContain('runtime')
      expect(namesOf(byFamily.extension)).toContain('tools')
      expect(
        namesOf(
          filterDescriptors(descriptors, {
            family: 'core',
            status: runtimeDescriptor.status,
          }),
        ),
      ).toContain('runtime')
      expect(isReady(runtimeDescriptor)).toBe(
        runtimeDescriptor.status === 'ready',
      )
      expect(isUnavailable(runtimeDescriptor)).toBe(false)
      expect(namesOf(capabilities.groupByFamily().extension)).toContain('tools')
    } finally {
      await runtime.dispose()
    }
  })

  test('exposes command, tool, MCP, extension, agent, and task catalogs through the kernel facade', async () => {
    const requiredCapabilities: string[] = []
    let mcpReloads = 0
    let hookReloads = 0
    let skillReloads = 0
    let pluginReloads = 0
    let agentReloads = 0
    const commandEntries: RuntimeCommandGraphEntry[] = [
      {
        descriptor: {
          name: 'status',
          description: 'Show runtime status',
          kind: 'local',
          aliases: ['stat'],
        },
        source: 'builtin',
        loadedFrom: 'builtin',
        supportsNonInteractive: true,
        modelInvocable: false,
      },
      {
        descriptor: {
          name: 'review',
          description: 'Build a review prompt',
          kind: 'prompt',
          terminalOnly: false,
        },
        source: 'project',
        loadedFrom: 'commands_DEPRECATED',
        supportsNonInteractive: true,
        modelInvocable: true,
      },
    ]
    const toolDescriptors: RuntimeToolDescriptor[] = [
      {
        name: 'Read',
        description: 'Read files',
        source: 'builtin',
        aliases: ['View'],
        safety: 'read',
        isConcurrencySafe: true,
      },
      {
        name: 'Bash',
        description: 'Run shell commands',
        source: 'builtin',
        safety: 'write',
        isConcurrencySafe: false,
      },
    ]
    const mcpServers = [
      {
        name: 'github',
        transport: 'stdio',
        state: 'connected',
        scope: 'project',
      },
      {
        name: 'linear',
        transport: 'http',
        state: 'pending',
        scope: 'user',
      },
    ] as const
    const mcpToolBindings = [
      {
        server: 'github',
        serverToolName: 'list_issues',
        runtimeToolName: 'mcp__github__list_issues',
      },
      {
        server: 'linear',
        serverToolName: 'list_tasks',
        runtimeToolName: 'mcp__linear__list_tasks',
      },
    ]
    const mcpResources = [
      {
        server: 'github',
        uri: 'repo://hare-code',
        name: 'hare-code',
      },
    ]
    const hookDescriptors = [
      {
        event: 'PreToolUse',
        type: 'command',
        source: 'projectSettings',
        matcher: 'Bash',
        displayName: 'echo pre',
      },
      {
        event: 'SessionEnd',
        type: 'command',
        source: 'pluginHook',
        pluginName: 'audit-plugin',
      },
    ] as const
    const skillDescriptors = [
      {
        name: 'review',
        description: 'Review code',
        source: 'projectSettings',
        loadedFrom: 'skills',
        modelInvocable: true,
        context: 'inline',
      },
      {
        name: 'plugin:plan',
        description: 'Plan from plugin',
        source: 'plugin',
        loadedFrom: 'plugin',
        modelInvocable: false,
        context: 'fork',
      },
    ] as const
    const pluginDescriptors = [
      {
        name: 'audit-plugin',
        source: 'audit@local',
        path: '/tmp/audit-plugin',
        repository: 'audit@local',
        status: 'enabled',
        enabled: true,
        components: {
          commands: true,
          agents: false,
          skills: true,
          hooks: true,
          mcp: false,
          lsp: false,
          outputStyles: false,
          settings: false,
        },
      },
    ] as const
    const agentSnapshot = {
      activeAgents: [
        {
          agentType: 'reviewer',
          whenToUse: 'Review code',
          source: 'projectSettings',
          active: true,
          tools: ['Read'],
          skills: ['review'],
        },
      ],
      allAgents: [
        {
          agentType: 'reviewer',
          whenToUse: 'Review code',
          source: 'projectSettings',
          active: true,
          tools: ['Read'],
          skills: ['review'],
        },
        {
          agentType: 'archived',
          whenToUse: 'Old agent',
          source: 'userSettings',
          active: false,
          background: true,
        },
      ],
      failedFiles: [
        {
          path: '/tmp/bad-agent.md',
          error: 'missing description',
        },
      ],
    } as const
    const taskSnapshot = {
      taskListId: 'team-a',
      tasks: [
        {
          id: '1',
          subject: 'Wire agents',
          description: 'Expose agents',
          status: 'in_progress',
          taskListId: 'team-a',
          owner: 'reviewer',
          blocks: [],
          blockedBy: [],
          ownedFiles: ['src/kernel/runtimeAgents.ts'],
          execution: {
            linkedBackgroundTaskId: 'a123',
            linkedAgentId: 'reviewer',
          },
        },
      ],
    } as const

    const runtime = await createKernelRuntime({
      id: 'runtime-command-tool-catalog-test',
      workspacePath: '/tmp/kernel-runtime-command-tool-catalog-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      capabilityResolver: {
        listDescriptors: () => [
          createCapabilityDescriptor('commands', 'ready'),
          createCapabilityDescriptor('tools', 'ready'),
          createCapabilityDescriptor('mcp', 'ready'),
          createCapabilityDescriptor('hooks', 'ready'),
          createCapabilityDescriptor('skills', 'ready'),
          createCapabilityDescriptor('plugins', 'ready'),
          createCapabilityDescriptor('agents', 'ready'),
          createCapabilityDescriptor('tasks', 'ready'),
        ],
        requireCapability: async name => {
          requiredCapabilities.push(name)
        },
        reloadCapabilities: async () => [],
      },
      commandCatalog: {
        listCommands: () => commandEntries,
        executeCommand: request => ({
          name: request.name,
          kind: 'local',
          result: {
            type: 'text',
            text: `executed:${request.name}:${request.args ?? ''}`,
          },
          metadata: request.metadata,
        }),
      },
      toolCatalog: {
        listTools: () => toolDescriptors,
        callTool: request => ({
          toolName: request.toolName,
          output: {
            input: request.input,
          },
          metadata: request.metadata,
        }),
      },
      mcpRegistry: {
        listServers: () => mcpServers,
        listToolBindings: () => mcpToolBindings,
        listResources: serverName =>
          serverName
            ? mcpResources.filter(resource => resource.server === serverName)
            : mcpResources,
        reload: () => {
          mcpReloads += 1
        },
        connectServer: request => ({
          serverName: request.serverName,
          state: 'connected',
          server: {
            name: request.serverName,
            transport: 'stdio',
            state: 'connected',
          },
          metadata: request.metadata,
        }),
        authenticateServer: request => ({
          serverName: request.serverName,
          state: request.action === 'clear' ? 'needs-auth' : 'connected',
          message: request.callbackUrl ?? request.action ?? 'authenticate',
          metadata: request.metadata,
        }),
        setServerEnabled: request => ({
          serverName: request.serverName,
          state: request.enabled ? 'pending' : 'disabled',
          server: {
            name: request.serverName,
            transport: 'http',
            state: request.enabled ? 'pending' : 'disabled',
          },
          metadata: request.metadata,
        }),
      },
      hookCatalog: {
        listHooks: () => hookDescriptors,
        reload: () => {
          hookReloads += 1
        },
        runHook: request => ({
          event: request.event,
          handled: true,
          outputs: [
            {
              matcher: request.matcher ?? null,
              input: request.input,
            },
          ],
          metadata: request.metadata,
        }),
        registerHook: request => ({
          hook: request.hook,
          registered: true,
          handlerRef: request.handlerRef,
          metadata: request.metadata,
        }),
      },
      skillCatalog: {
        listSkills: () => skillDescriptors,
        reload: () => {
          skillReloads += 1
        },
        resolvePromptContext: request => ({
          name: request.name,
          descriptor: skillDescriptors.find(
            skill => skill.name === request.name,
          ),
          context: 'inline',
          content: `skill:${request.name}:${request.args ?? ''}`,
          allowedTools: ['Read'],
          metadata: request.metadata,
        }),
      },
      pluginCatalog: {
        listPlugins: () => ({
          plugins: pluginDescriptors,
          errors: [
            {
              type: 'component-load-failed',
              source: 'audit@local',
              plugin: 'audit-plugin',
              message: 'missing command',
            },
          ],
        }),
        reload: () => {
          pluginReloads += 1
        },
        setPluginEnabled: request => ({
          name: request.name,
          action: 'set_enabled',
          success: true,
          enabled: request.enabled,
          status: request.enabled ? 'enabled' : 'disabled',
          plugin: {
            ...pluginDescriptors[0],
            enabled: request.enabled,
            status: request.enabled ? 'enabled' : 'disabled',
          },
          metadata: request.metadata,
        }),
        installPlugin: request => ({
          name: request.name,
          action: 'install',
          success: true,
          enabled: true,
          status: 'enabled',
          plugin: {
            ...pluginDescriptors[0],
            name: request.name,
            enabled: true,
            status: 'enabled',
          },
          metadata: request.metadata,
        }),
        uninstallPlugin: request => ({
          name: request.name,
          action: 'uninstall',
          success: true,
          enabled: false,
          status: 'disabled',
          metadata: request.metadata,
        }),
        updatePlugin: request => ({
          name: request.name,
          action: 'update',
          success: true,
          enabled: true,
          status: 'enabled',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
          metadata: request.metadata,
        }),
      },
      agentRegistry: {
        listAgents: () => agentSnapshot,
        reload: () => {
          agentReloads += 1
        },
      },
      taskRegistry: {
        listTasks: () => taskSnapshot,
        getTask: taskId =>
          taskSnapshot.tasks.find(task => task.id === taskId) ?? null,
      },
    })
    const commandEvents: runtimeEvents.KernelRuntimeCommandEvent[] = []
    const unsubscribeCommands = runtime.commands.onEvent(event => {
      commandEvents.push(event)
    })
    const toolEvents: runtimeEvents.KernelRuntimeToolEvent[] = []
    const unsubscribeTools = runtime.tools.onEvent(event => {
      toolEvents.push(event)
    })
    const mcpEvents: runtimeEvents.KernelRuntimeMcpEvent[] = []
    const unsubscribeMcp = runtime.mcp.onEvent(event => {
      mcpEvents.push(event)
    })
    const skillEvents: runtimeEvents.KernelRuntimeSkillEvent[] = []
    const unsubscribeSkills = runtime.skills.onEvent(event => {
      skillEvents.push(event)
    })
    const pluginEvents: runtimeEvents.KernelRuntimePluginEvent[] = []
    const unsubscribePlugins = runtime.plugins.onEvent(event => {
      pluginEvents.push(event)
    })

    try {
      await runtime.start()

      expect(
        commandNamesOf(await runtime.commands.list({ kind: 'local' })),
      ).toEqual(['status'])
      expect(await runtime.commands.get('stat')).toMatchObject({
        descriptor: { name: 'status' },
      })
      expect(
        await runtime.commands.execute('status', { args: 'brief' }),
      ).toEqual({
        name: 'status',
        kind: 'local',
        result: {
          type: 'text',
          text: 'executed:status:brief',
        },
      })
      await waitFor(() => commandEvents.length >= 1)
      expect(commandEvents.map(event => event.payload.type)).toEqual([
        'commands.executed',
      ])
      expect(
        runtimeEvents.getKernelCommandExecutionResult(commandEvents[0]!),
      ).toMatchObject({
        name: 'status',
        kind: 'local',
        result: {
          type: 'text',
          text: 'executed:status:brief',
        },
      })
      const replayedCommandEvents = await runtime.commands.replay()
      expect(replayedCommandEvents.map(event => event.payload.type)).toEqual([
        'commands.executed',
      ])
      expect(
        namesOf(await runtime.commands.descriptors({ modelInvocable: true })),
      ).toEqual(['review'])
      expect(namesOf(await runtime.tools.list({ safety: 'read' }))).toEqual([
        'Read',
      ])
      expect(await runtime.tools.get('View')).toMatchObject({
        name: 'Read',
        source: 'builtin',
      })
      expect(
        await runtime.tools.call('Read', { file_path: 'README.md' }),
      ).toEqual({
        toolName: 'Read',
        output: {
          input: { file_path: 'README.md' },
        },
      })
      await waitFor(() => toolEvents.length >= 1)
      expect(toolEvents.map(event => event.payload.type)).toEqual([
        'tools.called',
      ])
      expect(runtimeEvents.getKernelToolCallResult(toolEvents[0]!)).toMatchObject(
        {
          toolName: 'Read',
          output: {
            input: { file_path: 'README.md' },
          },
        },
      )
      const replayedToolEvents = await runtime.tools.replay()
      expect(replayedToolEvents.map(event => event.payload.type)).toEqual([
        'tools.called',
      ])
      expect(
        namesOf(await runtime.tools.list({ concurrencySafe: false })),
      ).toEqual(['Bash'])
      expect(namesOf(await runtime.mcp.status())).toEqual(['github', 'linear'])
      expect(await runtime.mcp.listTools('github')).toEqual([
        {
          server: 'github',
          serverToolName: 'list_issues',
          runtimeToolName: 'mcp__github__list_issues',
        },
      ])
      expect(await runtime.mcp.listResources('github')).toEqual([
        {
          server: 'github',
          uri: 'repo://hare-code',
          name: 'hare-code',
        },
      ])
      const reloadedMcp = await runtime.mcp.reload()
      expect(reloadedMcp.toolBindings).toEqual(mcpToolBindings)
      expect(mcpReloads).toBe(1)
      expect(await runtime.mcp.connect('github')).toMatchObject({
        serverName: 'github',
        state: 'connected',
        server: {
          name: 'github',
          state: 'connected',
        },
      })
      expect(
        await runtime.mcp.authenticate('github', {
          callbackUrl: 'https://callback.example/done',
          metadata: { flow: 'oauth' },
        }),
      ).toMatchObject({
        serverName: 'github',
        state: 'connected',
        message: 'https://callback.example/done',
        metadata: { flow: 'oauth' },
      })
      expect(await runtime.mcp.disable('linear')).toMatchObject({
        serverName: 'linear',
        state: 'disabled',
      })
      expect(await runtime.mcp.enable('linear')).toMatchObject({
        serverName: 'linear',
        state: 'pending',
      })
      expect(await runtime.mcp.clearAuth('github')).toMatchObject({
        serverName: 'github',
        state: 'needs-auth',
      })
      await waitFor(() => mcpEvents.length >= 6)
      expect(mcpEvents.map(event => event.payload.type)).toEqual([
        'mcp.reloaded',
        'mcp.connected',
        'mcp.authenticated',
        'mcp.enabled_changed',
        'mcp.enabled_changed',
        'mcp.authenticated',
      ])
      expect(runtimeEvents.getKernelMcpSnapshot(mcpEvents[0]!)).toMatchObject({
        toolBindings: mcpToolBindings,
      })
      expect(
        runtimeEvents.getKernelMcpLifecycleResult(mcpEvents[1]!),
      ).toMatchObject({
        serverName: 'github',
        state: 'connected',
      })
      expect(
        runtimeEvents.getKernelMcpLifecycleResult(mcpEvents[5]!),
      ).toMatchObject({
        serverName: 'github',
        state: 'needs-auth',
      })
      const replayedMcpEvents = await runtime.mcp.replay()
      expect(replayedMcpEvents.map(event => event.payload.type)).toEqual([
        'mcp.reloaded',
        'mcp.connected',
        'mcp.authenticated',
        'mcp.enabled_changed',
        'mcp.enabled_changed',
        'mcp.authenticated',
      ])
      expect(
        (await runtime.hooks.list({ source: 'pluginHook' })).map(
          hook => hook.pluginName,
        ),
      ).toEqual(['audit-plugin'])
      expect(await runtime.hooks.reload()).toEqual(hookDescriptors)
      expect(hookReloads).toBe(1)
      expect(
        await runtime.hooks.run(
          'PreToolUse',
          { tool: 'Bash' },
          {
            matcher: 'Bash',
            metadata: { source: 'sdk' },
          },
        ),
      ).toMatchObject({
        event: 'PreToolUse',
        handled: true,
        outputs: [
          {
            matcher: 'Bash',
            input: { tool: 'Bash' },
          },
        ],
        metadata: { source: 'sdk' },
      })
      expect(
        await runtime.hooks.register(
          {
            event: 'SessionEnd',
            type: 'command',
            source: 'sessionHook',
          },
          { handlerRef: 'session-end' },
        ),
      ).toMatchObject({
        hook: {
          event: 'SessionEnd',
          source: 'sessionHook',
        },
        registered: true,
        handlerRef: 'session-end',
      })
      expect(namesOf(await runtime.skills.list({ context: 'fork' }))).toEqual([
        'plugin:plan',
      ])
      expect(await runtime.skills.get('review')).toMatchObject({
        name: 'review',
        source: 'projectSettings',
      })
      expect(await runtime.skills.reload()).toEqual(skillDescriptors)
      expect(skillReloads).toBe(1)
      expect(
        await runtime.skills.resolveContext('review', {
          args: 'focus',
          metadata: { source: 'sdk' },
        }),
      ).toMatchObject({
        name: 'review',
        context: 'inline',
        content: 'skill:review:focus',
        allowedTools: ['Read'],
        metadata: { source: 'sdk' },
      })
      await waitFor(() => skillEvents.length >= 2)
      expect(skillEvents.map(event => event.payload.type)).toEqual([
        'skills.reloaded',
        'skills.context_resolved',
      ])
      expect(runtimeEvents.getKernelSkillSnapshot(skillEvents[0]!)).toMatchObject(
        {
          skills: skillDescriptors,
        },
      )
      expect(
        runtimeEvents.getKernelSkillPromptContextResult(skillEvents[1]!),
      ).toMatchObject({
        name: 'review',
        context: 'inline',
        content: 'skill:review:focus',
      })
      const replayedSkillEvents = await runtime.skills.replay()
      expect(replayedSkillEvents.map(event => event.payload.type)).toEqual([
        'skills.reloaded',
        'skills.context_resolved',
      ])
      expect(
        namesOf(await runtime.plugins.list({ hasComponent: 'hooks' })),
      ).toEqual(['audit-plugin'])
      const pluginStatus = await runtime.plugins.status()
      expect(pluginStatus.errors).toEqual([
        {
          type: 'component-load-failed',
          source: 'audit@local',
          plugin: 'audit-plugin',
          message: 'missing command',
        },
      ])
      expect((await runtime.plugins.reload()).plugins).toEqual(
        pluginDescriptors,
      )
      expect(pluginReloads).toBe(1)
      expect(await runtime.plugins.disable('audit-plugin')).toMatchObject({
        name: 'audit-plugin',
        enabled: false,
        status: 'disabled',
      })
      expect(await runtime.plugins.enable('audit-plugin')).toMatchObject({
        name: 'audit-plugin',
        enabled: true,
        status: 'enabled',
      })
      expect(
        await runtime.plugins.install('audit-plugin', { scope: 'project' }),
      ).toMatchObject({
        name: 'audit-plugin',
        action: 'install',
        success: true,
        enabled: true,
        status: 'enabled',
      })
      expect(
        await runtime.plugins.uninstall('audit-plugin', { keepData: true }),
      ).toMatchObject({
        name: 'audit-plugin',
        action: 'uninstall',
        success: true,
        enabled: false,
        status: 'disabled',
      })
      expect(
        await runtime.plugins.update('audit-plugin', { scope: 'project' }),
      ).toMatchObject({
        name: 'audit-plugin',
        action: 'update',
        success: true,
        enabled: true,
        status: 'enabled',
        oldVersion: '1.0.0',
        newVersion: '1.1.0',
      })
      await waitFor(() => pluginEvents.length >= 6)
      expect(pluginEvents.map(event => event.payload.type)).toEqual([
        'plugins.reloaded',
        'plugins.enabled_changed',
        'plugins.enabled_changed',
        'plugins.installed',
        'plugins.uninstalled',
        'plugins.updated',
      ])
      expect(
        runtimeEvents.getKernelPluginSnapshot(pluginEvents[0]!),
      ).toMatchObject({
        plugins: pluginDescriptors,
      })
      expect(
        runtimeEvents.getKernelPluginMutationResult(pluginEvents[5]!),
      ).toMatchObject({
        name: 'audit-plugin',
        action: 'update',
        oldVersion: '1.0.0',
        newVersion: '1.1.0',
      })
      const replayedPluginEvents = await runtime.plugins.replay()
      expect(replayedPluginEvents.map(event => event.payload.type)).toEqual([
        'plugins.reloaded',
        'plugins.enabled_changed',
        'plugins.enabled_changed',
        'plugins.installed',
        'plugins.uninstalled',
        'plugins.updated',
      ])
      expect(
        (await runtime.agents.list({ skill: 'review' })).map(
          agent => agent.agentType,
        ),
      ).toEqual(['reviewer'])
      expect(
        (await runtime.agents.all({ background: true })).map(
          agent => agent.agentType,
        ),
      ).toEqual(['archived'])
      expect(await runtime.agents.get('reviewer')).toMatchObject({
        agentType: 'reviewer',
        active: true,
      })
      expect(await runtime.agents.reload()).toMatchObject({
        failedFiles: [{ path: '/tmp/bad-agent.md' }],
      })
      expect(agentReloads).toBe(1)
      expect(
        (await runtime.tasks.list({ status: 'in_progress' })).map(
          task => task.id,
        ),
      ).toEqual(['1'])
      expect(await runtime.tasks.get('1')).toMatchObject({
        id: '1',
        owner: 'reviewer',
        execution: { linkedBackgroundTaskId: 'a123' },
      })
      expect(await runtime.tasks.snapshot()).toMatchObject({
        taskListId: 'team-a',
        tasks: [{ id: '1' }],
      })
      expect(requiredCapabilities).toEqual([
        'commands',
        'commands',
        'commands',
        'commands',
        'tools',
        'tools',
        'tools',
        'tools',
        'mcp',
        'mcp',
        'mcp',
        'mcp',
        'mcp',
        'mcp',
        'mcp',
        'mcp',
        'mcp',
        'hooks',
        'hooks',
        'hooks',
        'hooks',
        'skills',
        'skills',
        'skills',
        'skills',
        'plugins',
        'plugins',
        'plugins',
        'plugins',
        'plugins',
        'plugins',
        'plugins',
        'plugins',
        'agents',
        'agents',
        'agents',
        'agents',
        'tasks',
        'tasks',
        'tasks',
      ])
    } finally {
      unsubscribeCommands()
      unsubscribeTools()
      unsubscribeMcp()
      unsubscribeSkills()
      unsubscribePlugins()
      await runtime.dispose()
    }
  })

  test('exposes agent spawn and task mutation helpers through the kernel facade', async () => {
    const requiredCapabilities: string[] = []
    const events: string[] = []
    const runtime = await createKernelRuntime({
      id: 'runtime-agent-task-mutation-test',
      workspacePath: '/tmp/kernel-runtime-agent-task-mutation-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      capabilityResolver: {
        listDescriptors: () => [
          createCapabilityDescriptor('agents', 'ready'),
          createCapabilityDescriptor('tasks', 'ready'),
        ],
        requireCapability: async name => {
          requiredCapabilities.push(name)
        },
        reloadCapabilities: async () => [],
      },
      agentRegistry: {
        listAgents: () => ({
          activeAgents: [
            {
              agentType: 'reviewer',
              whenToUse: 'Review code',
              source: 'projectSettings',
              active: true,
            },
          ],
          allAgents: [],
        }),
        spawnAgent: request => ({
          status: 'async_launched',
          runId: 'agent-sdk-run-1',
          prompt: request.prompt,
          agentType: request.agentType,
          agentId: 'agent-sdk-1',
          taskId: request.taskId,
          taskListId: request.taskListId,
          outputFile: '/tmp/agent-sdk-1.log',
          isAsync: true,
          run: {
            runId: 'agent-sdk-run-1',
            status: 'running',
            prompt: request.prompt,
            createdAt: '2026-04-26T00:00:00.000Z',
            updatedAt: '2026-04-26T00:00:01.000Z',
            agentType: request.agentType,
            agentId: 'agent-sdk-1',
            taskId: request.taskId,
            taskListId: request.taskListId,
            outputFile: '/tmp/agent-sdk-1.log',
            outputAvailable: true,
            result: 'pending-result',
          },
        }),
        listAgentRuns: () => ({
          runs: [
            {
              runId: 'agent-sdk-run-1',
              status: 'running',
              prompt: 'Review the SDK mutation facade',
              createdAt: '2026-04-26T00:00:00.000Z',
              updatedAt: '2026-04-26T00:00:01.000Z',
              agentType: 'reviewer',
              agentId: 'agent-sdk-1',
              taskId: '1',
              taskListId: 'team-sdk',
              outputFile: '/tmp/agent-sdk-1.log',
              outputAvailable: true,
              result: 'pending-result',
            },
          ],
        }),
        getAgentRun: runId =>
          runId === 'agent-sdk-run-1'
            ? {
                runId,
                status: 'running',
                prompt: 'Review the SDK mutation facade',
                createdAt: '2026-04-26T00:00:00.000Z',
                updatedAt: '2026-04-26T00:00:01.000Z',
                agentType: 'reviewer',
                agentId: 'agent-sdk-1',
                taskId: '1',
                taskListId: 'team-sdk',
                result: 'pending-result',
              }
            : null,
        getAgentOutput: request => ({
          runId: request.runId,
          status: 'running',
          available: true,
          output: 'sdk output',
          outputFile: '/tmp/agent-sdk-1.log',
          truncated: false,
        }),
        cancelAgentRun: request => ({
          runId: request.runId,
          cancelled: true,
          status: 'cancelled',
          reason: request.reason,
          run: {
            runId: request.runId,
            status: 'cancelled',
            prompt: 'Review the SDK mutation facade',
            createdAt: '2026-04-26T00:00:00.000Z',
            updatedAt: '2026-04-26T00:00:02.000Z',
          },
        }),
      },
      taskRegistry: {
        listTasks: () => ({ taskListId: 'team-sdk', tasks: [] }),
        getTask: () => null,
        createTask: request => ({
          taskListId: request.taskListId ?? 'team-sdk',
          taskId: '1',
          created: true,
          updatedFields: ['subject', 'description'],
          task: {
            id: '1',
            subject: request.subject,
            description: request.description,
            status: request.status ?? 'pending',
            taskListId: request.taskListId ?? 'team-sdk',
            blocks: [],
            blockedBy: [],
          },
        }),
        updateTask: request => ({
          taskListId: request.taskListId ?? 'team-sdk',
          taskId: request.taskId,
          updatedFields: ['status'],
          task: {
            id: request.taskId,
            subject: 'SDK mutations',
            description: 'Update task from SDK',
            status: request.status ?? 'in_progress',
            taskListId: request.taskListId ?? 'team-sdk',
            blocks: [],
            blockedBy: [],
          },
        }),
        assignTask: request => ({
          taskListId: request.taskListId ?? 'team-sdk',
          taskId: request.taskId,
          assigned: true,
          updatedFields: ['owner'],
          task: {
            id: request.taskId,
            subject: 'SDK mutations',
            description: 'Assign task from SDK',
            status: request.status ?? 'in_progress',
            taskListId: request.taskListId ?? 'team-sdk',
            owner: request.owner,
            blocks: [],
            blockedBy: [],
          },
        }),
      },
    })
    const unsubscribe = runtime.onEvent(envelope => {
      const type = (envelope.payload as { type?: string } | undefined)?.type
      if (type) events.push(type)
    })
    const agentEvents: runtimeEvents.KernelRuntimeAgentEvent[] = []
    const unsubscribeAgents = runtime.agents.onEvent(event => {
      agentEvents.push(event)
    })
    const taskEvents: runtimeEvents.KernelRuntimeTaskEvent[] = []
    const unsubscribeTasks = runtime.tasks.onEvent(event => {
      taskEvents.push(event)
    })

    try {
      await runtime.start()
      expect(typeof runtime.agents.spawn).toBe('function')
      await runtime.agents
        .spawn({
          agentType: 'reviewer',
          prompt: 'Review the SDK mutation facade',
          taskId: '1',
          taskListId: 'team-sdk',
        })
        .then(result =>
          expect(result).toMatchObject({
            status: 'async_launched',
            runId: 'agent-sdk-run-1',
            agentId: 'agent-sdk-1',
            taskId: '1',
          }),
        )
      await runtime.agents.runs({ statuses: ['running'] }).then(runs =>
        expect(runs).toEqual([
          expect.objectContaining({
            runId: 'agent-sdk-run-1',
            status: 'running',
          }),
        ]),
      )
      await runtime.agents.status('agent-sdk-run-1').then(run =>
        expect(run).toMatchObject({
          runId: 'agent-sdk-run-1',
          agentId: 'agent-sdk-1',
        }),
      )
      await runtime.agents
        .output('agent-sdk-run-1', { tailBytes: 64 })
        .then(output =>
          expect(output).toMatchObject({
            runId: 'agent-sdk-run-1',
            available: true,
            output: 'sdk output',
          }),
        )
      await runtime.agents
        .result('agent-sdk-run-1')
        .then(result => expect(result).toBe('pending-result'))
      await runtime.agents
        .cancel('agent-sdk-run-1', { reason: 'sdk_cancel' })
        .then(result =>
          expect(result).toMatchObject({
            runId: 'agent-sdk-run-1',
            cancelled: true,
            status: 'cancelled',
          }),
        )
      expect(typeof runtime.tasks.create).toBe('function')
      await runtime.tasks
        .create({
          taskListId: 'team-sdk',
          subject: 'SDK mutations',
          description: 'Create task from SDK',
        })
        .then(result =>
          expect(result).toMatchObject({
            created: true,
            task: { id: '1', subject: 'SDK mutations' },
          }),
        )
      expect(typeof runtime.tasks.update).toBe('function')
      await runtime.tasks
        .update({
          taskListId: 'team-sdk',
          taskId: '1',
          status: 'in_progress',
        })
        .then(result =>
          expect(result).toMatchObject({
            task: { id: '1', status: 'in_progress' },
          }),
        )
      expect(typeof runtime.tasks.assign).toBe('function')
      await runtime.tasks
        .assign({
          taskListId: 'team-sdk',
          taskId: '1',
          owner: 'reviewer',
        })
        .then(result =>
          expect(result).toMatchObject({
            assigned: true,
            task: { id: '1', owner: 'reviewer' },
          }),
        )
      expect(events).toEqual(
        expect.arrayContaining([
          'agents.spawned',
          'agents.run.cancelled',
          'tasks.created',
          'tasks.updated',
          'tasks.assigned',
        ]),
      )
      expect(agentEvents.map(event => event.payload.type)).toEqual([
        'agents.spawned',
        'agents.run.cancelled',
      ])
      expect(
        runtimeEvents.getKernelAgentSpawnResult(agentEvents[0]!),
      ).toMatchObject({
        status: 'async_launched',
        runId: 'agent-sdk-run-1',
        agentId: 'agent-sdk-1',
      })
      expect(
        runtimeEvents.getKernelAgentRunCancelResult(agentEvents[1]!),
      ).toMatchObject({
        runId: 'agent-sdk-run-1',
        cancelled: true,
        status: 'cancelled',
      })
      expect(taskEvents.map(event => event.payload.type)).toEqual([
        'tasks.created',
        'tasks.updated',
        'tasks.assigned',
      ])
      expect(
        runtimeEvents.getKernelTaskMutationResult(taskEvents[0]!),
      ).toMatchObject({
        created: true,
        task: { id: '1', subject: 'SDK mutations' },
      })
      expect(
        runtimeEvents.getKernelTaskMutationResult(taskEvents[1]!),
      ).toMatchObject({
        task: { id: '1', status: 'in_progress' },
      })
      expect(
        runtimeEvents.getKernelTaskMutationResult(taskEvents[2]!),
      ).toMatchObject({
        assigned: true,
        task: { id: '1', owner: 'reviewer' },
      })
      const replayedAgentEvents = await runtime.agents.replay()
      expect(replayedAgentEvents.map(event => event.payload.type)).toEqual([
        'agents.spawned',
        'agents.run.cancelled',
      ])
      const replayedTaskEvents = await runtime.tasks.replay()
      expect(replayedTaskEvents.map(event => event.payload.type)).toEqual([
        'tasks.created',
        'tasks.updated',
        'tasks.assigned',
      ])
      expect(requiredCapabilities).toEqual([
        'agents',
        'agents',
        'agents',
        'agents',
        'agents',
        'agents',
        'tasks',
        'tasks',
        'tasks',
      ])
    } finally {
      unsubscribe()
      unsubscribeAgents()
      unsubscribeTasks()
      await runtime.dispose()
    }
  })

  test('runs default agent registry executions through the kernel run lifecycle', async () => {
    const agentRegistry = createDefaultKernelRuntimeAgentRegistry(
      '/tmp/kernel-runtime-agent-executor-test',
      {
        listAgents: () => createAgentSnapshotForTest('reviewer'),
        executor: async context => {
          context.output.append(`started:${context.agent.agentType}\n`)
          context.output.append(`prompt:${context.request.prompt}\n`)
          return {
            result: {
              ok: true,
              prompt: context.request.prompt,
            },
            agentId: 'executor-agent-1',
            backgroundTaskId: 'executor-bg-1',
            metadata: {
              executor: 'test',
            },
          }
        },
      },
    )
    const runtime = await createKernelRuntime({
      id: 'runtime-agent-executor-test',
      workspacePath: '/tmp/kernel-runtime-agent-executor-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      capabilityResolver: {
        listDescriptors: () => [createCapabilityDescriptor('agents', 'ready')],
        requireCapability: async () => undefined,
        reloadCapabilities: async () => [],
      },
      agentRegistry,
    })

    try {
      await runtime.start()
      const spawn = await runtime.agents.spawn({
        agentType: 'reviewer',
        prompt: 'check public kernel execution',
      })
      expect(spawn).toMatchObject({
        status: 'async_launched',
        agentType: 'reviewer',
        isAsync: true,
        canReadOutputFile: true,
      })
      expect(spawn.runId).toBeDefined()
      const runId = spawn.runId!
      await waitForAsync(async () => {
        return (await runtime.agents.status(runId))?.status === 'completed'
      })
      await runtime.agents.status(runId).then(run =>
        expect(run).toMatchObject({
          runId,
          status: 'completed',
          agentId: 'executor-agent-1',
          backgroundTaskId: 'executor-bg-1',
          outputAvailable: true,
          metadata: { executor: 'test' },
        }),
      )
      await runtime.agents.output(runId).then(output =>
        expect(output).toMatchObject({
          runId,
          available: true,
          output: expect.stringContaining('prompt:check public kernel execution'),
        }),
      )
      await runtime.agents.result(runId).then(result =>
        expect(result).toEqual({
          ok: true,
          prompt: 'check public kernel execution',
        }),
      )
    } finally {
      await runtime.dispose()
    }
  })

  test('cancels a running default agent registry execution', async () => {
    const agentRegistry = createDefaultKernelRuntimeAgentRegistry(
      '/tmp/kernel-runtime-agent-cancel-test',
      {
        listAgents: () => createAgentSnapshotForTest('reviewer'),
        executor: context =>
          new Promise<void>((_resolve, reject) => {
            context.output.append('started\n')
            context.signal.addEventListener(
              'abort',
              () => reject(new Error(String(context.signal.reason))),
              { once: true },
            )
          }),
      },
    )
    const runtime = await createKernelRuntime({
      id: 'runtime-agent-cancel-test',
      workspacePath: '/tmp/kernel-runtime-agent-cancel-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      capabilityResolver: {
        listDescriptors: () => [createCapabilityDescriptor('agents', 'ready')],
        requireCapability: async () => undefined,
        reloadCapabilities: async () => [],
      },
      agentRegistry,
    })

    try {
      await runtime.start()
      const spawn = await runtime.agents.spawn({
        agentType: 'reviewer',
        prompt: 'cancel public kernel execution',
      })
      const runId = spawn.runId!
      await waitForAsync(async () => {
        return (await runtime.agents.status(runId))?.status === 'running'
      })
      await runtime.agents
        .cancel(runId, { reason: 'sdk_cancel' })
        .then(result =>
          expect(result).toMatchObject({
            runId,
            cancelled: true,
            status: 'cancelled',
            reason: 'sdk_cancel',
          }),
        )
      await waitForAsync(async () => {
        return (await runtime.agents.status(runId))?.status === 'cancelled'
      })
      await runtime.agents.output(runId).then(output =>
        expect(output).toMatchObject({
          runId,
          available: true,
          output: expect.stringContaining('started'),
        }),
      )
    } finally {
      await runtime.dispose()
    }
  })

  test('times out while waiting for a missing turn terminal event', async () => {
    const runtime = await createKernelRuntime({
      id: 'runtime-turn-wait-timeout-test',
      workspacePath: '/tmp/kernel-runtime-turn-wait-timeout-test',
      eventJournalPath: false,
      conversationJournalPath: false,
    })

    try {
      await runtime.start()
      const conversation = await runtime.createConversation({
        id: 'conversation-turn-wait-timeout-test',
      })
      await expect(
        conversation.waitForTurn('missing-turn', { timeoutMs: 1 }),
      ).rejects.toThrow('Timed out waiting for turn missing-turn')
      await conversation.dispose()
    } finally {
      await runtime.dispose()
    }
  })

  test(
    'creates a runtime using stdio transport config',
    async () => {
      const stderr: string[] = []
      const workspace = await mkdtemp(
        join(tmpdir(), 'kernel-runtime-stdio-workspace-'),
      )
      const memoryPath = join(workspace, 'CLAUDE.md')
      await Bun.write(memoryPath, 'before')
      const runtime = await createKernelRuntime({
        id: 'runtime-stdio-test',
        workspacePath: workspace,
        transportConfig: {
          kind: 'stdio',
          command: 'bun',
          args: ['run', join(repoRoot, 'src/entrypoints/kernel-runtime.ts')],
          cwd: workspace,
          stderr: chunk => stderr.push(chunk),
        },
        host: {
          id: 'stdio-host-test',
          kind: 'test',
          trustLevel: 'local',
          declaredCapabilities: ['test'],
        },
      })

      try {
        await runtime.start()
        expect(runtime.transportKind).toBe('stdio')
        const conversation = await runtime.createConversation({
          id: 'stdio-conversation-test',
        })
        expect(conversation.snapshot().state).toBe('ready')
        await runtime.context.setSystemPromptInjection(null)
        expect(await runtime.context.getSystemPromptInjection()).toBeNull()
        expect(
          await runtime.context.setSystemPromptInjection('stdio-injection'),
        ).toBe('stdio-injection')
        expect(await runtime.context.getSystemPromptInjection()).toBe(
          'stdio-injection',
        )
        await runtime.kairos.enqueueEvent({ type: 'stdio.test' })
        expect((await runtime.kairos.getStatus()).pendingEvents).toBe(1)
        await runtime.kairos.tick()
        expect((await runtime.kairos.getStatus()).pendingEvents).toBe(0)
        expect((await runtime.memory.read(memoryPath)).content).toBe('before')
        expect(
          (
            await runtime.memory.update({
              id: memoryPath,
              content: 'after',
            })
          ).content,
        ).toBe('after')
        expect(await Bun.file(memoryPath).text()).toBe('after')
        expect(
          await runtime.sessions.list({
            cwd: workspace,
            includeWorktrees: false,
            limit: 1,
          }),
        ).toEqual(expect.any(Array))
        const resumeTranscriptPath = join(workspace, 'resume-session.jsonl')
        await Bun.write(
          resumeTranscriptPath,
          '{"type":"summary","summary":"resume fixture","timestamp":"2024-01-01T00:00:00.000Z"}\n',
        )
        const stdioCompanionEvents: string[] = []
        const stdioKairosEvents: string[] = []
        const unsubscribeCompanion = runtime.companion.onEvent(event => {
          stdioCompanionEvents.push(event.type)
        })
        const unsubscribeKairos = runtime.kairos.onEvent(event => {
          stdioKairosEvents.push(event.type)
        })
        await runtime.companion.dispatch({ type: 'pet', note: 'stdio' })
        await runtime.kairos.enqueueEvent({ type: 'stdio.test.events' })
        await runtime.kairos.tick()
        const resumedConversation =
          await runtime.sessions.resume(resumeTranscriptPath)
        expect(resumedConversation.sessionId).toBe(resumeTranscriptPath)
        expect(resumedConversation.workspacePath).toBe(workspace)
        await resumedConversation.dispose()
        await waitFor(() => stdioCompanionEvents.includes('petted'))
        await waitFor(() => stdioKairosEvents.includes('tick'))
        unsubscribeCompanion()
        unsubscribeKairos()
        expect(stderr.join('')).toBe('')
        await conversation.dispose()
      } finally {
        await runtime.dispose()
        await rm(workspace, { recursive: true, force: true })
      }
    },
    { timeout: 30_000 },
  )

  test('throws KernelRuntimeRequestError for failed runtime requests', async () => {
    const runtime = await createKernelRuntime({
      id: 'runtime-error-test',
      workspacePath: '/tmp/kernel-runtime-error-test',
      eventJournalPath: false,
      conversationJournalPath: false,
    })

    try {
      await runtime.start()
      await expect(
        runtime.decidePermission({
          permissionRequestId: 'missing-permission',
          decision: 'allow_once',
          decidedBy: 'host',
        }),
      ).rejects.toBeInstanceOf(KernelRuntimeRequestError)
    } finally {
      await runtime.dispose()
    }
  })
})

function collectTypedEventTypes(
  envelopes: readonly KernelRuntimeEnvelopeBase[],
): string[] {
  return runtimeEvents
    .collectKernelRuntimeEventEnvelopes(envelopes)
    .map(envelope => envelope.payload.type)
}

type CapabilityDescriptorForTest = KernelCapabilityDescriptor

type KernelCapabilityFamilyForTest =
  | 'core'
  | 'execution'
  | 'model'
  | 'extension'
  | 'security'
  | 'host'
  | 'autonomy'
  | 'observability'

type CapabilityViewForTest = KernelCapabilityDescriptor & {
  family: KernelCapabilityFamilyForTest
  ready: boolean
  unavailable: boolean
  optional: boolean
  loaded: boolean
}

type CapabilityDescriptorFilterForTest = {
  family?:
    | KernelCapabilityFamilyForTest
    | readonly KernelCapabilityFamilyForTest[]
  status?:
    | KernelCapabilityDescriptor['status']
    | readonly KernelCapabilityDescriptor['status'][]
  names?: readonly string[]
  lazy?: boolean
  reloadable?: boolean
  optional?: boolean
  unavailable?: boolean
}

type KernelRuntimeCapabilitiesForTest = {
  list(): readonly CapabilityDescriptorForTest[]
  views(): readonly CapabilityViewForTest[]
  get(name: string): CapabilityDescriptorForTest | undefined
  getView(name: string): CapabilityViewForTest | undefined
  filter(
    filter: CapabilityDescriptorFilterForTest,
  ): readonly CapabilityViewForTest[]
  groupByFamily(): Record<
    KernelCapabilityFamilyForTest,
    readonly CapabilityViewForTest[]
  >
  listByFamily(
    family: KernelCapabilityFamilyForTest,
  ): readonly CapabilityViewForTest[]
  reload(
    scope?: KernelCapabilityReloadScope,
  ): Promise<readonly CapabilityDescriptorForTest[]>
}

type CapabilityFilterFunction = (
  filter: CapabilityDescriptorFilterForTest,
) => readonly CapabilityViewForTest[]

type CapabilityGroupByFamilyFunction = () => Record<
  KernelCapabilityFamilyForTest,
  readonly CapabilityViewForTest[]
>

type CapabilityListByFamilyFunction = (
  family: KernelCapabilityFamilyForTest,
) => readonly CapabilityViewForTest[]

type GetCapabilityFamilyFunction = (
  descriptor: KernelCapabilityDescriptor,
) => KernelCapabilityFamilyForTest

type FilterKernelCapabilitiesFunction = (
  descriptors: readonly KernelCapabilityDescriptor[],
  filter: CapabilityDescriptorFilterForTest,
) => readonly CapabilityViewForTest[]

type GroupKernelCapabilitiesFunction = (
  descriptors: readonly KernelCapabilityDescriptor[],
) => Record<KernelCapabilityFamilyForTest, readonly CapabilityViewForTest[]>

type ToCapabilityViewFunction = (
  descriptor: KernelCapabilityDescriptor,
) => CapabilityViewForTest

type IsCapabilityStateFunction = (
  descriptor: KernelCapabilityDescriptor,
) => boolean

type CapabilityDescriptorHelpers = {
  KERNEL_CAPABILITY_FAMILIES?: readonly KernelCapabilityFamilyForTest[]
  filterKernelCapabilities?: FilterKernelCapabilitiesFunction
  getKernelCapabilityFamily?: GetCapabilityFamilyFunction
  groupKernelCapabilities?: GroupKernelCapabilitiesFunction
  isKernelCapabilityReady?: IsCapabilityStateFunction
  isKernelCapabilityUnavailable?: IsCapabilityStateFunction
  toKernelCapabilityView?: ToCapabilityViewFunction
}

type AgentSnapshotForTest = Awaited<
  ReturnType<NonNullable<KernelRuntimeAgentRegistryOptions['listAgents']>>
>

function createAgentSnapshotForTest(agentType: string): AgentSnapshotForTest {
  return {
    activeAgents: [
      {
        agentType,
        whenToUse: 'Review code',
        source: 'projectSettings',
        active: true,
      },
    ],
    allAgents: [
      {
        agentType,
        whenToUse: 'Review code',
        source: 'projectSettings',
        active: true,
      },
    ],
  }
}

function createCapabilityDescriptor(
  name: string,
  status: KernelCapabilityDescriptor['status'],
  dependencies: readonly string[] = [],
  reloadable = true,
  metadata?: Record<string, unknown>,
): CapabilityDescriptorForTest {
  return {
    name,
    status,
    dependencies,
    lazy: reloadable,
    reloadable,
    metadata,
  }
}

function expectFunction<TFunction>(value: unknown, name: string): TFunction {
  expect(typeof value).toBe('function')
  if (typeof value !== 'function') {
    throw new Error(`${name} must be a function`)
  }
  return value as TFunction
}

function namesOf(
  descriptors: readonly { name: string }[] | undefined,
): string[] {
  return [...(descriptors ?? [])].map(descriptor => descriptor.name).sort()
}

function commandNamesOf(
  entries: readonly { descriptor: { name: string } }[] | undefined,
): string[] {
  return [...(entries ?? [])].map(entry => entry.descriptor.name).sort()
}

function createEventEnvelope(
  overrides: Partial<KernelRuntimeEnvelopeBase> = {},
): KernelRuntimeEnvelopeBase {
  return {
    schemaVersion: 'kernel.runtime.v1',
    messageId: 'message-test',
    sequence: 1,
    timestamp: '2026-04-27T00:00:00.000Z',
    source: 'kernel_runtime',
    kind: 'event',
    runtimeId: 'runtime-test',
    conversationId: 'conversation-test',
    turnId: 'turn-test',
    ...overrides,
  }
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const startedAt = Date.now()
  while (!assertion()) {
    if (Date.now() - startedAt > 1_000) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

async function waitForAsync(assertion: () => Promise<boolean>): Promise<void> {
  const startedAt = Date.now()
  while (!(await assertion())) {
    if (Date.now() - startedAt > 1_000) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}
