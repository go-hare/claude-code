/**
 * /summary — Generate and display a session summary.
 *
 * Triggers a manual Session Memory extraction, then reads and displays the
 * updated summary.md file.
 */

const API_SAFE_TYPES = new Set(['user', 'assistant', 'system'])

const call = async (_args, context) => {
  const { messages } = context

  const safeMessages = (messages ?? []).filter(
    message => message != null && API_SAFE_TYPES.has(message.type),
  )

  if (safeMessages.length === 0) {
    return { type: 'text', value: 'No messages to summarize.' }
  }

  try {
    const { manuallyExtractSessionMemory } = await import(
      '../../services/SessionMemory/sessionMemory.js'
    )
    const { getSessionMemoryContent } = await import(
      '../../services/SessionMemory/sessionMemoryUtils.js'
    )

    const safeContext = { ...context, messages: safeMessages }
    const result = await manuallyExtractSessionMemory(safeMessages, safeContext)

    if (!result.success) {
      return {
        type: 'text',
        value: `Failed to generate session summary: ${result.error ?? 'unknown error'}`,
      }
    }

    const content = await getSessionMemoryContent()

    if (!content || content.trim().length === 0) {
      return {
        type: 'text',
        value: 'Session summary was updated, but the content is empty.',
      }
    }

    return {
      type: 'text',
      value: `Session summary updated.\n\n${content}`,
    }
  } catch (error) {
    return {
      type: 'text',
      value: `Failed to generate session summary: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

const summary = {
  type: 'local',
  name: 'summary',
  description: 'Generate and display a session summary',
  supportsNonInteractive: true,
  isHidden: false,
  load: () => Promise.resolve({ call }),
}

export default summary
