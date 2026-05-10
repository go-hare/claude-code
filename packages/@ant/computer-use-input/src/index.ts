import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FrontmostAppInfo, InputBackend } from './types.js'

const nodeRequire = createRequire(import.meta.url)

type NativeInputBackend = InputBackend

let cachedBackend: NativeInputBackend | null = null
let loadAttempted = false

function loadNativeBackend(): NativeInputBackend | null {
  if (loadAttempted) {
    return cachedBackend
  }
  loadAttempted = true

  if (process.platform !== 'darwin') {
    return null
  }

  const platformDir = `${process.arch}-darwin`
  const explicitPath = process.env.COMPUTER_USE_INPUT_NODE_PATH
  const sourceDir = dirname(fileURLToPath(import.meta.url))
  const candidates = explicitPath
    ? [explicitPath]
    : [
        `./vendor/computer-use-input/${platformDir}/computer-use-input.node`,
        `../vendor/computer-use-input/${platformDir}/computer-use-input.node`,
        join(
          sourceDir,
          '..',
          '..',
          '..',
          '..',
          'vendor',
          'computer-use-input',
          platformDir,
          'computer-use-input.node',
        ),
        join(
          process.cwd(),
          'vendor',
          'computer-use-input',
          platformDir,
          'computer-use-input.node',
        ),
      ]

  for (const candidate of candidates) {
    try {
      if (!explicitPath && candidate.startsWith('/') && !existsSync(candidate)) {
        continue
      }
      cachedBackend = nodeRequire(candidate) as NativeInputBackend
      return cachedBackend
    } catch {
      // Try the next source/bundled/package layout.
    }
  }

  return null
}

const backend = loadNativeBackend()

export const isSupported = backend !== null
export const moveMouse = backend?.moveMouse
export const key = backend?.key
export const keys = backend?.keys
export const mouseLocation = backend?.mouseLocation
export const mouseButton = backend?.mouseButton
export const mouseScroll = backend?.mouseScroll
export const typeText = backend?.typeText
export const getFrontmostAppInfo =
  backend?.getFrontmostAppInfo ?? (() => null)

export class ComputerUseInputAPI {
  declare moveMouse: InputBackend['moveMouse']
  declare key: InputBackend['key']
  declare keys: InputBackend['keys']
  declare mouseLocation: InputBackend['mouseLocation']
  declare mouseButton: InputBackend['mouseButton']
  declare mouseScroll: InputBackend['mouseScroll']
  declare typeText: InputBackend['typeText']
  declare getFrontmostAppInfo: InputBackend['getFrontmostAppInfo']
  declare isSupported: true
}

interface ComputerUseInputUnsupported {
  isSupported: false
}

export type ComputerUseInput =
  | ComputerUseInputAPI
  | ComputerUseInputUnsupported

export type { FrontmostAppInfo, InputBackend }
