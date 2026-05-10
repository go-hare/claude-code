import { isKairosEnabledCachedOrEnv } from '../../assistant/gate.js'

/**
 * Visibility gate for the /assistant command.
 *
 * This intentionally mirrors the same KAIROS gate used by runtime activation.
 * The command is still visible before the current session has activated
 * assistant mode, but it should not drift onto a separate GrowthBook flag.
 */
export function isAssistantEnabled(): boolean {
  return isKairosEnabledCachedOrEnv()
}

/**
 * Command-level visibility gate for `/assistant`.
 *
 * This is intentionally narrower than assistant runtime activation:
 * - it controls whether the command is exposed in the CLI
 * - it does not imply kairosActive is already enabled for the session
 */
export function isAssistantCommandEnabled(): boolean {
  return isAssistantEnabled()
}
