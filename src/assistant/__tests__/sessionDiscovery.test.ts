import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

let mockEnvironments: any[] = []
let mockPages: any[] = []
const apiCalls: Array<{ url: string; options: unknown }> = []

const OAUTH_ENV_KEYS = [
  'USER_TYPE',
  'USE_LOCAL_OAUTH',
  'USE_STAGING_OAUTH',
  'CLAUDE_LOCAL_OAUTH_API_BASE',
  'CLAUDE_LOCAL_OAUTH_APPS_BASE',
  'CLAUDE_LOCAL_OAUTH_CONSOLE_BASE',
  'CLAUDE_CODE_CUSTOM_OAUTH_URL',
] as const

const originalOauthEnv = new Map<string, string | undefined>(
  OAUTH_ENV_KEYS.map(key => [key, process.env[key]]),
)

mock.module('../sessionDiscoveryRepository.js', () => ({
  parseGitRemote: (url: string) => {
    if (url === 'https://github.com/org/repo.git') {
      return { host: 'github.com', owner: 'org', name: 'repo' }
    }
    if (url === 'ssh://git.example.com/team/app.git') {
      return { host: 'git.example.com', owner: 'team', name: 'app' }
    }
    return null
  },
}))

mock.module('../../utils/teleport/api.js', () => ({
  CCR_BYOC_BETA: 'ccr-byoc-beta',
  axiosGetWithRetry: async (url: string, options: unknown) => {
    apiCalls.push({ url, options })
    const page = mockPages.shift()
    if (!page) {
      throw new Error('No mocked session page available')
    }
    return {
      status: 200,
      statusText: 'OK',
      data: page,
    }
  },
  getOAuthHeaders: (accessToken: string) => ({
    authorization: `Bearer ${accessToken}`,
  }),
  prepareApiRequest: async () => ({
    accessToken: 'access-token',
    orgUUID: 'org-uuid',
  }),
  sendEventToRemoteSession: mock(async () => true),
}))

mock.module('../../utils/teleport/environments.js', () => ({
  fetchEnvironments: async () => mockEnvironments,
}))

const { discoverAssistantSessions } = await import('../sessionDiscovery.js')

describe('discoverAssistantSessions', () => {
  beforeEach(() => {
    for (const key of OAUTH_ENV_KEYS) {
      delete process.env[key]
    }
    mockEnvironments = []
    mockPages = []
    apiCalls.length = 0
  })

  afterEach(() => {
    for (const key of OAUTH_ENV_KEYS) {
      const value = originalOauthEnv.get(key)
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  test('falls back to all bridge environments when worker_type metadata is missing', async () => {
    mockEnvironments = [
      {
        environment_id: 'env-1',
        kind: 'bridge',
        name: 'Bridge Alpha',
      },
      {
        environment_id: 'env-2',
        kind: 'bridge',
        name: 'Bridge Beta',
      },
      {
        environment_id: 'env-3',
        kind: 'server',
        name: 'Other Environment',
      },
    ]

    mockPages = [
      {
        data: [
          {
            id: 'archived-session',
            title: 'Old session',
            session_status: 'archived',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            environment_id: 'env-1',
            session_context: {
              cwd: '/repo/old',
              sources: [],
            },
          },
          {
            id: 'assistant-old',
            title: '',
            session_status: 'running',
            created_at: '2026-01-02T00:00:00.000Z',
            updated_at: '2026-02-02T00:00:00.000Z',
            environment_id: 'env-1',
            session_context: {
              cwd: '/repo/app',
              sources: [
                {
                  type: 'git_repository',
                  url: 'https://github.com/org/repo.git',
                },
              ],
            },
          },
          {
            id: 'assistant-new',
            title: 'Beta Session',
            session_status: 'waiting',
            created_at: '2026-01-03T00:00:00.000Z',
            updated_at: '2026-03-02T00:00:00.000Z',
            environment_id: 'env-2',
            session_context: {
              cwd: 'D:\\workspace\\beta',
              sources: [
                {
                  type: 'git_repository',
                  url: 'ssh://git.example.com/team/app.git',
                },
              ],
            },
          },
          {
            id: 'ignored-non-bridge',
            title: 'Wrong environment',
            session_status: 'running',
            created_at: '2026-01-04T00:00:00.000Z',
            updated_at: '2026-04-02T00:00:00.000Z',
            environment_id: 'env-3',
            session_context: {
              cwd: '/repo/ignored',
              sources: [],
            },
          },
        ],
        has_more: false,
        last_id: null,
      },
    ]

    const sessions = await discoverAssistantSessions()

    expect(apiCalls).toHaveLength(1)
    expect(sessions.map(session => session.id)).toEqual([
      'assistant-new',
      'assistant-old',
    ])
    expect(sessions[0]).toMatchObject({
      id: 'assistant-new',
      title: 'Beta Session',
      environmentId: 'env-2',
      environmentName: 'Bridge Beta',
      repo: 'git.example.com/team/app',
      workerType: undefined,
    })
    expect(sessions[1]).toMatchObject({
      id: 'assistant-old',
      title: 'app',
      environmentId: 'env-1',
      environmentName: 'Bridge Alpha',
      repo: 'org/repo',
      workerType: undefined,
    })
  })

  test('returns no sessions when tagged bridge environments do not match the assistant worker type', async () => {
    mockEnvironments = [
      {
        environment_id: 'env-1',
        kind: 'bridge',
        name: 'Bridge Other',
        metadata: { worker_type: 'claude_code_worker' },
      },
    ]

    const sessions = await discoverAssistantSessions()

    expect(sessions).toEqual([])
    expect(apiCalls).toHaveLength(0)
  })
})
