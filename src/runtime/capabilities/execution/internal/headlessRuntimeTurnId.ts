import { randomUUID } from 'crypto'

export function resolveHeadlessRuntimeTurnId(commandUuid?: string): string {
  const normalizedCommandUuid = commandUuid?.trim()
  return normalizedCommandUuid && normalizedCommandUuid.length > 0
    ? normalizedCommandUuid
    : randomUUID()
}
