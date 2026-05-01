import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { createKernelRuntime } from '../index.js'

describe('kernel runtime session resume hydration', () => {
  test('hydrates resumed transcript messages and file history into conversation replay state', async () => {
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
      paths: ['/tmp/kernel-runtime-resume-hydration-test/CLAUDE.md'],
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
    const runtime = await createKernelRuntime({
      id: 'runtime-resume-hydration-test',
      workspacePath: '/tmp/kernel-runtime-resume-hydration-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      headlessExecutor: false,
      agentExecutor: false,
      sessionManager: {
        async listSessions() {
          return [
            {
              sessionId: 'session-1',
              cwd: '/tmp/kernel-runtime-resume-hydration-test',
              summary: 'Resume fixture',
              lastModified: 1,
            },
          ]
        },
        async resumeSession() {
          return {
            sessionId: 'session-1',
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
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
        async getSessionTranscript() {
          return {
            sessionId: 'session-1',
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
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
      },
    })

    try {
      await runtime.start()
      const conversation = await runtime.sessions.resume('session-1', {
        conversationId: 'conversation-resume-1',
      })
      const replayed = await conversation.replayEvents()
      const transcriptReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.transcript_message'
        )
      })
      const fileHistoryReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.file_history_snapshot'
        )
      })
      const todoReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.todo_snapshot'
        )
      })
      const nestedMemoryReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.nested_memory_snapshot'
        )
      })
      const taskReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.task_snapshot'
        )
      })
      const attributionReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.attribution_snapshot'
        )
      })
      const contentReplacementReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.content_replacement'
        )
      })
      const contextCollapseCommitReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.context_collapse_commit'
        )
      })
      const contextCollapseSnapshotReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.context_collapse_snapshot'
        )
      })

      expect(transcriptReplay).toHaveLength(2)
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
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
            index: 0,
            message: transcriptMessages[0],
          },
        },
      })
      expect(transcriptReplay[1]).toMatchObject({
        conversationId: 'conversation-resume-1',
        payload: {
          type: 'conversation.transcript_message',
          payload: {
            sessionId: 'session-1',
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
            index: 1,
            message: transcriptMessages[1],
          },
        },
      })
      expect(fileHistoryReplay[0]).toMatchObject({
        conversationId: 'conversation-resume-1',
        payload: {
          type: 'conversation.file_history_snapshot',
          payload: {
            sessionId: 'session-1',
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
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
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
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
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
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
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
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
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
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
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
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
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
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
            fullPath:
              '/tmp/kernel-runtime-resume-hydration-test/session-1.jsonl',
            snapshot: contextCollapseSnapshot,
          },
        },
      })
    } finally {
      await runtime.dispose()
    }
  })

  test('hydrates richer runtime-owned resume state from transcript paths through the default session manager', async () => {
    const workspace = await mkdtemp(
      join(tmpdir(), 'kernel-runtime-resume-path-'),
    )
    const sessionPath = join(workspace, 'session-path.jsonl')
    const configDir = join(workspace, 'config')
    const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = configDir
    const taskListId = 'alpha-team'
    await mkdir(join(configDir, 'tasks', taskListId), { recursive: true })
    await writeFile(
      join(configDir, 'tasks', taskListId, '1.json'),
      JSON.stringify(
        {
          id: '1',
          subject: 'Ship runtime resume hydration',
          description: 'Resume file-backed task state',
          status: 'in_progress',
          owner: 'lead-agent',
          blocks: [],
          blockedBy: [],
          metadata: {
            ownedFiles: ['src/example.ts'],
            taskExecution: {
              linkedBackgroundTaskId: 'background-task-1',
              linkedAgentId: 'lead-agent',
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    )
    const transcriptLines = [
      JSON.stringify({
        type: 'user',
        uuid: 'resume-user-1',
        sessionId: 'session-path-1',
        teamName: 'Alpha Team',
        cwd: workspace,
        userType: 'external',
        timestamp: '2026-05-01T00:00:00.000Z',
        version: '1.0.0',
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
          timestamp: '2026-05-01T00:00:01.000Z',
        },
        isSnapshotUpdate: false,
      }),
      JSON.stringify({
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
        teamName: 'Alpha Team',
        cwd: workspace,
        userType: 'external',
        timestamp: '2026-05-01T00:00:01.500Z',
        version: '1.0.0',
        attachment: {
          type: 'nested_memory',
          path: join(workspace, 'CLAUDE.md'),
          displayPath: 'CLAUDE.md',
          content: {
            path: join(workspace, 'CLAUDE.md'),
            content: 'Project instructions',
            lineCount: 1,
          },
        },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'resume-assistant-1',
        parentUuid: 'resume-nested-memory-1',
        sessionId: 'session-path-1',
        teamName: 'Alpha Team',
        cwd: workspace,
        userType: 'external',
        timestamp: '2026-05-01T00:00:02.000Z',
        version: '1.0.0',
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
            {
              type: 'text',
              text: 'Hi from transcript path',
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'marble-origami-commit',
        sessionId: 'session-path-1',
        collapseId: '0000000000000001',
        summaryUuid: 'collapse-summary-1',
        summaryContent:
          '<collapsed id="0000000000000001">summary</collapsed>',
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
    await writeFile(sessionPath, `${transcriptLines.join('\n')}\n`, 'utf8')

    const runtime = await createKernelRuntime({
      id: 'runtime-resume-path-test',
      workspacePath: workspace,
      eventJournalPath: false,
      conversationJournalPath: false,
      headlessExecutor: false,
      agentExecutor: false,
    })

    try {
      await runtime.start()
      const conversation = await runtime.sessions.resume(sessionPath, {
        conversationId: 'conversation-resume-path-1',
      })
      const replayed = await conversation.replayEvents()
      const fileHistoryReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.file_history_snapshot'
        )
      })
      const todoReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.todo_snapshot'
        )
      })
      const nestedMemoryReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.nested_memory_snapshot'
        )
      })
      const taskReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.task_snapshot'
        )
      })
      const attributionReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.attribution_snapshot'
        )
      })
      const contentReplacementReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.content_replacement'
        )
      })
      const contextCollapseCommitReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.context_collapse_commit'
        )
      })
      const contextCollapseSnapshotReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.context_collapse_snapshot'
        )
      })

      expect(fileHistoryReplay).toHaveLength(1)
      expect(todoReplay).toHaveLength(1)
      expect(nestedMemoryReplay).toHaveLength(1)
      expect(taskReplay).toHaveLength(1)
      expect(attributionReplay).toHaveLength(1)
      expect(contentReplacementReplay).toHaveLength(1)
      expect(contextCollapseCommitReplay).toHaveLength(1)
      expect(contextCollapseSnapshotReplay).toHaveLength(1)
      expect(fileHistoryReplay[0]).toMatchObject({
        conversationId: 'conversation-resume-path-1',
        payload: {
          type: 'conversation.file_history_snapshot',
          payload: {
            sessionId: 'session-path-1',
            fullPath: sessionPath,
            index: 0,
            snapshot: {
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
          },
        },
      })
      expect(todoReplay[0]).toMatchObject({
        conversationId: 'conversation-resume-path-1',
        payload: {
          type: 'conversation.todo_snapshot',
          payload: {
            sessionId: 'session-path-1',
            fullPath: sessionPath,
            snapshot: {
              sourceMessageUuid: 'resume-assistant-1',
              todos: [
                {
                  content: 'Ship runtime resume hydration',
                  status: 'in_progress',
                  activeForm: 'Shipping runtime resume hydration',
                },
              ],
            },
          },
        },
      })
      expect(nestedMemoryReplay[0]).toMatchObject({
        conversationId: 'conversation-resume-path-1',
        payload: {
          type: 'conversation.nested_memory_snapshot',
          payload: {
            sessionId: 'session-path-1',
            fullPath: sessionPath,
            snapshot: {
              paths: [join(workspace, 'CLAUDE.md')],
            },
          },
        },
      })
      expect(taskReplay[0]).toMatchObject({
        conversationId: 'conversation-resume-path-1',
        payload: {
          type: 'conversation.task_snapshot',
          payload: {
            sessionId: 'session-path-1',
            fullPath: sessionPath,
            snapshot: {
              taskListId: 'alpha-team',
              tasks: [
                {
                  id: '1',
                  subject: 'Ship runtime resume hydration',
                  description: 'Resume file-backed task state',
                  status: 'in_progress',
                  taskListId: 'alpha-team',
                  owner: 'lead-agent',
                  blocks: [],
                  blockedBy: [],
                  ownedFiles: ['src/example.ts'],
                  execution: {
                    linkedBackgroundTaskId: 'background-task-1',
                    linkedAgentId: 'lead-agent',
                  },
                },
              ],
            },
          },
        },
      })
      expect(attributionReplay[0]).toMatchObject({
        conversationId: 'conversation-resume-path-1',
        payload: {
          type: 'conversation.attribution_snapshot',
          payload: {
            sessionId: 'session-path-1',
            fullPath: sessionPath,
            index: 0,
            snapshot: {
              type: 'attribution-snapshot',
              messageId: 'resume-assistant-1',
              surface: 'cli',
              fileStates: {
                'src/example.ts': {
                  lineAttribution: [
                    { start: 0, end: 4, source: 'claude' },
                  ],
                  mtime: 1714521600000,
                },
              },
              promptCount: 2,
            },
          },
        },
      })
      expect(contentReplacementReplay[0]).toMatchObject({
        conversationId: 'conversation-resume-path-1',
        payload: {
          type: 'conversation.content_replacement',
          payload: {
            sessionId: 'session-path-1',
            fullPath: sessionPath,
            index: 0,
            replacement: {
              kind: 'tool-result',
              toolUseId: 'tool-use-1',
              replacement: '<tool result omitted>',
            },
          },
        },
      })
      expect(contextCollapseCommitReplay[0]).toMatchObject({
        conversationId: 'conversation-resume-path-1',
        payload: {
          type: 'conversation.context_collapse_commit',
          payload: {
            sessionId: 'session-path-1',
            fullPath: sessionPath,
            index: 0,
            commit: {
              type: 'marble-origami-commit',
              sessionId: 'session-path-1',
              collapseId: '0000000000000001',
              summaryUuid: 'collapse-summary-1',
              summaryContent:
                '<collapsed id="0000000000000001">summary</collapsed>',
              summary: 'summary',
              firstArchivedUuid: 'resume-user-1',
              lastArchivedUuid: 'resume-assistant-1',
            },
          },
        },
      })
      expect(contextCollapseSnapshotReplay[0]).toMatchObject({
        conversationId: 'conversation-resume-path-1',
        payload: {
          type: 'conversation.context_collapse_snapshot',
          payload: {
            sessionId: 'session-path-1',
            fullPath: sessionPath,
            snapshot: {
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
            },
          },
        },
      })
    } finally {
      if (previousConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousConfigDir
      }
      await runtime.dispose()
      await rm(workspace, { recursive: true, force: true })
    }
  })
  test('forwards resumeInterruptedTurn through the public runtime session facade', async () => {
    const seen: Array<boolean | undefined> = []
    const runtime = await createKernelRuntime({
      id: 'runtime-resume-policy-test',
      workspacePath: '/tmp/kernel-runtime-resume-policy-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      sessionManager: {
        listSessions: async () => [
          {
            sessionId: 'session-1',
            cwd: '/tmp/kernel-runtime-resume-policy-test',
            summary: 'resume fixture',
            lastModified: 1,
          },
        ],
        resumeSession: async (_sessionId, context) => {
          seen.push(context?.resumeInterruptedTurn)
          return {
            sessionId: 'session-1',
            fullPath: '/tmp/kernel-runtime-resume-policy-test/session-1.jsonl',
            messages: [],
            turnInterruptionState: 'interrupted_prompt' as const,
          }
        },
        getSessionTranscript: async () => ({
          sessionId: 'session-1',
          fullPath: '/tmp/kernel-runtime-resume-policy-test/session-1.jsonl',
          messages: [],
          turnInterruptionState: 'interrupted_prompt' as const,
        }),
      },
    })

    try {
      await runtime.start()
      const conversation = await runtime.sessions.resume('session-1', {
        resumeInterruptedTurn: true,
      })
      expect(conversation.sessionId).toBe('session-1')
      expect(seen).toEqual([true])
    } finally {
      await runtime.dispose()
    }
  })

  test('forwards resumeSessionAt through the public runtime session facade and slices replayed transcript', async () => {
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
    const seen: Array<string | undefined> = []
    const runtime = await createKernelRuntime({
      id: 'runtime-resume-session-at-test',
      workspacePath: '/tmp/kernel-runtime-resume-session-at-test',
      eventJournalPath: false,
      conversationJournalPath: false,
      sessionManager: {
        listSessions: async () => [
          {
            sessionId: 'session-1',
            cwd: '/tmp/kernel-runtime-resume-session-at-test',
            summary: 'resume fixture',
            lastModified: 1,
          },
        ],
        resumeSession: async (_sessionId, context) => {
          seen.push(context?.resumeSessionAt)
          return {
            sessionId: 'session-1',
            fullPath:
              '/tmp/kernel-runtime-resume-session-at-test/session-1.jsonl',
            messages: transcriptMessages,
            turnInterruptionState: 'none' as const,
          }
        },
        getSessionTranscript: async () => ({
          sessionId: 'session-1',
          fullPath:
            '/tmp/kernel-runtime-resume-session-at-test/session-1.jsonl',
          messages: transcriptMessages,
          turnInterruptionState: 'none' as const,
        }),
      },
    })

    try {
      await runtime.start()
      const conversation = await runtime.sessions.resume('session-1', {
        resumeSessionAt: 'resume-user-1',
      })
      const replayed = await conversation.replayEvents()
      const transcriptReplay = replayed.filter(envelope => {
        return (
          (envelope.payload as { type?: string } | undefined)?.type ===
          'conversation.transcript_message'
        )
      })

      expect(seen).toEqual(['resume-user-1'])
      expect(transcriptReplay).toHaveLength(1)
      expect(transcriptReplay[0]).toMatchObject({
        payload: {
          type: 'conversation.transcript_message',
          payload: {
            index: 0,
            message: transcriptMessages[0],
          },
        },
      })
    } finally {
      await runtime.dispose()
    }
  })
})
