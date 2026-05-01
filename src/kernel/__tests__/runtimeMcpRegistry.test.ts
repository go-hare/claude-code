import { describe, expect, test } from 'bun:test'

import {
  createDefaultKernelRuntimeMcpPlane,
  createDefaultKernelRuntimeMcpRegistry,
} from '../runtimeMcpRegistry.js'
import type { Tool } from '../../Tool.js'
import type {
  MCPServerConnection,
  ScopedMcpServerConfig,
  ServerResource,
} from '../../services/mcp/types.js'

function createHttpOauthServer(
  scope: ScopedMcpServerConfig['scope'] = 'user',
): ScopedMcpServerConfig {
  return {
    type: 'http',
    url: 'https://example.test/mcp',
    oauth: {
      clientId: 'client-id',
    },
    scope,
  }
}

describe('createDefaultKernelRuntimeMcpRegistry', () => {
  test('returns an authorization URL when callback completion is not provided', async () => {
    const config = createHttpOauthServer()
    let skipBrowserOpenUsed = false
    const registry = createDefaultKernelRuntimeMcpRegistry(undefined, {
      async getClaudeCodeMcpConfigs() {
        return { servers: { github: config } }
      },
      async getMcpToolsCommandsAndResources() {},
      async isMcpServerDisabled() {
        return false
      },
      async setMcpServerEnabled() {},
      async reconnectMcpServer() {
        throw new Error('reconnect should not run for URL-only auth requests')
      },
      async performOAuthFlow(
        _serverName,
        _config,
        onAuthorizationUrl,
        _abortSignal,
        options,
      ) {
        skipBrowserOpenUsed = options?.skipBrowserOpen === true
        onAuthorizationUrl('https://auth.example/authorize')
        const cancelled = new Error('cancelled after authorization URL')
        cancelled.name = 'AuthenticationCancelledError'
        throw cancelled
      },
      async revokeServerTokens() {},
      clearMcpAuthCache() {},
      isAuthFlowCancelled(error) {
        return error instanceof Error && error.name === 'AuthenticationCancelledError'
      },
    })

    const result = await registry.authenticateServer?.({
      serverName: 'github',
      metadata: { source: 'test' },
    })

    expect(result).toMatchObject({
      serverName: 'github',
      state: 'needs-auth',
      authorizationUrl: 'https://auth.example/authorize',
      metadata: { source: 'test' },
      server: {
        name: 'github',
        state: 'needs-auth',
      },
    })
    expect(result?.snapshot?.servers).toEqual([
      expect.objectContaining({
        name: 'github',
        state: 'needs-auth',
      }),
    ])
    expect(skipBrowserOpenUsed).toBe(true)
  })

  test('completes OAuth auth with callback URL and reconnects the server', async () => {
    const config = createHttpOauthServer('project')
    let clearedAuthCache = 0
    let callbackBridgeUsed = false
    let skipBrowserOpenUsed = false
    const registry = createDefaultKernelRuntimeMcpRegistry(undefined, {
      async getClaudeCodeMcpConfigs() {
        return { servers: { github: config } }
      },
      async getMcpToolsCommandsAndResources() {},
      async isMcpServerDisabled() {
        return false
      },
      async setMcpServerEnabled() {},
      async reconnectMcpServer(serverName, serverConfig) {
        return {
          client: {
            type: 'connected',
            name: serverName,
            config: serverConfig,
            capabilities: {},
            client: {} as never,
            cleanup: async () => {},
          },
        }
      },
      async performOAuthFlow(
        _serverName,
        _config,
        onAuthorizationUrl,
        _abortSignal,
        options,
      ) {
        onAuthorizationUrl('https://auth.example/authorize')
        skipBrowserOpenUsed = options?.skipBrowserOpen === true
        options?.onWaitingForCallback?.(callbackUrl => {
          callbackBridgeUsed = callbackUrl === 'https://callback.example/done'
        })
      },
      async revokeServerTokens() {},
      clearMcpAuthCache() {
        clearedAuthCache += 1
      },
      isAuthFlowCancelled() {
        return false
      },
    })

    const result = await registry.authenticateServer?.({
      serverName: 'github',
      callbackUrl: 'https://callback.example/done',
    })

    expect(callbackBridgeUsed).toBe(true)
    expect(skipBrowserOpenUsed).toBe(true)
    expect(clearedAuthCache).toBe(1)
    expect(result).toMatchObject({
      serverName: 'github',
      state: 'connected',
      authorizationUrl: 'https://auth.example/authorize',
      server: {
        name: 'github',
        state: 'connected',
        scope: 'project',
      },
    })
  })

  test('clears stored OAuth state and returns a needs-auth snapshot', async () => {
    const config = createHttpOauthServer()
    let revoked = 0
    let clearedAuthCache = 0
    const registry = createDefaultKernelRuntimeMcpRegistry(undefined, {
      async getClaudeCodeMcpConfigs() {
        return { servers: { github: config } }
      },
      async getMcpToolsCommandsAndResources() {},
      async isMcpServerDisabled() {
        return false
      },
      async setMcpServerEnabled() {},
      async reconnectMcpServer() {
        throw new Error('reconnect should not run for clear auth')
      },
      async performOAuthFlow() {
        throw new Error('auth flow should not run for clear auth')
      },
      async revokeServerTokens() {
        revoked += 1
      },
      clearMcpAuthCache() {
        clearedAuthCache += 1
      },
      isAuthFlowCancelled() {
        return false
      },
    })

    const result = await registry.authenticateServer?.({
      serverName: 'github',
      action: 'clear',
      metadata: { reason: 'reset' },
    })

    expect(revoked).toBe(1)
    expect(clearedAuthCache).toBe(1)
    expect(result).toMatchObject({
      serverName: 'github',
      state: 'needs-auth',
      metadata: { reason: 'reset' },
      server: {
        name: 'github',
        state: 'needs-auth',
      },
    })
  })

  test('materializes MCP resources, tool bindings, and tools through the shared plane', async () => {
    const config = createHttpOauthServer('project')
    let fetches = 0
    const plane = createDefaultKernelRuntimeMcpPlane(undefined, {
      async getClaudeCodeMcpConfigs() {
        return { servers: { github: config } }
      },
      async getMcpToolsCommandsAndResources(onConnectionAttempt) {
        fetches += 1
        onConnectionAttempt({
          client: {
            name: 'github',
            type: 'connected',
            config,
            capabilities: { tools: {}, resources: {} },
            client: {} as never,
            cleanup: async () => {},
          } satisfies MCPServerConnection,
          tools: [
            createMcpTool('mcp__github__list_issues', 'github', 'list_issues'),
          ],
          commands: [],
          resources: [
            {
              server: 'github',
              uri: 'repo://hare-code',
              name: 'hare-code',
            } satisfies ServerResource,
          ],
        })
      },
      async isMcpServerDisabled() {
        return false
      },
      async setMcpServerEnabled() {},
      async reconnectMcpServer(serverName, serverConfig) {
        return {
          client: {
            name: serverName,
            type: 'connected',
            config: serverConfig,
            capabilities: {},
            client: {} as never,
            cleanup: async () => {},
          },
        }
      },
      async performOAuthFlow() {},
      async revokeServerTokens() {},
      clearMcpAuthCache() {},
      isAuthFlowCancelled() {
        return false
      },
    })

    expect(await plane.registry.listResources()).toEqual([
      {
        server: 'github',
        uri: 'repo://hare-code',
        name: 'hare-code',
      },
    ])
    expect(await plane.registry.listToolBindings()).toEqual([
      {
        server: 'github',
        serverToolName: 'list_issues',
        runtimeToolName: 'mcp__github__list_issues',
      },
    ])
    expect((await plane.listTools()).map(tool => tool.name)).toEqual([
      'mcp__github__list_issues',
    ])
    expect(fetches).toBe(1)

    await plane.registry.listToolBindings()
    expect(fetches).toBe(1)

    await plane.registry.reload?.()
    await plane.registry.listToolBindings()
    expect(fetches).toBe(2)
  })
})

function createMcpTool(
  name: string,
  serverName: string,
  toolName: string,
): Tool {
  return {
    name,
    isMcp: true,
    mcpInfo: { serverName, toolName },
    inputSchema: {
      safeParse(input: unknown) {
        return { success: true, data: input as Record<string, unknown> }
      },
    },
    async description() {
      return toolName
    },
    async prompt() {
      return toolName
    },
    isReadOnly() {
      return true
    },
    async call() {
      return { data: { ok: true } }
    },
  } as unknown as Tool
}
