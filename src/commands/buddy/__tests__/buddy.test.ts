import { beforeEach, describe, expect, mock, test } from 'bun:test'

const mockGetCompanion = mock(() => ({
  name: 'Tomopatch',
  species: 'robot',
  rarity: 'rare',
  shiny: false,
  personality: 'calm',
  stats: { focus: 80 },
}))
const mockGetCompanionSeed = mock(() => 'seed-1')
const mockGetStoredCompanion = mock(() => ({ seed: 'seed-1' }))
const mockWithStoredCompanionProfile = mock((current: unknown) => current)
const mockGenerateSeed = mock(() => 'seed-2')
const mockBackfillProfiles = mock((current: unknown) => current)
const mockGenerateStoredCompanion = mock(async () => ({ seed: 'seed-1' }))
const mockGetGlobalConfig = mock(() => ({ companionMuted: false, companion: {} }))
const mockSaveGlobalConfig = mock((_updater: unknown) => {})
const mockTriggerCompanionReaction = mock(
  (_messages: unknown[], callback: (reaction: string | undefined) => void) => {
    callback('Tomopatch emits a satisfied chirp.')
  },
)

mock.module('../../../buddy/companion.js', () => ({
  backfillStoredCompanionProfiles: mockBackfillProfiles,
  generateSeed: mockGenerateSeed,
  getCompanion: mockGetCompanion,
  getCompanionSeed: mockGetCompanionSeed,
  getStoredCompanion: mockGetStoredCompanion,
  withStoredCompanionProfile: mockWithStoredCompanionProfile,
}))

mock.module('../../../buddy/companionReact.js', () => ({
  triggerCompanionReaction: mockTriggerCompanionReaction,
}))

mock.module('../../../buddy/CompanionCard.js', () => ({
  CompanionCard: (_props: unknown) => null,
}))

mock.module('../../../buddy/soul.js', () => ({
  generateStoredCompanion: mockGenerateStoredCompanion,
}))

mock.module('../../../utils/config.js', () => ({
  getGlobalConfig: mockGetGlobalConfig,
  saveGlobalConfig: mockSaveGlobalConfig,
}))

const buddy = await import('../buddy.js')

describe('buddy command', () => {
  beforeEach(() => {
    mockGetCompanion.mockClear()
    mockGetGlobalConfig.mockClear()
    mockSaveGlobalConfig.mockClear()
    mockTriggerCompanionReaction.mockClear()
  })

  test('/buddy pet writes petAt first and reaction via async callback', async () => {
    const appStateUpdates: Array<{
      companionReaction?: string
      companionPetAt?: number
    }> = []
    const onDone = mock((_text?: string, _options?: { display?: string }) => {})
    const context = {
      messages: [],
      setAppState: (
        updater: (prev: {
          companionReaction?: string
          companionPetAt?: number
        }) => {
          companionReaction?: string
          companionPetAt?: number
        },
      ) => {
        const prev = appStateUpdates.at(-1) ?? {
          companionReaction: undefined,
          companionPetAt: undefined,
        }
        appStateUpdates.push(updater(prev))
      },
      getAppState: () => ({ companionReaction: undefined }),
    }

    const jsx = await buddy.call(onDone as never, context as never, 'pet')

    expect(jsx).toBeNull()
    expect(appStateUpdates).toHaveLength(2)
    expect(appStateUpdates[0]?.companionPetAt).toEqual(expect.any(Number))
    expect(appStateUpdates[0]?.companionReaction).toBeUndefined()
    expect(appStateUpdates[1]?.companionReaction).toBe(
      'Tomopatch emits a satisfied chirp.',
    )
    expect(mockTriggerCompanionReaction).toHaveBeenCalledWith([], expect.any(Function))
    expect(onDone).toHaveBeenCalledWith('petted Tomopatch', { display: 'system' })
  })
})
