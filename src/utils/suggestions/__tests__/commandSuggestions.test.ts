import { describe, expect, test } from 'bun:test'
import type { Command } from '../../../commands.js'
import type { SuggestionItem } from '../../../components/PromptInput/PromptInputFooterSuggestions.js'
import {
  getCommandInputBeforeCursor,
  spliceCommandSuggestionAtCursor,
} from '../commandSuggestions.js'

function makeCommandSuggestion(name: string): SuggestionItem {
  return {
    id: name,
    displayText: `/${name}`,
    description: `${name} command`,
    metadata: {
      name,
      type: 'local',
      description: `${name} command`,
      handler: () => {},
    } as unknown as Command,
  }
}

describe('getCommandInputBeforeCursor', () => {
  test('ignores text after the cursor when parsing command input', () => {
    expect(getCommandInputBeforeCursor('/com existing text', 4)).toBe('/com')
  })
})

describe('spliceCommandSuggestionAtCursor', () => {
  test('preserves text after the cursor when completing a command', () => {
    expect(
      spliceCommandSuggestionAtCursor(
        '/com existing text',
        4,
        makeCommandSuggestion('commit'),
      ),
    ).toEqual({
      value: '/commit existing text',
      cursorOffset: '/commit '.length,
    })
  })

  test('returns null for non-command suggestion metadata', () => {
    expect(
      spliceCommandSuggestionAtCursor('/com foo', 4, {
        id: 'bad',
        displayText: 'bad',
        description: 'bad',
        metadata: { foo: 'bar' },
      }),
    ).toBeNull()
  })
})
