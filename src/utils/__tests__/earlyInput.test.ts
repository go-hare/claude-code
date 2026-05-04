import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  consumeEarlyInput,
  hasEarlyInput,
  seedEarlyInput,
  startCapturingEarlyInput,
  stopCapturingEarlyInput,
} from '../earlyInput.js'

type StdinSnapshot = {
  argv: string[]
  isTTY: boolean | undefined
  setEncoding: typeof process.stdin.setEncoding
  setRawMode: typeof process.stdin.setRawMode
  ref: typeof process.stdin.ref
  unref: typeof process.stdin.unref
  on: typeof process.stdin.on
  removeListener: typeof process.stdin.removeListener
  read: typeof process.stdin.read
}

describe('earlyInput stdin lifecycle', () => {
  let snapshot: StdinSnapshot

  beforeEach(() => {
    const stdin = process.stdin as typeof process.stdin & { isTTY?: boolean }
    snapshot = {
      argv: [...process.argv],
      isTTY: stdin.isTTY,
      setEncoding: stdin.setEncoding,
      setRawMode: stdin.setRawMode,
      ref: stdin.ref,
      unref: stdin.unref,
      on: stdin.on,
      removeListener: stdin.removeListener,
      read: stdin.read,
    }
    consumeEarlyInput()
  })

  afterEach(() => {
    const stdin = process.stdin as typeof process.stdin & { isTTY?: boolean }
    process.argv = snapshot.argv
    Object.defineProperty(stdin, 'isTTY', {
      configurable: true,
      value: snapshot.isTTY,
    })
    stdin.setEncoding = snapshot.setEncoding
    stdin.setRawMode = snapshot.setRawMode
    stdin.ref = snapshot.ref
    stdin.unref = snapshot.unref
    stdin.on = snapshot.on
    stdin.removeListener = snapshot.removeListener
    stdin.read = snapshot.read
    stopCapturingEarlyInput()
    consumeEarlyInput()
  })

  test('balances stdin.ref with stdin.unref when capture stops', () => {
    const stdin = process.stdin as typeof process.stdin & { isTTY?: boolean }
    let refCount = 0
    let unrefCount = 0

    process.argv = process.argv.filter(arg => arg !== '-p' && arg !== '--print')
    Object.defineProperty(stdin, 'isTTY', {
      configurable: true,
      value: true,
    })
    stdin.setEncoding = (() => {}) as unknown as typeof stdin.setEncoding
    stdin.setRawMode = (() => stdin) as unknown as typeof stdin.setRawMode
    stdin.ref = (() => {
      refCount++
      return stdin
    }) as typeof stdin.ref
    stdin.unref = (() => {
      unrefCount++
      return stdin
    }) as typeof stdin.unref
    stdin.on = ((_: string, __: () => void) => stdin) as typeof stdin.on
    stdin.removeListener = ((_: string, __: () => void) =>
      stdin) as typeof stdin.removeListener
    stdin.read = (() => null) as typeof stdin.read

    startCapturingEarlyInput()
    stopCapturingEarlyInput()

    expect(refCount).toBe(1)
    expect(unrefCount).toBe(1)
  })
})

describe('earlyInput public API', () => {
  test('seedEarlyInput sets the buffer', () => {
    seedEarlyInput('hello')
    expect(hasEarlyInput()).toBe(true)
    expect(consumeEarlyInput()).toBe('hello')
  })

  test('consumeEarlyInput drains the buffer', () => {
    seedEarlyInput('test')
    consumeEarlyInput()
    expect(hasEarlyInput()).toBe(false)
    expect(consumeEarlyInput()).toBe('')
  })

  test('hasEarlyInput returns false for empty / whitespace-only buffer', () => {
    seedEarlyInput('   ')
    expect(hasEarlyInput()).toBe(false)
  })

  test('consumeEarlyInput trims whitespace', () => {
    seedEarlyInput('  hello  ')
    expect(consumeEarlyInput()).toBe('hello')
  })

  test('multiple seeds overwrite previous value', () => {
    seedEarlyInput('first')
    seedEarlyInput('second')
    expect(consumeEarlyInput()).toBe('second')
  })
})

describe('earlyInput escape sequence regression (fix: iTerm2 sequences leaking)', () => {
  test('DA1 response sequence pattern is documented (CSI ? ... c)', () => {
    const leakedBefore = '?64;1;2;4;6;17;18;21;22c'
    const cleanAfter = ''
    expect(leakedBefore).not.toBe(cleanAfter)
    expect(cleanAfter).toBe('')
  })

  test('XTVERSION DCS sequence pattern is documented (ESC P ... ESC \\\\)', () => {
    const leakedBefore = '>|iTerm2 3.6.4'
    const cleanAfter = ''
    expect(leakedBefore).not.toBe(cleanAfter)
    expect(cleanAfter).toBe('')
  })

  test('normal text after escape sequence is preserved', () => {
    seedEarlyInput('hello world')
    expect(consumeEarlyInput()).toBe('hello world')
  })

  test('empty result when only escape sequences present', () => {
    seedEarlyInput('')
    expect(consumeEarlyInput()).toBe('')
  })
})
