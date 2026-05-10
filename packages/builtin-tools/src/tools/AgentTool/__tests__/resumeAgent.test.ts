import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { resumeAgentBackground } from '../resumeAgent.js'
import * as runAgentModule from '../runAgent.js'
import * as localAgentTask from 'src/tasks/LocalAgentTask/LocalAgentTask.js'
import * as tools from 'src/tools.js'
import * as sessionStorage from 'src/utils/sessionStorage.js'

const runAgentMock = mock(
  ((_: any) =>
    (async function* () {
      return
    })()) as any,
)

const registerAsyncAgentMock = mock(
  (({ agentId }: { agentId: string }) => ({
    agentId,
    abortController: new AbortController(),
  })) as any,
)

const getAgentTranscriptMock = mock(async () => ({
  messages: [{ type: 'assistant', message: { content: [] } }],
  contentReplacements: [],
}))

const readAgentMetadataMock = mock(async () => ({
  agentType: 'general-purpose',
  description: 'resume worker',
  activeTaskExecutionContext: {
    taskListId: 'alpha-team',
    taskId: '42',
    ownedFiles: ['src/coordinator/writeGuard.ts'],
  },
}))

const runAgentSpy = spyOn(runAgentModule, 'runAgent')
const registerAsyncAgentSpy = spyOn(localAgentTask, 'registerAsyncAgent')
const assembleToolPoolSpy = spyOn(tools, 'assembleToolPool')
const getAgentTranscriptSpy = spyOn(sessionStorage, 'getAgentTranscript')
const readAgentMetadataSpy = spyOn(sessionStorage, 'readAgentMetadata')

describe('resumeAgentBackground', () => {
  afterEach(() => {
    runAgentMock.mockClear()
    registerAsyncAgentMock.mockClear()
    getAgentTranscriptMock.mockClear()
    readAgentMetadataMock.mockClear()
    runAgentSpy.mockReset()
    registerAsyncAgentSpy.mockReset()
    assembleToolPoolSpy.mockReset()
    getAgentTranscriptSpy.mockReset()
    readAgentMetadataSpy.mockReset()
    mock.restore()
  })

  test('restores active task execution context and owned files on resume', async () => {
    runAgentSpy.mockImplementation(runAgentMock)
    registerAsyncAgentSpy.mockImplementation(registerAsyncAgentMock)
    assembleToolPoolSpy.mockImplementation((() => []) as any)
    getAgentTranscriptSpy.mockImplementation(getAgentTranscriptMock as any)
    readAgentMetadataSpy.mockImplementation(readAgentMetadataMock)

    const toolUseContext = {
      options: {
        mainLoopModel: 'sonnet',
        tools: [],
        mcpClients: [],
        agentDefinitions: {
          activeAgents: [
            {
              agentType: 'general-purpose',
              permissionMode: 'default',
              model: 'sonnet',
            },
          ],
        },
      },
      getAppState: () =>
        ({
          toolPermissionContext: {
            mode: 'default',
            additionalWorkingDirectories: new Map(),
          },
          agentDefinitions: {
            activeAgents: [
              {
                agentType: 'general-purpose',
                permissionMode: 'default',
                model: 'sonnet',
              },
            ],
          },
          mcp: { tools: [] },
        }) as any,
      setAppState: () => {},
      setAppStateForTasks: () => {},
      messages: [],
      readFileState: new Map(),
      abortController: new AbortController(),
      setInProgressToolUseIDs: () => {},
      setResponseLength: () => {},
      updateFileHistoryState: () => ({} as never),
      updateAttributionState: () => ({} as never),
      agentId: 'parent-agent',
      contentReplacementState: {} as any,
    } as any

    await resumeAgentBackground({
      agentId: 'agent-1',
      prompt: 'continue',
      toolUseContext,
      canUseTool: (() => true) as any,
    })

    expect(runAgentMock).toHaveBeenCalledTimes(1)
    expect(runAgentMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        ownedFiles: ['src/coordinator/writeGuard.ts'],
        activeTaskExecutionContext: {
          taskListId: 'alpha-team',
          taskId: '42',
          ownedFiles: ['src/coordinator/writeGuard.ts'],
        },
      }),
    )
    expect(registerAsyncAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationTargetAgentId: 'parent-agent',
        activeTaskExecutionContext: {
          taskListId: 'alpha-team',
          taskId: '42',
          ownedFiles: ['src/coordinator/writeGuard.ts'],
        },
      }),
    )
  })
})
