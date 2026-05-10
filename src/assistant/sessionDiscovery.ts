import { getOauthConfig } from '../constants/oauth.js'
import { parseGitRemote } from './sessionDiscoveryRepository.js'
import { logForDebugging } from '../utils/debug.js'
import {
  axiosGetWithRetry,
  CCR_BYOC_BETA,
  getOAuthHeaders,
  prepareApiRequest,
  type ListSessionsResponse,
  type SessionContextSource,
  type SessionResource,
} from '../utils/teleport/api.js'
import {
  fetchEnvironments,
  type EnvironmentResource,
} from '../utils/teleport/environments.js'

const ASSISTANT_WORKER_TYPE = 'claude_code_assistant'
const DISCOVERY_PAGE_SIZE = 100
const MAX_DISCOVERY_PAGES = 50

type AssistantEnvironmentResource = EnvironmentResource & {
  metadata?: {
    worker_type?: string
  }
}

export type AssistantSession = {
  id: string
  title: string
  status: SessionResource['session_status']
  createdAt: string
  updatedAt: string
  environmentId: string
  environmentName: string
  cwd: string
  repo: string | null
  workerType?: string
}

function getAssistantEnvironmentIds(
  environments: AssistantEnvironmentResource[],
): Set<string> {
  const bridgeEnvironments = environments.filter(env => env.kind === 'bridge')
  if (bridgeEnvironments.length === 0) {
    logForDebugging('[assistant] no bridge environments available')
    return new Set()
  }

  const taggedBridgeEnvironments = bridgeEnvironments.filter(
    env =>
      typeof env.metadata?.worker_type === 'string' && env.metadata.worker_type,
  )

  if (taggedBridgeEnvironments.length === 0) {
    logForDebugging(
      `[assistant] bridge environments missing metadata.worker_type; falling back to all ${bridgeEnvironments.length} bridge environments`,
    )
    return new Set(
      bridgeEnvironments.map(environment => environment.environment_id),
    )
  }

  const assistantEnvironments = bridgeEnvironments.filter(
    env => env.metadata?.worker_type === ASSISTANT_WORKER_TYPE,
  )

  if (assistantEnvironments.length === 0) {
    logForDebugging(
      `[assistant] bridge environments were tagged, but none matched worker_type=${ASSISTANT_WORKER_TYPE}`,
    )
    return new Set()
  }

  return new Set(
    assistantEnvironments.map(environment => environment.environment_id),
  )
}

function getSessionPageCursor(page: ListSessionsResponse): string | null {
  return page.last_id ?? null
}

function getRepositoryLabel(session: SessionResource): string | null {
  const gitSource = session.session_context.sources.find(
    (
      source,
    ): source is SessionContextSource & {
      type: 'git_repository'
      url: string
    } =>
      source.type === 'git_repository' &&
      'url' in source &&
      typeof source.url === 'string',
  )

  const parsed = gitSource ? parseGitRemote(gitSource.url) : null
  if (!parsed) {
    return null
  }

  if (parsed.host === 'github.com') {
    return `${parsed.owner}/${parsed.name}`
  }

  return `${parsed.host}/${parsed.owner}/${parsed.name}`
}

function getCwdLeaf(cwd: string): string | undefined {
  const segments = cwd.split(/[\\/]+/).filter(Boolean)
  return segments.at(-1)
}

function getFallbackSessionTitle(session: SessionResource): string {
  const cwdLeaf = getCwdLeaf(session.session_context.cwd)
  if (cwdLeaf) {
    return cwdLeaf
  }
  return `Assistant session ${session.id.slice(0, 8)}`
}

function mapAssistantSession(
  session: SessionResource,
  environmentNameById: Map<string, string>,
  workerTypeByEnvironmentId: Map<string, string>,
): AssistantSession {
  return {
    id: session.id,
    title: session.title?.trim() || getFallbackSessionTitle(session),
    status: session.session_status,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    environmentId: session.environment_id,
    environmentName:
      environmentNameById.get(session.environment_id) ?? session.environment_id,
    cwd: session.session_context.cwd,
    repo: getRepositoryLabel(session),
    workerType: workerTypeByEnvironmentId.get(session.environment_id),
  }
}

