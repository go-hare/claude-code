import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  createCacheEditsBlock,
  createCachedMCState,
  getToolResultsToDelete,
  isCachedMicrocompactEnabled,
  isModelSupportedForCacheEditing,
  markToolsSentToAPI,
  registerToolResult,
  resetCachedMCState,
  type CachedMCState,
} from '../cachedMicrocompact.js'

describe('cachedMicrocompact', () => {
  let state: CachedMCState
  const previousFlag = process.env.CLAUDE_CACHED_MICROCOMPACT

  beforeEach(() => {
    state = createCachedMCState()
    if (previousFlag === undefined) {
      delete process.env.CLAUDE_CACHED_MICROCOMPACT
    } else {
      process.env.CLAUDE_CACHED_MICROCOMPACT = previousFlag
    }
  })

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.CLAUDE_CACHED_MICROCOMPACT
    } else {
      process.env.CLAUDE_CACHED_MICROCOMPACT = previousFlag
    }
  })

  test('createCachedMCState returns clean state', () => {
    expect(state.registeredTools.size).toBe(0)
    expect(state.toolOrder).toEqual([])
    expect(state.deletedRefs.size).toBe(0)
    expect(state.pinnedEdits).toEqual([])
    expect(state.toolsSentToAPI).toBe(false)
  })

  test('registerToolResult tracks tool IDs in order and deduplicates', () => {
    registerToolResult(state, 'tool-1')
    registerToolResult(state, 'tool-2')
    registerToolResult(state, 'tool-1')

    expect(state.registeredTools.size).toBe(2)
    expect(state.toolOrder).toEqual(['tool-1', 'tool-2'])
  })

  test('getToolResultsToDelete returns empty when below threshold', () => {
    for (let i = 0; i < 5; i++) {
      registerToolResult(state, `tool-${i}`)
    }

    expect(getToolResultsToDelete(state)).toEqual([])
  })

  test('getToolResultsToDelete returns oldest tools and keeps recent tools', () => {
    for (let i = 0; i < 12; i++) {
      registerToolResult(state, `tool-${i}`)
    }

    const toDelete = getToolResultsToDelete(state)

    expect(toDelete).toEqual([
      'tool-0',
      'tool-1',
      'tool-2',
      'tool-3',
      'tool-4',
      'tool-5',
      'tool-6',
    ])
  })

  test('already deleted tools are not suggested again', () => {
    for (let i = 0; i < 12; i++) {
      registerToolResult(state, `tool-${i}`)
    }

    const first = getToolResultsToDelete(state)
    for (const id of first) {
      state.deletedRefs.add(id)
    }

    const second = getToolResultsToDelete(state)
    for (const id of first) {
      expect(second).not.toContain(id)
    }
  })

  test('createCacheEditsBlock generates delete_tool_result edits', () => {
    const block = createCacheEditsBlock(state, ['tool-1', 'tool-2'])

    expect(block).toEqual({
      type: 'cache_edits',
      edits: [
        { type: 'delete_tool_result', tool_use_id: 'tool-1' },
        { type: 'delete_tool_result', tool_use_id: 'tool-2' },
      ],
    })
  })

  test('createCacheEditsBlock returns null for empty list', () => {
    expect(createCacheEditsBlock(state, [])).toBeNull()
  })

  test('markToolsSentToAPI sets flag', () => {
    markToolsSentToAPI(state)
    expect(state.toolsSentToAPI).toBe(true)
  })

  test('resetCachedMCState clears tracked state', () => {
    registerToolResult(state, 'tool-1')
    state.deletedRefs.add('tool-1')
    state.pinnedEdits.push({
      userMessageIndex: 1,
      block: { type: 'cache_edits', edits: [] },
    })
    markToolsSentToAPI(state)

    resetCachedMCState(state)

    expect(state.registeredTools.size).toBe(0)
    expect(state.toolOrder).toEqual([])
    expect(state.deletedRefs.size).toBe(0)
    expect(state.pinnedEdits).toEqual([])
    expect(state.toolsSentToAPI).toBe(false)
  })

  test('isCachedMicrocompactEnabled follows CLAUDE_CACHED_MICROCOMPACT', () => {
    process.env.CLAUDE_CACHED_MICROCOMPACT = '1'
    expect(isCachedMicrocompactEnabled()).toBe(true)

    process.env.CLAUDE_CACHED_MICROCOMPACT = '0'
    expect(isCachedMicrocompactEnabled()).toBe(false)
  })

  test('isModelSupportedForCacheEditing accepts Claude 4.x only', () => {
    expect(isModelSupportedForCacheEditing('claude-opus-4-6')).toBe(true)
    expect(isModelSupportedForCacheEditing('claude-sonnet-4-6')).toBe(true)
    expect(isModelSupportedForCacheEditing('claude-2')).toBe(false)
    expect(isModelSupportedForCacheEditing('gpt-4')).toBe(false)
  })
})
