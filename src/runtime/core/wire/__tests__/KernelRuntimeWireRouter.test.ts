import { describe, expect, mock, test } from 'bun:test'
import { existsSync } from 'fs'

import { createHeadlessConversation } from '../../../capabilities/execution/internal/headlessConversationAdapter.js'
import { RuntimePermissionBroker } from '../../../capabilities/permissions/RuntimePermissionBroker.js'
import { createRuntimeCapabilityResolver } from '../../../capabilities/RuntimeCapabilityResolver.js'
import type { KernelPermissionRequest } from '../../../contracts/permissions.js'
import { RuntimeEventBus } from '../../events/RuntimeEventBus.js'
import { createKernelRuntimeHeadlessProcessExecutor } from '../KernelRuntimeHeadlessProcessExecutor.js'
import {
  createKernelRuntimeWireRouter,
  type KernelRuntimeWireAgentRegistry,
  type KernelRuntimeWireCommandCatalog,
  type KernelRuntimeWireConversationRecoverySnapshot,
  type KernelRuntimeWireConversationSnapshotStore,
  type KernelRuntimeWireCapabilityResolver,
  type KernelRuntimeWireHookCatalog,
  type KernelRuntimeWireMcpRegistry,
  type KernelRuntimeWirePermissionBroker,
  type KernelRuntimeWirePluginCatalog,
  type KernelRuntimeWireSessionManager,
  type KernelRuntimeWireSkillCatalog,
  type KernelRuntimeWireTaskRegistry,
  type KernelRuntimeWireToolCatalog,
  type KernelRuntimeWireTurnExecutor,
} from '../KernelRuntimeWireRouter.js'
import { KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION } from '../../../contracts/wire.js'
import {
  parseKernelRuntimeCommandLine,
  serializeKernelRuntimeEnvelope,
} from '../KernelRuntimeWireCodec.js'

function createClock(): () => string {
  let tick = 0
  return () => {
    const second = String(tick++).padStart(2, '0')
    return `2026-04-26T00:00:${second}.000Z`
  }
}

function createMessageIds(): () => string {
  let nextId = 1
  return () => `wire-message-${nextId++}`
}

function createRouter(
  options: {
    capabilityResolver?: KernelRuntimeWireCapabilityResolver
    commandCatalog?: KernelRuntimeWireCommandCatalog
    conversationSnapshotStore?: KernelRuntimeWireConversationSnapshotStore
    maxReplayEvents?: number
    mcpRegistry?: KernelRuntimeWireMcpRegistry
    hookCatalog?: KernelRuntimeWireHookCatalog
    skillCatalog?: KernelRuntimeWireSkillCatalog
    pluginCatalog?: KernelRuntimeWirePluginCatalog
    agentRegistry?: KernelRuntimeWireAgentRegistry
    taskRegistry?: KernelRuntimeWireTaskRegistry
    sessionManager?: KernelRuntimeWireSessionManager
    permissionBroker?: KernelRuntimeWirePermissionBroker
    toolCatalog?: KernelRuntimeWireToolCatalog
    runTurnExecutor?: KernelRuntimeWireTurnExecutor
  } = {},
) {
  const observed: unknown[] = []
  const eventBus = new RuntimeEventBus({
    runtimeId: 'runtime-1',
    maxReplayEvents: options.maxReplayEvents,
    now: createClock(),
    createMessageId: createMessageIds(),
  })
  eventBus.subscribe(envelope => {
    observed.push(envelope)
  })
  const router = createKernelRuntimeWireRouter({
    runtimeId: 'runtime-1',
    workspacePath: '/tmp/workspace',
    eventBus,
    conversationSnapshotStore: options.conversationSnapshotStore,
    capabilityResolver: options.capabilityResolver,
    commandCatalog: options.commandCatalog,
    toolCatalog: options.toolCatalog,
    mcpRegistry: options.mcpRegistry,
    hookCatalog: options.hookCatalog,
    skillCatalog: options.skillCatalog,
    pluginCatalog: options.pluginCatalog,
    agentRegistry: options.agentRegistry,
    taskRegistry: options.taskRegistry,
    sessionManager: options.sessionManager,
    permissionBroker: options.permissionBroker,
    runTurnExecutor: options.runTurnExecutor,
    createConversation: options => createHeadlessConversation(options),
  })
  return { router, observed }
}

