import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

const processUserInputMock = mock(async (..._args: any[]) => ({
  messages: [],
  shouldQuery: false,
} as any))
const claimConsumableQueuedAutonomyCommandsMock = mock(async (..._args: any[]) => ({
  attachmentCommands: [],
  staleCommands: [],
  claimedRunIds: [],
  claimedCommands: [],
}) as any)
const finalizeAutonomyCommandsForTurnMock = mock(async (..._args: any[]) => [] as any)

mock.module('../utils/processUserInput/processUserInput.js', () => ({
  processUserInput: processUserInputMock,
}))

mock.module('../utils/autonomyQueueLifecycle.js', () => ({
  claimConsumableQueuedAutonomyCommands:
    claimConsumableQueuedAutonomyCommandsMock,
  finalizeAutonomyCommandsForTurn: finalizeAutonomyCommandsForTurnMock,
}))

const { QueryGuard } = await import('../utils/QueryGuard')
const { handlePromptSubmit } = await import('../utils/handlePromptSubmit')

function createQueuedBaseParams() {
  const queryGuard = new QueryGuard()
  queryGuard.reserve()

  return {
    queryGuard,
    helpers: {
      setCursorOffset: mock((_offset: number) => {}),
      clearBuffer: mock(() => {}),
      resetHistory: mock(() => {}),
    },
    onInputChange: mock((_value: string) => {}),
    setPastedContents: mock((_value: unknown) => {}),
    setToolJSX: mock((_value: unknown) => {}),
    getToolUseContext: mock(() => ({} as any)),
    messages: [],
    mainLoopModel: 'claude-sonnet-4-6',
    ideSelection: undefined,
    querySource: 'repl_main_thread' as any,
    commands: [],
    setUserInputOnProcessing: mock((_prompt?: string) => {}),
    setAbortController: mock((_abortController: AbortController | null) => {}),
    onQuery: mock(async () => true) as unknown as (
      ...args: unknown[]
    ) => Promise<boolean>,
    setAppState: mock((_updater: unknown) => {}),
  }
}

describe('handlePromptSubmit autonomy lifecycle', () => {
  beforeEach(() => {
    processUserInputMock.mockReset()
    claimConsumableQueuedAutonomyCommandsMock.mockReset()
    finalizeAutonomyCommandsForTurnMock.mockReset()
  })

  test('does not finalize queued autonomy runs that defer completion to background work', async () => {
    const params = createQueuedBaseParams()
    const queuedCommand = {
      value: '/fork ship-it',
      mode: 'prompt',
      autonomy: {
        runId: 'run-1',
        trigger: 'scheduled-task',
      },
    } as any

    claimConsumableQueuedAutonomyCommandsMock.mockResolvedValue({
      attachmentCommands: [queuedCommand],
      staleCommands: [],
      claimedRunIds: ['run-1'],
      claimedCommands: [queuedCommand],
    })
    processUserInputMock.mockResolvedValue({
      messages: [],
      shouldQuery: false,
      deferAutonomyCompletion: true,
    })

    await handlePromptSubmit({
      ...params,
      queuedCommands: [queuedCommand] as any,
    })

    expect(finalizeAutonomyCommandsForTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [],
        outcome: { type: 'completed' },
      }),
    )
    expect(finalizeAutonomyCommandsForTurnMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [queuedCommand],
      }),
    )
  })

  test('finalizes claimed autonomy runs after a completed dequeue turn', async () => {
    const params = createQueuedBaseParams()
    const queuedCommand = {
      value: 'scheduled follow-up',
      mode: 'prompt',
      autonomy: {
        runId: 'run-2',
        trigger: 'scheduled-task',
      },
    } as any

    claimConsumableQueuedAutonomyCommandsMock.mockResolvedValue({
      attachmentCommands: [queuedCommand],
      staleCommands: [],
      claimedRunIds: ['run-2'],
      claimedCommands: [queuedCommand],
    })
    processUserInputMock.mockResolvedValue({
      messages: [],
      shouldQuery: false,
    })

    await handlePromptSubmit({
      ...params,
      queuedCommands: [queuedCommand] as any,
    })

    expect(finalizeAutonomyCommandsForTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: [queuedCommand],
        outcome: { type: 'completed' },
        priority: 'later',
      }),
    )
  })
})

afterAll(() => {
  mock.restore()
})
