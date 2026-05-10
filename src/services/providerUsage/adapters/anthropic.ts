import type { ProviderUsageAdapter, ProviderUsageBucket } from '../types.js'

export const anthropicAdapter: ProviderUsageAdapter = {
  providerId: 'anthropic',
  parseHeaders(headers): ProviderUsageBucket[] {
    const buckets: ProviderUsageBucket[] = []
    for (const [abbrev, kind, label] of [
      ['5h', 'session', 'Session'],
      ['7d', 'weekly', 'Weekly'],
    ] as const) {
      const util = headers.get(
        `anthropic-ratelimit-unified-${abbrev}-utilization`,
      )
      const reset = headers.get(`anthropic-ratelimit-unified-${abbrev}-reset`)
      if (util === null || reset === null) continue
      const utilization = Number(util)
      const resetsAt = Number(reset)
      if (!Number.isFinite(utilization)) continue
      buckets.push({
        kind,
        label,
        utilization,
        ...(Number.isFinite(resetsAt) && resetsAt > 0 ? { resetsAt } : {}),
      })
    }
    return buckets
  },
}
