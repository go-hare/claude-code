import { afterEach, describe, expect, test } from 'bun:test'
import {
  getActiveTaskCompletionReminderAttachment,
  getQueuedCommandAttachmentBatch,
  getVerifyPlanReminderAttachment,
} from '../attachments.js'
import { createAttachmentContextAssembly } from '../attachmentContextCategories.js'
import { createTask } from '../tasks.js'

const originalVerifyPlan = process.env.CLAUDE_CODE_VERIFY_PLAN

afterEach(() => {
  if (originalVerifyPlan === undefined) {
    delete process.env.CLAUDE_CODE_VERIFY_PLAN
  } else {
    process.env.CLAUDE_CODE_VERIFY_PLAN = originalVerifyPlan
  }
})

describe('getQueuedCommandAttachmentBatch', () => {
  test('keeps successful queued commands when one attachment build fails', async () => {
    const result = await getQueuedCommandAttachmentBatch([
      {
        uuid: '11111111-1111-1111-1111-111111111111' as any,
        mode: 'prompt',
        value: 'delivered prompt',
      },
      {
        uuid: '22222222-2222-2222-2222-222222222222' as any,
        mode: 'prompt',
        value: 'broken image prompt',
        pastedContents: {
          1: {
            id: 1,
            type: 'image',
            content: 'a'.repeat(8_000_000),
            mediaType: 'image/png',
          } as any,
        },
      },
    ])

    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0]).toMatchObject({
      type: 'queued_command',
      source_uuid: '11111111-1111-1111-1111-111111111111',
    })
    expect(result.attachedQueuedCommands.map(cmd => cmd.uuid)).toEqual([
      '11111111-1111-1111-1111-111111111111',
    ])
    expect(result.contextCategories.modelVisible).toEqual([
      expect.objectContaining({
        type: 'queued_command',
        category: 'model_visible',
        source: 'queued_command',
      }),
    ])
    expect(result.contextCategories.hostVisible).toEqual([
      expect.objectContaining({
        id: '11111111-1111-1111-1111-111111111111',
        type: 'queued_command.consumed',
        category: 'host_visible',
        source: 'queued_command',
      }),
      expect.objectContaining({
        type: 'queued_command.batch',
        category: 'host_visible',
        source: 'queued_command',
      }),
    ])
    expect(result.contextCategories.operatorDebug[0]).toMatchObject({
      type: 'context_assembly.summary',
      category: 'operator_debug',
      metadata: {
        attachmentCount: 1,
        attachedQueuedCommandCount: 1,
      },
    })
  })
})

describe('createAttachmentContextAssembly', () => {
  test('separates model-visible context from host-visible metadata', () => {
    const assembly = createAttachmentContextAssembly(
      [
        {
          type: 'relevant_memories',
          memories: [
            {
              path: '/tmp/notes.md',
              content: 'private model text',
              mtimeMs: 1,
            },
          ],
        },
        {
          type: 'skill_discovery',
          skills: [{ name: 'debugger', description: 'Inspect failures' }],
          signal: { kind: 'turn_zero' } as any,
          source: 'native',
        },
        {
          type: 'task_status',
          taskId: 'task-1',
          taskType: 'local_agent',
          status: 'running',
          description: 'Review the patch',
          deltaSummary: null,
        },
      ] as any,
      [],
    )

    expect(assembly.modelVisible.map(entry => entry.source)).toEqual([
      'memory',
      'skill',
      'task',
    ])
    expect(assembly.hostVisible).toEqual([
      expect.objectContaining({
        type: 'memory.relevant_memories',
        source: 'memory',
        metadata: expect.objectContaining({
          memoryCount: 1,
          paths: ['/tmp/notes.md'],
        }),
      }),
      expect.objectContaining({
        type: 'skill.skill_discovery',
        source: 'skill',
        metadata: expect.objectContaining({
          skillCount: 1,
          skillNames: ['debugger'],
        }),
      }),
      expect.objectContaining({
        type: 'task.task_status',
        source: 'task',
        metadata: expect.objectContaining({
          taskId: 'task-1',
          status: 'running',
        }),
      }),
    ])
    expect(assembly.operatorDebug[0]).toMatchObject({
      type: 'context_assembly.summary',
      metadata: {
        countsBySource: {
          memory: 1,
          skill: 1,
          task: 1,
        },
      },
    })
  })

  test('does not mark host/debug-only attachments as model-visible', () => {
    const assembly = createAttachmentContextAssembly(
      [
        {
          type: 'dynamic_skill',
          skillDir: '/tmp/skills',
          skillNames: ['debugger'],
          displayPath: 'skills/debugger',
        },
        {
          type: 'command_permissions',
          allowedTools: ['Bash'],
          model: 'test-model',
        },
        {
          type: 'structured_output',
          data: { status: 'ok' },
        },
        {
          type: 'hook_success',
          hookName: 'PostToolUse',
          hookEvent: 'PostToolUse',
          toolUseID: 'toolu_1',
          content: 'visible only in hook UI',
        },
        {
          type: 'hook_additional_context',
          hookName: 'UserPromptSubmit',
          hookEvent: 'UserPromptSubmit',
          toolUseID: 'toolu_2',
          content: [],
        },
        {
          type: 'bagel_console',
          errorCount: 1,
          warningCount: 0,
          sample: 'debug-only console sample',
        },
      ] as any,
      [],
    )

    expect(assembly.modelVisible.map(entry => entry.type)).toEqual([])
    expect(assembly.hostVisible).toEqual([
      expect.objectContaining({
        type: 'skill.dynamic_skill',
        category: 'host_visible',
        source: 'skill',
      }),
      expect.objectContaining({
        type: 'tool.command_permissions',
        category: 'host_visible',
        source: 'tool',
        metadata: expect.objectContaining({
          allowedTools: ['Bash'],
          model: 'test-model',
        }),
      }),
    ])
    expect(assembly.operatorDebug).toEqual([
      expect.objectContaining({
        type: 'context_assembly.summary',
        category: 'operator_debug',
      }),
      expect.objectContaining({
        type: 'bagel_console',
        category: 'operator_debug',
        source: 'operator',
        metadata: { attachmentType: 'bagel_console' },
      }),
    ])
    expect(assembly.operatorDebug.every(entry => entry.payload === undefined)).toBe(true)
  })

  test('keeps model-visible operator nudges separate from operator metadata', () => {
    const assembly = createAttachmentContextAssembly(
      [
        {
          type: 'token_usage',
          used: 10,
          total: 100,
          remaining: 90,
        },
        {
          type: 'diagnostics',
          files: [{ uri: 'file:///tmp/app.ts', diagnostics: [] }],
          isNew: true,
        },
      ] as any,
      [],
    )

    expect(assembly.modelVisible).toEqual([
      expect.objectContaining({
        type: 'token_usage',
        category: 'model_visible',
        source: 'operator',
      }),
      expect.objectContaining({
        type: 'diagnostics',
        category: 'model_visible',
        source: 'operator',
      }),
    ])
    expect(assembly.operatorDebug.map(entry => entry.type)).toEqual([
      'context_assembly.summary',
      'token_usage',
      'diagnostics',
    ])
    expect(assembly.operatorDebug.every(entry => entry.payload === undefined)).toBe(true)
  })
})

