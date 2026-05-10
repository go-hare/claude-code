import type { UUID } from 'crypto'
import type { Message } from 'src/types/message'

type SnipMetadata = {
  removedUuids?: UUID[]
}

type SnipBoundaryLike = Message & {
  snipMetadata?: SnipMetadata
  subtype?: string
  content?: unknown
}

function getRemovedUuids(message: Message): UUID[] {
  const removedUuids = (message as SnipBoundaryLike).snipMetadata?.removedUuids
  return Array.isArray(removedUuids) ? removedUuids : []
}

export function isSnipBoundaryMessage(message: Message): boolean {
  if (message.type !== 'system') {
    return false
  }

  if (getRemovedUuids(message).length > 0) {
    return true
  }

  const boundary = message as SnipBoundaryLike
  return (
    boundary.subtype === 'snip_boundary' ||
    boundary.content === '[snip] Conversation history before this point has been snipped.'
  )
}

export function projectSnippedView(messages: Message[]): Message[] {
  let latestBoundaryIndex = -1
  const removedUuids = new Set<UUID>()

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!
    if (!isSnipBoundaryMessage(message)) {
      continue
    }
    latestBoundaryIndex = i
    for (const uuid of getRemovedUuids(message)) {
      removedUuids.add(uuid)
    }
  }

  if (latestBoundaryIndex === -1) {
    return messages
  }

  return messages.filter((message, index) => {
    if (index >= latestBoundaryIndex) {
      return true
    }
    return !removedUuids.has(message.uuid)
  })
}
