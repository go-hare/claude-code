import { describe, expect, test } from 'bun:test'

describe('DiscoverSkillsTool', () => {
  test('exports a real tool with the expected identity', async () => {
    const { DiscoverSkillsTool } = await import('../DiscoverSkillsTool.js')
    expect(DiscoverSkillsTool).toBeDefined()
    expect(DiscoverSkillsTool.name).toBe('DiscoverSkills')
    expect(typeof DiscoverSkillsTool.call).toBe('function')
  })

  test('exposes stable metadata', async () => {
    const { DiscoverSkillsTool } = await import('../DiscoverSkillsTool.js')
    expect(await DiscoverSkillsTool.description()).toContain('skills')
    expect(DiscoverSkillsTool.userFacingName()).toBe('Discover Skills')
    expect(DiscoverSkillsTool.isReadOnly()).toBe(true)
    expect(DiscoverSkillsTool.isConcurrencySafe()).toBe(true)
  })

  test('renders tool usage and empty results sanely', async () => {
    const { DiscoverSkillsTool } = await import('../DiscoverSkillsTool.js')
    const msg = DiscoverSkillsTool.renderToolUseMessage({
      description: 'deploy a Next.js app',
    })
    expect(msg).toContain('Searching skills')

    const result = DiscoverSkillsTool.mapToolResultToToolResultBlockParam(
      { results: [], count: 0 },
      'toolu_123',
    )
    expect(result.content).toContain('No matching skills found')
  })
})
