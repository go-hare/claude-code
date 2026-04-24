/**
 * Companion reaction system.
 *
 * Called from REPL.tsx after each query turn. Checks mute state, frequency
 * limits, and @-mention detection, then uses the current configured provider
 * to generate a short companion reaction shown in the CompanionSprite bubble.
 */
import { getCompanion } from './companion.js'
import { parseStructuredJSONObject } from './structuredResponse.js'
import { getGlobalConfig } from '../utils/config.js'
import type { Message } from '../types/message.js'
import { queryWithModel } from '../services/api/claude.js'
import { extractTextContent } from '../utils/messages.js'
import { asSystemPrompt } from '../utils/systemPromptType.js'
import {
  getMainLoopModel,
  getSmallFastModel,
} from '../utils/model/model.js'
import { getAPIProvider } from '../utils/model/providers.js'

// ─── Rate limiting ──────────────────────────────────

let lastReactTime = 0
const MIN_INTERVAL_MS = 45_000 // official is roughly 30-60s

// ─── Recent reactions (avoid repetition) ────────────

const recentReactions: string[] = []
const MAX_RECENT = 8

// ─── Public API ─────────────────────────────────────

type CompanionObserver = (
  messages: Message[],
  setReaction: (text: string | undefined) => void,
) => void

type GlobalWithCompanionObserver = typeof globalThis & {
  fireCompanionObserver?: CompanionObserver
}

const REACTION_SCHEMA = {
  type: 'object',
  properties: {
    reaction: { type: 'string' },
  },
  required: ['reaction'],
  additionalProperties: false,
} as const

export function getBuddyReactionModel(): string {
  if (getAPIProvider() !== 'openai') {
    return getSmallFastModel()
  }

  if (process.env.OPENAI_SMALL_FAST_MODEL) {
    return process.env.OPENAI_SMALL_FAST_MODEL
  }

  if (
    process.env.OPENAI_DEFAULT_HAIKU_MODEL ||
    process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL
  ) {
    return getSmallFastModel()
  }

  if (process.env.OPENAI_MODEL) {
    return process.env.OPENAI_MODEL
  }

  return getMainLoopModel()
}

export function parseBuddyReactionResponse(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  const parsed = parseStructuredJSONObject(trimmed)
  if (parsed && typeof parsed === 'object') {
    const reaction = (parsed as { reaction?: unknown }).reaction
    return typeof reaction === 'string' ? reaction.trim() || null : null
  }

  const plainText = trimmed.replace(/```(?:json)?|```/gi, '').replace(/\s+/g, ' ').trim()
  if (!plainText || /[{}[\]]/.test(plainText)) {
    return null
  }

  return plainText.length > 140 ? `${plainText.slice(0, 139)}…` : plainText
}

/**
 * Trigger a companion reaction after a query turn.
 *
 * Flow:
 *  1. Check companion exists and is not muted
 *  2. Detect if user @-mentioned companion by name
 *  3. Apply rate limiting (skip if not addressed and too soon)
 *  4. Build conversation transcript
 *  5. Call the currently configured model provider
 *  6. Pass reaction text to setReaction callback
 */
export function triggerCompanionReaction(
  messages: Message[],
  setReaction: (text: string | undefined) => void,
): void {
  const companion = getCompanion()
  if (!companion || getGlobalConfig().companionMuted) return

  const addressed = isAddressed(messages, companion.name)

  const now = Date.now()
  if (!addressed && now - lastReactTime < MIN_INTERVAL_MS) return

  const transcript = buildTranscript(messages)
  if (!transcript.trim()) return

  lastReactTime = now

  void generateBuddyReaction(companion, transcript, addressed)
    .then(reaction => {
      if (!reaction) return
      recentReactions.push(reaction)
      if (recentReactions.length > MAX_RECENT) recentReactions.shift()
      setReaction(reaction)
    })
    .catch(() => {})
}

// ─── Helpers ────────────────────────────────────────

function isAddressed(messages: Message[], name: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i')
  for (
    let i = messages.length - 1;
    i >= Math.max(0, messages.length - 3);
    i--
  ) {
    const m = messages[i]
    if (m?.type !== 'user') continue
    const content = (m as any).message?.content
    if (typeof content === 'string' && pattern.test(content)) return true
  }
  return false
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildTranscript(messages: Message[]): string {
  return messages
    .slice(-12)
    .filter(m => m.type === 'user' || m.type === 'assistant')
    .map(m => {
      const role = m.type === 'user' ? 'user' : 'claude'
      const content = (m as any).message?.content
      const text =
        typeof content === 'string'
          ? content.slice(0, 300)
          : Array.isArray(content)
            ? content
                .filter((b: any) => b?.type === 'text')
                .map((b: any) => b.text)
                .join(' ')
                .slice(0, 300)
            : ''
      return `${role}: ${text}`
    })
    .join('\n')
    .slice(0, 5000)
}

export function installCompanionObserver(): void {
  const globalWithObserver = globalThis as GlobalWithCompanionObserver
  globalWithObserver.fireCompanionObserver = triggerCompanionReaction
}

// ─── Model call ─────────────────────────────────────

async function generateBuddyReaction(
  companion: {
    name: string
    personality: string
    species: string
    rarity: string
    stats: Record<string, number>
  },
  transcript: string,
  addressed: boolean,
): Promise<string | null> {
  try {
    const result = await queryWithModel({
      systemPrompt: asSystemPrompt([
        [
          'You are a tiny terminal buddy reacting to a coding conversation.',
          `Your name is ${companion.name}.`,
          `Your personality is: ${companion.personality}`,
          'Return strict JSON with one field: "reaction".',
          'The reaction must be one short sentence, playful, warm, and concise.',
          'Do not narrate actions outside the buddy voice.',
          'Avoid repeating recent reactions.',
        ].join(' '),
      ]),
      userPrompt: [
        `species: ${companion.species}`,
        `rarity: ${companion.rarity}`,
        `addressed: ${addressed ? 'yes' : 'no'}`,
        `recent_reactions: ${recentReactions.join(' | ') || 'none'}`,
        '',
        'conversation:',
        transcript,
      ].join('\n'),
      outputFormat: {
        type: 'json_schema',
        schema: REACTION_SCHEMA,
      },
      signal: AbortSignal.timeout(10_000),
      options: {
        model: getBuddyReactionModel(),
        querySource: 'buddy_reaction',
        agents: [],
        isNonInteractiveSession: false,
        hasAppendSystemPrompt: false,
        mcpTools: [],
        maxOutputTokensOverride: 120,
      },
    })

    return parseBuddyReactionResponse(
      extractTextContent(
        result.message.content as readonly { readonly type: string }[],
      ) ?? '',
    )
  } catch {
    return null
  }
}
