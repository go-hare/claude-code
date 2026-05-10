import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import {
  isNativeAudioAvailable,
  isNativePlaying,
  isNativeRecordingActive,
  microphoneAuthorizationStatus,
} from '../index.js'

const supportedPlatforms = new Set(['darwin', 'linux', 'win32'])

function nativePath(): string {
  return join(
    import.meta.dir,
    '..',
    '..',
    '..',
    '..',
    'vendor',
    'audio-capture',
    `${process.arch}-${process.platform}`,
    'audio-capture.node',
  )
}

describe('audio-capture-napi', () => {
  test('loads the native audio module when a platform binary is present', () => {
    if (!supportedPlatforms.has(process.platform)) {
      expect(isNativeAudioAvailable()).toBe(false)
      return
    }

    expect(existsSync(nativePath())).toBe(true)
    expect(isNativeAudioAvailable()).toBe(true)
  })

  test('reports passive native state without starting audio devices', () => {
    expect(typeof isNativeRecordingActive()).toBe('boolean')
    expect(typeof isNativePlaying()).toBe('boolean')
  })

  test('returns a valid microphone authorization status', () => {
    expect([0, 1, 2, 3]).toContain(microphoneAuthorizationStatus())
  })
})
