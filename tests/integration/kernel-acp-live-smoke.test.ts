import * as acp from '@agentclientprotocol/sdk'
import { describe, expect, test } from 'bun:test'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { Readable, Writable } from 'stream'
import { fileURLToPath } from 'url'

type AcpSessionUpdateParams = {
  sessionId?: string
  update?: {
    sessionUpdate?: string
    type?: string
    [key: string]: unknown
  }
}

type LiveAcpEnv = {
  apiKey: string
  baseUrl: string
  model: string
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const hasLiveAcpEnv =
  process.env.RUN_ACP_LIVE_SMOKE === '1' &&
  getEnvValue('KERNEL_DEEP_TEST_API_KEY', 'OPENAI_API_KEY') !== undefined &&
  getEnvValue('KERNEL_DEEP_TEST_BASE_URL', 'OPENAI_BASE_URL') !== undefined &&
  getEnvValue('KERNEL_DEEP_TEST_MODEL', 'OPENAI_MODEL') !== undefined

const liveTest = hasLiveAcpEnv ? test : test.skip

describe('kernel ACP live smoke', () => {
  liveTest(
    'runs built ACP stdio transport against an OpenAI-compatible endpoint',
    async () => {
      const env = requireLiveAcpEnv()
      const cliPath = `${repoRoot}/dist/cli-bun.js`
      expect(existsSync(cliPath)).toBe(true)

      const child = spawn('bun', [cliPath, '--acp'], {
        cwd: repoRoot,
        env: createChildEnv(env),
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stderr = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', chunk => {
        stderr += chunk
      })

      const updates: AcpSessionUpdateParams[] = []
      const client: acp.Client = {
        async requestPermission() {
          return { outcome: { outcome: 'cancelled' } }
        },
        async sessionUpdate(params) {
          updates.push(params as AcpSessionUpdateParams)
        },
        async readTextFile() {
          return { content: '' }
        },
        async writeTextFile() {
          return {}
        },
      }
      const stream = acp.ndJsonStream(
        Writable.toWeb(child.stdin),
        Readable.toWeb(child.stdout),
      )
      const connection = new acp.ClientSideConnection(() => client, stream)

      try {
        const init = await withTimeout(
          connection.initialize({
            protocolVersion: acp.PROTOCOL_VERSION,
            clientInfo: { name: 'kernel-acp-live-smoke', version: '1.0.0' },
            clientCapabilities: {
              fs: { readTextFile: true, writeTextFile: true },
            },
          }),
          'initialize',
        )
        expect(init.protocolVersion).toBe(acp.PROTOCOL_VERSION)

        const session = await withTimeout(
          connection.newSession({
            cwd: repoRoot,
            mcpServers: [],
            _meta: { permissionMode: 'default' },
          }),
          'newSession',
        )
        const result = await withTimeout(
          connection.prompt({
            sessionId: session.sessionId,
            prompt: [
              {
                type: 'text',
                text: 'Reply with exactly ACP_LIVE_OK and do not use tools.',
              },
            ],
          }),
          'prompt',
        )

        const updateTypes = updates.map(update => getUpdateType(update))
        const updateKeys = updates.map(update => JSON.stringify(update.update))
        expect(result.stopReason).toBe('end_turn')
        expect(updateTypes).toContain('agent_message_chunk')
        expect(updateTypes).toContain('usage_update')
        expect(hasAdjacentDuplicate(updateKeys)).toBe(false)
        expect(stderr.trim()).toBe('')
      } finally {
        child.kill('SIGTERM')
        await waitForExit(child, 5_000)
      }
    },
    { timeout: 120_000 },
  )
})

function createChildEnv(env: LiveAcpEnv): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_CODE_USE_OPENAI: '1',
    CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
    OPENAI_API_KEY: env.apiKey,
    OPENAI_BASE_URL: env.baseUrl,
    OPENAI_MODEL: env.model,
    OPENAI_DEFAULT_HAIKU_MODEL: env.model,
    OPENAI_DEFAULT_SONNET_MODEL: env.model,
    OPENAI_DEFAULT_OPUS_MODEL: env.model,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_SKIP_PROMPT_HISTORY: '1',
    NO_COLOR: '1',
    NODE_ENV: 'production',
  }
  delete childEnv.BUN_TEST
  return childEnv
}

function requireLiveAcpEnv(): LiveAcpEnv {
  const apiKey = getEnvValue('KERNEL_DEEP_TEST_API_KEY', 'OPENAI_API_KEY')
  const baseUrl = getEnvValue('KERNEL_DEEP_TEST_BASE_URL', 'OPENAI_BASE_URL')
  const model = getEnvValue('KERNEL_DEEP_TEST_MODEL', 'OPENAI_MODEL')
  if (!apiKey || !baseUrl || !model) {
    throw new Error('Missing ACP live smoke environment')
  }
  return { apiKey, baseUrl, model }
}

function getEnvValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]
    if (value) {
      return value
    }
  }
  return undefined
}

function getUpdateType(update: AcpSessionUpdateParams): string {
  return update.update?.sessionUpdate ?? update.update?.type ?? 'unknown'
}

function hasAdjacentDuplicate(values: readonly string[]): boolean {
  return values.some((value, index) => index > 0 && values[index - 1] === value)
}

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 90_000,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${label} timed out`)),
      timeoutMs,
    )
    timeout.unref?.()
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout)
  })
}

async function waitForExit(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  await new Promise<void>(resolve => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, timeoutMs)
    timeout.unref?.()
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}
