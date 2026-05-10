import React from 'react'
import {
  backfillStoredCompanionProfiles,
  generateSeed,
  getCompanion,
  getCompanionSeed,
  getStoredCompanion,
  withStoredCompanionProfile,
} from '../../buddy/companion.js'
import { triggerCompanionReaction } from '../../buddy/companionReact.js'
import { CompanionCard } from '../../buddy/CompanionCard.js'
import { generateStoredCompanion } from '../../buddy/soul.js'
import { type Companion, type Species } from '../../buddy/types.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'

function backfillCompanionProfilesIfNeeded(): void {
  const config = getGlobalConfig()
  if (!config.companion) return

  saveGlobalConfig(backfillStoredCompanionProfiles)
}

function showCompanionCard(
  companion: Companion,
  context: ToolUseContext & LocalJSXCommandContext,
  onDone: LocalJSXCommandOnDone,
): React.ReactNode {
  const lastReaction = context.getAppState?.()?.companionReaction
  return React.createElement(CompanionCard, {
    companion,
    lastReaction,
    onDone: onDone as unknown as Parameters<typeof CompanionCard>[0]['onDone'],
  })
}

async function hatchBuddy(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  options?: { forceNewSeed?: boolean },
): Promise<React.ReactNode> {
  backfillCompanionProfilesIfNeeded()
  const stableSeed = getCompanionSeed()
  const existingStored = getStoredCompanion(stableSeed)
  if (existingStored && !options?.forceNewSeed) {
    const existing = getCompanion()
    if (existing) {
      return showCompanionCard(existing, context, onDone)
    }
    onDone('Buddy already hatched.', { display: 'system' })
    return null
  }

  const soulSeed = options?.forceNewSeed ? generateSeed() : stableSeed
  const stored = await generateStoredCompanion(
    soulSeed,
    context.abortController.signal,
  )
  const nextStored =
    options?.forceNewSeed && soulSeed !== stableSeed
      ? { ...stored, seed: soulSeed }
      : stored

  saveGlobalConfig(current => {
    const next = withStoredCompanionProfile(current, stableSeed, nextStored)
    return {
      ...next,
      companionMuted: false,
    }
  })
  context.setAppState(prev => ({
    ...prev,
    companionReaction: undefined,
    companionPetAt: undefined,
  }))

  const companion = getCompanion()
  if (companion) {
    if (options?.forceNewSeed) {
      onDone(`${companion.name} has rehatched.`, { display: 'system' })
    }
    return showCompanionCard(companion, context, onDone)
  }

  onDone(options?.forceNewSeed ? 'Buddy rehatched.' : 'Hatched a new buddy.', {
    display: 'system',
  })
  return null
}

function showBuddyCard(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
): React.ReactNode | null {
  backfillCompanionProfilesIfNeeded()
  const companion = getCompanion()
  if (!companion) {
    onDone('No buddy hatched yet. Use /buddy hatch.', { display: 'system' })
    return null
  }

  if (getGlobalConfig().companionMuted) {
    saveGlobalConfig(current => ({
      ...current,
      companionMuted: false,
    }))
  }

  return showCompanionCard(companion, context, onDone)
}

function petBuddy(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
): null {
  backfillCompanionProfilesIfNeeded()
  const companion = getCompanion()
  if (!companion) {
    onDone('No buddy hatched yet. Use /buddy hatch.', { display: 'system' })
    return null
  }

  saveGlobalConfig(current => ({
    ...current,
    companionMuted: false,
  }))
  context.setAppState(prev => ({
    ...prev,
    companionPetAt: Date.now(),
  }))
  triggerCompanionReaction(context.messages ?? [], reaction =>
    context.setAppState(prev =>
      prev.companionReaction === reaction
        ? prev
        : { ...prev, companionReaction: reaction as string | undefined },
    ),
  )
  onDone(`petted ${companion.name}`, { display: 'system' })
  return null
}

function setBuddyMuted(
  muted: boolean,
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
): null {
  backfillCompanionProfilesIfNeeded()
  const companion = getCompanion()
  if (!companion) {
    onDone('No buddy hatched yet. Use /buddy hatch.', { display: 'system' })
    return null
  }

  saveGlobalConfig(current => ({
    ...current,
    companionMuted: muted,
  }))

  if (muted) {
    context.setAppState(prev => ({
      ...prev,
      companionReaction: undefined,
    }))
  }

  onDone(
    muted
      ? `${companion.name} is now muted.`
      : `${companion.name} is listening again.`,
    { display: 'system' },
  )
  return null
}

function buddyHelp(onDone: LocalJSXCommandOnDone): null {
  onDone(
    [
      'Usage: /buddy [hatch|card|rehatch|pet|mute|unmute]',
      '/buddy with no arguments will hatch your buddy if needed, otherwise show its card.',
      'Aliases: off -> mute, on -> unmute',
    ].join('\n'),
    { display: 'system' },
  )
  return null
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const [subcommand = ''] = args.trim().split(/\s+/)

  switch (subcommand.toLowerCase()) {
    case '':
      return getCompanion()
        ? showBuddyCard(onDone, context)
        : hatchBuddy(onDone, context)
    case 'hatch':
      return hatchBuddy(onDone, context)
    case 'card':
      return showBuddyCard(onDone, context)
    case 'rehatch':
      return hatchBuddy(onDone, context, { forceNewSeed: true })
    case 'pet':
      return petBuddy(onDone, context)
    case 'mute':
    case 'off':
      return setBuddyMuted(true, onDone, context)
    case 'unmute':
    case 'on':
      return setBuddyMuted(false, onDone, context)
    default:
      return buddyHelp(onDone)
  }
}
