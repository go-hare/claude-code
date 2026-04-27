import { describe, expect, test } from 'bun:test'

import { resolveHeadlessRuntimeTurnId } from '../headlessRuntimeTurnId.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('resolveHeadlessRuntimeTurnId', () => {
  test('keeps a non-empty command uuid', () => {
    expect(resolveHeadlessRuntimeTurnId('turn-1')).toBe('turn-1')
  })

  test('normalizes command uuid whitespace', () => {
    expect(resolveHeadlessRuntimeTurnId(' turn-1 ')).toBe('turn-1')
  })

  test('generates a uuid when command uuid is missing', () => {
    expect(resolveHeadlessRuntimeTurnId()).toMatch(UUID_PATTERN)
  })

  test('generates a uuid when command uuid is an empty string', () => {
    expect(resolveHeadlessRuntimeTurnId('')).toMatch(UUID_PATTERN)
  })

  test('generates a uuid when command uuid is only whitespace', () => {
    expect(resolveHeadlessRuntimeTurnId('   ')).toMatch(UUID_PATTERN)
  })

  test('generates unique fallback ids', () => {
    expect(resolveHeadlessRuntimeTurnId()).not.toBe(resolveHeadlessRuntimeTurnId())
  })
})
