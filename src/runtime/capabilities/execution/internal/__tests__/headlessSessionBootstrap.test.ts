import { describe, expect, mock, test } from 'bun:test'

import { createHeadlessSessionBootstrap } from '../headlessSessionBootstrap.js'

describe('createHeadlessSessionBootstrap', () => {
  test('applies external metadata through app-state and prompt-state seams', () => {
    const switchSession = mock(() => {})
    const patchPromptState = mock(() => {})
    const setAppState = mock((_updater: unknown) => {})
    const bootstrap = createHeadlessSessionBootstrap(
      {
        getSessionIdentity: () => ({ sessionId: 'session-1', cwd: null }),
        patchPromptState,
        switchSession,
        isSessionPersistenceDisabled: () => false,
      } as any,
      {
        resetSessionFilePointer: async () => {},
        resetSessionMetadataForResume: () => {},
        restoreSessionMetadata: () => {},
        restoreSessionStateFromLog: () => {},
      },
    )

    bootstrap.applyExternalMetadata(
      {
        model: 'claude-sonnet-4-6',
      } as any,
      setAppState as any,
    )

    expect(setAppState).toHaveBeenCalledTimes(1)
    expect(patchPromptState).toHaveBeenCalledWith({
      mainLoopModelOverride: 'claude-sonnet-4-6',
    })
    expect(switchSession).not.toHaveBeenCalled()
  })

  test('adopts loaded conversations through bootstrap/session-storage seams', async () => {
    const switchSession = mock(() => {})
    const patchPromptState = mock(() => {})
    const resetSessionFilePointer = mock(async () => {})
    const resetSessionMetadataForResume = mock(() => {})
    const restoreSessionMetadata = mock(() => {})
    const restoreSessionStateFromLog = mock(() => {})

    const bootstrap = createHeadlessSessionBootstrap(
      {
        getSessionIdentity: () => ({ sessionId: 'session-1', cwd: null }),
        patchPromptState,
        switchSession,
        isSessionPersistenceDisabled: () => false,
      } as any,
      {
        resetSessionFilePointer,
        resetSessionMetadataForResume,
        restoreSessionMetadata,
        restoreSessionStateFromLog,
      },
    )

    await bootstrap.adoptLoadedConversation(
      {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        fullPath: '/tmp/project/.claude/session.jsonl',
        customTitle: 'saved-title',
        worktreeSession: { worktreePath: '/tmp/worktree' } as any,
      },
      {
        forkSession: false,
        persistSession: true,
      },
    )

    expect(switchSession).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      '/tmp/project/.claude',
    )
    expect(resetSessionFilePointer).toHaveBeenCalledTimes(1)
    expect(resetSessionMetadataForResume).toHaveBeenCalledTimes(1)
    expect(restoreSessionMetadata).toHaveBeenCalledWith({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      fullPath: '/tmp/project/.claude/session.jsonl',
      customTitle: 'saved-title',
      worktreeSession: { worktreePath: '/tmp/worktree' },
    })
    expect(restoreSessionStateFromLog).not.toHaveBeenCalled()
  })

  test('strips worktree ownership when adopting a forked conversation', async () => {
    const restoreSessionMetadata = mock(() => {})
    const restoreSessionStateFromLog = mock(() => {})

    const bootstrap = createHeadlessSessionBootstrap(
      {
        getSessionIdentity: () => ({ sessionId: 'session-1', cwd: null }),
        patchPromptState: () => {},
        switchSession: () => {},
        isSessionPersistenceDisabled: () => false,
      } as any,
      {
        resetSessionFilePointer: async () => {},
        resetSessionMetadataForResume: () => {},
        restoreSessionMetadata,
        restoreSessionStateFromLog,
      },
    )

    await bootstrap.adoptLoadedConversation(
      {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        worktreeSession: { worktreePath: '/tmp/worktree' } as any,
      },
      {
        forkSession: true,
        persistSession: true,
      },
    )

    expect(restoreSessionMetadata).toHaveBeenCalledWith({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      worktreeSession: undefined,
    })
  })

  test('applies loaded conversations through restore-state and adoption seams', async () => {
    const restoreSessionStateFromLog = mock(() => {})
    const restoreSessionMetadata = mock(() => {})
    const setAppState = mock((_updater: unknown) => {})

    const bootstrap = createHeadlessSessionBootstrap(
      {
        getSessionIdentity: () => ({ sessionId: 'session-1', cwd: null }),
        patchPromptState: () => {},
        switchSession: () => {},
        isSessionPersistenceDisabled: () => false,
      } as any,
      {
        resetSessionFilePointer: async () => {},
        resetSessionMetadataForResume: () => {},
        restoreSessionMetadata,
        restoreSessionStateFromLog,
      },
    )

    const loadedConversation = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      messages: [],
    } as any

    await bootstrap.applyLoadedConversation(
      loadedConversation,
      setAppState as any,
      {
        forkSession: false,
        persistSession: false,
      },
    )

    expect(restoreSessionStateFromLog).toHaveBeenCalledWith(
      loadedConversation,
      setAppState,
    )
    expect(restoreSessionMetadata).toHaveBeenCalledTimes(1)
  })

  test('applies loaded conversation mode through coordinator warning and persistence seams', async () => {
    const refreshAgentDefinitions = mock(async () => ({
      allAgents: [{ agentType: 'coordinator' }],
      activeAgents: [{ agentType: 'coordinator' }],
    })) as unknown as () => Promise<any>
    const saveMode = mock(() => {})
    const writeStderr = mock((_message: string) => {})
    const setAppState = mock((updater: (prev: any) => any) =>
      updater({ agentDefinitions: { allAgents: [], activeAgents: [] } }),
    )

    const bootstrap = createHeadlessSessionBootstrap(
      {
        getSessionIdentity: () => ({ sessionId: 'session-1', cwd: null }),
        patchPromptState: () => {},
        switchSession: () => {},
        isSessionPersistenceDisabled: () => false,
      } as any,
      {
        resetSessionFilePointer: async () => {},
        resetSessionMetadataForResume: () => {},
        restoreSessionMetadata: () => {},
        restoreSessionStateFromLog: () => {},
        matchSessionMode: () => 'mode warning',
        isCoordinatorMode: () => true,
        refreshAgentDefinitions,
        saveMode,
        writeStderr,
      },
    )

    await bootstrap.applyLoadedConversationMode('normal', setAppState as any)

    expect(writeStderr).toHaveBeenCalledWith('mode warning\n')
    expect(refreshAgentDefinitions).toHaveBeenCalledTimes(1)
    expect(setAppState).toHaveBeenCalledTimes(1)
    expect(saveMode).toHaveBeenCalledWith('coordinator')
  })

  test('routes session metadata persistence through the bootstrap owner seam', () => {
    const patchPromptState = mock(() => {})
    const notifySessionMetadataChanged = mock(() => {})
    const saveAgentSetting = mock(() => {})
    const saveAiGeneratedTitle = mock(() => {})

    const bootstrap = createHeadlessSessionBootstrap(
      {
        getSessionIdentity: () => ({
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          cwd: null,
        }),
        patchPromptState,
        switchSession: () => {},
        isSessionPersistenceDisabled: () => false,
      } as any,
      {
        resetSessionFilePointer: async () => {},
        resetSessionMetadataForResume: () => {},
        restoreSessionMetadata: () => {},
        restoreSessionStateFromLog: () => {},
        notifySessionMetadataChanged,
        saveAgentSetting,
        saveAiGeneratedTitle,
      },
    )

    bootstrap.applyModelChange({
      mainLoopModelOverride: 'claude-sonnet-4-6',
      resolvedModel: 'claude-sonnet-4-6',
    })
    bootstrap.persistAgentSetting('reviewer')
    bootstrap.persistGeneratedTitle('generated title')

    expect(patchPromptState).toHaveBeenCalledWith({
      mainLoopModelOverride: 'claude-sonnet-4-6',
    })
    expect(notifySessionMetadataChanged).toHaveBeenCalledWith({
      model: 'claude-sonnet-4-6',
    })
    expect(saveAgentSetting).toHaveBeenCalledWith('reviewer')
    expect(saveAiGeneratedTitle).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      'generated title',
    )
  })
})
