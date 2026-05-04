import { describe, expect, test } from 'bun:test'

import { RuntimeEventBus } from '../../../core/events/RuntimeEventBus.js'
import type { Tool, ToolUseContext } from '../../../../Tool.js'
import { getEmptyToolPermissionContext } from '../../../../Tool.js'
import type { CanUseToolFn } from '../../../../hooks/useCanUseTool.js'
import type { AssistantMessage } from '../../../../types/message.js'
import type { PermissionDecision } from '../../../../utils/permissions/PermissionResult.js'
import { RuntimePermissionBroker } from '../RuntimePermissionBroker.js'
import { wrapCanUseToolWithRuntimePermissions } from '../RuntimePermissionCanUseToolAdapter.js'

type RuntimeEventEnvelope = ReturnType<RuntimeEventBus['replay']>[number]

function createEventBus(): RuntimeEventBus {
  let messageId = 1
  return new RuntimeEventBus({
    runtimeId: 'runtime-1',
    now: () => '2026-04-26T00:00:00.000Z',
    createMessageId: () => `message-${messageId++}`,
  })
}

function createContext(): ToolUseContext {
  return {
    getAppState: () => ({
      toolPermissionContext: getEmptyToolPermissionContext(),
    }),
  } as unknown as ToolUseContext
}

function createAssistantMessage(): AssistantMessage {
  return {
    type: 'assistant',
    message: {
      id: 'message-1',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'test',
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    },
    uuid: 'assistant-1',
    timestamp: '2026-04-26T00:00:00.000Z',
  } as unknown as AssistantMessage
}

function createTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'Read',
    isMcp: false,
    isLsp: false,
    isReadOnly: () => true,
    isDestructive: () => false,
    isOpenWorld: () => false,
    ...overrides,
  } as unknown as Tool
}

function requireEventPayload(envelope: RuntimeEventEnvelope) {
  if (!envelope.payload) {
    throw new Error('Expected runtime event payload')
  }
  return envelope.payload
}

function auditPayloads(eventBus: RuntimeEventBus): unknown[] {
  return eventBus
    .replay({ conversationId: 'conversation-1' })
    .map(envelope => {
      const payload = requireEventPayload(envelope)
        .payload as Record<string, unknown>
      return {
        permissionRequestId: payload.permissionRequestId,
        toolName: payload.toolName,
        action: payload.action,
        risk: payload.risk,
        decidedBy: payload.decidedBy,
        decision: payload.decision,
        reason: payload.reason,
      }
    })
}

describe('wrapCanUseToolWithRuntimePermissions', () => {
  test('returns the legacy decision while auditing requested and resolved events', async () => {
    const eventBus = createEventBus()
    const broker = new RuntimePermissionBroker({ eventBus })
    const legacyDecision: PermissionDecision = {
      behavior: 'allow',
      decisionReason: {
        type: 'mode',
        mode: 'default',
      },
    }
    const canUseTool: CanUseToolFn = async () => legacyDecision
    const wrapped = wrapCanUseToolWithRuntimePermissions(canUseTool, {
      broker,
      getConversationId: () => 'conversation-1',
    })

    await expect(
      wrapped(
        createTool(),
        { file_path: '/tmp/file.txt' },
        createContext(),
        createAssistantMessage(),
        'tool-use-1',
      ),
    ).resolves.toBe(legacyDecision)

    expect(auditPayloads(eventBus)).toEqual([
      {
        permissionRequestId: 'tool-use-1',
        toolName: 'Read',
        action: 'tool.call',
        risk: 'low',
        decidedBy: undefined,
        decision: undefined,
        reason: undefined,
      },
      {
        permissionRequestId: 'tool-use-1',
        toolName: 'Read',
        action: 'tool.call',
        risk: 'low',
        decidedBy: 'policy',
        decision: 'allow',
        reason: 'Permission mode default',
      },
    ])
  })

  test('maps permanent host approval to allow_session', async () => {
    const eventBus = createEventBus()
    const broker = new RuntimePermissionBroker({ eventBus })
    const legacyDecision: PermissionDecision = {
      behavior: 'allow',
      decisionReason: {
        type: 'permissionPromptTool',
        permissionPromptToolName: 'stdio',
        toolResult: {
          behavior: 'allow',
          updatedInput: {},
          decisionClassification: 'user_permanent',
        },
      },
    }
    const wrapped = wrapCanUseToolWithRuntimePermissions(
      async () => legacyDecision,
      {
        broker,
        getConversationId: () => 'conversation-1',
      },
    )

    await wrapped(
      createTool({ isReadOnly: () => false }),
      { command: 'touch file' },
      createContext(),
      createAssistantMessage(),
      'tool-use-1',
    )

    expect(auditPayloads(eventBus).at(-1)).toMatchObject({
      permissionRequestId: 'tool-use-1',
      decidedBy: 'host',
      decision: 'allow_session',
    })
  })

  test('audits runtime denial when the legacy permission check throws', async () => {
    const eventBus = createEventBus()
    const broker = new RuntimePermissionBroker({ eventBus })
    const wrapped = wrapCanUseToolWithRuntimePermissions(
      async () => {
        throw new Error('permission failed')
      },
      {
        broker,
        getConversationId: () => 'conversation-1',
      },
    )

    await expect(
      wrapped(
        createTool({ isDestructive: () => true }),
        { command: 'rm -rf x' },
        createContext(),
        createAssistantMessage(),
        'tool-use-1',
      ),
    ).rejects.toThrow('permission failed')

    expect(auditPayloads(eventBus)).toEqual([
      {
        permissionRequestId: 'tool-use-1',
        toolName: 'Read',
        action: 'tool.call',
        risk: 'destructive',
        decidedBy: undefined,
        decision: undefined,
        reason: undefined,
      },
      {
        permissionRequestId: 'tool-use-1',
        toolName: 'Read',
        action: 'tool.call',
        risk: 'destructive',
        decidedBy: 'runtime',
        decision: 'deny',
        reason: 'Permission check failed: permission failed',
      },
    ])
  })
})
