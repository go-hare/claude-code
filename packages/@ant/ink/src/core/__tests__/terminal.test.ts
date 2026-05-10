import { afterEach, describe, expect, test } from 'bun:test'
import { Writable } from 'stream'
import {
  isCursorIntegratedTerminal,
  isSynchronizedOutputSupported,
  writeDiffToTerminal,
} from '../terminal.js'

const ENV_KEYS = [
  'COLORTERM',
  'CURSOR_TRACE_ID',
  'KITTY_WINDOW_ID',
  'TERM',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TMUX',
  'VSCODE_GIT_ASKPASS_MAIN',
  'VSCODE_GIT_ASKPASS_NODE',
  'VTE_VERSION',
  'WT_SESSION',
  'ZED_TERM',
  '__CFBundleIdentifier',
] as const

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map(key => [key, process.env[key]]),
)
const originalStdoutIsTty = Object.getOwnPropertyDescriptor(
  process.stdout,
  'isTTY',
)

function clearTerminalEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

function setStdoutIsTty(value: boolean): void {
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value,
  })
}

class CaptureStream extends Writable {
  chunks: string[] = []

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(String(chunk))
    callback()
  }

  text(): string {
    return this.chunks.join('')
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  if (originalStdoutIsTty) {
    Object.defineProperty(process.stdout, 'isTTY', originalStdoutIsTty)
  } else {
    Reflect.deleteProperty(process.stdout, 'isTTY')
  }
})

describe('terminal capability detection', () => {
  test('detects Cursor integrated terminal from Cursor-specific env', () => {
    clearTerminalEnv()
    process.env.TERM_PROGRAM = 'vscode'
    process.env.CURSOR_TRACE_ID = 'trace'

    expect(isCursorIntegratedTerminal()).toBe(true)
  })

  test('does not classify plain VS Code terminal as Cursor', () => {
    clearTerminalEnv()
    process.env.TERM_PROGRAM = 'vscode'

    expect(isCursorIntegratedTerminal()).toBe(false)
  })

  test('keeps synchronized output for plain VS Code but disables it for Cursor', () => {
    clearTerminalEnv()
    setStdoutIsTty(true)

    process.env.TERM_PROGRAM = 'vscode'
    expect(isSynchronizedOutputSupported()).toBe(true)

    process.env.CURSOR_TRACE_ID = 'trace'
    expect(isSynchronizedOutputSupported()).toBe(false)
  })

  test('does not write synchronized output markers in Cursor terminal', () => {
    clearTerminalEnv()
    process.env.TERM_PROGRAM = 'vscode'
    process.env.CURSOR_TRACE_ID = 'trace'
    const output = new CaptureStream()

    writeDiffToTerminal(
      { stdout: output, stderr: output },
      [{ type: 'stdout', content: 'hello' }],
    )

    expect(output.text()).toBe('hello')
  })

  test('keeps synchronized output markers in plain VS Code terminal', () => {
    clearTerminalEnv()
    process.env.TERM_PROGRAM = 'vscode'
    const output = new CaptureStream()

    writeDiffToTerminal(
      { stdout: output, stderr: output },
      [{ type: 'stdout', content: 'hello' }],
    )

    expect(output.text()).toBe('\x1B[?2026hhello\x1B[?2026l')
  })
})
