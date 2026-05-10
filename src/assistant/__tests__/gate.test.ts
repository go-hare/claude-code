import { feature } from 'bun:bundle'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test'
import * as growthBook from '../../services/analytics/growthbook.js'

let cachedKairosGateValue = false
let blockingKairosGateValue = false

const cachedGateCalls: string[] = []
const blockingGateCalls: string[] = []

function isKairosCompiledIn(): boolean {
  return feature('KAIROS') ? true : false
}

const {
  isKairosEnabled,
  isKairosEnabledCachedOrEnv,
  isKairosRuntimeEnabled,
} = await import('../gate.js')
const { isAssistantCommandEnabled } = await import(
  '../../commands/assistant/gate.js'
)
const blockingGateSpy = spyOn(growthBook, 'checkGate_CACHED_OR_BLOCKING')
const cachedGateSpy = spyOn(growthBook, 'getFeatureValue_CACHED_MAY_BE_STALE')

beforeEach(() => {
  blockingGateSpy.mockImplementation(async (gate: string) => {
    blockingGateCalls.push(gate)
    return blockingKairosGateValue
  })
  cachedGateSpy.mockImplementation(<T>(gate: string, _defaultValue: T): T => {
      cachedGateCalls.push(gate)
      return cachedKairosGateValue as T
    })
  cachedKairosGateValue = false
  blockingKairosGateValue = false
  cachedGateCalls.length = 0
  blockingGateCalls.length = 0
  delete process.env.CLAUDE_CODE_ENABLE_KAIROS
})

afterEach(() => {
  blockingGateSpy.mockReset()
  cachedGateSpy.mockReset()
})

afterAll(() => {
  blockingGateSpy.mockRestore()
  cachedGateSpy.mockRestore()
})

describe('KAIROS gates', () => {
  test('assistant command visibility uses the cached tengu_kairos gate', () => {
    cachedKairosGateValue = true
    const kairosCompiledIn = isKairosCompiledIn()

    expect(isAssistantCommandEnabled()).toBe(kairosCompiledIn)
    expect(isKairosEnabledCachedOrEnv()).toBe(kairosCompiledIn)
    expect(cachedGateCalls).toEqual(
      kairosCompiledIn ? ['tengu_kairos', 'tengu_kairos'] : [],
    )
  })

  test('env override keeps command visibility aligned with runtime', async () => {
    process.env.CLAUDE_CODE_ENABLE_KAIROS = '1'
    const kairosCompiledIn = isKairosCompiledIn()

    expect(isAssistantCommandEnabled()).toBe(kairosCompiledIn)
    expect(isKairosEnabledCachedOrEnv()).toBe(kairosCompiledIn)
    expect(await isKairosEnabled()).toBe(kairosCompiledIn)
    expect(await isKairosRuntimeEnabled()).toBe(kairosCompiledIn)
    expect(cachedGateCalls).toHaveLength(0)
    expect(blockingGateCalls).toHaveLength(0)
  })

  test('runtime activation uses the blocking tengu_kairos gate', async () => {
    blockingKairosGateValue = true
    const kairosCompiledIn = isKairosCompiledIn()

    expect(await isKairosEnabled()).toBe(kairosCompiledIn)
    expect(await isKairosRuntimeEnabled()).toBe(kairosCompiledIn)
    expect(blockingGateCalls).toEqual(
      kairosCompiledIn ? ['tengu_kairos', 'tengu_kairos'] : [],
    )
  })
})
