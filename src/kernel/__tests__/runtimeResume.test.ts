import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import type { KernelRuntimeEnvelopeBase } from '../../runtime/contracts/events.js'
import { ConversationCoreService } from '../conversationCoreService.js'
import { RuntimeCoreService } from '../runtimeCoreService.js'
import type { KernelSessionManager, KernelTranscript } from '../sessions.js'

describe('conversation core session resume hydration', () => {
  test('hydrates resumed transcript messages and snapshots into replay state', async () => {
    const fixture = createResumeFixture()
    const core = createConversationCore({
      sessionManager: createFixtureSessionManager(fixture),
    })

    await core.conversation.resumeSession({
      transcriptSessionId: 'session-1',
      targetSessionId: 'conversation-resume-1',
    })

    const replayed = core.runtime.eventBus.replay({
      conversationId: 'conversation-resume-1',
    })

    expect(eventsOf(replayed, 'conversation.transcript_message')).toHaveLength(2)
    expect(eventsOf(replayed, 'conversation.file_history_snapshot')).toHaveLength(1)
    expect(eventsOf(replayed, 'conversation.todo_snapshot')).toHaveLength(1)
    expect(eventsOf(replayed, 'conversation.nested_memory_snapshot')).toHaveLength(1)
    expect(eventsOf(replayed, 'conversation.task_snapshot')).toHaveLength(1)
    expect(eventsOf(replayed, 'conversation.attribution_snapshot')).toHaveLength(1)
    expect(eventsOf(replayed, 'conversation.content_replacement')).toHaveLength(1)
    expect(eventsOf(replayed, 'conversation.context_collapse_commit')).toHaveLength(1)
    expect(eventsOf(replayed, 'conversation.context_collapse_snapshot')).toHaveLength(1)
    expect(eventsOf(replayed, 'conversation.transcript_message')[0]).toMatchObject({
      conversationId: 'conversation-resume-1',
      payload: {
        type: 'conversation.transcript_message',
        payload: {
          sessionId: 'session-1',
          fullPath: '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
          index: 0,
          message: fixture.messages[0],
        },
      },
    })
    expect(eventsOf(replayed, 'conversation.file_history_snapshot')[0]).toMatchObject({
      payload: {
        payload: {
          snapshot: fixture.fileHistorySnapshots![0],
        },
      },
    })
    expect(eventsOf(replayed, 'conversation.content_replacement')[0]).toMatchObject({
      payload: {
        payload: {
          replacement: fixture.contentReplacements![0],
        },
      },
    })
  })

  test('hydrates richer resume state from jsonl transcript paths', async () => {
    const workspace = await mkdtemp(
      join(tmpdir(), 'kernel-runtime-resume-path-'),
    )
    const sessionPath = join(workspace, 'session-path.jsonl')
    await mkdir(workspace, { recursive: true })
    await writeFile(sessionPath, `${createResumeJsonl(workspace).join('\n')}\n`, 'utf8')

    const core = createConversationCore()

    try {
      await core.conversation.resumeSession({
        transcriptSessionId: sessionPath,
        targetSessionId: 'conversation-resume-path-1',
      })

      const replayed = core.runtime.eventBus.replay({
        conversationId: 'conversation-resume-path-1',
      })

      expect(eventsOf(replayed, 'conversation.file_history_snapshot')).toHaveLength(1)
      expect(eventsOf(replayed, 'conversation.todo_snapshot')).toHaveLength(1)
      expect(eventsOf(replayed, 'conversation.nested_memory_snapshot')).toHaveLength(1)
      expect(eventsOf(replayed, 'conversation.attribution_snapshot')).toHaveLength(1)
      expect(eventsOf(replayed, 'conversation.content_replacement')).toHaveLength(1)
      expect(eventsOf(replayed, 'conversation.context_collapse_commit')).toHaveLength(1)
      expect(eventsOf(replayed, 'conversation.context_collapse_snapshot')).toHaveLength(1)
      expect(eventsOf(replayed, 'conversation.nested_memory_snapshot')[0]).toMatchObject({
        payload: {
          payload: {
            snapshot: {
              paths: [join(workspace, 'CLAUDE.md')],
            },
          },
        },
      })
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  test('passes resume policy params into the session manager', async () => {
    const seen: Array<{
      resumeInterruptedTurn?: boolean
      resumeSessionAt?: string
    }> = []
    const core = createConversationCore({
      sessionManager: createFixtureSessionManager(createResumeFixture(), seen),
    })

    const result = await core.conversation.resumeSession({
      transcriptSessionId: 'session-1',
      targetSessionId: 'conversation-resume-policy-1',
      resumeInterruptedTurn: true,
      resumeSessionAt: 'resume-user-1',
    })

    expect(result).toMatchObject({
      sessionId: 'conversation-resume-policy-1',
      resumeInterruptedTurn: true,
      resumeSliced: true,
    })
    expect(seen).toEqual([
      {
        resumeInterruptedTurn: true,
        resumeSessionAt: 'resume-user-1',
      },
    ])
    expect(
      eventsOf(
        core.runtime.eventBus.replay({
          conversationId: 'conversation-resume-policy-1',
        }),
        'conversation.transcript_message',
      ),
    ).toHaveLength(1)
  })
})

function createConversationCore(options: {
  sessionManager?: KernelSessionManager
} = {}): {
  runtime: RuntimeCoreService
  conversation: ConversationCoreService
} {
  const runtime = new RuntimeCoreService({
    runtimeId: 'runtime-resume-test',
    workspacePath: '/tmp/kernel-runtime-resume-test',
    eventJournalPath: false,
  })
  return {
    runtime,
    conversation: new ConversationCoreService({
      runtimeId: runtime.runtimeId,
      workspacePath: runtime.workspacePath,
      eventBus: runtime.eventBus,
      permissionBroker: runtime.permissionBroker,
      conversationJournalPath: false,
      sessionManager: options.sessionManager,
    }),
  }
}

function createFixtureSessionManager(
  transcript: KernelTranscript,
  seen?: Array<{
    resumeInterruptedTurn?: boolean
    resumeSessionAt?: string
  }>,
): KernelSessionManager {
  return {
    async list() {
      return [
        {
          sessionId: transcript.sessionId ?? 'session-1',
          cwd: '/tmp/kernel-runtime-resume-test',
          summary: 'Resume fixture',
          lastModified: 1,
        },
      ]
    },
    async resume(_sessionId, context) {
      seen?.push({
        resumeInterruptedTurn: context?.resumeInterruptedTurn,
        resumeSessionAt: context?.resumeSessionAt,
      })
      return transcript
    },
    async getTranscript() {
      return transcript
    },
  } as KernelSessionManager
}

function createResumeFixture(): KernelTranscript {
  return {
    sessionId: 'session-1',
    fullPath: '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
    messages: [
      {
        type: 'user',
        uuid: 'resume-user-1',
        message: { content: 'Hello from transcript' },
      },
      {
        type: 'assistant',
        uuid: 'resume-assistant-1',
        message: { content: 'Hi from transcript' },
      },
    ],
    turnInterruptionState: 'none',
    fileHistorySnapshots: [
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
    ],
    todoSnapshot: {
      sourceMessageUuid: 'resume-assistant-1',
      todos: [
        {
          content: 'Ship runtime resume hydration',
          status: 'in_progress',
          activeForm: 'Shipping runtime resume hydration',
        },
      ],
    },
    nestedMemorySnapshot: {
      paths: ['/tmp/kernel-runtime-resume-hydration-test/CLAUDE.md'],
    },
    taskSnapshot: {
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
        },
      ],
    },
    attributionSnapshots: [
      {
        type: 'attribution-snapshot',
        messageId: 'resume-assistant-1',
        surface: 'cli',
        fileStates: {},
        promptCount: 2,
      },
    ],
    contentReplacements: [
      {
        kind: 'tool-result',
        toolUseId: 'tool-use-1',
        replacement: '<tool result omitted>',
      },
    ],
    contextCollapseCommits: [
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
    ],
    contextCollapseSnapshot: {
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
    },
  }
}

function createResumeJsonl(workspace: string): string[] {
  return [
    JSON.stringify({
      type: 'user',
      uuid: 'resume-user-1',
      sessionId: 'session-path-1',
      cwd: workspace,
      timestamp: '2026-05-01T00:00:00.000Z',
      message: {
        content: 'Hello from transcript path',
      },
    }),
    JSON.stringify({
      type: 'file-history-snapshot',
      messageId: 'resume-user-1',
      snapshot: {
        messageId: 'resume-user-1',
        trackedFileBackups: {
          'src/example.ts': {
            backupFileName: 'resume-user-1@v1',
            version: 1,
            backupTime: '2026-05-01T00:00:00.000Z',
          },
        },
      },
    }),
    JSON.stringify({
      type: 'attribution-snapshot',
      messageId: 'resume-assistant-1',
      surface: 'cli',
      fileStates: {},
      promptCount: 2,
    }),
    JSON.stringify({
      type: 'content-replacement',
      sessionId: 'session-path-1',
      replacements: [
        {
          kind: 'tool-result',
          toolUseId: 'tool-use-1',
          replacement: '<tool result omitted>',
        },
      ],
    }),
    JSON.stringify({
      type: 'attachment',
      uuid: 'resume-nested-memory-1',
      parentUuid: 'resume-user-1',
      sessionId: 'session-path-1',
      cwd: workspace,
      timestamp: '2026-05-01T00:00:01.500Z',
      attachment: {
        type: 'nested_memory',
        path: join(workspace, 'CLAUDE.md'),
      },
    }),
    JSON.stringify({
      type: 'assistant',
      uuid: 'resume-assistant-1',
      parentUuid: 'resume-nested-memory-1',
      sessionId: 'session-path-1',
      cwd: workspace,
      timestamp: '2026-05-01T00:00:02.000Z',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'todo-use-1',
            name: 'TodoWrite',
            input: {
              todos: [
                {
                  content: 'Ship runtime resume hydration',
                  status: 'in_progress',
                  activeForm: 'Shipping runtime resume hydration',
                },
              ],
            },
          },
        ],
      },
    }),
    JSON.stringify({
      type: 'marble-origami-commit',
      sessionId: 'session-path-1',
      collapseId: '0000000000000001',
      summaryUuid: 'collapse-summary-1',
      summaryContent: '<collapsed id="0000000000000001">summary</collapsed>',
      summary: 'summary',
      firstArchivedUuid: 'resume-user-1',
      lastArchivedUuid: 'resume-assistant-1',
    }),
    JSON.stringify({
      type: 'marble-origami-snapshot',
      sessionId: 'session-path-1',
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
    }),
  ]
}

function eventsOf(
  envelopes: readonly KernelRuntimeEnvelopeBase[],
  type: string,
): KernelRuntimeEnvelopeBase[] {
  return envelopes.filter(envelope => {
    const payload = envelope.payload
    return (
      payload !== null &&
      typeof payload === 'object' &&
      'type' in payload &&
      payload.type === type
    )
  })
}