async function fetchDiscoverySessionPages(): Promise<SessionResource[]> {
  const { accessToken, orgUUID } = await prepareApiRequest()
  const url = `${getOauthConfig().BASE_API_URL}/v1/sessions`
  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': CCR_BYOC_BETA,
    'x-organization-uuid': orgUUID,
  }

  const sessions: SessionResource[] = []
  const seenSessionIds = new Set<string>()
  const seenCursors = new Set<string>()

  let beforeId: string | undefined
  let hitPageLimit = true

  for (let pageIndex = 0; pageIndex < MAX_DISCOVERY_PAGES; pageIndex++) {
    const response = await axiosGetWithRetry<ListSessionsResponse>(url, {
      headers,
      params: beforeId
        ? { limit: DISCOVERY_PAGE_SIZE, before_id: beforeId }
        : { limit: DISCOVERY_PAGE_SIZE },
      timeout: 15000,
      validateStatus: status => status < 500,
    })

    if (response.status !== 200) {
      throw new Error(
        `Failed to fetch sessions: ${response.status} ${response.statusText}`,
      )
    }

    const page = response.data
    for (const session of page.data ?? []) {
      if (seenSessionIds.has(session.id)) {
        continue
      }
      seenSessionIds.add(session.id)
      sessions.push(session)
    }

    if (!page.has_more) {
      hitPageLimit = false
      break
    }

    const cursor = getSessionPageCursor(page)
    if (!cursor) {
      hitPageLimit = false
      logForDebugging(
        '[assistant] sessions API reported has_more=true without a cursor; stopping discovery pagination early',
      )
      break
    }

    if (seenCursors.has(cursor)) {
      hitPageLimit = false
      logForDebugging(
        `[assistant] sessions API repeated cursor ${cursor}; stopping discovery pagination to avoid an infinite loop`,
      )
      break
    }

    seenCursors.add(cursor)
    beforeId = cursor
  }

  if (hitPageLimit) {
    logForDebugging(
      `[assistant] discovery hit MAX_DISCOVERY_PAGES (${MAX_DISCOVERY_PAGES}); session list may be truncated`,
    )
  }

  return sessions
}

/**
 * Discover assistant sessions on Anthropic CCR.
 *
 * Returns attachable bridge-backed assistant sessions sorted by freshness.
 * Throws on transport/auth failures so the caller can surface the real error
 * instead of silently redirecting to the install wizard.
 */
export async function discoverAssistantSessions(): Promise<AssistantSession[]> {
  const environments =
    (await fetchEnvironments()) as AssistantEnvironmentResource[]
  const assistantEnvironmentIds = getAssistantEnvironmentIds(environments)

  if (assistantEnvironmentIds.size === 0) {
    return []
  }

  const environmentNameById = new Map<string, string>()
  const workerTypeByEnvironmentId = new Map<string, string>()
  for (const environment of environments) {
    environmentNameById.set(environment.environment_id, environment.name)
    if (typeof environment.metadata?.worker_type === 'string') {
      workerTypeByEnvironmentId.set(
        environment.environment_id,
        environment.metadata.worker_type,
      )
    }
  }

  const remoteSessions = await fetchDiscoverySessionPages()
  const assistantSessions = remoteSessions
    .filter(session => session.session_status !== 'archived')
    .filter(session => assistantEnvironmentIds.has(session.environment_id))
    .map(session =>
      mapAssistantSession(
        session,
        environmentNameById,
        workerTypeByEnvironmentId,
      ),
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    )

  logForDebugging(
    `[assistant] discovered ${assistantSessions.length} assistant sessions across ${assistantEnvironmentIds.size} candidate environments`,
  )

  return assistantSessions
}
