import { describe, expect, test } from 'bun:test'

import * as bridge from '../bridge.js'
import * as daemon from '../daemon.js'
import * as headless from '../headless.js'
import * as headlessMcp from '../headlessMcp.js'
import * as headlessStartup from '../headlessStartup.js'
import * as kernel from '../index.js'
import * as serverHost from '../serverHost.js'
import * as serverTypes from '../../server/types.js'

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

describe('kernel index surface', () => {
  test('locks the exact stable public kernel export set', () => {
    expect(Object.keys(kernel).sort()).toEqual([...EXPECTED_KERNEL_EXPORTS].sort())
  })

  test('re-exports the stable public kernel API from its leaf modules', () => {
    expect(
      Object.is(
        kernel.createDefaultKernelHeadlessEnvironment,
        headless.createDefaultKernelHeadlessEnvironment,
      ),
    ).toBe(true)
    expect(
      Object.is(kernel.createKernelHeadlessSession, headless.createKernelHeadlessSession),
    ).toBe(true)
    expect(
      Object.is(kernel.createKernelHeadlessStore, headless.createKernelHeadlessStore),
    ).toBe(true)
    expect(Object.is(kernel.runKernelHeadless, headless.runKernelHeadless)).toBe(
      true,
    )
    expect(
      Object.is(
        kernel.connectDefaultKernelHeadlessMcp,
        headlessMcp.connectDefaultKernelHeadlessMcp,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.prepareKernelHeadlessStartup,
        headlessStartup.prepareKernelHeadlessStartup,
      ),
    ).toBe(true)

    expect(
      Object.is(kernel.createKernelSession, serverHost.createDirectConnectSession),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createDirectConnectSession,
        serverHost.createDirectConnectSession,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.connectDirectHostSession,
        serverHost.connectDirectHostSession,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.applyDirectConnectSessionState,
        serverHost.applyDirectConnectSessionState,
      ),
    ).toBe(true)
    expect(
      Object.is(kernel.assembleServerHost, serverHost.assembleServerHost),
    ).toBe(true)
    expect(Object.is(kernel.DirectConnectError, serverHost.DirectConnectError)).toBe(
      true,
    )
    expect(
      Object.is(kernel.runKernelHeadlessClient, serverHost.runConnectHeadless),
    ).toBe(true)
    expect(
      Object.is(kernel.runConnectHeadless, serverHost.runConnectHeadless),
    ).toBe(true)
    expect(Object.is(kernel.startKernelServer, serverHost.startServer)).toBe(true)
    expect(Object.is(kernel.startServer, serverHost.startServer)).toBe(true)
    expect(
      Object.is(kernel.connectResponseSchema, serverTypes.connectResponseSchema),
    ).toBe(true)

    expect(Object.is(kernel.runBridgeHeadless, bridge.runBridgeHeadless)).toBe(true)
    expect(Object.is(kernel.runDaemonWorker, daemon.runDaemonWorker)).toBe(true)
  })
})
