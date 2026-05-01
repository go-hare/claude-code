import { describe, expect, test } from 'bun:test'

import { resolveHeadlessResumeInterruptedTurn } from '../headlessResumePolicy.js'

describe('resolveHeadlessResumeInterruptedTurn', () => {
  test('prefers the explicit public run option', () => {
    expect(resolveHeadlessResumeInterruptedTurn(true, undefined)).toBe(true)
    expect(resolveHeadlessResumeInterruptedTurn(false, '1')).toBe(false)
  })

  test('falls back to the legacy environment gate when explicit option is unset', () => {
    expect(resolveHeadlessResumeInterruptedTurn(undefined, '1')).toBe(true)
    expect(resolveHeadlessResumeInterruptedTurn(undefined, '')).toBe(false)
    expect(resolveHeadlessResumeInterruptedTurn(undefined, undefined)).toBe(
      false,
    )
  })
})
