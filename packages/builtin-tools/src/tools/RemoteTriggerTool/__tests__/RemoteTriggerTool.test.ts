import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from 'src/bootstrap/state.js'

let requestStatus = 200

mock.module('axios', () => ({
  AxiosHeaders: class AxiosHeaders {},
  default: {
    isAxiosError: () => false,
    request: async () => ({
      status: requestStatus,
      data: { ok: requestStatus >= 200 && requestStatus < 300 },
    }),
  },
  isAxiosError: () => false,
}))

mock.module('src/utils/auth.js', () => ({
  calculateApiKeyHelperTTL: () => 0,
  checkAndRefreshOAuthTokenIfNeeded: async () => {},
  checkGcpCredentialsValid: async () => false,
  clearApiKeyHelperCache: () => {},
  clearAwsCredentialsCache: () => {},
  clearGcpCredentialsCache: () => {},
  clearOAuthTokenCache: () => {},
  getAccountInformation: () => null,
  getAnthropicApiKey: () => null,
  getAnthropicApiKeyWithSource: () => ({ apiKey: null, source: null }),
  getApiKeyFromApiKeyHelper: async () => null,
  getApiKeyFromApiKeyHelperCached: () => null,
  getApiKeyFromConfigOrMacOSKeychain: async () => null,
  getAuthTokenSource: () => null,
  getClaudeAIOAuthTokens: () => ({ accessToken: 'token' }),
  getClaudeAIOAuthTokensAsync: async () => ({ accessToken: 'token' }),
  getConfiguredApiKeyHelper: () => undefined,
  getOauthAccountInfo: () => null,
  getOtelHeadersFromHelper: () => ({}),
  getRateLimitTier: () => null,
  getSubscriptionName: () => '',
  getSubscriptionType: () => null,
  handleOAuth401Error: async () => {},
  hasAnthropicApiKeyAuth: () => false,
  hasOpusAccess: () => false,
  hasProfileScope: () => false,
  is1PApiCustomer: () => false,
  isAnthropicAuthEnabled: () => false,
  isAwsAuthRefreshFromProjectSettings: () => false,
  isAwsCredentialExportFromProjectSettings: () => false,
  isClaudeAISubscriber: () => false,
  isConsumerSubscriber: () => false,
  isCustomApiKeyApproved: () => false,
  isEnterpriseSubscriber: () => false,
  isGcpAuthRefreshFromProjectSettings: () => false,
  isMaxSubscriber: () => false,
  isOtelHeadersHelperFromProjectOrLocalSettings: () => false,
  isOverageProvisioningAllowed: () => false,
  isProSubscriber: () => false,
  isTeamPremiumSubscriber: () => false,
  isTeamSubscriber: () => false,
  isUsing3PServices: () => false,
  prefetchApiKeyFromApiKeyHelperIfSafe: () => {},
  prefetchAwsCredentialsAndBedRockInfoIfSafe: () => {},
  prefetchGcpCredentialsIfSafe: () => {},
  refreshAndGetAwsCredentials: async () => null,
  refreshAwsAuth: async () => false,
  refreshGcpAuth: async () => false,
  refreshGcpCredentialsIfNeeded: async () => null,
  removeApiKey: async () => {},
  saveApiKey: async () => {},
  saveOAuthTokensIfNeeded: () => ({ didSave: false }),
  validateForceLoginOrg: async () => ({ valid: true }),
}))

mock.module('src/services/oauth/client.js', () => ({
  buildAuthUrl: () => '',
  createAndStoreApiKey: async () => null,
  exchangeCodeForTokens: async () => null,
  fetchAndStoreUserRoles: async () => null,
  fetchProfileInfo: async () => null,
  getOrganizationUUID: async () => 'org',
  isOAuthTokenExpired: () => false,
  parseScopes: () => [],
  populateOAuthAccountInfoIfNeeded: async () => false,
  refreshOAuthToken: async () => null,
  shouldUseClaudeAIAuth: () => false,
  storeOAuthAccountInfo: () => {},
}))



let cwd = ''

beforeEach(async () => {
  requestStatus = 200
  cwd = join(tmpdir(), `remote-trigger-tool-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(cwd, { recursive: true })
  resetStateForTests()
  setOriginalCwd(cwd)
  setProjectRoot(cwd)
})

afterEach(async () => {
  resetStateForTests()
  await rm(cwd, { recursive: true, force: true })
})

describe('RemoteTriggerTool audit', () => {
  test('writes an audit record for successful remote calls', async () => {
    const { RemoteTriggerTool } = await import('../RemoteTriggerTool.js')
    const result = await RemoteTriggerTool.call(
      { action: 'run', trigger_id: 'trigger-1' },
      { abortController: new AbortController() } as any,
    )

    expect(result.data.audit_id).toBeString()
    const raw = await readFile(
      join(cwd, '.claude', 'remote-trigger-audit.jsonl'),
      'utf-8',
    )
    expect(raw).toContain('"action":"run"')
    expect(raw).toContain('"triggerId":"trigger-1"')
    expect(raw).toContain('"ok":true')
  })

  test('writes an audit record before rethrowing validation failures', async () => {
    const { RemoteTriggerTool } = await import('../RemoteTriggerTool.js')

    await expect(
      RemoteTriggerTool.call(
        { action: 'run' },
        { abortController: new AbortController() } as any,
      ),
    ).rejects.toThrow('run requires trigger_id')

    const raw = await readFile(
      join(cwd, '.claude', 'remote-trigger-audit.jsonl'),
      'utf-8',
    )
    expect(raw).toContain('"action":"run"')
    expect(raw).toContain('"ok":false')
    expect(raw).toContain('run requires trigger_id')
  })
})
