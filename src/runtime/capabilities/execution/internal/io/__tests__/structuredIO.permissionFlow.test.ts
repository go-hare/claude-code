import { beforeEach, describe, expect, mock, test } from 'bun:test'

import type { Tool, ToolUseContext } from 'src/Tool.js'
import type {
  ProtocolControlRequest,
  ProtocolControlResponse,
} from 'src/types/protocol/controlTypes.js'
import type { AssistantMessage } from 'src/types/message.js'
import type { PermissionDecision } from 'src/utils/permissions/PermissionResult.js'

const stdoutWrites: string[] = []
const notifyCommandLifecycle = mock((_uuid: string, _state: string) => {})
const notifySessionStateChanged = mock((_state: string) => {})

const actualProcessUtils = await import('src/utils/process.js')

mock.module('src/utils/process.js', () => ({
  ...actualProcessUtils,
  writeToStdout: mock((data: string) => {
    stdoutWrites.push(data)
  }),
}))

mock.module('src/utils/debug.js', () => ({
  logForDebugging: mock(() => {}),
  logAntError: mock(() => {}),
  isDebugMode: mock(() => false),
  isDebugToStdErr: mock(() => false),
  getMinDebugLogLevel: mock(() => 'debug'),
  getDebugFilter: mock(() => null),
  getDebugFilePath: mock(() => null),
  getHasFormattedOutput: mock(() => false),
  setHasFormattedOutput: mock(() => {}),
  enableDebugLogging: mock(() => false),
  getDebugLogPath: mock(() => '/tmp/debug.log'),
  flushDebugLogs: mock(async () => {}),
}))

const actualHooks = await import('src/utils/hooks.js')

mock.module('src/utils/hooks.js', () => ({
  ...actualHooks,
  async *executePermissionRequestHooks() {},
}))

mock.module('src/utils/diagLogs.js', () => ({
  logForDiagnosticsNoPII: mock(() => {}),
}))

mock.module('src/utils/commandLifecycle.js', () => ({
  notifyCommandLifecycle,
}))

mock.module('src/utils/sessionState.js', () => ({
  notifySessionStateChanged,
}))

const { StructuredIO, SANDBOX_NETWORK_ACCESS_TOOL_NAME } = await import(
  '../structuredIO.js'
)
const { RuntimePermissionBroker } = await import(
  'src/runtime/capabilities/permissions/RuntimePermissionBroker.js'
)
const { Stream } = await import('src/utils/stream.js')
const { getEmptyToolPermissionContext } = await import('src/Tool.js')

function createTool(): Tool {
  return {
    name: 'Bash',
    userFacingName: () => 'Bash',
    isReadOnly: () => false,
    isDestructive: () => false,
  } as unknown as Tool
}

function createContext(): ToolUseContext {
  let appState = {
    toolPermissionContext: getEmptyToolPermissionContext(),
  } as any
  return {
    abortController: new AbortController(),
    getAppState: () => appState,
    setAppState: (updater: (prev: any) => any) => {
      appState = updater(appState)
    },
  } as unknown as ToolUseContext
}

function createAssistantMessage(): AssistantMessage {
  return {} as AssistantMessage
}

function createAskDecision(): PermissionDecision {
  return {
    behavior: 'ask',
    message: 'Need approval',
  }
}

function createSuccessResponse(
  requestId: string,
  response: Record<string, unknown>,
): ProtocolControlResponse {
  return {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response,
    },
  }
}

function parseStdoutWrites(): Array<Record<string, unknown>> {
  return stdoutWrites.map(
    line => JSON.parse(line.trim()) as Record<string, unknown>,
  )
}

function createHarness() {
  const input = new Stream<string>()
  const io = new StructuredIO(input)
  const drain = (async () => {
    for await (const _message of io.structuredInput) {
    }
  })()

  return {
    input,
    io,
    async close() {
      input.done()
      await drain
    },
  }
}

async function getPendingControlRequest(
  io: InstanceType<typeof StructuredIO>,
): Promise<ProtocolControlRequest> {
  const next = await io.outbound.next()
  if (next.done) {
    throw new Error('Expected pending control_request')
  }
  return next.value as ProtocolControlRequest
}

function pushProtocolStdinMessage(
  input: { enqueue(value: string): void },
  message: ProtocolControlResponse,
): void {
  input.enqueue(`${JSON.stringify(message)}\n`)
}

