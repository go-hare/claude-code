import type { ProviderBalance } from '../types.js'

export interface BalanceProvider {
  readonly providerId: string
  isEnabled(): boolean
  fetchBalance(signal?: AbortSignal): Promise<ProviderBalance | null>
}
