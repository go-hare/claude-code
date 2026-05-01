export function applyResumeSessionAtToTranscript<
  TTranscript extends { messages: readonly unknown[] },
>(
  transcript: TTranscript,
  resumeSessionAt: string | undefined,
): { transcript: TTranscript; sliced: boolean; error?: string } {
  if (!resumeSessionAt) {
    return { transcript, sliced: false }
  }

  const index = transcript.messages.findIndex(message =>
    hasMessageUuid(message, resumeSessionAt),
  )
  if (index < 0) {
    return {
      transcript,
      sliced: false,
      error: `No message found with message.uuid of: ${resumeSessionAt}`,
    }
  }

  return {
    transcript: {
      ...transcript,
      messages: transcript.messages.slice(0, index + 1),
    },
    sliced: index + 1 !== transcript.messages.length,
  }
}

function hasMessageUuid(message: unknown, uuid: string): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { uuid?: unknown }).uuid === uuid
  )
}
