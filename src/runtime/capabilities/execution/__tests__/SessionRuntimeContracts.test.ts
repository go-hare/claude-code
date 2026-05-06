import { EMPTY_USAGE } from '@ant/model-provider'
import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

import { createFileStateCacheWithSizeLimit } from '../../../../utils/fileStateCache.js'

const repoRoot = join(import.meta.dir, '../../../../..')
const content = readFileSync(
  join(
    repoRoot,
    'src/runtime/capabilities/execution/SessionRuntime.ts',
  ),
  'utf8',
)
const headlessManagedSessionContent = readFileSync(
  join(
    repoRoot,
    'src/runtime/capabilities/execution/internal/headlessManagedSession.ts',
  ),
  'utf8',
)
const queryEngineEntryContent = readFileSync(
  join(repoRoot, 'src/QueryEngine.ts'),
  'utf8',
)
const queryContent = readFileSync(join(repoRoot, 'src/query.ts'), 'utf8')
const headlessRuntimeLoopContent = readFileSync(
  join(
    repoRoot,
    'src/runtime/capabilities/execution/internal/headlessRuntimeLoop.ts',
  ),
  'utf8',
)
const queryTurnEventAdapterContent = readFileSync(
  join(
    repoRoot,
    'src/runtime/capabilities/execution/internal/QueryTurnEventAdapter.ts',
  ),
  'utf8',
)
const queryTurnCompatibilityProjectorContent = readFileSync(
  join(
    repoRoot,
    'src/runtime/capabilities/execution/internal/QueryTurnCompatibilityProjector.ts',
  ),
  'utf8',
)
const queryHelpersContent = readFileSync(
  join(repoRoot, 'src/utils/queryHelpers.ts'),
  'utf8',
)
const acpAgentContent = readFileSync(
  join(repoRoot, 'src/services/acp/agent.ts'),
  'utf8',
)

