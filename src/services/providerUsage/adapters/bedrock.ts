import type { ProviderUsageAdapter, ProviderUsageBucket } from '../types.js'

export const bedrockAdapter: ProviderUsageAdapter = {
  providerId: 'bedrock',
  parseHeaders(headers): ProviderUsageBucket[] {
    const buckets: ProviderUsageBucket[] = []

    const remainingRaw = headers.get('x-amzn-bedrock-quota-remaining')
    const resetRaw = headers.get('x-amzn-bedrock-quota-reset')

    if (remainingRaw !== null) {
      const remaining = Number(remainingRaw)
      if (Number.isFinite(remaining) && remaining >= 0 && remaining <= 1) {
        const resetsAt = resetRaw !== null ? Number(resetRaw) : 0
        buckets.push({
          kind: 'throttle',
          label: 'Throttle',
          utilization: 1 - remaining,
          ...(Number.isFinite(resetsAt) && resetsAt > 0 ? { resetsAt } : {}),
        })
      }
    }

    return buckets
  },
}
