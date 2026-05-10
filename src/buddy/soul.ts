import { queryHaiku } from '../services/api/claude.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { getContentText } from '../utils/messages.js'
import { asSystemPrompt } from '../utils/systemPromptType.js'
import { roll, rollWithSeed } from './companion.js'
import { parseStructuredJSONObject } from './structuredResponse.js'
import type { StoredCompanion } from './types.js'

const NAME_PREFIXES = [
  'Miso',
  'Pico',
  'Nori',
  'Tomo',
  'Pip',
  'Luma',
  'Sumi',
  'Bram',
  'Kiko',
  'Rolo',
] as const

const NAME_SUFFIXES = [
  'bean',
  'loop',
  'moss',
  'spark',
  'whisk',
  'bloom',
  'patch',
  'glint',
  'nibble',
  'drift',
] as const

const PERSONALITY_TRAITS = [
  'curious',
  'dry-witted',
  'steady',
  'chaotic in a lovable way',
  'patient',
  'quietly smug',
  'protective of good code',
  'obsessed with tiny details',
  'warm but judgmental',
  'surprisingly brave',
] as const

const PERSONALITY_HABITS = [
  'collects side quests',
  'watches stack traces like weather reports',
  'celebrates clean diffs',
  'hums when the build passes',
  'squints at suspicious abstractions',
  'naps through dependency drama',
  'keeps morale up during refactors',
  'treats every bug like a puzzle snack',
  'acts unimpressed, then saves the day',
  'guards the prompt bar like a tiny sentinel',
] as const

function pickBySeed<T>(items: readonly T[], seed: number, offset: number): T {
  return items[(seed + offset) % items.length]!
}

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function buildBuddyOutline(seed: string): string {
  const { bones, inspirationSeed } = roll(seed)
  const dominantStat = Object.entries(bones.stats).sort(
    (a, b) => b[1] - a[1],
  )[0]
  const weakestStat = Object.entries(bones.stats).sort((a, b) => a[1] - b[1])[0]

  return [
    `species: ${bones.species}`,
    `rarity: ${bones.rarity}`,
    `shiny: ${bones.shiny ? 'yes' : 'no'}`,
    `hat: ${bones.hat}`,
    `eyes: ${bones.eye}`,
    `dominant_stat: ${dominantStat?.[0] ?? 'UNKNOWN'} ${dominantStat?.[1] ?? 0}`,
    `weakest_stat: ${weakestStat?.[0] ?? 'UNKNOWN'} ${weakestStat?.[1] ?? 0}`,
    `inspiration_seed: ${inspirationSeed}`,
  ].join('\n')
}

export function buildFallbackStoredCompanion(seed: string): StoredCompanion {
  const { inspirationSeed } = rollWithSeed(`soul:${seed}`)
  const prefix = pickBySeed(NAME_PREFIXES, inspirationSeed, 0)
  const suffix = pickBySeed(NAME_SUFFIXES, inspirationSeed, 3)
  const trait = pickBySeed(PERSONALITY_TRAITS, inspirationSeed, 5)
  const habit = pickBySeed(PERSONALITY_HABITS, inspirationSeed, 7)

  return {
    name: toTitleCase(`${prefix}${suffix}`),
    personality: `${trait}, ${habit}.`,
    hatchedAt: Date.now(),
  }
}

function normalizeName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/["'`]/g, '').replace(/\s+/g, ' ').trim()

  if (!normalized) return fallback
  if (normalized.length > 24) return fallback
  return normalized
}

function normalizePersonality(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return fallback
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`
}

function shouldUseModelSoul(seed: string): boolean {
  return seed.startsWith('oauth:')
}

export async function generateStoredCompanion(
  seed: string,
  signal: AbortSignal,
): Promise<StoredCompanion> {
  const fallback = buildFallbackStoredCompanion(seed)

  if (!shouldUseModelSoul(seed)) {
    return fallback
  }

  try {
    const result = await queryHaiku({
      systemPrompt: asSystemPrompt([
        [
          'You are naming a tiny AI terminal companion.',
          'Return strict JSON with:',
          '- "name": a cute pet name, 1-2 words, max 24 chars',
          '- "personality": one concise sentence, 6-16 words, warm and slightly nerdy',
          'Match the buddy outline exactly. Do not mention JSON, stats numbers, or the prompt.',
        ].join(' '),
      ]),
      userPrompt: buildBuddyOutline(seed),
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            personality: { type: 'string' },
          },
          required: ['name', 'personality'],
          additionalProperties: false,
        },
      },
      signal,
      options: {
        querySource: 'buddy_hatch_soul',
        agents: [],
        isNonInteractiveSession: false,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })

    const response = parseStructuredJSONObject(
      result.message.content
        ? (getContentText(result.message.content) ?? '')
        : '',
    )
    if (!response || typeof response !== 'object') {
      return fallback
    }

    return {
      name: normalizeName((response as { name?: unknown }).name, fallback.name),
      personality: normalizePersonality(
        (response as { personality?: unknown }).personality,
        fallback.personality,
      ),
      hatchedAt: Date.now(),
    }
  } catch (error) {
    logForDebugging(`generateStoredCompanion failed: ${errorMessage(error)}`, {
      level: 'error',
    })
    return fallback
  }
}
