import type { ProviderUsageAdapter, ProviderUsageBucket } from '../types.js'

function parseResetAt(value: string | null): number {
  if (!value) return 0
  let seconds = 0
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h|d)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(value)) !== null) {
    const n = Number(match[1])
    const unit = match[2]
    switch (unit) {
      case 'ms':
        seconds += n / 1000
        break
      case 's':
        seconds += n
        break
      case 'm':
        seconds += n * 60
        break
      case 'h':
        seconds += n * 3600
        break
      case 'd':
        seconds += n * 86400
        break
    }
  }
  if (seconds === 0) {
    const n = Number(value)
    if (Number.isFinite(n)) seconds = n
  }
  if (seconds <= 0) return 0
  return Math.floor(Date.now() / 1000) + seconds
}

function computeUtilization(
  remaining: string | null,
  limit: string | null,
): number | null {
  if (remaining === null || limit === null) return null
  const r = Number(remaining)
  const l = Number(limit)
  if (!Number.isFinite(r) || !Number.isFinite(l) || l <= 0) return null
  const used = Math.max(0, l - r)
  return Math.min(1, Math.max(0, used / l))
}

export const openaiAdapter: ProviderUsageAdapter = {
  providerId: 'openai',
  parseHeaders(headers): ProviderUsageBucket[] {
    const buckets: ProviderUsageBucket[] = []

    const reqUtil = computeUtilization(
      headers.get('x-ratelimit-remaining-requests'),
      headers.get('x-ratelimit-limit-requests'),
    )
    if (reqUtil !== null) {
      buckets.push({
        kind: 'requests',
        label: 'RPM',
        utilization: reqUtil,
        resetsAt:
          parseResetAt(headers.get('x-ratelimit-reset-requests')) || undefined,
      })
    }

    const tokUtil = computeUtilization(
      headers.get('x-ratelimit-remaining-tokens'),
      headers.get('x-ratelimit-limit-tokens'),
    )
    if (tokUtil !== null) {
      buckets.push({
        kind: 'tokens',
        label: 'TPM',
        utilization: tokUtil,
        resetsAt:
          parseResetAt(headers.get('x-ratelimit-reset-tokens')) || undefined,
      })
    }

    return buckets
  },
}
