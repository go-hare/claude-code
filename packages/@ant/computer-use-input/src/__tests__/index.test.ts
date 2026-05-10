import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import * as input from '../index.js'

function nativePath(): string {
  return join(
    import.meta.dir,
    '..',
    '..',
    '..',
    '..',
    '..',
    'vendor',
    'computer-use-input',
    `${process.arch}-darwin`,
    'computer-use-input.node',
  )
}

describe('@ant/computer-use-input', () => {
  test('loads the native macOS input module when a platform binary is present', () => {
    if (process.platform !== 'darwin') {
      expect(input.isSupported).toBe(false)
      return
    }

    expect(existsSync(nativePath())).toBe(true)
    expect(input.isSupported).toBe(true)
    expect(input.moveMouse).toBeFunction()
    expect(input.key).toBeFunction()
    expect(input.keys).toBeFunction()
    expect(input.mouseButton).toBeFunction()
    expect(input.mouseLocation).toBeFunction()
    expect(input.mouseScroll).toBeFunction()
    expect(input.typeText).toBeFunction()
    expect(input.getFrontmostAppInfo).toBeFunction()
  })
})
