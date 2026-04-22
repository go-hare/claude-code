import { describe, expect, test } from 'bun:test'
import type { ToolUseContext } from '../../../Tool.js'
import { getEmptyToolPermissionContext } from '../../../Tool.js'
import { getDefaultAppState } from '../../../state/AppStateStore.js'
import { createFileStateCacheWithSizeLimit } from '../../../utils/fileStateCache.js'
import {
  collectSkillDiscoveryPrefetch,
  startSkillDiscoveryPrefetch,
} from '../prefetch.js'

function createTestToolUseContext(): ToolUseContext {
  const appState = getDefaultAppState()
  appState.toolPermissionContext = getEmptyToolPermissionContext()
  return {
    abortController: new AbortController(),
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'sonnet',
      tools: [],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        allAgents: [],
        allowedAgentTypes: undefined,
      } as any,
    },
    readFileState: createFileStateCacheWithSizeLimit(10),
    getAppState: () => appState,
    setAppState: () => {},
    messages: [],
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
  }
}

describe('skill discovery prefetch handle', () => {
  test('disposes by aborting only the child signal', async () => {
    const context = createTestToolUseContext()
    const handle = startSkillDiscoveryPrefetch(null, [], context)

    expect(handle.signal.aborted).toBe(false)
    expect(context.abortController.signal.aborted).toBe(false)

    handle[Symbol.dispose]()

    expect(handle.signal.aborted).toBe(true)
    expect(context.abortController.signal.aborted).toBe(false)
  })

  test('marks settlement after collection', async () => {
    const handle = startSkillDiscoveryPrefetch(
      null,
      [],
      createTestToolUseContext(),
    )

    expect(handle.settledAt).toBeNull()
    await expect(collectSkillDiscoveryPrefetch(handle)).resolves.toEqual([])
    expect(handle.settledAt).not.toBeNull()
  })
})