describe('StructuredIO permission flow', () => {
  beforeEach(() => {
    stdoutWrites.length = 0
    notifyCommandLifecycle.mockClear()
    notifySessionStateChanged.mockClear()
  })

  test('maps stdin allow control_response back to an allow PermissionDecision', async () => {
    const { input, io, close } = createHarness()
    const context = createContext()
    const toolInput = { command: 'pwd' }
    const toolUseID = 'tool-use-allow'
    const canUseTool = io.createCanUseTool()

    const permissionPromise = canUseTool(
      createTool(),
      toolInput,
      context,
      createAssistantMessage(),
      toolUseID,
      createAskDecision(),
    )

    const request = await getPendingControlRequest(io)
    expect(request.request).toMatchObject({
      subtype: 'can_use_tool',
      tool_name: 'Bash',
      tool_use_id: toolUseID,
    })

    pushProtocolStdinMessage(
      input,
      createSuccessResponse(request.request_id, {
        behavior: 'allow',
        updatedInput: {},
        toolUseID,
        decisionClassification: 'user_temporary',
      }),
    )

    await expect(permissionPromise).resolves.toMatchObject({
      behavior: 'allow',
      updatedInput: toolInput,
      toolUseID,
      decisionClassification: 'user_temporary',
      decisionReason: {
        type: 'permissionPromptTool',
        toolResult: {
          behavior: 'allow',
          toolUseID,
          decisionClassification: 'user_temporary',
        },
      },
    })

    await close()
  })

  test('injectControlResponse resolves the same pending request and emits control_cancel_request', async () => {
    const { input, io, close } = createHarness()
    const unexpectedResponseCallback = mock(
      async (_response: ProtocolControlResponse) => {},
    )
    io.setUnexpectedResponseCallback(unexpectedResponseCallback)

    const toolUseID = 'tool-use-injected'
    const canUseTool = io.createCanUseTool()
    const permissionPromise = canUseTool(
      createTool(),
      { command: 'ls' },
      createContext(),
      createAssistantMessage(),
      toolUseID,
      createAskDecision(),
    )

    const request = await getPendingControlRequest(io)
    const injectedResponse = createSuccessResponse(request.request_id, {
      behavior: 'allow',
      updatedInput: {},
      toolUseID,
      decisionClassification: 'user_permanent',
    })

    io.injectControlResponse(injectedResponse)

    await expect(permissionPromise).resolves.toMatchObject({
      behavior: 'allow',
      toolUseID,
      decisionClassification: 'user_permanent',
    })
    expect(io.getPendingPermissionRequests()).toHaveLength(0)
    expect(parseStdoutWrites()).toEqual([
      {
        type: 'control_cancel_request',
        request_id: request.request_id,
      },
    ])

    pushProtocolStdinMessage(input, injectedResponse)
    await close()
    expect(unexpectedResponseCallback).not.toHaveBeenCalled()
  })

  test('broker decision can resolve a pending stdio permission request and cancel the host prompt', async () => {
    const { input, io, close } = createHarness()
    const permissionBroker = new RuntimePermissionBroker()
    const toolUseID = 'tool-use-broker'
    const canUseTool = io.createCanUseTool(undefined, {
      permissionBroker,
      getConversationId: () => 'conversation-1',
      getTurnId: () => 'turn-1',
    })
    const permissionPromise = canUseTool(
      createTool(),
      { command: 'whoami' },
      createContext(),
      createAssistantMessage(),
      toolUseID,
      createAskDecision(),
    )

    const request = await getPendingControlRequest(io)
    expect(request.request_id).toBeDefined()
    expect(permissionBroker.snapshot().pendingRequestIds).toContain(toolUseID)

    permissionBroker.decide({
      permissionRequestId: toolUseID,
      decision: 'allow_once',
      decidedBy: 'host',
      reason: 'approved over wire',
    })

    await expect(permissionPromise).resolves.toMatchObject({
      behavior: 'allow',
      toolUseID,
      decisionClassification: 'user_temporary',
      decisionReason: {
        type: 'permissionPromptTool',
        toolResult: {
          behavior: 'allow',
          toolUseID,
          decisionClassification: 'user_temporary',
        },
      },
    })

    const cancel = await io.outbound.next()
    expect(cancel.value).toEqual({
      type: 'control_cancel_request',
      request_id: request.request_id,
    })

    await close()
  })

  test('keeps concurrent broker-backed permission prompts isolated', async () => {
    const { input, io, close } = createHarness()
    const permissionBroker = new RuntimePermissionBroker()
    const canUseTool = io.createCanUseTool(undefined, {
      permissionBroker,
      getConversationId: () => 'conversation-1',
      getTurnId: () => 'turn-1',
    })
    const firstPromise = canUseTool(
      createTool(),
      { command: 'cat a.txt' },
      createContext(),
      createAssistantMessage(),
      'tool-use-a',
      createAskDecision(),
    )
    const secondPromise = canUseTool(
      createTool(),
      { command: 'cat b.txt' },
      createContext(),
      createAssistantMessage(),
      'tool-use-b',
      createAskDecision(),
    )

    const firstRequest = await getPendingControlRequest(io)
    const secondRequest = await getPendingControlRequest(io)
    expect(permissionBroker.snapshot().pendingRequestIds.sort()).toEqual([
      'tool-use-a',
      'tool-use-b',
    ])

    permissionBroker.decide({
      permissionRequestId: 'tool-use-a',
      decision: 'deny',
      decidedBy: 'host',
      reason: 'deny only a',
    })

    await expect(firstPromise).resolves.toMatchObject({
      behavior: 'deny',
      toolUseID: 'tool-use-a',
    })
    expect(permissionBroker.snapshot().pendingRequestIds).toEqual([
      'tool-use-b',
    ])
    expect((await io.outbound.next()).value).toEqual({
      type: 'control_cancel_request',
      request_id: firstRequest.request_id,
    })

    pushProtocolStdinMessage(
      input,
      createSuccessResponse(secondRequest.request_id, {
        behavior: 'allow',
        updatedInput: {},
        toolUseID: 'tool-use-b',
        decisionClassification: 'user_temporary',
      }),
    )

    await expect(secondPromise).resolves.toMatchObject({
      behavior: 'allow',
      toolUseID: 'tool-use-b',
    })
    expect(permissionBroker.snapshot().pendingRequestIds).toEqual([])

    await close()
  })

  test('sandbox ask reuses cached broker options and cancels the legacy host prompt when broker wins', async () => {
    const { input, io, close } = createHarness()
    const permissionBroker = new RuntimePermissionBroker()
    const askSandboxNetwork = io.createSandboxAskCallback()
    void io.createCanUseTool(undefined, {
      permissionBroker,
      getConversationId: () => 'conversation-sandbox',
      getTurnId: () => 'turn-sandbox',
    })

    const askPromise = askSandboxNetwork({
      host: 'api.example.com',
      port: 443,
    })

    const request = await getPendingControlRequest(io)
    expect(request.request).toMatchObject({
      subtype: 'can_use_tool',
      tool_name: SANDBOX_NETWORK_ACCESS_TOOL_NAME,
      input: {
        host: 'api.example.com',
      },
    })
    const permissionRequestId = (request.request as { tool_use_id?: string })
      .tool_use_id
    expect(typeof permissionRequestId).toBe('string')
    if (!permissionRequestId) {
      throw new Error('Expected sandbox permission request tool_use_id')
    }
    expect(permissionBroker.snapshot().pendingRequestIds).toContain(
      permissionRequestId,
    )

    permissionBroker.decide({
      permissionRequestId,
      decision: 'allow_once',
      decidedBy: 'host',
      reason: 'sandbox approved by broker',
    })

    await expect(askPromise).resolves.toBe(true)

    const cancel = await io.outbound.next()
    expect(cancel.value).toEqual({
      type: 'control_cancel_request',
      request_id: request.request_id,
    })

    await close()
  })

  test('returns deny for a deny response without aborting the tool context', async () => {
    const { input, io, close } = createHarness()
    const context = createContext()
    const toolUseID = 'tool-use-deny'
    const canUseTool = io.createCanUseTool()
    const permissionPromise = canUseTool(
      createTool(),
      { command: 'rm test.txt' },
      context,
      createAssistantMessage(),
      toolUseID,
      createAskDecision(),
    )

    const request = await getPendingControlRequest(io)
    pushProtocolStdinMessage(
      input,
      createSuccessResponse(request.request_id, {
        behavior: 'deny',
        message: 'Denied by host',
        toolUseID,
        decisionClassification: 'user_reject',
      }),
    )

    await expect(permissionPromise).resolves.toMatchObject({
      behavior: 'deny',
      message: 'Denied by host',
      toolUseID,
      decisionClassification: 'user_reject',
    })
    expect(context.abortController.signal.aborted).toBe(false)

    await close()
  })

  test('ignores duplicate control_response deliveries after a request is already resolved', async () => {
    const { input, io, close } = createHarness()
    const unexpectedResponseCallback = mock(
      async (_response: ProtocolControlResponse) => {},
    )
    io.setUnexpectedResponseCallback(unexpectedResponseCallback)

    const toolUseID = 'tool-use-duplicate'
    const canUseTool = io.createCanUseTool()
    const permissionPromise = canUseTool(
      createTool(),
      { command: 'cat file.txt' },
      createContext(),
      createAssistantMessage(),
      toolUseID,
      createAskDecision(),
    )

    const request = await getPendingControlRequest(io)
    const response = createSuccessResponse(request.request_id, {
      behavior: 'allow',
      updatedInput: {},
      toolUseID,
      decisionClassification: 'user_temporary',
    })

    pushProtocolStdinMessage(input, response)
    await expect(permissionPromise).resolves.toMatchObject({
      behavior: 'allow',
      toolUseID,
      decisionClassification: 'user_temporary',
    })

    pushProtocolStdinMessage(input, response)
    await close()

    expect(unexpectedResponseCallback).not.toHaveBeenCalled()
  })
})
