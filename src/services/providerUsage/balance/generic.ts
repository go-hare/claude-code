import type { ProviderBalance } from '../types.js'
import type { BalanceProvider } from './types.js'

function pickAtPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  const parts = path.split('.').filter(Boolean)
  let cur: unknown = obj
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) {
      const idx = Number(part)
      if (!Number.isFinite(idx)) return undefined
      cur = cur[idx]
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return cur
}

const PRIVATE_IP_RE =
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|0\.0\.0\.0|fc|fd|\[::1\]|\[fe80:)/

function assertSafeBalanceUrl(raw: string): URL {
  const parsed = new URL(raw)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`unsupported protocol: ${parsed.protocol}`)
  }
  if (
    parsed.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  ) {
    throw new Error(`http only allowed for localhost, got ${parsed.hostname}`)
  }
  if (PRIVATE_IP_RE.test(parsed.hostname)) {
    throw new Error(`private/reserved IP not allowed: ${parsed.hostname}`)
  }
  return parsed
}

export const genericBalanceProvider: BalanceProvider = {
  providerId: 'generic',

  isEnabled(): boolean {
    return Boolean(process.env.CLAUDE_CODE_BALANCE_URL)
  },

  async fetchBalance(signal?: AbortSignal): Promise<ProviderBalance | null> {
    const rawUrl = process.env.CLAUDE_CODE_BALANCE_URL
    if (!rawUrl) return null

    let url: URL
    try {
      url = assertSafeBalanceUrl(rawUrl)
    } catch {
      return null
    }

    const key =
      process.env.CLAUDE_CODE_BALANCE_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      ''
    const path = process.env.CLAUDE_CODE_BALANCE_JSON_PATH || 'balance'
    const currency = process.env.CLAUDE_CODE_BALANCE_CURRENCY || 'USD'

    let res: Response
    try {
      res = await fetch(url.href, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        signal,
      })
    } catch {
      return null
    }
    if (!res.ok) return null

    let data: unknown
    try {
      data = await res.json()
    } catch {
      return null
    }

    const raw = pickAtPath(data, path)
    const remaining = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(remaining)) return null

    return {
      currency,
      remaining,
      updatedAt: Math.floor(Date.now() / 1000),
    }
  },
}
