export function resolveHeadlessResumeInterruptedTurn(
  explicit: boolean | undefined,
  envValue = process.env.CLAUDE_CODE_RESUME_INTERRUPTED_TURN,
): boolean {
  if (explicit !== undefined) {
    return explicit
  }
  return Boolean(envValue)
}