describe('SessionRuntime contracts', () => {
  test('defines the execution session factory surface', () => {
    expect(content).toContain("from '../../contracts/session.js'")
    expect(content).toContain('export interface RuntimeExecutionSession')
    expect(content).toContain(
      'export interface RuntimeExecutionSession extends RuntimeSessionLifecycle',
    )
    expect(content).toContain('submitRuntimeTurn(')
    const sessionInterfaceBlock = content.slice(
      content.indexOf('export interface RuntimeExecutionSession'),
      content.indexOf('export type ExecutionSessionFactory'),
    )
    expect(sessionInterfaceBlock).not.toContain('submitMessage(')
    expect(content).toContain('export async function* askRuntime(')
    expect(content).toContain('export type ExecutionSessionFactory')
    expect(content).toContain('export const createExecutionSessionRuntime')
  })

  test('keeps legacy compatibility message projection outside runtime owners', () => {
    expect(content).toContain('private async *runQueryTurn(')
    expect(content).toContain(
      'for await (const envelope of this.submitRuntimeTurn(prompt, {',
    )
    expect(content).toContain('includeCompatibilityMessages: true')
    expect(content).toContain('for await (const envelope of askRuntime(options))')
    expect(content).toContain('getProtocolMessageFromRuntimeEnvelope(envelope)')
    expect(content).toContain('for await (const sidecar of this.bindBootstrapState(')
    expect(queryEngineEntryContent).not.toContain('ask,')
    expect(acpAgentContent).toContain(
      'session.queryEngine.submitRuntimeTurn(promptInput)',
    )
    expect(acpAgentContent).not.toContain('queryEngine.submitMessage')
  })

  test('runtime turns default to canonical events and require explicit compatibility projection', () => {
    expect(content).toContain('createQueryTurnEventAdapter')
    expect(content).toContain(
      'turnEventAdapter.projectQueryMessage(',
    )
    expect(content).toContain(
      'turnEventAdapter.projectQueryMessageWithCompatibility(',
    )
    expect(content).toContain('includeCompatibilityMessages?: boolean')
    expect(content).toContain('type QueryTurnSidecarOutput')
    expect(content).toContain('AsyncGenerator<QueryTurnSidecarOutput')
    expect(content).toContain("type: 'query_sidecar'")
    expect(content).toContain('messages: []')
    expect(content).toContain('compatibilityMessages: []')
    expect(content).toContain('messages: projection.compatibilityMessages')
    expect(content).toContain('createHeadlessProtocolMessageRuntimeEvent')
    expect(content).toContain('includeCompatibilityMessages: true')
    expect(headlessRuntimeLoopContent).toContain('includeCompatibilityMessages: true')
    expect(content).toContain('yield projectQuerySidecar(')
    expect(content).toContain('const emitTerminalResult')
    expect(content).toContain("type: 'query_result'")
    expect(content).toContain('protocolMessage: result')
    expect(content).toContain("type: 'query_system_init'")
    expect(content).not.toContain('buildSystemInitMessage')
    expect(content).toContain('yield projectQuerySidecar(compactMsg)')
    expect(content).toContain('yield projectQuerySidecar(msg)')
    expect(content).toContain("type: 'query_user_replay'")
    expect(content).toContain('yield projectQuerySidecar(apiErrorMsg)')
    expect(queryTurnEventAdapterContent).toContain('includeCompatibility: false')
    expect(content).not.toContain('emitQueryRuntimeEvents?.(msg) ?? []')
    expect(content).not.toContain('emitQueryRuntimeEvents?.(message) ?? []')
    expect(content).not.toContain('yield* normalizeMessage(msg)')
    expect(content).not.toContain("type: 'query_sdk_message'")
    expect(content).not.toContain('turnEventAdapter.projectProtocolMessage(message)')
    expect(queryTurnEventAdapterContent).not.toContain(
      'projectProtocolMessage(message: ProtocolMessage)',
    )
    expect(queryTurnEventAdapterContent).not.toContain(
      'getProtocolResultTurnOutcome',
    )
    expect(queryTurnEventAdapterContent).toContain(
      "from './QueryTurnCompatibilityProjector.js'",
    )
    expect(queryTurnEventAdapterContent).not.toContain('normalizeMessages')
    expect(queryTurnEventAdapterContent).not.toContain('buildSystemInitMessage')
    expect(queryTurnEventAdapterContent).not.toContain(
      'projectProgressMessageToProtocolMessageProjection',
    )
    expect(queryTurnCompatibilityProjectorContent).toContain(
      'queryMessageToCompatibilityProtocolMessages',
    )
    expect(content).toContain(
      'turnEventAdapter.createFallbackTerminalEvent()',
    )
    expect(content).toContain("type: 'turn.abort_requested'")
    expect(content).toContain("this.abortController.abort('interrupt')")
  })

  test('runtime turns carry canonical input contract categories', () => {
    expect(content).toContain('KernelTurnInputContract')
    expect(content).toContain('createRuntimeToolCapabilityPlane')
    expect(content).toContain('createTurnInputContract(prompt)')
    expect(content).toContain('input: turnInput')
    expect(content).toContain("type: 'turn.context_assembled'")
    expect(content).toContain('source: metadata.phase')
    expect(queryContent).toContain('onContextAssemblyPrepared')
    expect(queryContent).toContain('contextCategories')
    expect(queryContent).toContain("'attachment_batch'")
    expect(queryContent).toContain("'memory_prefetch'")
    expect(queryContent).toContain("'skill_prefetch'")
    expect(headlessRuntimeLoopContent).toContain(
      "executionMode: toolState.executionMode ?? 'headless'",
    )
    expect(headlessRuntimeLoopContent).toContain(
      'capabilityPlane: toolState.capabilityPlane',
    )
    expect(content).toContain('preludeEvents?: readonly RuntimeTurnPreludeEvent[]')
    expect(content).toContain('preludeEvents,')
    expect(headlessRuntimeLoopContent).toContain(
      'projectHeadlessTaskNotification',
    )
    expect(headlessRuntimeLoopContent).toContain(
      'projectCoordinatorLifecycleFromCompatibilityMessage',
    )
    expect(headlessRuntimeLoopContent).toContain(
      "type: 'team.shutdown_requested'",
    )
    expect(headlessRuntimeLoopContent).toContain(
      "type: 'team.cleanup_completed'",
    )
    expect(headlessRuntimeLoopContent).toContain('preludeEvents,')
    expect(acpAgentContent).toContain("executionMode: 'acp'")
  })

  test('keeps MessageSelector optional at the runtime boundary', () => {
    expect(content).toContain(
      "(): typeof import('../../../components/MessageSelector.js') | null",
    )
    expect(content).toContain('return null')
    expect(content).toContain('function selectableUserMessagesFilter')
    expect(content).toContain(
      'selectableUserMessagesFilter(message as Message) ?? true',
    )
  })

  test('keeps runtime permission mounted across user-input and query contexts', () => {
    const runtimePermissionMounts = content.match(
      /runtimePermission: this\.config\.runtimePermission/g,
    )
    expect(runtimePermissionMounts).toHaveLength(2)
  })

  test('threads content replacement state across runtime session boundaries', () => {
    const contentReplacementMounts = content.match(
      /contentReplacementState: this\.contentReplacementState/g,
    )
    expect(contentReplacementMounts).toHaveLength(2)
    expect(content).toContain('initialContentReplacements?: ContentReplacementRecord[]')
    expect(content).toContain('contentReplacementState?: ContentReplacementState')
    expect(content).toContain('provisionContentReplacementState(')
    expect(content).toContain('initialContentReplacements,')
    expect(content).toContain('contentReplacementState,')
  })

  test('allows callers to inject active task execution context into runtime turns', () => {
    const activeTaskMounts = content.match(
      /activeTaskExecutionContext:\s*this\.config\.activeTaskExecutionContext\s*\?\?\s*getActiveTaskExecutionContext\(\)/g,
    )
    expect(activeTaskMounts).toHaveLength(2)
    expect(content).toContain(
      "activeTaskExecutionContext?: ToolUseContext['activeTaskExecutionContext']",
    )
    expect(content).toContain('activeTaskExecutionContext,')
  })

  test('headless runtime provisions resumed content replacement state once per session', () => {
    expect(headlessRuntimeLoopContent).toContain(
      'const contentReplacementState = provisionContentReplacementState(',
    )
    expect(headlessRuntimeLoopContent).toContain(
      'loadedConversation?.contentReplacements',
    )
    expect(headlessRuntimeLoopContent).toContain(
      'contentReplacementState,',
    )
  })

  test('headless runtime does not implicitly reload open task context before each runtime turn', () => {
    expect(headlessRuntimeLoopContent).not.toContain(
      'resolveOpenTaskExecutionContext()',
    )
    expect(headlessRuntimeLoopContent).not.toContain(
      'activeTaskExecutionContext,',
    )
  })

  test('runtime resume restores nested memory dedupe state from transcript messages', () => {
    expect(queryHelpersContent).toContain(
      'export function extractLoadedNestedMemoryPathsFromMessages(',
    )
    expect(queryHelpersContent).toContain(
      'export function projectProgressMessageToProtocolMessages(',
    )
    expect(queryHelpersContent).toContain(
      'export function projectProgressMessageToProtocolMessageProjection(',
    )
    expect(queryHelpersContent).toContain(
      '): AsyncGenerator<Message, void, unknown> {',
    )
    expect(content).toContain(
      'initialLoadedNestedMemoryPaths?: readonly string[]',
    )
    expect(content).toContain(
      'extractLoadedNestedMemoryPathsFromMessages(this.mutableMessages)',
    )
    expect(headlessRuntimeLoopContent).toContain(
      'let loadedNestedMemoryPaths = extractLoadedNestedMemoryPathsFromMessages(',
    )
    expect(headlessRuntimeLoopContent).toContain(
      'initialLoadedNestedMemoryPaths: Array.from(',
    )
  })

  test('query persists content replacements for sdk runtime sessions', () => {
    expect(queryContent).toContain("querySource.startsWith('agent:')")
    expect(queryContent).toContain("querySource.startsWith('repl_main_thread')")
    expect(queryContent).toContain("querySource === 'sdk'")
  })

  test('headless managed session shares the runtime session lifecycle contract', () => {
    expect(headlessManagedSessionContent).toContain(
      "from '../../../contracts/session.js'",
    )
    expect(headlessManagedSessionContent).toContain(
      'export type HeadlessManagedSession = RuntimeSessionLifecycle &',
    )
    expect(headlessManagedSessionContent).toContain(
      'IndexedRuntimeSession &',
    )
    expect(headlessManagedSessionContent).toContain(
      'AttachableRuntimeSession<HeadlessManagedSessionSink> & {',
    )
    expect(headlessManagedSessionContent).toContain(
      'export type HeadlessManagedSessionSink = RuntimeSessionSink<ProtocolStdoutMessage>',
    )
  })

  test('ask routes through an injected execution session factory', async () => {
    const { ask } = await import('../SessionRuntime.js')
    const initialCache = createFileStateCacheWithSizeLimit(4)
    const nextCache = createFileStateCacheWithSizeLimit(4)
    nextCache.set('/tmp/out.txt', {
      content: 'next-cache',
      timestamp: 1,
      offset: undefined,
      limit: undefined,
    })

    const setReadFileCache = mock((_cache: unknown) => {})
    const stopAndWait = mock(async (_force?: boolean) => {})
    const submitMessage = mock(async function* (
      prompt: string | unknown[],
      options?: { uuid?: string; isMeta?: boolean },
    ) {
      expect(prompt).toBe('hello')
      expect(options).toEqual({
        uuid: 'prompt-1',
        isMeta: true,
      })
      yield {
        type: 'result',
        subtype: 'success',
        duration_ms: 0,
        duration_api_ms: 0,
        is_error: false,
        num_turns: 1,
        stop_reason: null,
        session_id: 'session-1',
        total_cost_usd: 0,
        usage: EMPTY_USAGE,
        modelUsage: {},
        permission_denials: [],
        uuid: 'result-1',
      } as const
    })
    const submitRuntimeTurn = mock(async function* (
      prompt: string | unknown[],
      options?: { uuid?: string; isMeta?: boolean },
    ) {
      expect(prompt).toBe('hello')
      expect(options).toEqual({
        uuid: 'prompt-1',
        isMeta: true,
      })
      yield {
        schemaVersion: 'kernel.runtime.v1',
        messageId: 'runtime-message-1',
        sequence: 1,
        timestamp: '2026-04-27T00:00:00.000Z',
        source: 'kernel_runtime',
        kind: 'event',
        payload: {
          type: 'headless.protocol_message',
          replayable: true,
          payload: {
            type: 'result',
            subtype: 'success',
            duration_ms: 0,
            duration_api_ms: 0,
            is_error: false,
            num_turns: 1,
            stop_reason: null,
            session_id: 'session-1',
            total_cost_usd: 0,
            usage: EMPTY_USAGE,
            modelUsage: {},
            permission_denials: [],
            uuid: 'result-1',
          },
        },
      }
    })

    const createSessionRuntime = mock((config: Record<string, unknown>) => {
      expect(config.readFileCache).not.toBe(initialCache)
      expect(config.initialMessages).toEqual([])
      expect(config.initialLoadedNestedMemoryPaths).toEqual([
        '/tmp/.claude/CLAUDE.md',
      ])
      expect(config.activeTaskExecutionContext).toEqual({
        taskListId: 'team-alpha',
        taskId: '7',
        ownedFiles: ['src/runtime.ts'],
      })
      return {
        id: 'session-1',
        workDir: process.cwd(),
        isLive: true,
        submitRuntimeTurn,
        submitMessage,
        getReadFileState: () => nextCache,
        stopAndWait,
      }
    })

    const yieldedMessages: unknown[] = []
    for await (const message of ask({
      commands: [],
      prompt: 'hello',
      promptUuid: 'prompt-1',
      isMeta: true,
      cwd: process.cwd(),
      tools: [] as any,
      mcpClients: [],
      canUseTool: async () => ({ behavior: 'allow' }) as any,
      getAppState: () => ({}) as any,
      setAppState: () => ({}) as any,
      getReadFileCache: () => initialCache,
      setReadFileCache,
      initialLoadedNestedMemoryPaths: ['/tmp/.claude/CLAUDE.md'],
      activeTaskExecutionContext: {
        taskListId: 'team-alpha',
        taskId: '7',
        ownedFiles: ['src/runtime.ts'],
      },
      createSessionRuntime: createSessionRuntime as any,
    })) {
      yieldedMessages.push(message)
    }

    expect(createSessionRuntime).toHaveBeenCalledTimes(1)
    expect(submitRuntimeTurn).toHaveBeenCalledTimes(1)
    expect(submitMessage).not.toHaveBeenCalled()
    expect(setReadFileCache).toHaveBeenCalledWith(nextCache)
    expect(stopAndWait).toHaveBeenCalledWith(true)
    expect(yieldedMessages).toHaveLength(1)
  })
})
