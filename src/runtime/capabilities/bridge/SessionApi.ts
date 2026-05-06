import type { ProtocolMessage } from 'src/types/protocol/index.js'
import { logForDebugging } from '../../../utils/debug.js'
import { errorMessage } from '../../../utils/errors.js'
import { extractErrorDetail } from '../../../bridge/debugUtils.js'
import { toCompatSessionId } from '../../../bridge/sessionIdCompat.js'

type GitSource = {
  type: 'git_repository'
  url: string
  revision?: string
}

type GitOutcome = {
  type: 'git_repository'
  git_info: { type: 'github'; repo: string; branches: string[] }
}

type SessionEvent = {
  type: 'event'
  data: ProtocolMessage
}

export async function createBridgeSessionRuntime(params: {
  environmentId: string
  title?: string
  events: SessionEvent[]
  gitRepoUrl: string | null
  branch: string
  signal: AbortSignal
  baseUrl?: string
  getAccessToken?: () => string | undefined
  permissionMode?: string
}): Promise<string | null> {
  const { getClaudeAIOAuthTokens } = await import('../../../utils/auth.js')
  const { getOrganizationUUID } = await import('../../../services/oauth/client.js')
  const { getOauthConfig } = await import('../../../constants/oauth.js')
  const { getOAuthHeaders } = await import('../../../utils/teleport/api.js')
  const { parseGitHubRepository } = await import('../../../utils/detectRepository.js')
  const { getDefaultBranch } = await import('../../../utils/git.js')
  const { getMainLoopModel } = await import('../../../utils/model/model.js')
  const { default: axios } = await import('axios')
  const { isSelfHostedBridge } = await import('../../../bridge/bridgeConfig.js')

  const accessToken =
    params.getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken
  if (!accessToken) {
    logForDebugging('[bridge] No access token for session creation')
    return null
  }

  const orgUUID = isSelfHostedBridge()
    ? 'self-hosted'
    : await getOrganizationUUID()
  if (!orgUUID) {
    logForDebugging('[bridge] No org UUID for session creation')
    return null
  }

  let gitSource: GitSource | null = null
  let gitOutcome: GitOutcome | null = null

  if (params.gitRepoUrl) {
    const { parseGitRemote } = await import('../../../utils/detectRepository.js')
    const parsed = parseGitRemote(params.gitRepoUrl)
    if (parsed) {
      const { host, owner, name } = parsed
      const revision = params.branch || (await getDefaultBranch()) || undefined
      gitSource = {
        type: 'git_repository',
        url: `https://${host}/${owner}/${name}`,
        revision,
      }
      gitOutcome = {
        type: 'git_repository',
        git_info: {
          type: 'github',
          repo: `${owner}/${name}`,
          branches: [`claude/${params.branch || 'task'}`],
        },
      }
    } else {
      const ownerRepo = parseGitHubRepository(params.gitRepoUrl)
      if (ownerRepo) {
        const [owner, name] = ownerRepo.split('/')
        if (owner && name) {
          const revision = params.branch || (await getDefaultBranch()) || undefined
          gitSource = {
            type: 'git_repository',
            url: `https://github.com/${owner}/${name}`,
            revision,
          }
          gitOutcome = {
            type: 'git_repository',
            git_info: {
              type: 'github',
              repo: `${owner}/${name}`,
              branches: [`claude/${params.branch || 'task'}`],
            },
          }
        }
      }
    }
  }

  const requestBody = {
    ...(params.title !== undefined && { title: params.title }),
    events: params.events,
    session_context: {
      sources: gitSource ? [gitSource] : [],
      outcomes: gitOutcome ? [gitOutcome] : [],
      model: getMainLoopModel(),
    },
    environment_id: params.environmentId,
    source: 'remote-control',
    ...(params.permissionMode && { permission_mode: params.permissionMode }),
  }

  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  }

  const url = `${params.baseUrl ?? getOauthConfig().BASE_API_URL}/v1/sessions`
  let response
  try {
    response = await axios.post(url, requestBody, {
      headers,
      signal: params.signal,
      validateStatus: s => s < 500,
    })
  } catch (err: unknown) {
    logForDebugging(
      `[bridge] Session creation request failed: ${errorMessage(err)}`,
    )
    return null
  }
  const isSuccess = response.status === 200 || response.status === 201

  if (!isSuccess) {
    const detail = extractErrorDetail(response.data)
    logForDebugging(
      `[bridge] Session creation failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
    )
    return null
  }

  const sessionData: unknown = response.data
  if (
    !sessionData ||
    typeof sessionData !== 'object' ||
    !('id' in sessionData) ||
    typeof sessionData.id !== 'string'
  ) {
    logForDebugging('[bridge] No session ID in response')
    return null
  }

  return sessionData.id
}

export async function getBridgeSessionRuntime(
  sessionId: string,
  opts?: { baseUrl?: string; getAccessToken?: () => string | undefined },
): Promise<{ environment_id?: string; title?: string } | null> {
  const { getClaudeAIOAuthTokens } = await import('../../../utils/auth.js')
  const { getOrganizationUUID } = await import('../../../services/oauth/client.js')
  const { getOauthConfig } = await import('../../../constants/oauth.js')
  const { getOAuthHeaders } = await import('../../../utils/teleport/api.js')
  const { default: axios } = await import('axios')
  const { isSelfHostedBridge } = await import('../../../bridge/bridgeConfig.js')

  const accessToken =
    opts?.getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken
  if (!accessToken) {
    logForDebugging('[bridge] No access token for session fetch')
    return null
  }

  const orgUUID = isSelfHostedBridge()
    ? 'self-hosted'
    : await getOrganizationUUID()
  if (!orgUUID) {
    logForDebugging('[bridge] No org UUID for session fetch')
    return null
  }

  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  }

  const url = `${opts?.baseUrl ?? getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}`
  logForDebugging(`[bridge] Fetching session ${sessionId}`)

  let response
  try {
    response = await axios.get<{ environment_id?: string; title?: string }>(
      url,
      { headers, timeout: 10_000, validateStatus: s => s < 500 },
    )
  } catch (err: unknown) {
    logForDebugging(
      `[bridge] Session fetch request failed: ${errorMessage(err)}`,
    )
    return null
  }

  if (response.status !== 200) {
    const detail = extractErrorDetail(response.data)
    logForDebugging(
      `[bridge] Session fetch failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
    )
    return null
  }

  return response.data
}

