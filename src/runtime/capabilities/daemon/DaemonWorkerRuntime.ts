import { resolve } from 'path'
import { getClaudeAIOAuthTokens } from '../../../utils/auth.js'
import { errorMessage } from '../../../utils/errors.js'
import type {
  DaemonWorkerRuntimeDeps,
  HeadlessBridgeRunner,
} from './contracts.js'

export const EXIT_CODE_PERMANENT = 78
export const EXIT_CODE_TRANSIENT = 1

export type RemoteControlWorkerRuntimeConfig = {
  dir: string
  name?: string
  spawnMode: 'same-dir' | 'worktree'
  capacity: number
  permissionMode?: string
  sandbox: boolean
  sessionTimeoutMs?: number
  createSessionOnStart: boolean
}

export function buildRemoteControlWorkerConfigFromEnv(
  env: NodeJS.ProcessEnv,
  fallbackDir = resolve('.'),
): RemoteControlWorkerRuntimeConfig {
  return {
    dir: env.DAEMON_WORKER_DIR || fallbackDir,
    name: env.DAEMON_WORKER_NAME || undefined,
    spawnMode:
      (env.DAEMON_WORKER_SPAWN_MODE as 'same-dir' | 'worktree') ||
      'same-dir',
    capacity: parseInt(env.DAEMON_WORKER_CAPACITY || '4', 10),
    permissionMode: env.DAEMON_WORKER_PERMISSION || undefined,
    sandbox: env.DAEMON_WORKER_SANDBOX === '1',
    sessionTimeoutMs: env.DAEMON_WORKER_TIMEOUT_MS
      ? parseInt(env.DAEMON_WORKER_TIMEOUT_MS, 10)
      : undefined,
    createSessionOnStart: env.DAEMON_WORKER_CREATE_SESSION !== '0',
  }
}

export async function runDaemonWorkerRuntime(
  kind: string | undefined,
  deps: DaemonWorkerRuntimeDeps,
): Promise<void> {
  if (!kind) {
    console.error('Error: --daemon-worker requires a worker kind')
    process.exitCode = EXIT_CODE_PERMANENT
    return
  }

  switch (kind) {
    case 'remoteControl':
      await runRemoteControlWorkerRuntime(deps)
      return
    default:
      console.error(`Error: unknown daemon worker kind '${kind}'`)
      process.exitCode = EXIT_CODE_PERMANENT
  }
}

export async function runRemoteControlWorkerRuntime(
  deps: DaemonWorkerRuntimeDeps,
): Promise<void> {
  const config = buildRemoteControlWorkerConfigFromEnv(process.env, resolve('.'))
  const controller = new AbortController()
  const onSignal = () => controller.abort()

  process.on('SIGTERM', onSignal)
  process.on('SIGINT', onSignal)

  try {
    await deps.runBridgeHeadless(
      {
        ...config,
        getAccessToken: () => getClaudeAIOAuthTokens()?.accessToken,
        onAuth401: async (_failedToken: string) => {
          const tokens = getClaudeAIOAuthTokens()
          return !!tokens?.accessToken
        },
        log: message => {
          console.log(`[remoteControl] ${message}`)
        },
      },
      controller.signal,
    )
  } catch (error) {
    if (deps.isPermanentError(error)) {
      console.error(`[remoteControl] permanent error: ${errorMessage(error)}`)
      process.exitCode = EXIT_CODE_PERMANENT
    } else {
      console.error(`[remoteControl] transient error: ${errorMessage(error)}`)
      process.exitCode = EXIT_CODE_TRANSIENT
    }
  } finally {
    process.off('SIGTERM', onSignal)
    process.off('SIGINT', onSignal)
  }
}
