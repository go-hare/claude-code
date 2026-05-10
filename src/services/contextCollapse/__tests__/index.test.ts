import { describe, expect, test } from 'bun:test'
import {
  initContextCollapse,
  isContextCollapseEnabled,
  resetContextCollapse,
} from '../index.js'

describe('contextCollapse lifecycle', () => {
  test('initContextCollapse enables context-collapse runtime until reset', () => {
    resetContextCollapse()
    expect(isContextCollapseEnabled()).toBe(false)

    initContextCollapse()
    expect(isContextCollapseEnabled()).toBe(true)

    resetContextCollapse()
    expect(isContextCollapseEnabled()).toBe(false)
  })
})
