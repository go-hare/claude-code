import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { ComputerUseAPI } from '../index.js'

function nativePath(): string {
  return join(
    import.meta.dir,
    '..',
    '..',
    '..',
    '..',
    '..',
    'vendor',
    'computer-use-swift',
    `${process.arch}-darwin`,
    'computer_use.node',
  )
}

describe('@ant/computer-use-swift', () => {
  test('loads the native macOS computer-use module when a platform binary is present', () => {
    if (process.platform !== 'darwin') {
      expect(() => new ComputerUseAPI()).toThrow()
      return
    }

    expect(existsSync(nativePath())).toBe(true)
    const api = new ComputerUseAPI()
    expect(api.apps.listRunning).toBeFunction()
    expect(api.display.listAll).toBeFunction()
    expect(api.screenshot.captureExcluding).toBeFunction()
    expect(api.resolvePrepareCapture).toBeFunction()
    expect(api._drainMainRunLoop).toBeFunction()
  })
})
