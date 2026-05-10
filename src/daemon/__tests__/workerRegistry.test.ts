import { describe, expect, mock, test } from 'bun:test'

const mockRunDaemonWorkerHost = mock(async () => {})
const mockRunBridgeHeadless = mock(async () => {})

class MockBridgeHeadlessPermanentError extends Error {
  constructor(message = 'permanent') {
    super(message)
    this.name = 'BridgeHeadlessPermanentError'
  }
}

mock.module('../../hosts/daemon/index.js', () => ({
  runDaemonWorkerHost: mockRunDaemonWorkerHost,
}))

mock.module('../../bridge/bridgeMain.js', () => ({
  runBridgeHeadless: mockRunBridgeHeadless,
}))

mock.module(
  '../../runtime/capabilities/bridge/HeadlessBridgeRuntime.js',
  () => ({
    BridgeHeadlessPermanentError: MockBridgeHeadlessPermanentError,
  }),
)

const { runDaemonWorker } = await import('../workerRegistry.js')

describe('runDaemonWorker', () => {
  test('delegates through daemon host with bridge error typing', async () => {
    await runDaemonWorker('bridge')

    expect(mockRunDaemonWorkerHost).toHaveBeenCalledTimes(1)
    const call = mockRunDaemonWorkerHost.mock.calls[0] as unknown as
      | [string | undefined, {
          runBridgeHeadless: typeof mockRunBridgeHeadless
          isPermanentError: (error: unknown) => boolean
        }]
      | undefined
    expect(call?.[0]).toBe('bridge')
    expect(call?.[1]?.runBridgeHeadless).toBe(mockRunBridgeHeadless)
    expect(
      call?.[1]?.isPermanentError(
        new MockBridgeHeadlessPermanentError(),
      ),
    ).toBe(true)
    expect(call?.[1]?.isPermanentError(new Error('transient'))).toBe(false)
  })
})
