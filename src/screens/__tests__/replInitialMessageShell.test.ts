import { describe, expect, mock, test } from 'bun:test'

import { runReplInitialMessageShell } from '../replInitialMessageShell.js'

describe('replInitialMessageShell', () => {
  test('clears context first and routes plain string prompts through submit', async () => {
    const initialMessage = {
      message: {
        uuid: 'user-1',
        message: { content: 'implement this plan' },
      },
      clearContext: true,
      mode: 'acceptEdits',
    } as any
    let state = {
      initialMessage,
      toolPermissionContext: {
        mode: 'default',
        prePlanMode: undefined,
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
        additionalWorkingDirectories: new Map(),
      },
    } as any
    const clearContextForInitialMessage = mock(
      async (_initialMessage: unknown) => {},
    )
    const submitInitialPrompt = mock((_content: string) => {})

    await runReplInitialMessageShell({
      initialMessage,
      clearContextForInitialMessage,
      setAppState: updater => {
        state = updater(state)
      },
      shouldRestrictAutoPermissions: false,
      createFileHistorySnapshot: mock((_messageUuid: string) => {}),
      awaitPendingHooks: mock(async () => {}),
      submitInitialPrompt,
      createAbortController: () => new AbortController(),
      setAbortController: mock((_controller: AbortController | null) => {}),
      dispatchInitialMessage: mock(
        (_initialMessage: unknown, _abortController: AbortController) => {},
      ),
      scheduleProcessingReset: mock(() => {}),
    })

    expect(clearContextForInitialMessage).toHaveBeenCalledTimes(1)
    expect(submitInitialPrompt).toHaveBeenCalledWith('implement this plan')
    expect(state.initialMessage).toBeNull()
    expect(state.toolPermissionContext.mode).toBe('acceptEdits')
  })

  test('routes plan messages through direct query with a fresh abort controller', async () => {
    const initialMessage = {
      message: {
        uuid: 'user-2',
        planContent: 'step 1',
        message: { content: 'implement this plan' },
      },
    } as any
    const abortController = new AbortController()
    const setAbortController = mock(
      (_controller: AbortController | null) => {},
    )
    const dispatchInitialMessage = mock(
      (_initialMessage: unknown, _abortController: AbortController) => {},
    )

    await runReplInitialMessageShell({
      initialMessage,
      clearContextForInitialMessage: mock(async (_initialMessage: unknown) => {}),
      setAppState: updater => {
        void updater({
          initialMessage,
          toolPermissionContext: {
            mode: 'default',
            prePlanMode: undefined,
            alwaysAllowRules: {},
            alwaysDenyRules: {},
            alwaysAskRules: {},
            additionalWorkingDirectories: new Map(),
          },
        } as any)
      },
      shouldRestrictAutoPermissions: false,
      createFileHistorySnapshot: mock((_messageUuid: string) => {}),
      awaitPendingHooks: mock(async () => {}),
      submitInitialPrompt: mock((_content: string) => {}),
      createAbortController: () => abortController,
      setAbortController,
      dispatchInitialMessage,
      scheduleProcessingReset: mock(() => {}),
    })

    expect(setAbortController).toHaveBeenCalledWith(abortController)
    expect(dispatchInitialMessage).toHaveBeenCalledWith(
      initialMessage.message,
      abortController,
    )
  })

  test('keeps auto mode explicit when dangerous permissions are stripped', async () => {
    const initialMessage = {
      message: {
        uuid: 'user-3',
        message: { content: 'auto mode prompt' },
      },
      mode: 'auto',
    } as any
    let state = {
      initialMessage,
      toolPermissionContext: {
        mode: 'default',
        prePlanMode: undefined,
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
        additionalWorkingDirectories: new Map(),
      },
    } as any

    await runReplInitialMessageShell({
      initialMessage,
      clearContextForInitialMessage: mock(async (_initialMessage: unknown) => {}),
      setAppState: updater => {
        state = updater(state)
      },
      shouldRestrictAutoPermissions: true,
      createFileHistorySnapshot: mock((_messageUuid: string) => {}),
      awaitPendingHooks: mock(async () => {}),
      submitInitialPrompt: mock((_content: string) => {}),
      createAbortController: () => new AbortController(),
      setAbortController: mock((_controller: AbortController | null) => {}),
      dispatchInitialMessage: mock(
        (_initialMessage: unknown, _abortController: AbortController) => {},
      ),
      scheduleProcessingReset: mock(() => {}),
    })

    expect(state.toolPermissionContext.mode).toBe('auto')
    expect(state.initialMessage).toBeNull()
  })
})
