import { describe, expect, test } from 'bun:test'
import { CtxInspectTool } from '../CtxInspectTool.js'

describe('CtxInspectTool', () => {
  test('exports stable metadata', async () => {
    expect(CtxInspectTool).toBeDefined()
    expect(CtxInspectTool.name).toBe('CtxInspect')
    expect(await CtxInspectTool.description()).toContain('context')
    expect(await CtxInspectTool.prompt()).toContain('context')
    expect(CtxInspectTool.userFacingName()).toBe('CtxInspect')
    expect(CtxInspectTool.isReadOnly()).toBe(true)
    expect(CtxInspectTool.isConcurrencySafe()).toBe(true)
  })

  test('formats tool results for transcript rendering', () => {
    const block = CtxInspectTool.mapToolResultToToolResultBlockParam(
      {
        total_tokens: 192,
        message_count: 3,
        summary: 'Context inspection requires the CONTEXT_COLLAPSE runtime.',
      },
      'tool-use-id',
    )

    expect(block.tool_use_id).toBe('tool-use-id')
    expect(block.content).toContain('192 tokens')
    expect(block.content).toContain('3 messages')
    expect(block.content).toContain('CONTEXT_COLLAPSE runtime')
  })

  test('returns the placeholder result when runtime support is unavailable', async () => {
    const result = await (CtxInspectTool.call as any)({ query: 'tool usage' })

    expect(result.data).toEqual({
      total_tokens: 0,
      message_count: 0,
      summary: 'Context inspection requires the CONTEXT_COLLAPSE runtime.',
    })
  })
})