async function waitForObserved<T>(
  observed: readonly T[],
  predicate: (item: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const item = observed.find(predicate)
    if (item) {
      return item
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for observed runtime envelope')
}

async function waitForPendingPermission(
  permissionBroker: RuntimePermissionBroker,
  permissionRequestId: string,
): Promise<void> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    if (
      permissionBroker
        .snapshot()
        .pendingRequestIds.includes(permissionRequestId)
    ) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for pending permission request')
}

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

function createPermissionRequest(
  permissionRequestId: string,
  overrides: Partial<KernelPermissionRequest> = {},
): KernelPermissionRequest {
  return {
    permissionRequestId,
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    toolName: 'Bash',
    action: 'run',
    argumentsPreview: { command: 'pwd' },
    risk: 'medium',
    policySnapshot: { mode: 'default' },
    ...overrides,
  }
}

const testHost = {
  kind: 'desktop',
  id: 'desktop-host-1',
  transport: 'stdio',
  trustLevel: 'local',
  declaredCapabilities: ['events'],
} as const

describe('KernelRuntimeWireRouter', () => {
  test('responds to ping with a stable pong envelope', async () => {
    const { router } = createRouter()

    const [pong] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'ping',
      requestId: 'request-1',
    })

    expect(pong).toMatchObject({
      schemaVersion: 'kernel.runtime.v1',
      kind: 'pong',
      requestId: 'request-1',
      runtimeId: 'runtime-1',
      source: 'kernel_runtime',
    })
  })

  test('routes create, run, abort, and replay through shared runtime events', async () => {
    const { router, observed } = createRouter()

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    const [runAck] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    const [abortAck] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'interrupt',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-2',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'duplicate_interrupt',
    })
    const replay = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-1',
      conversationId: 'conversation-1',
    })

    expect(runAck).toMatchObject({
      kind: 'ack',
      requestId: 'run-1',
      payload: { state: 'running' },
    })
    expect(abortAck).toMatchObject({
      kind: 'ack',
      requestId: 'abort-1',
      payload: { state: 'aborting', stopReason: 'interrupt' },
    })
    expect(
      observed.filter(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.abort_requested',
      ),
    ).toHaveLength(1)
    expect(
      replay
        .filter(envelope => envelope.kind === 'event')
        .map(envelope => envelope.payload)
        .map(payload => (payload as { type?: string }).type),
    ).toEqual(['conversation.ready', 'turn.started', 'turn.abort_requested'])
  })

  test('replays only events after a scoped cursor', async () => {
    const { router } = createRouter()

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    const replay = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-1',
      conversationId: 'conversation-1',
    })
    const firstEvent = replay.find(envelope => envelope.kind === 'event')

    expect(firstEvent?.eventId).toBe('conversation-1:1')

    const replayAfterCursor = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-2',
      conversationId: 'conversation-1',
      sinceEventId: firstEvent?.eventId,
    })

    expect(
      replayAfterCursor
        .filter(envelope => envelope.kind === 'event')
        .map(envelope => envelope.payload)
        .map(payload => (payload as { type?: string }).type),
    ).toEqual(['turn.started'])
  })

  test('tracks host connect, disconnect, and reconnect replay cursors', async () => {
    const { router, observed } = createRouter()

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    const firstEvent = observed.find(
      envelope =>
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'conversation.ready',
    ) as { eventId?: string } | undefined

    const connect = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'connect_host',
      requestId: 'connect-1',
      host: testHost,
      sinceEventId: firstEvent?.eventId,
    })
    const hostConnected = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'host.connected'
      )
    })

    expect(connect[0]).toMatchObject({
      kind: 'ack',
      requestId: 'connect-1',
      payload: {
        connected: true,
        hostId: 'desktop-host-1',
        state: 'connected',
        replayedEvents: 0,
      },
    })
    expect(
      connect
        .filter(envelope => envelope.kind === 'event')
        .map(envelope => (envelope.payload as { type?: string }).type),
    ).toEqual([])
    expect(hostConnected).toMatchObject({
      kind: 'event',
      payload: {
        type: 'host.connected',
        payload: {
          host: testHost,
          replayedEvents: 0,
        },
      },
    })

    const [disconnect] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'disconnect_host',
      requestId: 'disconnect-1',
      hostId: 'desktop-host-1',
      reason: 'window_closed',
    })
    const hostDisconnected = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'host.disconnected'
      )
    })

    expect(disconnect).toMatchObject({
      kind: 'ack',
      requestId: 'disconnect-1',
      payload: {
        disconnected: true,
        hostId: 'desktop-host-1',
        policy: 'detach',
        reason: 'window_closed',
      },
    })

    const reconnect = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'connect_host',
      requestId: 'connect-2',
      host: testHost,
      sinceEventId: (hostDisconnected as { eventId?: string }).eventId,
    })
    const hostReconnected = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'host.reconnected'
      )
    })

    expect(reconnect[0]).toMatchObject({
      kind: 'ack',
      requestId: 'connect-2',
      payload: {
        connected: true,
        hostId: 'desktop-host-1',
        previousState: 'disconnected',
        replayedEvents: 0,
      },
    })
    expect(hostReconnected).toMatchObject({
      payload: {
        type: 'host.reconnected',
        payload: {
          previousState: 'disconnected',
        },
      },
    })
  })

  test('rejects conversation reuse across different sessions', async () => {
    const { router } = createRouter()

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
      sessionId: 'session-a',
    })

    const [conflict] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-2',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
      sessionId: 'session-b',
    })

    expect(conflict).toMatchObject({
      kind: 'error',
      requestId: 'create-2',
      conversationId: 'conversation-1',
      error: {
        code: 'invalid_request',
        retryable: false,
        details: {
          existingSessionId: 'session-a',
          requestedSessionId: 'session-b',
        },
      },
    })
  })

  test('hydrates resumed transcript messages and file history into conversation replay events', async () => {
    const transcriptMessages = [
      {
        type: 'user',
        uuid: 'resume-user-1',
        message: {
          content: 'Hello from transcript',
        },
      },
      {
        type: 'assistant',
        uuid: 'resume-assistant-1',
        message: {
          content: 'Hi from transcript',
        },
      },
    ] as const
    const contentReplacements = [
      {
        kind: 'tool-result',
        toolUseId: 'tool-use-1',
        replacement: '<tool result omitted>',
      },
    ] as const
    const contextCollapseCommits = [
      {
        type: 'marble-origami-commit',
        sessionId: 'session-1',
        collapseId: '0000000000000001',
        summaryUuid: 'collapse-summary-1',
        summaryContent:
          '<collapsed id="0000000000000001">summary</collapsed>',
        summary: 'summary',
        firstArchivedUuid: 'resume-user-1',
        lastArchivedUuid: 'resume-assistant-1',
      },
    ] as const
    const contextCollapseSnapshot = {
      type: 'marble-origami-snapshot',
      sessionId: 'session-1',
      staged: [
        {
          startUuid: 'resume-user-1',
          endUuid: 'resume-assistant-1',
          summary: 'summary',
          risk: 1,
          stagedAt: 1714521600000,
        },
      ],
      armed: true,
      lastSpawnTokens: 2048,
    } as const
    const fileHistorySnapshots = [
      {
        messageId: 'resume-user-1',
        trackedFileBackups: {
          'src/example.ts': {
            backupFileName: 'resume-user-1@v1',
            version: 1,
            backupTime: '2026-05-01T00:00:00.000Z',
          },
        },
        timestamp: '2026-05-01T00:00:01.000Z',
      },
    ] as const
    const todoSnapshot = {
      sourceMessageUuid: 'resume-assistant-1',
      todos: [
        {
          content: 'Ship runtime resume hydration',
          status: 'in_progress',
          activeForm: 'Shipping runtime resume hydration',
        },
      ],
    } as const
    const nestedMemorySnapshot = {
      paths: ['/tmp/workspace/CLAUDE.md'],
    } as const
    const taskSnapshot = {
      taskListId: 'session-1',
      tasks: [
        {
          id: '1',
          subject: 'Ship runtime resume hydration',
          description: 'Resume file-backed task state',
          status: 'in_progress',
          taskListId: 'session-1',
          owner: 'session-1',
          blocks: [],
          blockedBy: [],
          ownedFiles: ['src/example.ts'],
          execution: {
            linkedBackgroundTaskId: 'background-task-1',
          },
        },
      ],
    } as const
    const attributionSnapshots = [
      {
        type: 'attribution-snapshot',
        messageId: 'resume-assistant-1',
        surface: 'cli',
        fileStates: {
          'src/example.ts': {
            lineAttribution: [{ start: 0, end: 4, source: 'claude' }],
            mtime: 1714521600000,
          },
        },
        promptCount: 2,
      },
    ] as const
    const sessionManager = {
        async listSessions() {
          return [
            {
              sessionId: 'session-1',
              cwd: '/tmp/workspace',
              summary: 'Resume fixture',
              lastModified: 1,
            },
          ]
        },
        resumeSession: mock(async () => {
          return {
            sessionId: 'session-1',
            fullPath: '/tmp/workspace/session-1.jsonl',
            messages: transcriptMessages,
            turnInterruptionState: 'none' as const,
            taskSnapshot,
            todoSnapshot,
            nestedMemorySnapshot,
            attributionSnapshots,
            fileHistorySnapshots,
            contentReplacements,
            contextCollapseCommits,
            contextCollapseSnapshot,
          }
        }),
        async getSessionTranscript() {
          return {
            sessionId: 'session-1',
            fullPath: '/tmp/workspace/session-1.jsonl',
            messages: transcriptMessages,
            turnInterruptionState: 'none' as const,
            taskSnapshot,
            todoSnapshot,
            nestedMemorySnapshot,
            attributionSnapshots,
            fileHistorySnapshots,
            contentReplacements,
            contextCollapseCommits,
            contextCollapseSnapshot,
          }
        },
      }
    const { router } = createRouter({
      sessionManager,
    })

    const [resumed] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'resume_session',
      requestId: 'resume-1',
      sessionId: 'session-1',
      conversationId: 'conversation-resume-1',
      resumeInterruptedTurn: true,
      resumeSessionAt: 'resume-user-1',
    })
    const replay = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-1',
      conversationId: 'conversation-resume-1',
    })
    const transcriptReplay = replay.slice(1).filter(envelope => {
      return (
        (envelope.payload as { type?: string } | undefined)?.type ===
        'conversation.transcript_message'
      )
    })
    const fileHistoryReplay = replay.slice(1).filter(envelope => {
      return (
        (envelope.payload as { type?: string } | undefined)?.type ===
        'conversation.file_history_snapshot'
      )
    })
    const todoReplay = replay.slice(1).filter(envelope => {
      return (
        (envelope.payload as { type?: string } | undefined)?.type ===
        'conversation.todo_snapshot'
      )
    })
    const nestedMemoryReplay = replay.slice(1).filter(envelope => {
      return (
        (envelope.payload as { type?: string } | undefined)?.type ===
        'conversation.nested_memory_snapshot'
      )
    })
    const taskReplay = replay.slice(1).filter(envelope => {
      return (
        (envelope.payload as { type?: string } | undefined)?.type ===
        'conversation.task_snapshot'
      )
    })
    const attributionReplay = replay.slice(1).filter(envelope => {
      return (
        (envelope.payload as { type?: string } | undefined)?.type ===
        'conversation.attribution_snapshot'
      )
    })
    const contentReplacementReplay = replay.slice(1).filter(envelope => {
      return (
        (envelope.payload as { type?: string } | undefined)?.type ===
        'conversation.content_replacement'
      )
    })
    const contextCollapseCommitReplay = replay.slice(1).filter(envelope => {
      return (
        (envelope.payload as { type?: string } | undefined)?.type ===
        'conversation.context_collapse_commit'
      )
    })
    const contextCollapseSnapshotReplay = replay.slice(1).filter(envelope => {
      return (
        (envelope.payload as { type?: string } | undefined)?.type ===
        'conversation.context_collapse_snapshot'
      )
    })

    expect(resumed).toMatchObject({
      kind: 'ack',
      requestId: 'resume-1',
      conversationId: 'conversation-resume-1',
      payload: {
        conversation: {
          conversationId: 'conversation-resume-1',
          sessionId: 'session-1',
          workspacePath: '/tmp/workspace',
        },
      },
    })
    expect(sessionManager.resumeSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        resumeInterruptedTurn: true,
        resumeSessionAt: 'resume-user-1',
      }),
    )
    expect(transcriptReplay).toHaveLength(1)
    expect(fileHistoryReplay).toHaveLength(1)
    expect(todoReplay).toHaveLength(1)
    expect(nestedMemoryReplay).toHaveLength(1)
    expect(taskReplay).toHaveLength(1)
    expect(attributionReplay).toHaveLength(1)
    expect(contentReplacementReplay).toHaveLength(1)
    expect(contextCollapseCommitReplay).toHaveLength(1)
    expect(contextCollapseSnapshotReplay).toHaveLength(1)
    expect(transcriptReplay[0]).toMatchObject({
      conversationId: 'conversation-resume-1',
      payload: {
        type: 'conversation.transcript_message',
        payload: {
          sessionId: 'session-1',
          fullPath: '/tmp/workspace/session-1.jsonl',
          index: 0,
          message: transcriptMessages[0],
        },
      },
    })
    expect(fileHistoryReplay[0]).toMatchObject({
      conversationId: 'conversation-resume-1',
      payload: {
        type: 'conversation.file_history_snapshot',
        payload: {
          sessionId: 'session-1',
          fullPath: '/tmp/workspace/session-1.jsonl',
          index: 0,
          snapshot: fileHistorySnapshots[0],
        },
      },
    })
    expect(todoReplay[0]).toMatchObject({
      conversationId: 'conversation-resume-1',
      payload: {
        type: 'conversation.todo_snapshot',
        payload: {
          sessionId: 'session-1',
          fullPath: '/tmp/workspace/session-1.jsonl',
          snapshot: todoSnapshot,
        },
      },
    })
    expect(nestedMemoryReplay[0]).toMatchObject({
      conversationId: 'conversation-resume-1',
      payload: {
        type: 'conversation.nested_memory_snapshot',
        payload: {
          sessionId: 'session-1',
          fullPath: '/tmp/workspace/session-1.jsonl',
          snapshot: nestedMemorySnapshot,
        },
      },
    })
    expect(taskReplay[0]).toMatchObject({
      conversationId: 'conversation-resume-1',
      payload: {
        type: 'conversation.task_snapshot',
        payload: {
          sessionId: 'session-1',
          fullPath: '/tmp/workspace/session-1.jsonl',
          snapshot: taskSnapshot,
        },
      },
    })
    expect(attributionReplay[0]).toMatchObject({
      conversationId: 'conversation-resume-1',
      payload: {
        type: 'conversation.attribution_snapshot',
        payload: {
          sessionId: 'session-1',
          fullPath: '/tmp/workspace/session-1.jsonl',
          index: 0,
          snapshot: attributionSnapshots[0],
        },
      },
    })
    expect(contentReplacementReplay[0]).toMatchObject({
      conversationId: 'conversation-resume-1',
      payload: {
        type: 'conversation.content_replacement',
        payload: {
          sessionId: 'session-1',
          fullPath: '/tmp/workspace/session-1.jsonl',
          index: 0,
          replacement: contentReplacements[0],
        },
      },
    })
    expect(contextCollapseCommitReplay[0]).toMatchObject({
      conversationId: 'conversation-resume-1',
      payload: {
        type: 'conversation.context_collapse_commit',
        payload: {
          sessionId: 'session-1',
          fullPath: '/tmp/workspace/session-1.jsonl',
          index: 0,
          commit: contextCollapseCommits[0],
        },
      },
    })
    expect(contextCollapseSnapshotReplay[0]).toMatchObject({
      conversationId: 'conversation-resume-1',
      payload: {
        type: 'conversation.context_collapse_snapshot',
        payload: {
          sessionId: 'session-1',
          fullPath: '/tmp/workspace/session-1.jsonl',
          snapshot: contextCollapseSnapshot,
        },
      },
    })
  })

  test('aborts active turns when host disconnect policy requests it', async () => {
    let executionSignal: AbortSignal | undefined
    const { router, observed } = createRouter({
      runTurnExecutor: async function* ({ signal }) {
        executionSignal = signal
        await new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true },
          )
        })
      },
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'connect_host',
      requestId: 'connect-1',
      host: testHost,
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    await waitForObserved(observed, () => executionSignal !== undefined)

    const [disconnect] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'disconnect_host',
      requestId: 'disconnect-1',
      hostId: 'desktop-host-1',
      policy: 'abort_active_turns',
      reason: 'host_closed',
    })
    const completed = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.completed'
      )
    })

    expect(executionSignal?.aborted).toBe(true)
    expect(disconnect).toMatchObject({
      kind: 'ack',
      payload: {
        disconnected: true,
        hostId: 'desktop-host-1',
        policy: 'abort_active_turns',
        abortedTurnIds: ['turn-1'],
      },
    })
    expect(completed).toMatchObject({
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'host_closed',
        },
      },
    })
  })

  test('rejects missing replay cursors without acknowledging subscription', async () => {
    const { router, observed } = createRouter()
    const observedBeforeSubscribe = observed.length

    const [error] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-missing',
      conversationId: 'conversation-1',
      sinceEventId: 'missing-event',
    })

    expect(error).toMatchObject({
      kind: 'error',
      requestId: 'subscribe-missing',
      conversationId: 'conversation-1',
      error: {
        code: 'not_found',
        retryable: false,
        details: {
          eventId: 'missing-event',
          replayError: 'not_found',
        },
      },
    })
    expect(observed.slice(observedBeforeSubscribe)).toEqual([error])
  })

  test('treats evicted replay cursors as gone instead of retryable gaps', async () => {
    const { router, observed } = createRouter({ maxReplayEvents: 1 })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    const firstEvent = observed.find(
      envelope =>
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'conversation.ready',
    ) as { eventId?: string } | undefined
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    const observedBeforeSubscribe = observed.length

    expect(firstEvent?.eventId).toBe('conversation-1:1')

    const [error] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-expired',
      conversationId: 'conversation-1',
      sinceEventId: firstEvent?.eventId,
    })

    expect(error).toMatchObject({
      kind: 'error',
      requestId: 'subscribe-expired',
      conversationId: 'conversation-1',
      error: {
        code: 'not_found',
        retryable: false,
        details: {
          eventId: 'conversation-1:1',
          replayError: 'not_found',
        },
      },
    })
    expect(observed.slice(observedBeforeSubscribe)).toEqual([error])
  })

  test('streams long-running turn output before terminal completion', async () => {
    const releaseExecution = createDeferred()
    const { router, observed } = createRouter({
      runTurnExecutor: async function* () {
        await releaseExecution.promise
        yield {
          type: 'output',
          payload: { text: 'hello from executor' },
        }
        yield {
          type: 'completed',
          stopReason: 'end_turn',
        }
      },
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    const [runAck] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })

    expect(runAck).toMatchObject({
      kind: 'ack',
      requestId: 'run-1',
      payload: { state: 'running' },
    })
    expect(
      observed.some(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.output_delta',
      ),
    ).toBe(false)

    releaseExecution.resolve()

    const output = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.output_delta'
      )
    })
    const completed = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.completed'
      )
    })

    expect(output).toMatchObject({
      kind: 'event',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      payload: {
        type: 'turn.output_delta',
        payload: { text: 'hello from executor' },
      },
    })
    expect(completed).toMatchObject({
      kind: 'event',
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'end_turn',
        },
      },
    })
  })

  test('streams output from a process-backed headless executor', async () => {
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
    const { router, observed } = createRouter({
      runTurnExecutor: createKernelRuntimeHeadlessProcessExecutor({
        command: nodeCommand,
        args: ['-e', fakeHeadlessScript],
        cwd: process.cwd(),
        killTimeoutMs: 1000,
      }),
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello process',
    })

    const protocolMessage = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'headless.protocol_message'
      )
    })
    const output = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.output_delta' &&
        (envelope as { payload?: { payload?: { text?: string } } }).payload
          ?.payload?.text === 'final:hello process'
      )
    })
    const completed = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.completed'
      )
    })

    expect(protocolMessage).toMatchObject({
      kind: 'event',
      payload: {
        type: 'headless.protocol_message',
      },
    })
    expect(output).toMatchObject({
      kind: 'event',
      payload: {
        type: 'turn.output_delta',
        payload: {
          text: 'final:hello process',
        },
      },
    })
    expect(completed).toMatchObject({
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'success',
        },
      },
    })
  })

  test('projects nested SDK tool events from a process-backed headless executor', async () => {
    const fakeHeadlessScript = `
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => {
        input += chunk;
      });
      process.stdin.on("end", () => {
        const text = input.trim() || "README.md";
        console.log(JSON.stringify({
          type: "assistant",
          uuid: "assistant-tool-1",
          session_id: "session-1",
          parent_tool_use_id: "toolu_parent_agent",
          message: {
            role: "assistant",
            content: [{
              type: "tool_use",
              id: "toolu_child_read",
              name: "Read",
              input: { path: text },
            }],
          },
        }));
        console.log(JSON.stringify({
          type: "user",
          uuid: "user-tool-result-1",
          session_id: "session-1",
          parent_tool_use_id: "toolu_parent_agent",
          message: {
            role: "user",
            content: [{
              type: "tool_result",
              tool_use_id: "toolu_child_read",
              content: "done",
              is_error: false,
            }],
          },
        }));
        console.log(JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: false,
          result: "ok",
          session_id: "session-1",
        }));
      });
    `
    const nodeCommand = existsSync('/usr/local/bin/node')
      ? '/usr/local/bin/node'
      : 'node'
    const { router, observed } = createRouter({
      runTurnExecutor: createKernelRuntimeHeadlessProcessExecutor({
        command: nodeCommand,
        args: ['-e', fakeHeadlessScript],
        cwd: process.cwd(),
        killTimeoutMs: 1000,
      }),
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'README.md',
    })

    const toolUseStart = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.progress' &&
        (envelope as {
          payload?: { payload?: { kind?: string; toolUseId?: string } }
        }).payload?.payload?.kind === 'tool_use_start' &&
        (envelope as {
          payload?: { payload?: { toolUseId?: string } }
        }).payload?.payload?.toolUseId === 'toolu_child_read'
      )
    })
    const toolUseDone = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.progress' &&
        (envelope as {
          payload?: { payload?: { kind?: string; toolUseId?: string } }
        }).payload?.payload?.kind === 'tool_use_done' &&
        (envelope as {
          payload?: { payload?: { toolUseId?: string } }
        }).payload?.payload?.toolUseId === 'toolu_child_read'
      )
    })

    expect(toolUseStart).toMatchObject({
      payload: {
        type: 'turn.progress',
        payload: {
          kind: 'tool_use_start',
          toolUseId: 'toolu_child_read',
          parentToolUseId: 'toolu_parent_agent',
          toolName: 'Read',
          toolInput: {
            path: 'README.md',
          },
        },
      },
    })
    expect(toolUseDone).toMatchObject({
      payload: {
        type: 'turn.progress',
        payload: {
          kind: 'tool_use_done',
          toolUseId: 'toolu_child_read',
          parentToolUseId: 'toolu_parent_agent',
          content: 'done',
          isError: false,
        },
      },
    })
  })

  test('passes resumed session identifiers through the process-backed executor', async () => {
    const fakeHeadlessScript = `
      const resumeIndex = process.argv.findIndex(arg => arg === "--resume");
      const resumed = resumeIndex >= 0 ? process.argv[resumeIndex + 1] : "missing";
      console.log(JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: resumed,
        session_id: resumed,
      }));
    `
    const nodeCommand = existsSync('/usr/local/bin/node')
      ? '/usr/local/bin/node'
      : 'node'
    const { router, observed } = createRouter({
      runTurnExecutor: createKernelRuntimeHeadlessProcessExecutor({
        command: nodeCommand,
        args: ['-e', fakeHeadlessScript, '--'],
        cwd: process.cwd(),
        killTimeoutMs: 1000,
      }),
    })
    const resumedSessionId = '550e8400-e29b-41d4-a716-446655440000'

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
      sessionId: resumedSessionId,
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello process',
    })

    const output = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.output_delta' &&
        (envelope as { payload?: { payload?: { text?: string } } }).payload
          ?.payload?.text === resumedSessionId
      )
    })

    expect(output).toMatchObject({
      kind: 'event',
      payload: {
        type: 'turn.output_delta',
        payload: {
          text: resumedSessionId,
        },
      },
    })
  })

  test('aborts long-running turn executors through the execution signal', async () => {
    let executionSignal: AbortSignal | undefined
    const { router, observed } = createRouter({
      runTurnExecutor: async function* ({ signal }) {
        executionSignal = signal
        await new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true },
          )
        })
      },
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    await waitForObserved(observed, () => executionSignal !== undefined)

    const [abortAck] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'interrupt',
    })
    const completed = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.completed'
      )
    })

    expect(executionSignal?.aborted).toBe(true)
    expect(abortAck).toMatchObject({
      kind: 'ack',
      payload: {
        state: 'aborting',
        stopReason: 'interrupt',
      },
    })
    expect(completed).toMatchObject({
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'interrupt',
        },
      },
    })
  })

  test('runs multiple conversations concurrently and aborts only the targeted turn', async () => {
    const gates = new Map<string, ReturnType<typeof createDeferred>>()
    const signals = new Map<string, AbortSignal>()
    const { router, observed } = createRouter({
      runTurnExecutor: async function* ({ command, signal }) {
        signals.set(command.conversationId, signal)
        yield {
          type: 'event',
          event: {
            type: 'executor.started',
            replayable: true,
            payload: {
              conversationId: command.conversationId,
              turnId: command.turnId,
            },
          },
        }

        const gate = gates.get(command.conversationId)
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => reject(signal.reason ?? new Error('aborted'))
          signal.addEventListener('abort', onAbort, { once: true })
          gate?.promise
            .then(resolve)
            .catch(reject)
            .finally(() => signal.removeEventListener('abort', onAbort))
        })
        yield {
          type: 'completed',
          stopReason: `done:${command.conversationId}`,
        }
      },
    })

    gates.set('conversation-a', createDeferred())
    gates.set('conversation-b', createDeferred())

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-a',
      conversationId: 'conversation-a',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-b',
      conversationId: 'conversation-b',
      workspacePath: '/tmp/workspace',
    })
    const [runA] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-a',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      prompt: 'hello a',
    })
    const [runB] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-b',
      conversationId: 'conversation-b',
      turnId: 'turn-b',
      prompt: 'hello b',
    })

    expect(runA).toMatchObject({
      kind: 'ack',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
    })
    expect(runB).toMatchObject({
      kind: 'ack',
      conversationId: 'conversation-b',
      turnId: 'turn-b',
    })
    await waitForObserved(
      observed,
      envelope =>
        (
          envelope as {
            payload?: { type?: string; payload?: { conversationId?: string } }
          }
        ).payload?.type === 'executor.started' &&
        (envelope as { payload?: { payload?: { conversationId?: string } } })
          .payload?.payload?.conversationId === 'conversation-a',
    )
    await waitForObserved(
      observed,
      envelope =>
        (
          envelope as {
            payload?: { type?: string; payload?: { conversationId?: string } }
          }
        ).payload?.type === 'executor.started' &&
        (envelope as { payload?: { payload?: { conversationId?: string } } })
          .payload?.payload?.conversationId === 'conversation-b',
    )

    gates.get('conversation-b')?.resolve()
    const completedB = await waitForObserved(
      observed,
      envelope =>
        (envelope as { conversationId?: string; payload?: { type?: string } })
          .conversationId === 'conversation-b' &&
        (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.completed',
    )
    expect(completedB).toMatchObject({
      conversationId: 'conversation-b',
      turnId: 'turn-b',
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'done:conversation-b',
        },
      },
    })
    expect(signals.get('conversation-a')?.aborted).toBe(false)

    const [abortA] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-a',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      reason: 'interrupt-a',
    })
    const completedA = await waitForObserved(
      observed,
      envelope =>
        (envelope as { conversationId?: string; payload?: { type?: string } })
          .conversationId === 'conversation-a' &&
        (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.completed',
    )

    expect(abortA).toMatchObject({
      kind: 'ack',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      payload: {
        state: 'aborting',
        stopReason: 'interrupt-a',
      },
    })
    expect(signals.get('conversation-a')?.aborted).toBe(true)
    expect(signals.get('conversation-b')?.aborted).toBe(false)
    expect(completedA).toMatchObject({
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'interrupt-a',
        },
      },
    })
  })

  test('maps executor failures to failed turn events', async () => {
    const { router, observed } = createRouter({
      runTurnExecutor: async function* () {
        yield {
          type: 'output',
          payload: { text: 'partial' },
        }
        throw new Error('executor failed')
      },
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })

    const failed = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.failed'
      )
    })

    expect(failed).toMatchObject({
      payload: {
        type: 'turn.failed',
        payload: {
          state: 'failed',
          error: {
            name: 'Error',
            message: 'executor failed',
          },
        },
      },
    })
  })

  test('returns busy instead of starting concurrent turns', async () => {
    const { router } = createRouter()

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    const [busy] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-2',
      conversationId: 'conversation-1',
      turnId: 'turn-2',
      prompt: 'second turn',
    })

    expect(busy).toMatchObject({
      kind: 'error',
      requestId: 'run-2',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      error: {
        code: 'busy',
        retryable: true,
      },
    })
  })

  test('recovers conversation snapshots and preserves active turn locks', async () => {
    const snapshots: KernelRuntimeWireConversationRecoverySnapshot[] = []
    const store: KernelRuntimeWireConversationSnapshotStore = {
      readLatest(conversationId) {
        for (let index = snapshots.length - 1; index >= 0; index -= 1) {
          const snapshot = snapshots[index]
          if (snapshot?.conversation.conversationId === conversationId) {
            return snapshot
          }
        }
        return undefined
      },
      append(snapshot) {
        snapshots.push(snapshot)
      },
    }

    const first = createRouter({ conversationSnapshotStore: store })
    await first.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await first.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })

    expect(snapshots.at(-1)).toMatchObject({
      conversation: {
        conversationId: 'conversation-1',
        state: 'running',
        activeTurnId: 'turn-1',
      },
      activeTurn: {
        turnId: 'turn-1',
        state: 'running',
      },
      activeExecution: {
        type: 'run_turn',
        requestId: 'run-1',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        prompt: 'hello',
      },
    })

    const second = createRouter({ conversationSnapshotStore: store })
    const [recovered] = await second.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-2',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })

    expect(recovered).toMatchObject({
      kind: 'ack',
      requestId: 'create-2',
      conversationId: 'conversation-1',
      payload: {
        state: 'detached',
        activeTurnId: 'turn-1',
      },
    })
    expect(
      second.observed.some(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type ===
          'conversation.recovered',
      ),
    ).toBe(true)

    const [busy] = await second.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-2',
      conversationId: 'conversation-1',
      turnId: 'turn-2',
      prompt: 'second turn',
    })
    expect(busy).toMatchObject({
      kind: 'error',
      requestId: 'run-2',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      error: {
        code: 'busy',
        retryable: true,
      },
    })

    const [abortAck] = await second.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'after_crash',
    })

    expect(abortAck).toMatchObject({
      kind: 'ack',
      requestId: 'abort-1',
      payload: {
        state: 'aborting',
        stopReason: 'after_crash',
      },
    })
    expect(snapshots.at(-1)).toMatchObject({
      conversation: {
        conversationId: 'conversation-1',
        state: 'aborting',
        activeTurnId: 'turn-1',
      },
      activeTurn: {
        turnId: 'turn-1',
        state: 'aborting',
        stopReason: 'after_crash',
      },
    })
  })

  test('resumes aborting recovered executions instead of leaving zombie turns', async () => {
    const snapshots: KernelRuntimeWireConversationRecoverySnapshot[] = []
    const store: KernelRuntimeWireConversationSnapshotStore = {
      readLatest(conversationId) {
        for (let index = snapshots.length - 1; index >= 0; index -= 1) {
          const snapshot = snapshots[index]
          if (snapshot?.conversation.conversationId === conversationId) {
            return snapshot
          }
        }
        return undefined
      },
      append(snapshot) {
        snapshots.push(snapshot)
      },
    }
    const stalledExecutor: KernelRuntimeWireTurnExecutor =
      async function* stalled() {
        await new Promise<never>(() => {})
      }
    const first = createRouter({
      conversationSnapshotStore: store,
      runTurnExecutor: stalledExecutor,
    })
    await first.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await first.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'resume aborted turn',
    })
    await first.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'crashed_before_abort_observed',
    })

    expect(snapshots.at(-1)).toMatchObject({
      activeTurn: {
        turnId: 'turn-1',
        state: 'aborting',
      },
      activeExecution: {
        type: 'run_turn',
        requestId: 'run-1',
        turnId: 'turn-1',
        prompt: 'resume aborted turn',
      },
    })

    const resumedSignals: boolean[] = []
    const second = createRouter({
      conversationSnapshotStore: store,
      runTurnExecutor: async context => {
        resumedSignals.push(context.signal.aborted)
      },
    })
    const [recovered] = await second.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-2',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })

    expect(recovered).toMatchObject({
      kind: 'ack',
      requestId: 'create-2',
      payload: {
        state: 'detached',
        activeTurnId: 'turn-1',
      },
    })
    const completed = await waitForObserved(
      second.observed,
      envelope =>
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.completed',
    )
    expect(completed).toMatchObject({
      payload: {
        type: 'turn.completed',
        payload: {
          stopReason: 'crashed_before_abort_observed',
        },
      },
    })
    expect(resumedSignals).toEqual([true])
    expect(snapshots.at(-1)).toMatchObject({
      conversation: {
        conversationId: 'conversation-1',
        state: 'ready',
      },
    })
    expect(snapshots.at(-1)?.activeTurn).toBeUndefined()
    expect(snapshots.at(-1)?.activeExecution).toBeUndefined()
  })

  test('resumes recovered active turn execution from the persisted run command', async () => {
    const snapshots: KernelRuntimeWireConversationRecoverySnapshot[] = []
    const store: KernelRuntimeWireConversationSnapshotStore = {
      readLatest(conversationId) {
        for (let index = snapshots.length - 1; index >= 0; index -= 1) {
          const snapshot = snapshots[index]
          if (snapshot?.conversation.conversationId === conversationId) {
            return snapshot
          }
        }
        return undefined
      },
      append(snapshot) {
        snapshots.push(snapshot)
      },
    }
    const stalledExecutor: KernelRuntimeWireTurnExecutor =
      async function* stalled() {
        await new Promise<never>(() => {})
      }
    const first = createRouter({
      conversationSnapshotStore: store,
      runTurnExecutor: stalledExecutor,
    })
    await first.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await first.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'resume me',
    })

    expect(snapshots.at(-1)).toMatchObject({
      activeTurn: {
        turnId: 'turn-1',
        state: 'running',
      },
      activeExecution: {
        type: 'run_turn',
        requestId: 'run-1',
        prompt: 'resume me',
      },
    })

    const resumedCommands: unknown[] = []
    const second = createRouter({
      conversationSnapshotStore: store,
      runTurnExecutor: async function* resumed(context) {
        resumedCommands.push(context.command)
        yield {
          type: 'output',
          payload: { text: 'resumed output' },
        }
        yield { type: 'completed', stopReason: 'end_turn' }
      },
    })
    const [recovered] = await second.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-2',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })

    expect(recovered).toMatchObject({
      kind: 'ack',
      requestId: 'create-2',
      payload: {
        state: 'detached',
        activeTurnId: 'turn-1',
      },
    })
    await waitForObserved(
      second.observed,
      envelope =>
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.output_delta',
    )
    await waitForObserved(
      second.observed,
      envelope =>
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.completed',
    )

    expect(resumedCommands).toMatchObject([
      {
        type: 'run_turn',
        requestId: 'run-1',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        prompt: 'resume me',
      },
    ])
    expect(snapshots.at(-1)).toMatchObject({
      conversation: {
        conversationId: 'conversation-1',
        state: 'ready',
      },
    })
    expect(snapshots.at(-1)?.activeTurn).toBeUndefined()
    expect(snapshots.at(-1)?.activeExecution).toBeUndefined()
  })

  test('does not resurrect disposed conversations from snapshot storage', async () => {
    const snapshots: KernelRuntimeWireConversationRecoverySnapshot[] = []
    const store: KernelRuntimeWireConversationSnapshotStore = {
      readLatest(conversationId) {
        for (let index = snapshots.length - 1; index >= 0; index -= 1) {
          const snapshot = snapshots[index]
          if (snapshot?.conversation.conversationId === conversationId) {
            return snapshot
          }
        }
        return undefined
      },
      append(snapshot) {
        snapshots.push(snapshot)
      },
    }

    const first = createRouter({ conversationSnapshotStore: store })
    await first.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await first.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'dispose_conversation',
      requestId: 'dispose-1',
      conversationId: 'conversation-1',
      reason: 'done',
    })

    expect(snapshots.at(-1)).toMatchObject({
      conversation: {
        conversationId: 'conversation-1',
        state: 'disposed',
      },
    })

    const second = createRouter({ conversationSnapshotStore: store })
    const [ack] = await second.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-2',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })

    expect(ack).toMatchObject({
      kind: 'ack',
      requestId: 'create-2',
      conversationId: 'conversation-1',
    })
    expect((ack.payload as { activeTurnId?: string }).activeTurnId).toBeUndefined()
    expect(
      second.observed.some(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type ===
          'conversation.recovered',
      ),
    ).toBe(false)
    expect(
      second.observed.some(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type ===
          'conversation.ready',
      ),
    ).toBe(true)
  })

  test('uses the updated runtime workspace after init_runtime', async () => {
    const capabilityCwds: Array<string | undefined> = []
    const commandCwds: Array<string | undefined> = []
    const { router } = createRouter({
      capabilityResolver: {
        listDescriptors: () => [],
        async requireCapability(_name, context) {
          capabilityCwds.push(context?.cwd)
        },
        async reloadCapabilities() {
          return []
        },
      },
      commandCatalog: {
        async listCommands(context) {
          commandCwds.push(context?.cwd)
          return []
        },
      },
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'init_runtime',
      requestId: 'init-1',
      workspacePath: '/tmp/next-workspace',
    })
    const [ack] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_commands',
      requestId: 'list-1',
    })

    expect(ack).toMatchObject({
      kind: 'ack',
      requestId: 'list-1',
      payload: {
        entries: [],
      },
    })
    expect(capabilityCwds).toEqual(['/tmp/next-workspace'])
    expect(commandCwds).toEqual(['/tmp/next-workspace'])
  })

  test('disposing one conversation does not abort sibling execution keys', async () => {
    const abortedConversations: string[] = []
    const { router } = createRouter({
      runTurnExecutor: async context => {
        await new Promise<void>(resolve => {
          context.signal.addEventListener(
            'abort',
            () => {
              abortedConversations.push(context.command.conversationId)
              resolve()
            },
            { once: true },
          )
        })
      },
    })

    for (const conversationId of ['a', 'a:b'] as const) {
      await router.handleCommand({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'create_conversation',
        requestId: `create-${conversationId}`,
        conversationId,
        workspacePath: '/tmp/workspace',
      })
    }
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-a',
      conversationId: 'a',
      turnId: 'turn-a-1',
      prompt: 'parent',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-a:b',
      conversationId: 'a:b',
      turnId: 'turn-ab-1',
      prompt: 'child',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'dispose_conversation',
      requestId: 'dispose-a',
      conversationId: 'a',
      reason: 'cleanup',
    })

    await new Promise(resolve => setTimeout(resolve, 25))
    expect(abortedConversations).toEqual(['a'])

    const [busy] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-a:b-2',
      conversationId: 'a:b',
      turnId: 'turn-ab-2',
      prompt: 'still running',
    })

    expect(busy).toMatchObject({
      kind: 'error',
      requestId: 'run-a:b-2',
      conversationId: 'a:b',
      turnId: 'turn-ab-1',
      error: {
        code: 'busy',
      },
    })
  })

  test('returns not_found for commands targeting missing conversations', async () => {
    const { router } = createRouter()

    const [missing] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-1',
      conversationId: 'missing-conversation',
      turnId: 'turn-1',
      reason: 'interrupt',
    })

    expect(missing).toMatchObject({
      kind: 'error',
      requestId: 'abort-1',
      conversationId: 'missing-conversation',
      error: {
        code: 'not_found',
        retryable: false,
      },
    })
  })

  test('routes permission decisions through the runtime permission broker', async () => {
    const permissionBroker = new RuntimePermissionBroker()
    const { router } = createRouter({ permissionBroker })
    const pending = permissionBroker.requestPermission(
      createPermissionRequest('permission-1'),
    )

    const [ack] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'decide_permission',
      requestId: 'permission-decision-1',
      permissionRequestId: 'permission-1',
      decision: 'allow_once',
      decidedBy: 'host',
      reason: 'approved from host',
    })

    expect(ack).toMatchObject({
      kind: 'ack',
      requestId: 'permission-decision-1',
      payload: {
        permissionRequestId: 'permission-1',
        decision: 'allow_once',
        decidedBy: 'host',
        reason: 'approved from host',
      },
    })
    await expect(pending).resolves.toMatchObject({
      permissionRequestId: 'permission-1',
      decision: 'allow_once',
      decidedBy: 'host',
    })
  })

  test('exposes the shared permission broker to turn executors', async () => {
    const permissionBroker = new RuntimePermissionBroker()
    const runTurnExecutor: KernelRuntimeWireTurnExecutor = async function* (
      context,
    ) {
      const decision = await context.permissionBroker!.requestPermission(
        createPermissionRequest('permission-1', {
          conversationId: context.command.conversationId,
          turnId: context.command.turnId,
        }),
      )
      yield {
        type: 'event',
        event: {
          type: 'executor.permission_decision',
          replayable: true,
          payload: decision,
        },
      }
      yield { type: 'completed', stopReason: 'end_turn' }
    }
    const { router, observed } = createRouter({
      permissionBroker,
      runTurnExecutor,
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-conversation-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-turn-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })

    await waitForPendingPermission(permissionBroker, 'permission-1')

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'decide_permission',
      requestId: 'permission-decision-1',
      permissionRequestId: 'permission-1',
      decision: 'allow_once',
      decidedBy: 'host',
      reason: 'approved from host',
    })

    const permissionDecisionEvent = await waitForObserved(
      observed,
      envelope =>
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'executor.permission_decision',
    )

    expect(permissionDecisionEvent).toMatchObject({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      payload: {
        type: 'executor.permission_decision',
        payload: {
          permissionRequestId: 'permission-1',
          decision: 'allow_once',
          decidedBy: 'host',
        },
      },
    })
  })

  test('maps missing permission decisions to not_found', async () => {
    const permissionBroker = new RuntimePermissionBroker()
    const { router } = createRouter({ permissionBroker })

    const [error] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'decide_permission',
      requestId: 'permission-decision-missing',
      permissionRequestId: 'missing-permission',
      decision: 'deny',
      decidedBy: 'host',
      reason: 'missing',
    })

    expect(error).toMatchObject({
      kind: 'error',
      requestId: 'permission-decision-missing',
      error: {
        code: 'not_found',
        retryable: false,
        details: {
          permissionRequestId: 'missing-permission',
        },
      },
    })
  })

  test('parses abort_turn from an NDJSON command line', () => {
    const command = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'abort_turn',
        requestId: 'abort-1',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        reason: 'interrupt',
      }),
    )

    expect(command).toEqual({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'interrupt',
    })
  })

  test('parses run_turn input contract from an NDJSON command line', () => {
    const command = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'run_turn',
        requestId: 'run-input-1',
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
      }),
    )

    expect(command).toMatchObject({
      type: 'run_turn',
      executionMode: 'headless',
      contextAssembly: {
        modelVisible: [
          {
            type: 'turn.prompt',
            category: 'model_visible',
            source: 'user_input',
          },
        ],
      },
      capabilityPlane: {
        runtimeSupports: ['tool:Read'],
      },
    })
  })

  test('parses decide_permission from an NDJSON command line', () => {
    const command = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'decide_permission',
        requestId: 'permission-decision-1',
        permissionRequestId: 'permission-1',
        decision: 'allow_session',
        decidedBy: 'host',
        reason: 'trusted workspace',
        expiresAt: '2026-04-26T01:00:00.000Z',
      }),
    )

    expect(command).toEqual({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'decide_permission',
      requestId: 'permission-decision-1',
      permissionRequestId: 'permission-1',
      decision: 'allow_session',
      decidedBy: 'host',
      reason: 'trusted workspace',
      expiresAt: '2026-04-26T01:00:00.000Z',
    })
  })

  test('parses resume_session continuation options from an NDJSON command line', () => {
    const command = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'resume_session',
        requestId: 'resume-1',
        sessionId: '/tmp/session.jsonl',
        conversationId: 'conversation-resume-1',
        workspacePath: '/tmp/workspace',
        resumeInterruptedTurn: true,
        resumeSessionAt: 'resume-user-1',
      }),
    )

    expect(command).toEqual({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'resume_session',
      requestId: 'resume-1',
      sessionId: '/tmp/session.jsonl',
      conversationId: 'conversation-resume-1',
      workspacePath: '/tmp/workspace',
      resumeInterruptedTurn: true,
      resumeSessionAt: 'resume-user-1',
    })
  })

  test('parses reload and host event payloads from NDJSON command lines', () => {
    const connectHost = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'connect_host',
        requestId: 'connect-1',
        host: testHost,
        sinceEventId: 'conversation-1:1',
      }),
    )
    const disconnectHost = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'disconnect_host',
        requestId: 'disconnect-1',
        hostId: 'desktop-host-1',
        policy: 'abort_active_turns',
        reason: 'host_closed',
      }),
    )
    const reload = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'reload_capabilities',
        requestId: 'reload-1',
        scope: { type: 'capability', name: 'tools' },
      }),
    )
    const listCommands = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'list_commands',
        requestId: 'list-commands-1',
      }),
    )
    const listTools = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'list_tools',
        requestId: 'list-tools-1',
      }),
    )
    const listMcpTools = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'list_mcp_tools',
        requestId: 'list-mcp-tools-1',
        serverName: 'github',
      }),
    )
    const reloadMcp = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'reload_mcp',
        requestId: 'reload-mcp-1',
      }),
    )
    const connectMcp = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'connect_mcp',
        requestId: 'connect-mcp-1',
        serverName: 'github',
      }),
    )
    const authMcp = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'authenticate_mcp',
        requestId: 'auth-mcp-1',
        serverName: 'github',
        action: 'clear',
        callbackUrl: 'https://callback.example/done',
      }),
    )
    const setMcpEnabled = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'set_mcp_enabled',
        requestId: 'set-mcp-enabled-1',
        serverName: 'github',
        enabled: false,
      }),
    )
    const listHooks = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'list_hooks',
        requestId: 'list-hooks-1',
      }),
    )
    const runHook = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'run_hook',
        requestId: 'run-hook-1',
        event: 'PreToolUse',
        matcher: 'Bash',
        input: { tool: 'Bash' },
      }),
    )
    const registerHook = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'register_hook',
        requestId: 'register-hook-1',
        hook: {
          event: 'SessionEnd',
          type: 'command',
          source: 'sessionHook',
        },
        handlerRef: 'session-end',
      }),
    )
    const resolveSkillContext = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'resolve_skill_context',
        requestId: 'resolve-skill-context-1',
        name: 'review',
        args: 'focus',
      }),
    )
    const reloadPlugins = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'reload_plugins',
        requestId: 'reload-plugins-1',
      }),
    )
    const setPluginEnabled = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'set_plugin_enabled',
        requestId: 'set-plugin-enabled-1',
        name: 'audit-plugin',
        enabled: false,
        scope: 'project',
      }),
    )
    const installPlugin = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'install_plugin',
        requestId: 'install-plugin-1',
        name: 'audit-plugin',
        scope: 'project',
      }),
    )
    const uninstallPlugin = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'uninstall_plugin',
        requestId: 'uninstall-plugin-1',
        name: 'audit-plugin',
        keepData: true,
      }),
    )
    const updatePlugin = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'update_plugin',
        requestId: 'update-plugin-1',
        name: 'audit-plugin',
        scope: 'project',
      }),
    )
    const listAgents = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'list_agents',
        requestId: 'list-agents-1',
      }),
    )
    const listTasks = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'list_tasks',
        requestId: 'list-tasks-1',
        taskListId: 'team-a',
      }),
    )
    const getTask = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'get_task',
        requestId: 'get-task-1',
        taskListId: 'team-a',
        taskId: '1',
      }),
    )
    const hostEvent = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'publish_host_event',
        requestId: 'host-event-1',
        event: {
          type: 'host.focus_changed',
          replayable: true,
          payload: { focused: true },
        },
      }),
    )

    expect(connectHost).toMatchObject({
      type: 'connect_host',
      host: testHost,
      sinceEventId: 'conversation-1:1',
    })
    expect(disconnectHost).toMatchObject({
      type: 'disconnect_host',
      hostId: 'desktop-host-1',
      policy: 'abort_active_turns',
      reason: 'host_closed',
    })
    expect(reload).toMatchObject({
      type: 'reload_capabilities',
      scope: { type: 'capability', name: 'tools' },
    })
    expect(listCommands).toMatchObject({
      type: 'list_commands',
      requestId: 'list-commands-1',
    })
    expect(listTools).toMatchObject({
      type: 'list_tools',
      requestId: 'list-tools-1',
    })
    expect(listMcpTools).toMatchObject({
      type: 'list_mcp_tools',
      requestId: 'list-mcp-tools-1',
      serverName: 'github',
    })
    expect(reloadMcp).toMatchObject({
      type: 'reload_mcp',
      requestId: 'reload-mcp-1',
    })
    expect(connectMcp).toMatchObject({
      type: 'connect_mcp',
      requestId: 'connect-mcp-1',
      serverName: 'github',
    })
    expect(authMcp).toMatchObject({
      type: 'authenticate_mcp',
      requestId: 'auth-mcp-1',
      serverName: 'github',
      action: 'clear',
      callbackUrl: 'https://callback.example/done',
    })
    expect(setMcpEnabled).toMatchObject({
      type: 'set_mcp_enabled',
      requestId: 'set-mcp-enabled-1',
      serverName: 'github',
      enabled: false,
    })
    expect(listHooks).toMatchObject({
      type: 'list_hooks',
      requestId: 'list-hooks-1',
    })
    expect(runHook).toMatchObject({
      type: 'run_hook',
      requestId: 'run-hook-1',
      event: 'PreToolUse',
      matcher: 'Bash',
      input: { tool: 'Bash' },
    })
    expect(registerHook).toMatchObject({
      type: 'register_hook',
      requestId: 'register-hook-1',
      hook: {
        event: 'SessionEnd',
        type: 'command',
        source: 'sessionHook',
      },
      handlerRef: 'session-end',
    })
    expect(resolveSkillContext).toMatchObject({
      type: 'resolve_skill_context',
      requestId: 'resolve-skill-context-1',
      name: 'review',
      args: 'focus',
    })
    expect(reloadPlugins).toMatchObject({
      type: 'reload_plugins',
      requestId: 'reload-plugins-1',
    })
    expect(setPluginEnabled).toMatchObject({
      type: 'set_plugin_enabled',
      requestId: 'set-plugin-enabled-1',
      name: 'audit-plugin',
      enabled: false,
      scope: 'project',
    })
    expect(installPlugin).toMatchObject({
      type: 'install_plugin',
      requestId: 'install-plugin-1',
      name: 'audit-plugin',
      scope: 'project',
    })
    expect(uninstallPlugin).toMatchObject({
      type: 'uninstall_plugin',
      requestId: 'uninstall-plugin-1',
      name: 'audit-plugin',
      keepData: true,
    })
    expect(updatePlugin).toMatchObject({
      type: 'update_plugin',
      requestId: 'update-plugin-1',
      name: 'audit-plugin',
      scope: 'project',
    })
    expect(listAgents).toMatchObject({
      type: 'list_agents',
      requestId: 'list-agents-1',
    })
    expect(listTasks).toMatchObject({
      type: 'list_tasks',
      requestId: 'list-tasks-1',
      taskListId: 'team-a',
    })
    expect(getTask).toMatchObject({
      type: 'get_task',
      requestId: 'get-task-1',
      taskListId: 'team-a',
      taskId: '1',
    })
    expect(hostEvent).toMatchObject({
      type: 'publish_host_event',
      event: {
        type: 'host.focus_changed',
        payload: { focused: true },
      },
    })
  })

  test('maps malformed wire messages to schema_mismatch errors', async () => {
    const { router } = createRouter()

    const [error] = await router.handleMessage({
      schemaVersion: 'kernel.runtime.command.v0',
      type: 'ping',
      requestId: 'bad-1',
    })

    expect(error).toMatchObject({
      kind: 'error',
      requestId: 'bad-1',
      error: {
        code: 'schema_mismatch',
        retryable: false,
        details: {
          expected: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          actual: 'kernel.runtime.command.v0',
        },
      },
    })
  })

  test('serializes runtime envelopes as JSON lines', async () => {
    const { router } = createRouter()
    const [pong] = await router.handleMessage({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'ping',
      requestId: 'ping-1',
    })

    expect(JSON.parse(serializeKernelRuntimeEnvelope(pong))).toMatchObject({
      kind: 'pong',
      requestId: 'ping-1',
      schemaVersion: 'kernel.runtime.v1',
    })
  })

  test('reloads capabilities through the injected resolver and emits an event', async () => {
    const capabilityResolver = createRuntimeCapabilityResolver([
      { name: 'events', reloadable: false },
      { name: 'tools', dependencies: ['events'] },
    ])
    await capabilityResolver.requireCapability('tools')
    const { router, observed } = createRouter({ capabilityResolver })

    const [ack] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'reload_capabilities',
      requestId: 'reload-1',
      scope: { type: 'capability', name: 'tools' },
    })

    expect(ack).toMatchObject({
      kind: 'ack',
      requestId: 'reload-1',
      payload: {
        descriptors: expect.arrayContaining([
          expect.objectContaining({
            name: 'tools',
            status: 'declared',
          }),
        ]),
      },
    })
    expect(observed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'event',
          payload: expect.objectContaining({
            type: 'capabilities.reloaded',
          }),
        }),
      ]),
    )
  })

  test('lists command and tool catalogs through runtime wire commands', async () => {
    const required: string[] = []
    let mcpReloaded = false
    let hooksReloaded = false
    let skillsReloaded = false
    let pluginsReloaded = false
    let agentsReloaded = false
    const capabilityResolver = createRuntimeCapabilityResolver([
      {
        name: 'commands',
        load: async () => {
          required.push('commands')
        },
      },
      {
        name: 'tools',
        load: async () => {
          required.push('tools')
        },
      },
      {
        name: 'mcp',
        load: async () => {
          required.push('mcp')
        },
      },
      {
        name: 'hooks',
        load: async () => {
          required.push('hooks')
        },
      },
      {
        name: 'skills',
        load: async () => {
          required.push('skills')
        },
      },
      {
        name: 'plugins',
        load: async () => {
          required.push('plugins')
        },
      },
      {
        name: 'agents',
        load: async () => {
          required.push('agents')
        },
      },
      {
        name: 'tasks',
        load: async () => {
          required.push('tasks')
        },
      },
    ])
    const { router } = createRouter({
      capabilityResolver,
      commandCatalog: {
        listCommands: () => [
          {
            descriptor: {
              name: 'status',
              description: 'Show status',
              kind: 'local',
            },
            source: 'builtin',
            loadedFrom: 'builtin',
            supportsNonInteractive: true,
            modelInvocable: false,
          },
        ],
        executeCommand: request => ({
          name: request.name,
          kind: 'local',
          result: {
            type: 'text',
            text: `executed:${request.name}:${request.args ?? ''}`,
          },
        }),
      },
      toolCatalog: {
        listTools: () => [
          {
            name: 'Read',
            description: 'Read files',
            source: 'builtin',
            safety: 'read',
            isConcurrencySafe: true,
          },
        ],
        callTool: request => ({
          toolName: request.toolName,
          output: {
            input: request.input,
          },
        }),
      },
      mcpRegistry: {
        listServers: () => [
          {
            name: 'github',
            transport: 'stdio',
            state: 'connected',
            scope: 'project',
          },
        ],
        listToolBindings: () => [
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
        ],
        listResources: serverName =>
          serverName === 'github'
            ? [
                {
                  server: 'github',
                  uri: 'repo://hare-code',
                  name: 'hare-code',
                },
              ]
            : [],
        reload: () => {
          mcpReloaded = true
        },
        connectServer: request => ({
          serverName: request.serverName,
          state: 'connected',
          server: {
            name: request.serverName,
            transport: 'stdio',
            state: 'connected',
          },
        }),
        authenticateServer: request => ({
          serverName: request.serverName,
          state: request.action === 'clear' ? 'needs-auth' : 'connected',
          message: request.callbackUrl ?? request.action ?? 'authenticate',
        }),
        setServerEnabled: request => ({
          serverName: request.serverName,
          state: request.enabled ? 'pending' : 'disabled',
          server: {
            name: request.serverName,
            transport: 'http',
            state: request.enabled ? 'pending' : 'disabled',
          },
        }),
      },
      hookCatalog: {
        listHooks: () => [
          {
            event: 'PreToolUse',
            type: 'command',
            source: 'projectSettings',
            matcher: 'Bash',
          },
        ],
        reload: () => {
          hooksReloaded = true
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
        }),
        registerHook: request => ({
          hook: request.hook,
          registered: true,
          handlerRef: request.handlerRef,
        }),
      },
      skillCatalog: {
        listSkills: () => [
          {
            name: 'review',
            description: 'Review code',
            source: 'projectSettings',
            loadedFrom: 'skills',
            modelInvocable: true,
          },
        ],
        reload: () => {
          skillsReloaded = true
        },
        resolvePromptContext: request => ({
          name: request.name,
          descriptor:
            request.name === 'review'
              ? {
                  name: 'review',
                  description: 'Review code',
                  source: 'projectSettings',
                  loadedFrom: 'skills',
                  modelInvocable: true,
                }
              : undefined,
          context: 'inline',
          content: `skill:${request.name}:${request.args ?? ''}`,
          allowedTools: ['Read'],
        }),
      },
      pluginCatalog: {
        listPlugins: () => ({
          plugins: [
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
          ],
          errors: [],
        }),
        reload: () => {
          pluginsReloaded = true
        },
        setPluginEnabled: request => ({
          name: request.name,
          action: 'set_enabled',
          success: true,
          enabled: request.enabled,
          status: request.enabled ? 'enabled' : 'disabled',
          plugin: {
            name: request.name,
            source: 'audit@local',
            path: '/tmp/audit-plugin',
            repository: 'audit@local',
            status: request.enabled ? 'enabled' : 'disabled',
            enabled: request.enabled,
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
        }),
        installPlugin: request => ({
          name: request.name,
          action: 'install',
          success: true,
          enabled: true,
          status: 'enabled',
          plugin: {
            name: request.name,
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
        }),
        uninstallPlugin: request => ({
          name: request.name,
          action: 'uninstall',
          success: true,
          enabled: false,
          status: 'disabled',
        }),
        updatePlugin: request => ({
          name: request.name,
          action: 'update',
          success: true,
          enabled: true,
          status: 'enabled',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
        }),
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
          allAgents: [
            {
              agentType: 'reviewer',
              whenToUse: 'Review code',
              source: 'projectSettings',
              active: true,
            },
          ],
        }),
        reload: () => {
          agentsReloaded = true
        },
      },
      taskRegistry: {
        listTasks: taskListId => ({
          taskListId: taskListId ?? 'team-a',
          tasks: [
            {
              id: '1',
              subject: 'Wire tasks',
              description: 'Expose tasks',
              status: 'in_progress',
              taskListId: taskListId ?? 'team-a',
              owner: 'reviewer',
              blocks: [],
              blockedBy: [],
            },
          ],
        }),
        getTask: (taskId, taskListId) =>
          taskId === '1'
            ? {
                id: '1',
                subject: 'Wire tasks',
                description: 'Expose tasks',
                status: 'in_progress',
                taskListId: taskListId ?? 'team-a',
                owner: 'reviewer',
                blocks: [],
                blockedBy: [],
              }
            : null,
      },
    })

    const [commands] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_commands',
      requestId: 'commands-1',
    })
    const [executedCommand] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'execute_command',
      requestId: 'commands-execute-1',
      name: 'status',
      args: 'brief',
    })
    const [tools] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_tools',
      requestId: 'tools-1',
    })
    const [calledTool] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'call_tool',
      requestId: 'tools-call-1',
      toolName: 'Read',
      input: {
        file_path: 'README.md',
      },
    })
    const [mcpServers] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_mcp_servers',
      requestId: 'mcp-servers-1',
    })
    const [mcpTools] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_mcp_tools',
      requestId: 'mcp-tools-1',
      serverName: 'github',
    })
    const [mcpResources] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_mcp_resources',
      requestId: 'mcp-resources-1',
      serverName: 'github',
    })
    const [mcpReload] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'reload_mcp',
      requestId: 'mcp-reload-1',
    })
    const [mcpConnect] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'connect_mcp',
      requestId: 'mcp-connect-1',
      serverName: 'github',
    })
    const [mcpAuth] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'authenticate_mcp',
      requestId: 'mcp-auth-1',
      serverName: 'github',
      action: 'authenticate',
      callbackUrl: 'https://callback.example/done',
    })
    const [mcpDisable] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'set_mcp_enabled',
      requestId: 'mcp-disable-1',
      serverName: 'linear',
      enabled: false,
    })
    const [hooks] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_hooks',
      requestId: 'hooks-1',
    })
    const [hooksReload] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'reload_hooks',
      requestId: 'hooks-reload-1',
    })
    const [hookRun] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_hook',
      requestId: 'hooks-run-1',
      event: 'PreToolUse',
      matcher: 'Bash',
      input: { tool: 'Bash' },
    })
    const [hookRegister] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'register_hook',
      requestId: 'hooks-register-1',
      hook: {
        event: 'SessionEnd',
        type: 'command',
        source: 'sessionHook',
      },
      handlerRef: 'session-end',
    })
    const [skills] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_skills',
      requestId: 'skills-1',
    })
    const [skillsReload] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'reload_skills',
      requestId: 'skills-reload-1',
    })
    const [skillContext] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'resolve_skill_context',
      requestId: 'skills-context-1',
      name: 'review',
      args: 'focus',
    })
    const [plugins] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_plugins',
      requestId: 'plugins-1',
    })
    const [pluginsReload] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'reload_plugins',
      requestId: 'plugins-reload-1',
    })
    const [pluginDisable] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'set_plugin_enabled',
      requestId: 'plugins-disable-1',
      name: 'audit-plugin',
      enabled: false,
    })
    const [pluginInstall] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'install_plugin',
      requestId: 'plugins-install-1',
      name: 'audit-plugin',
      scope: 'project',
    })
    const [pluginUninstall] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'uninstall_plugin',
      requestId: 'plugins-uninstall-1',
      name: 'audit-plugin',
      keepData: true,
    })
    const [pluginUpdate] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'update_plugin',
      requestId: 'plugins-update-1',
      name: 'audit-plugin',
      scope: 'project',
    })
    const [agents] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_agents',
      requestId: 'agents-1',
    })
    const [agentsReload] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'reload_agents',
      requestId: 'agents-reload-1',
    })
    const [tasks] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_tasks',
      requestId: 'tasks-1',
      taskListId: 'team-a',
    })
    const [task] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'get_task',
      requestId: 'task-1',
      taskListId: 'team-a',
      taskId: '1',
    })

    expect(commands).toMatchObject({
      kind: 'ack',
      requestId: 'commands-1',
      payload: {
        entries: [
          {
            descriptor: {
              name: 'status',
              kind: 'local',
            },
          },
        ],
      },
    })
    expect(tools).toMatchObject({
      kind: 'ack',
      requestId: 'tools-1',
      payload: {
        tools: [
          {
            name: 'Read',
            safety: 'read',
          },
        ],
      },
    })
    expect(executedCommand).toMatchObject({
      kind: 'ack',
      requestId: 'commands-execute-1',
      payload: {
        name: 'status',
        result: {
          type: 'text',
          text: 'executed:status:brief',
        },
      },
    })
    expect(calledTool).toMatchObject({
      kind: 'ack',
      requestId: 'tools-call-1',
      payload: {
        toolName: 'Read',
        output: {
          input: {
            file_path: 'README.md',
          },
        },
      },
    })
    expect(mcpServers).toMatchObject({
      kind: 'ack',
      requestId: 'mcp-servers-1',
      payload: {
        servers: [
          {
            name: 'github',
            transport: 'stdio',
            state: 'connected',
          },
        ],
      },
    })
    expect(mcpTools).toMatchObject({
      kind: 'ack',
      requestId: 'mcp-tools-1',
      payload: {
        tools: [
          {
            server: 'github',
            serverToolName: 'list_issues',
            runtimeToolName: 'mcp__github__list_issues',
          },
        ],
      },
    })
    expect(mcpResources).toMatchObject({
      kind: 'ack',
      requestId: 'mcp-resources-1',
      payload: {
        resources: [
          {
            server: 'github',
            uri: 'repo://hare-code',
          },
        ],
      },
    })
    expect(mcpReload).toMatchObject({
      kind: 'ack',
      requestId: 'mcp-reload-1',
      payload: {
        servers: [
          {
            name: 'github',
          },
        ],
        toolBindings: expect.arrayContaining([
          expect.objectContaining({
            runtimeToolName: 'mcp__github__list_issues',
          }),
        ]),
      },
    })
    expect(mcpReloaded).toBe(true)
    expect(mcpConnect).toMatchObject({
      kind: 'ack',
      requestId: 'mcp-connect-1',
      payload: {
        serverName: 'github',
        state: 'connected',
      },
    })
    expect(mcpAuth).toMatchObject({
      kind: 'ack',
      requestId: 'mcp-auth-1',
      payload: {
        serverName: 'github',
        state: 'connected',
        message: 'https://callback.example/done',
      },
    })
    expect(mcpDisable).toMatchObject({
      kind: 'ack',
      requestId: 'mcp-disable-1',
      payload: {
        serverName: 'linear',
        state: 'disabled',
      },
    })
    expect(hooks).toMatchObject({
      kind: 'ack',
      requestId: 'hooks-1',
      payload: {
        hooks: [
          {
            event: 'PreToolUse',
            type: 'command',
            source: 'projectSettings',
          },
        ],
      },
    })
    expect(hooksReload).toMatchObject({
      kind: 'ack',
      requestId: 'hooks-reload-1',
      payload: { hooks: expect.any(Array) },
    })
    expect(hookRun).toMatchObject({
      kind: 'ack',
      requestId: 'hooks-run-1',
      payload: {
        event: 'PreToolUse',
        handled: true,
        outputs: [
          {
            matcher: 'Bash',
            input: { tool: 'Bash' },
          },
        ],
      },
    })
    expect(hookRegister).toMatchObject({
      kind: 'ack',
      requestId: 'hooks-register-1',
      payload: {
        hook: {
          event: 'SessionEnd',
          source: 'sessionHook',
        },
        registered: true,
        handlerRef: 'session-end',
      },
    })
    expect(skills).toMatchObject({
      kind: 'ack',
      requestId: 'skills-1',
      payload: {
        skills: [
          {
            name: 'review',
            modelInvocable: true,
          },
        ],
      },
    })
    expect(skillsReload).toMatchObject({
      kind: 'ack',
      requestId: 'skills-reload-1',
      payload: { skills: expect.any(Array) },
    })
    expect(skillContext).toMatchObject({
      kind: 'ack',
      requestId: 'skills-context-1',
      payload: {
        name: 'review',
        context: 'inline',
        content: 'skill:review:focus',
        allowedTools: ['Read'],
      },
    })
    expect(plugins).toMatchObject({
      kind: 'ack',
      requestId: 'plugins-1',
      payload: {
        plugins: [
          {
            name: 'audit-plugin',
            enabled: true,
          },
        ],
        errors: [],
      },
    })
    expect(pluginsReload).toMatchObject({
      kind: 'ack',
      requestId: 'plugins-reload-1',
      payload: { plugins: expect.any(Array), errors: [] },
    })
    expect(pluginDisable).toMatchObject({
      kind: 'ack',
      requestId: 'plugins-disable-1',
      payload: {
        name: 'audit-plugin',
        enabled: false,
        status: 'disabled',
      },
    })
    expect(pluginInstall).toMatchObject({
      kind: 'ack',
      requestId: 'plugins-install-1',
      payload: {
        name: 'audit-plugin',
        action: 'install',
        success: true,
        enabled: true,
        status: 'enabled',
      },
    })
    expect(pluginUninstall).toMatchObject({
      kind: 'ack',
      requestId: 'plugins-uninstall-1',
      payload: {
        name: 'audit-plugin',
        action: 'uninstall',
        success: true,
        enabled: false,
        status: 'disabled',
      },
    })
    expect(pluginUpdate).toMatchObject({
      kind: 'ack',
      requestId: 'plugins-update-1',
      payload: {
        name: 'audit-plugin',
        action: 'update',
        success: true,
        enabled: true,
        status: 'enabled',
        oldVersion: '1.0.0',
        newVersion: '1.1.0',
      },
    })
    expect(agents).toMatchObject({
      kind: 'ack',
      requestId: 'agents-1',
      payload: {
        activeAgents: [
          {
            agentType: 'reviewer',
            active: true,
          },
        ],
      },
    })
    expect(agentsReload).toMatchObject({
      kind: 'ack',
      requestId: 'agents-reload-1',
      payload: { activeAgents: expect.any(Array) },
    })
    expect(tasks).toMatchObject({
      kind: 'ack',
      requestId: 'tasks-1',
      payload: {
        taskListId: 'team-a',
        tasks: [
          {
            id: '1',
            status: 'in_progress',
          },
        ],
      },
    })
    expect(task).toMatchObject({
      kind: 'ack',
      requestId: 'task-1',
      payload: {
        task: {
          id: '1',
          owner: 'reviewer',
        },
      },
    })
    expect(hooksReloaded).toBe(true)
    expect(skillsReloaded).toBe(true)
    expect(pluginsReloaded).toBe(true)
    expect(agentsReloaded).toBe(true)
    expect(required).toEqual([
      'commands',
      'tools',
      'mcp',
      'hooks',
      'skills',
      'plugins',
      'agents',
      'tasks',
    ])
  })

  test('routes agent spawn and task mutations through runtime wire commands', async () => {
    const required: string[] = []
    const events: string[] = []
    const { router, observed } = createRouter({
      capabilityResolver: createRuntimeCapabilityResolver([
        {
          name: 'agents',
          load: async () => {
            required.push('agents')
          },
        },
        {
          name: 'tasks',
          load: async () => {
            required.push('tasks')
          },
        },
      ]),
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
          runId: 'agent-run-1',
          prompt: request.prompt,
          agentType: request.agentType,
          agentId: 'agent-1',
          taskId: request.taskId,
          taskListId: request.taskListId,
          outputFile: '/tmp/agent-1.log',
          isAsync: true,
          run: {
            runId: 'agent-run-1',
            status: 'running',
            prompt: request.prompt,
            createdAt: '2026-04-26T00:00:00.000Z',
            updatedAt: '2026-04-26T00:00:01.000Z',
            agentType: request.agentType,
            agentId: 'agent-1',
            taskId: request.taskId,
            taskListId: request.taskListId,
            outputFile: '/tmp/agent-1.log',
            outputAvailable: true,
          },
        }),
        listAgentRuns: () => ({
          runs: [
            {
              runId: 'agent-run-1',
              status: 'running',
              prompt: 'Review runtime mutations',
              createdAt: '2026-04-26T00:00:00.000Z',
              updatedAt: '2026-04-26T00:00:01.000Z',
              agentType: 'reviewer',
              agentId: 'agent-1',
              taskId: '1',
              taskListId: 'team-a',
              outputFile: '/tmp/agent-1.log',
              outputAvailable: true,
            },
          ],
        }),
        getAgentRun: runId =>
          runId === 'agent-run-1'
            ? {
                runId,
                status: 'running',
                prompt: 'Review runtime mutations',
                createdAt: '2026-04-26T00:00:00.000Z',
                updatedAt: '2026-04-26T00:00:01.000Z',
                agentType: 'reviewer',
                agentId: 'agent-1',
                taskId: '1',
                taskListId: 'team-a',
              }
            : null,
        getAgentOutput: request => ({
          runId: request.runId,
          status: 'running',
          available: true,
          output: 'runtime output',
          outputFile: '/tmp/agent-1.log',
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
            prompt: 'Review runtime mutations',
            createdAt: '2026-04-26T00:00:00.000Z',
            updatedAt: '2026-04-26T00:00:02.000Z',
            completedAt: '2026-04-26T00:00:02.000Z',
            cancelledAt: '2026-04-26T00:00:02.000Z',
            cancelReason: request.reason,
            agentType: 'reviewer',
            agentId: 'agent-1',
            taskId: '1',
            taskListId: 'team-a',
          },
        }),
      },
      taskRegistry: {
        listTasks: () => ({ taskListId: 'team-a', tasks: [] }),
        getTask: () => null,
        createTask: request => ({
          taskListId: request.taskListId ?? 'team-a',
          taskId: '1',
          created: true,
          updatedFields: ['subject', 'description'],
          task: {
            id: '1',
            subject: request.subject,
            description: request.description,
            status: request.status ?? 'pending',
            taskListId: request.taskListId ?? 'team-a',
            blocks: [],
            blockedBy: [],
          },
        }),
        updateTask: request => ({
          taskListId: request.taskListId ?? 'team-a',
          taskId: request.taskId,
          updatedFields: ['status'],
          task: {
            id: request.taskId,
            subject: 'Wire mutations',
            description: 'Update task state',
            status: request.status ?? 'in_progress',
            taskListId: request.taskListId ?? 'team-a',
            blocks: [],
            blockedBy: [],
          },
        }),
        assignTask: request => ({
          taskListId: request.taskListId ?? 'team-a',
          taskId: request.taskId,
          assigned: true,
          updatedFields: ['owner', 'ownedFiles'],
          task: {
            id: request.taskId,
            subject: 'Wire mutations',
            description: 'Assign task owner',
            status: request.status ?? 'in_progress',
            taskListId: request.taskListId ?? 'team-a',
            owner: request.owner,
            ownedFiles: request.ownedFiles,
            blocks: [],
            blockedBy: [],
          },
        }),
      },
    })
    const unsubscribe = router.eventBus.subscribe(envelope => {
      const type = (envelope.payload as { type?: string } | undefined)?.type
      if (type) events.push(type)
    })

    try {
      const [spawned] = await router.handleCommand({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'spawn_agent',
        requestId: 'spawn-agent-1',
        agentType: 'reviewer',
        prompt: 'Review runtime mutations',
        taskId: '1',
        taskListId: 'team-a',
      })
      const [runs] = await router.handleCommand({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'list_agent_runs',
        requestId: 'list-agent-runs-1',
      })
      const [run] = await router.handleCommand({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'get_agent_run',
        requestId: 'get-agent-run-1',
        runId: 'agent-run-1',
      })
      const [output] = await router.handleCommand({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'get_agent_output',
        requestId: 'get-agent-output-1',
        runId: 'agent-run-1',
        tailBytes: 128,
      })
      const [cancelled] = await router.handleCommand({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'cancel_agent_run',
        requestId: 'cancel-agent-run-1',
        runId: 'agent-run-1',
        reason: 'test_cancel',
      })
      const [created] = await router.handleCommand({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'create_task',
        requestId: 'create-task-1',
        taskListId: 'team-a',
        subject: 'Wire mutations',
        description: 'Create task via wire',
      })
      const [updated] = await router.handleCommand({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'update_task',
        requestId: 'update-task-1',
        taskListId: 'team-a',
        taskId: '1',
        status: 'in_progress',
      })
      const [assigned] = await router.handleCommand({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'assign_task',
        requestId: 'assign-task-1',
        taskListId: 'team-a',
        taskId: '1',
        owner: 'reviewer',
        ownedFiles: ['src/kernel/runtimeTasks.ts'],
      })

      expect(spawned).toMatchObject({
        kind: 'ack',
        requestId: 'spawn-agent-1',
        payload: {
          status: 'async_launched',
          runId: 'agent-run-1',
          agentId: 'agent-1',
          taskId: '1',
        },
      })
      expect(runs).toMatchObject({
        kind: 'ack',
        requestId: 'list-agent-runs-1',
        payload: {
          runs: [{ runId: 'agent-run-1', status: 'running' }],
        },
      })
      expect(run).toMatchObject({
        kind: 'ack',
        requestId: 'get-agent-run-1',
        payload: {
          run: { runId: 'agent-run-1', status: 'running' },
        },
      })
      expect(output).toMatchObject({
        kind: 'ack',
        requestId: 'get-agent-output-1',
        payload: {
          runId: 'agent-run-1',
          available: true,
          output: 'runtime output',
        },
      })
      expect(cancelled).toMatchObject({
        kind: 'ack',
        requestId: 'cancel-agent-run-1',
        payload: {
          runId: 'agent-run-1',
          cancelled: true,
          status: 'cancelled',
        },
      })
      expect(created).toMatchObject({
        kind: 'ack',
        requestId: 'create-task-1',
        payload: {
          created: true,
          task: { id: '1', subject: 'Wire mutations' },
        },
      })
      expect(updated).toMatchObject({
        kind: 'ack',
        requestId: 'update-task-1',
        payload: {
          task: { id: '1', status: 'in_progress' },
        },
      })
      expect(assigned).toMatchObject({
        kind: 'ack',
        requestId: 'assign-task-1',
        payload: {
          assigned: true,
          task: { id: '1', owner: 'reviewer' },
        },
      })
      expect(events).toEqual(
        expect.arrayContaining([
          'agents.spawned',
          'agents.run.cancelled',
          'tasks.created',
          'tasks.updated',
          'tasks.assigned',
        ]),
      )
      expect(
        observed.some(
          envelope =>
            (envelope as { payload?: { type?: string } }).payload?.type ===
            'tasks.assigned',
        ),
      ).toBe(true)
      expect(required).toEqual(['agents', 'tasks'])
    } finally {
      unsubscribe()
    }
  })

  test('returns unavailable when command or tool catalogs are missing', async () => {
    const { router } = createRouter()

    const [commands] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_commands',
      requestId: 'commands-missing',
    })
    const [tools] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_tools',
      requestId: 'tools-missing',
    })
    const [mcp] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_mcp_servers',
      requestId: 'mcp-missing',
    })
    const [hooks] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_hooks',
      requestId: 'hooks-missing',
    })
    const [skills] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_skills',
      requestId: 'skills-missing',
    })
    const [plugins] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_plugins',
      requestId: 'plugins-missing',
    })
    const [agents] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_agents',
      requestId: 'agents-missing',
    })
    const [tasks] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_tasks',
      requestId: 'tasks-missing',
    })

    expect(commands).toMatchObject({
      kind: 'error',
      requestId: 'commands-missing',
      error: {
        code: 'unavailable',
        message: 'Command catalog is not available',
      },
    })
    expect(tools).toMatchObject({
      kind: 'error',
      requestId: 'tools-missing',
      error: {
        code: 'unavailable',
        message: 'Tool catalog is not available',
      },
    })
    expect(mcp).toMatchObject({
      kind: 'error',
      requestId: 'mcp-missing',
      error: {
        code: 'unavailable',
        message: 'MCP registry is not available',
      },
    })
    expect(hooks).toMatchObject({
      kind: 'error',
      requestId: 'hooks-missing',
      error: {
        code: 'unavailable',
        message: 'Hook catalog is not available',
      },
    })
    expect(skills).toMatchObject({
      kind: 'error',
      requestId: 'skills-missing',
      error: {
        code: 'unavailable',
        message: 'Skill catalog is not available',
      },
    })
    expect(plugins).toMatchObject({
      kind: 'error',
      requestId: 'plugins-missing',
      error: {
        code: 'unavailable',
        message: 'Plugin catalog is not available',
      },
    })
    expect(agents).toMatchObject({
      kind: 'error',
      requestId: 'agents-missing',
      error: {
        code: 'unavailable',
        message: 'Agent registry is not available',
      },
    })
    expect(tasks).toMatchObject({
      kind: 'error',
      requestId: 'tasks-missing',
      error: {
        code: 'unavailable',
        message: 'Task registry is not available',
      },
    })
  })

  test('returns unavailable when catalog capabilities cannot be loaded', async () => {
    const { router } = createRouter({
      capabilityResolver: createRuntimeCapabilityResolver([]),
      commandCatalog: {
        listCommands: () => [],
      },
      toolCatalog: {
        listTools: () => [],
      },
      mcpRegistry: {
        listServers: () => [],
        listResources: () => [],
        listToolBindings: () => [],
      },
      hookCatalog: {
        listHooks: () => [],
      },
      skillCatalog: {
        listSkills: () => [],
      },
      pluginCatalog: {
        listPlugins: () => ({ plugins: [], errors: [] }),
      },
      agentRegistry: {
        listAgents: () => ({ activeAgents: [], allAgents: [] }),
      },
      taskRegistry: {
        listTasks: () => ({ taskListId: 'test', tasks: [] }),
        getTask: () => null,
      },
    })

    const [commands] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_commands',
      requestId: 'commands-unavailable',
    })
    const [tools] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_tools',
      requestId: 'tools-unavailable',
    })
    const [mcp] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_mcp_servers',
      requestId: 'mcp-unavailable',
    })
    const [hooks] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_hooks',
      requestId: 'hooks-unavailable',
    })
    const [skills] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_skills',
      requestId: 'skills-unavailable',
    })
    const [plugins] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_plugins',
      requestId: 'plugins-unavailable',
    })
    const [agents] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_agents',
      requestId: 'agents-unavailable',
    })
    const [tasks] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'list_tasks',
      requestId: 'tasks-unavailable',
    })

    expect(commands).toMatchObject({
      kind: 'error',
      requestId: 'commands-unavailable',
      error: {
        code: 'unavailable',
        details: { capabilities: ['commands'] },
      },
    })
    expect(tools).toMatchObject({
      kind: 'error',
      requestId: 'tools-unavailable',
      error: {
        code: 'unavailable',
        details: { capabilities: ['tools'] },
      },
    })
    expect(mcp).toMatchObject({
      kind: 'error',
      requestId: 'mcp-unavailable',
      error: {
        code: 'unavailable',
        details: { capabilities: ['mcp'] },
      },
    })
    expect(hooks).toMatchObject({
      kind: 'error',
      requestId: 'hooks-unavailable',
      error: {
        code: 'unavailable',
        details: { capabilities: ['hooks'] },
      },
    })
    expect(skills).toMatchObject({
      kind: 'error',
      requestId: 'skills-unavailable',
      error: {
        code: 'unavailable',
        details: { capabilities: ['skills'] },
      },
    })
    expect(plugins).toMatchObject({
      kind: 'error',
      requestId: 'plugins-unavailable',
      error: {
        code: 'unavailable',
        details: { capabilities: ['plugins'] },
      },
    })
    expect(agents).toMatchObject({
      kind: 'error',
      requestId: 'agents-unavailable',
      error: {
        code: 'unavailable',
        details: { capabilities: ['agents'] },
      },
    })
    expect(tasks).toMatchObject({
      kind: 'error',
      requestId: 'tasks-unavailable',
      error: {
        code: 'unavailable',
        details: { capabilities: ['tasks'] },
      },
    })
  })

  test('loads capability intent before creating a conversation', async () => {
    const loaded: string[] = []
    const capabilityResolver = createRuntimeCapabilityResolver([
      {
        name: 'tools',
        load: async () => {
          loaded.push('tools')
          return ['tool-registry']
        },
      },
      {
        name: 'mcp',
        load: async () => {
          loaded.push('mcp')
          return ['mcp-registry']
        },
      },
    ])
    const { router, observed } = createRouter({ capabilityResolver })

    const [ack] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-with-capabilities',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
      capabilityIntent: {
        requiredCapabilities: ['tools'],
        mcp: true,
      },
    })

    expect(ack).toMatchObject({
      kind: 'ack',
      requestId: 'create-with-capabilities',
      conversationId: 'conversation-1',
    })
    expect(loaded.sort()).toEqual(['mcp', 'tools'])
    expect(
      observed.map(
        envelope => (envelope as { payload?: { type?: string } }).payload?.type,
      ),
    ).toEqual(['capabilities.required', 'conversation.ready'])
    expect(
      observed.find(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type ===
          'capabilities.required',
      ),
    ).toMatchObject({
      conversationId: 'conversation-1',
      payload: {
        payload: {
          capabilities: ['tools', 'mcp'],
          descriptors: expect.arrayContaining([
            expect.objectContaining({ name: 'tools', status: 'ready' }),
            expect.objectContaining({ name: 'mcp', status: 'ready' }),
          ]),
        },
      },
    })
  })

  test('resolves provider selection from turn, conversation, then runtime default', async () => {
    const seen: Array<{
      conversationId: string
      providerSelection?: { providerId: string; kind?: string; model?: string }
      conversationProvider?: { providerId: string; kind?: string; model?: string }
    }> = []
    const runTurnExecutor: KernelRuntimeWireTurnExecutor = async function* (
      context,
    ) {
      seen.push({
        conversationId: context.command.conversationId,
        providerSelection: context.providerSelection,
        conversationProvider: context.conversation.snapshot().provider,
      })
      yield { type: 'completed', stopReason: 'end_turn' }
    }
    const { router } = createRouter({ runTurnExecutor })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'init_runtime',
      requestId: 'init-provider',
      defaultProvider: {
        providerId: 'default-openai',
        kind: 'openai-compatible',
        model: 'default-model',
      },
    })
    const [conversationAck] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-provider',
      conversationId: 'conversation-provider',
      workspacePath: '/tmp/workspace',
      capabilityIntent: {
        provider: {
          providerId: 'conversation-openai',
          kind: 'openai-compatible',
          model: 'conversation-model',
        },
      },
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'turn-provider',
      conversationId: 'conversation-provider',
      turnId: 'turn-provider',
      prompt: 'hello',
      providerOverride: {
        providerId: 'turn-anthropic',
        kind: 'anthropic',
        model: 'turn-model',
      },
    })

    await waitForObserved(
      seen,
      item => item.conversationId === 'conversation-provider',
    )

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-default-provider',
      conversationId: 'conversation-default-provider',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'turn-default-provider',
      conversationId: 'conversation-default-provider',
      turnId: 'turn-default-provider',
      prompt: 'hello',
    })
    await waitForObserved(
      seen,
      item => item.conversationId === 'conversation-default-provider',
    )
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'init_runtime',
      requestId: 'init-provider-next-default',
      defaultProvider: {
        providerId: 'next-default-openai',
        kind: 'openai-compatible',
        model: 'next-default-model',
      },
    })
    const [reusedDefaultConversationAck] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'reuse-default-provider',
      conversationId: 'conversation-default-provider',
      workspacePath: '/tmp/workspace',
    })

    expect(conversationAck).toMatchObject({
      payload: {
        provider: {
          providerId: 'conversation-openai',
          model: 'conversation-model',
        },
      },
    })
    expect(reusedDefaultConversationAck).toMatchObject({
      kind: 'ack',
      payload: {
        provider: {
          providerId: 'default-openai',
          kind: 'openai-compatible',
          model: 'default-model',
        },
      },
    })
    expect(seen).toEqual([
      {
        conversationId: 'conversation-provider',
        providerSelection: {
          providerId: 'turn-anthropic',
          kind: 'anthropic',
          model: 'turn-model',
        },
        conversationProvider: {
          providerId: 'conversation-openai',
          kind: 'openai-compatible',
          model: 'conversation-model',
        },
      },
      {
        conversationId: 'conversation-default-provider',
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
  })

  test('rejects explicit provider changes when reusing a conversation', async () => {
    const { router } = createRouter()

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-provider-a',
      conversationId: 'conversation-provider',
      workspacePath: '/tmp/workspace',
      provider: {
        model: 'model-a',
        kind: 'openai-compatible',
        providerId: 'provider-a',
      },
    })
    const [sameProviderAck] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-provider-same',
      conversationId: 'conversation-provider',
      workspacePath: '/tmp/workspace',
      provider: {
        providerId: 'provider-a',
        kind: 'openai-compatible',
        model: 'model-a',
      },
    })
    const [conflict] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-provider-b',
      conversationId: 'conversation-provider',
      workspacePath: '/tmp/workspace',
      provider: {
        providerId: 'provider-b',
        kind: 'openai-compatible',
        model: 'model-b',
      },
    })

    expect(sameProviderAck).toMatchObject({
      kind: 'ack',
      requestId: 'create-provider-same',
      payload: {
        provider: {
          providerId: 'provider-a',
          kind: 'openai-compatible',
          model: 'model-a',
        },
      },
    })
    expect(conflict).toMatchObject({
      kind: 'error',
      requestId: 'create-provider-b',
      conversationId: 'conversation-provider',
      error: {
        code: 'invalid_request',
        retryable: false,
        details: {
          requestedProvider: {
            providerId: 'provider-b',
            kind: 'openai-compatible',
            model: 'model-b',
          },
        },
      },
    })
  })

  test('parses provider selection through wire commands', () => {
    const create = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'create_conversation',
        requestId: 'create-provider-wire',
        conversationId: 'conversation-provider',
        workspacePath: '/tmp/workspace',
        provider: {
          providerId: 'desktop-openai',
          kind: 'openai-compatible',
          model: 'gpt-5.4',
          baseURL: 'http://127.0.0.1:8317/v1',
          authRef: { type: 'desktop', id: 'provider-secret' },
        },
      }),
    )
    const runTurn = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'run_turn',
        requestId: 'turn-provider-wire',
        conversationId: 'conversation-provider',
        turnId: 'turn-provider',
        prompt: 'hello',
        providerOverride: {
          providerId: 'turn-openai',
          kind: 'openai-compatible',
          model: 'gpt-5.4-mini',
        },
      }),
    )

    expect(create).toMatchObject({
      type: 'create_conversation',
      provider: {
        providerId: 'desktop-openai',
        kind: 'openai-compatible',
        model: 'gpt-5.4',
        baseURL: 'http://127.0.0.1:8317/v1',
        authRef: { type: 'desktop', id: 'provider-secret' },
      },
    })
    expect(runTurn).toMatchObject({
      type: 'run_turn',
      providerOverride: {
        providerId: 'turn-openai',
        kind: 'openai-compatible',
        model: 'gpt-5.4-mini',
      },
    })
    expect(() =>
      parseKernelRuntimeCommandLine(
        JSON.stringify({
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type: 'create_conversation',
          requestId: 'create-provider-invalid',
          conversationId: 'conversation-provider',
          workspacePath: '/tmp/workspace',
          provider: {
            providerId: 'desktop-openai',
            kind: 'openai-compatible',
            authRef: { type: 'plain-text' },
          },
        }),
      ),
    ).toThrow('authRef.type must be env, secret, desktop, or keychain')
    expect(() =>
      parseKernelRuntimeCommandLine(
        JSON.stringify({
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type: 'create_conversation',
          requestId: 'create-provider-invalid-headers',
          conversationId: 'conversation-provider',
          workspacePath: '/tmp/workspace',
          provider: {
            providerId: 'desktop-openai',
            kind: 'openai-compatible',
            headers: { Authorization: 1 },
          },
        }),
      ),
    ).toThrow('headers.Authorization must be a string')
  })

  test('publishes host events onto the runtime event bus', async () => {
    const { router } = createRouter()

    const [ack] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'publish_host_event',
      requestId: 'host-event-1',
      event: {
        conversationId: 'conversation-1',
        type: 'host.focus_changed',
        replayable: true,
        payload: { focused: true },
      },
    })
    const replay = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-host-events',
      conversationId: 'conversation-1',
    })

    expect(ack).toMatchObject({
      kind: 'ack',
      requestId: 'host-event-1',
      conversationId: 'conversation-1',
      payload: {
        published: true,
      },
    })
    expect(
      replay
        .filter(envelope => envelope.kind === 'event')
        .map(envelope => envelope.payload)
        .map(payload => (payload as { type?: string }).type),
    ).toEqual(['host.focus_changed'])
  })
})
