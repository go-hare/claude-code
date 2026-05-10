import { feature } from 'bun:bundle'
import * as growthBook from '../services/analytics/growthbook.js'
import { logForDebugging } from '../utils/debug.js'
import { isEnvTruthy } from '../utils/envUtils.js'

const KAIROS_GATE = 'tengu_kairos'

/**
 * Startup-safe gate for places that must decide immediately, such as command
 * visibility. Uses the same underlying KAIROS gate as runtime activation, but
 * reads from the cached GrowthBook snapshot instead of blocking on init.
 */
export function isKairosEnabledCachedOrEnv(): boolean {
  if (!feature('KAIROS')) {
    return false
  }

  if (isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_KAIROS)) {
    return true
  }

  return growthBook.getFeatureValue_CACHED_MAY_BE_STALE(KAIROS_GATE, false)
}

/**
 * Runtime gate for assistant mode.
 *
 * The compile-time `feature('KAIROS')` switch still controls dead-code
 * elimination. Once the code is present, runtime enablement prefers:
 * 1. `CLAUDE_CODE_ENABLE_KAIROS=1` explicit local override
 * 2. the blocking/cached GrowthBook gate used by assistant startup
 */
export async function isKairosEnabled(): Promise<boolean> {
  if (!feature('KAIROS')) {
    return false
  }

  if (isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_KAIROS)) {
    logForDebugging(`[assistant] ${KAIROS_GATE} -> true (env override)`)
    return true
  }

  const enabled = await growthBook.checkGate_CACHED_OR_BLOCKING(KAIROS_GATE)
  logForDebugging(`[assistant] ${KAIROS_GATE} -> ${enabled}`)
  return enabled
}

/**
 * Runtime activation gate for assistant mode.
 *
 * Use this when deciding whether KAIROS should actually become active for the
 * current session (main.tsx startup path).
 */
export async function isKairosRuntimeEnabled(): Promise<boolean> {
  return isKairosEnabled()
}
