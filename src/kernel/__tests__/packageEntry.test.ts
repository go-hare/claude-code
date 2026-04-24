import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

import * as kernel from '../index.js'

const EXPECTED_KERNEL_EXPORTS = [
  'DirectConnectError',
  'applyDirectConnectSessionState',
  'assembleServerHost',
  'connectDefaultKernelHeadlessMcp',
  'connectDirectHostSession',
  'connectResponseSchema',
  'createDefaultKernelHeadlessEnvironment',
  'createDirectConnectSession',
  'createKernelHeadlessSession',
  'createKernelHeadlessStore',
  'createKernelSession',
  'getDirectConnectErrorMessage',
  'prepareKernelHeadlessStartup',
  'runBridgeHeadless',
  'runConnectHeadless',
  'runDaemonWorker',
  'runKernelHeadless',
  'runKernelHeadlessClient',
  'startKernelServer',
  'startServer',
] as const

const packageEntry = await import('../../entrypoints/kernel.js')
const packageJson = JSON.parse(
  await readFile(join(process.cwd(), 'package.json'), 'utf8'),
) as {
  exports?: Record<string, unknown>
}

describe('kernel package entry', () => {
  test('declares the package-level ./kernel export', () => {
    expect(packageJson.exports).toBeDefined()
    expect(packageJson.exports?.['./kernel']).toBeDefined()
  })

  test('re-exports the stable kernel surface through src/entrypoints/kernel.ts', () => {
    expect(Object.keys(packageEntry).sort()).toEqual(
      [...EXPECTED_KERNEL_EXPORTS].sort(),
    )
    expect(Object.is(packageEntry.runKernelHeadless, kernel.runKernelHeadless)).toBe(
      true,
    )
    expect(
      Object.is(packageEntry.createDirectConnectSession, kernel.createDirectConnectSession),
    ).toBe(true)
    expect(Object.is(packageEntry.runBridgeHeadless, kernel.runBridgeHeadless)).toBe(
      true,
    )
    expect(Object.is(packageEntry.runDaemonWorker, kernel.runDaemonWorker)).toBe(
      true,
    )
  })
})