describe('getVerifyPlanReminderAttachment', () => {
  const reminderMessages = [
    {
      type: 'attachment',
      attachment: { type: 'plan_mode_exit' },
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      type: 'user',
      uuid: `user-${index}`,
      message: { role: 'user', content: `turn ${index}` },
    })),
  ] as any

  test('keeps reminding while background verification is pending', async () => {
    process.env.CLAUDE_CODE_VERIFY_PLAN = 'true'

    const attachments = await getVerifyPlanReminderAttachment(
      reminderMessages,
      {
        getAppState: () => ({
          pendingPlanVerification: {
            plan: 'Ship the feature',
            verificationStarted: true,
            verificationCompleted: false,
          },
        }),
      } as any,
    )

    expect(attachments).toEqual([
      { type: 'verify_plan_reminder', verificationStarted: true },
    ])
  })

  test('does not remind after verification completes', async () => {
    process.env.CLAUDE_CODE_VERIFY_PLAN = 'true'

    const attachments = await getVerifyPlanReminderAttachment(
      reminderMessages,
      {
        getAppState: () => ({
          pendingPlanVerification: {
            plan: 'Ship the feature',
            verificationStarted: true,
            verificationCompleted: true,
          },
        }),
      } as any,
    )

    expect(attachments).toEqual([])
  })
})

describe('getActiveTaskCompletionReminderAttachment', () => {
  test('reminds when a foreground task has follow-up tool activity after activation', async () => {
    const taskListId = `active-task-reminder-${Date.now()}`
    const taskId = await createTask(taskListId, {
      subject: 'Review bug fixes',
      description: 'Inspect the diff and decide whether the fixes are done',
      status: 'in_progress',
      owner: undefined,
      blocks: [],
      blockedBy: [],
    })

    const attachments = await getActiveTaskCompletionReminderAttachment(
      [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'task-update',
                name: 'TaskUpdate',
                input: { taskId, status: 'in_progress' },
              },
            ],
          },
        },
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'bash-review',
                name: 'Bash',
                input: { command: 'git diff -- src/runtime/core/state.ts' },
              },
            ],
          },
        },
      ] as any,
      {
        agentId: undefined,
        activeTaskExecutionContext: { taskListId, taskId },
        options: { tools: [{ name: 'TaskUpdate' }] },
      } as any,
    )

    expect(attachments).toEqual([
      {
        type: 'active_task_completion_reminder',
        taskId,
        subject: 'Review bug fixes',
      },
    ])
  })

  test('does not remind before any follow-up work happens', async () => {
    const taskListId = `active-task-no-reminder-${Date.now()}`
    const taskId = await createTask(taskListId, {
      subject: 'Review bug fixes',
      description: 'Inspect the diff and decide whether the fixes are done',
      status: 'in_progress',
      owner: undefined,
      blocks: [],
      blockedBy: [],
    })

    const attachments = await getActiveTaskCompletionReminderAttachment(
      [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'task-update',
                name: 'TaskUpdate',
                input: { taskId, status: 'in_progress' },
              },
            ],
          },
        },
      ] as any,
      {
        agentId: undefined,
        activeTaskExecutionContext: { taskListId, taskId },
        options: { tools: [{ name: 'TaskUpdate' }] },
      } as any,
    )

    expect(attachments).toEqual([])
  })
})
