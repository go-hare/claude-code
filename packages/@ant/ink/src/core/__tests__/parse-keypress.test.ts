import { describe, expect, test } from 'bun:test'
import {
  INITIAL_STATE,
  parseMultipleKeypresses,
} from '../parse-keypress.js'

describe('parseMultipleKeypresses', () => {
  test('keeps trailing input after bracketed paste as a normal key', () => {
    const [keys] = parseMultipleKeypresses(
      INITIAL_STATE,
      '\x1B[200~line 1\nline 2\x1B[201~22222',
    )

    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatchObject({
      kind: 'key',
      isPasted: true,
      sequence: 'line 1\nline 2',
    })
    expect(keys[1]).toMatchObject({
      kind: 'key',
      isPasted: false,
      sequence: '22222',
    })
  })

  test('accumulates split bracketed paste chunks without changing semantics', () => {
    let state = INITIAL_STATE
    let keys

    ;[keys, state] = parseMultipleKeypresses(state, '\x1B[200~')
    expect(keys).toHaveLength(0)

    for (let i = 0; i < 1000; i++) {
      ;[keys, state] = parseMultipleKeypresses(state, `chunk ${i}\n`)
      expect(keys).toHaveLength(0)
    }

    ;[keys, state] = parseMultipleKeypresses(state, '\x1B[201~done')

    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatchObject({
      kind: 'key',
      isPasted: true,
      sequence: Array.from({ length: 1000 }, (_, i) => `chunk ${i}\n`).join(
        '',
      ),
    })
    expect(keys[1]).toMatchObject({
      kind: 'key',
      isPasted: false,
      sequence: 'done',
    })
    expect(state.mode).toBe('NORMAL')
  })
})
