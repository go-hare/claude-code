import { safeParseJSON } from '../utils/json.js'

export function parseStructuredJSONObject(
  text: string,
): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  const parsed =
    safeParseJSON(trimmed) ??
    safeParseJSON(extractJsonFromFencedBlock(trimmed), false) ??
    safeParseJSON(extractBalancedJsonObject(trimmed), false)

  return parsed && typeof parsed === 'object'
    ? (parsed as Record<string, unknown>)
    : null
}

function extractJsonFromFencedBlock(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return match?.[1]?.trim() || null
}

function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    return null
  }
  return text.slice(start, end + 1)
}