export async function archiveBridgeSessionRuntime(
  sessionId: string,
  opts?: {
    baseUrl?: string
    getAccessToken?: () => string | undefined
    timeoutMs?: number
  },
): Promise<boolean> {
  const { getClaudeAIOAuthTokens } = await import('../../../utils/auth.js')
  const { getOrganizationUUID } = await import('../../../services/oauth/client.js')
  const { getOauthConfig } = await import('../../../constants/oauth.js')
  const { getOAuthHeaders } = await import('../../../utils/teleport/api.js')
  const { default: axios } = await import('axios')
  const { isSelfHostedBridge } = await import('../../../bridge/bridgeConfig.js')

  const accessToken =
    opts?.getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken
  if (!accessToken) {
    logForDebugging('[bridge] No access token for session archive')
    return false
  }

  const orgUUID = isSelfHostedBridge()
    ? 'self-hosted'
    : await getOrganizationUUID()
  if (!orgUUID) {
    logForDebugging('[bridge] No org UUID for session archive')
    return false
  }

  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  }

  const url = `${opts?.baseUrl ?? getOauthConfig().BASE_API_URL}/v1/sessions/${toCompatSessionId(sessionId)}/archive`
  try {
    const response = await axios.post(
      url,
      {},
      {
        headers,
        timeout: opts?.timeoutMs ?? 10_000,
        validateStatus: s => s < 500,
      },
    )
    return response.status === 200 || response.status === 204
  } catch (err: unknown) {
    logForDebugging(
      `[bridge] Session archive request failed: ${errorMessage(err)}`,
    )
    return false
  }
}

export async function updateBridgeSessionTitleRuntime(
  sessionId: string,
  title: string,
  opts?: {
    baseUrl?: string
    getAccessToken?: () => string | undefined
    timeoutMs?: number
  },
): Promise<boolean> {
  const { getClaudeAIOAuthTokens } = await import('../../../utils/auth.js')
  const { getOrganizationUUID } = await import('../../../services/oauth/client.js')
  const { getOauthConfig } = await import('../../../constants/oauth.js')
  const { getOAuthHeaders } = await import('../../../utils/teleport/api.js')
  const { default: axios } = await import('axios')
  const { isSelfHostedBridge } = await import('../../../bridge/bridgeConfig.js')

  const accessToken =
    opts?.getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken
  if (!accessToken) {
    logForDebugging('[bridge] No access token for session title update')
    return false
  }

  const orgUUID = isSelfHostedBridge()
    ? 'self-hosted'
    : await getOrganizationUUID()
  if (!orgUUID) {
    logForDebugging('[bridge] No org UUID for session title update')
    return false
  }

  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  }

  const url = `${opts?.baseUrl ?? getOauthConfig().BASE_API_URL}/v1/sessions/${toCompatSessionId(sessionId)}`
  try {
    const response = await axios.patch(
      url,
      { title },
      {
        headers,
        timeout: opts?.timeoutMs ?? 10_000,
        validateStatus: s => s < 500,
      },
    )
    return response.status === 200
  } catch (err: unknown) {
    logForDebugging(
      `[bridge] Session title update failed: ${errorMessage(err)}`,
    )
    return false
  }
}
