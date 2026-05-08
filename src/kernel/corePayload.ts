export function stripUndefined<T>(value: T | undefined): T | undefined {
  if (value === undefined) {
    return undefined
  }
  if (Array.isArray(value)) {
    return value
      .filter(item => item !== undefined)
      .map(item => stripUndefined(item)) as T
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, unknown] => entry[1] !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)])
    return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined
  }
  return value
}
