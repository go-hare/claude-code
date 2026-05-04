import { describe, expect, test } from 'bun:test'
import type { ContentBlock } from '@agentclientprotocol/sdk'
import { promptToQueryContent } from '../bridge.js'
import { promptToQueryInput } from '../promptConversion.js'

describe('ACP prompt conversion', () => {
  test('serializes resource links as metadata text instead of markdown', () => {
    const prompt: ContentBlock[] = [
      { type: 'text', text: 'before' },
      { type: 'resource_link', name: 'Spec', uri: 'file:///tmp/spec.md' } as ContentBlock,
      { type: 'resource', resource: { text: 'after' } } as ContentBlock,
    ]

    const expected =
      'before\nResource link: name=Spec, uri=file:///tmp/spec.md\nafter'

    expect(promptToQueryInput(prompt)).toBe(expected)
    expect(promptToQueryContent(prompt)).toBe(expected)
  })

  test('keeps resource links visible when metadata fields are missing', () => {
    const prompt: ContentBlock[] = [
      { type: 'resource_link' } as ContentBlock,
    ]

    expect(promptToQueryInput(prompt)).toBe('Resource link')
    expect(promptToQueryContent(prompt)).toBe('Resource link')
  })
})
