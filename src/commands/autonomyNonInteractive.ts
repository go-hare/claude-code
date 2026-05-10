import type { Command, LocalCommandCall } from '../types/command.js'
import { getAutonomyCommandText } from '../cli/handlers/autonomy.js'

const call: LocalCommandCall = async args => {
  const trimmed = args.trim()
  const command = trimmed || 'status'
  return {
    type: 'text',
    value: await getAutonomyCommandText(command, {
      enqueueInMemory: true,
      removeQueuedInMemory: true,
    }),
  }
}

const autonomyNonInteractive = {
  type: 'local',
  name: 'autonomy',
  supportsNonInteractive: true,
  description:
    'Inspect automatic autonomy runs recorded for proactive ticks and scheduled tasks',
  argumentHint:
    '[status [--deep]|runs [limit]|flows [limit]|flow <id>|flow cancel <id>|flow resume <id>]',
  get isHidden() {
    return false
  },
  load: () => Promise.resolve({ call }),
} satisfies Command

export default autonomyNonInteractive
