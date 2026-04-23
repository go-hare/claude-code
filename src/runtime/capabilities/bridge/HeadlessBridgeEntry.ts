import { hostname } from 'os'
import { randomUUID } from 'crypto'
import { errorMessage } from '../../../utils/errors.js'
import type { BridgeConfig } from '../../../bridge/types.js'
import type { HeadlessBridgeDeps } from './contracts.js'
import {
  BridgeHeadlessPermanentError,
  createHeadlessBridgeLogger,
  type HeadlessBridgeOpts,
} from './HeadlessBridgeRuntime.js'

export async function runHeadlessBridgeRuntime(
  opts: HeadlessBridgeOpts,
  signal: AbortSignal,
  deps: HeadlessBridgeDeps,
): Promise<void> {
  const { dir, log } = opts

  await deps.setWorkingDirectory(dir)
  await deps.initRuntimeSinks()

  const isTrusted = await deps.ensureTrustedWorkspace(dir)
  if (!isTrusted) {
    throw new BridgeHeadlessPermanentError(
      `Workspace not trusted: ${dir}. Run \`claude\` in that directory first to accept the trust dialog.`,
    )
  }

  if (!opts.getAccessToken()) {
    throw new Error(deps.bridgeLoginError)
  }

  const baseUrl = await deps.getBaseUrl()
  if (
    baseUrl.startsWith('http://') &&
    !baseUrl.includes('localhost') &&
    !baseUrl.includes('127.0.0.1')
  ) {
    throw new BridgeHeadlessPermanentError(
      'Remote Control base URL uses HTTP. Only HTTPS or localhost HTTP is allowed.',
    )
  }

  const sessionIngressUrl =
    process.env.CLAUDE_BRIDGE_SESSION_INGRESS_URL || baseUrl

  const git = await deps.getGitMetadata(dir, opts.spawnMode)
  if (opts.spawnMode === 'worktree' && !git.worktreeAvailable) {
    throw new BridgeHeadlessPermanentError(
      `Worktree mode requires a git repository or WorktreeCreate hooks. Directory ${dir} has neither.`,
    )
  }

  const config: BridgeConfig = {
    dir,
    machineName: hostname(),
    branch: git.branch,
    gitRepoUrl: git.gitRepoUrl,
    maxSessions: opts.capacity,
    spawnMode: opts.spawnMode,
    verbose: false,
    sandbox: opts.sandbox,
    bridgeId: randomUUID(),
    workerType: 'claude_code',
    environmentId: randomUUID(),
    apiBaseUrl: baseUrl,
    sessionIngressUrl,
    sessionTimeoutMs: opts.sessionTimeoutMs,
  }

  const api = deps.createApi({
    baseUrl,
    getAccessToken: opts.getAccessToken,
    onAuth401: opts.onAuth401,
    log,
  })

  let environmentId: string
  let environmentSecret: string
  try {
    const reg = await api.registerBridgeEnvironment(config)
    environmentId = reg.environment_id
    environmentSecret = reg.environment_secret
  } catch (err) {
    throw new Error(`Bridge registration failed: ${errorMessage(err)}`)
  }

  const spawner = await deps.createSpawner(opts)
  const logger = createHeadlessBridgeLogger(log)
  logger.printBanner(config, environmentId)

  let initialSessionId: string | undefined
  if (opts.createSessionOnStart) {
    try {
      const sid = await deps.createInitialSession({
        environmentId,
        title: opts.name,
        gitRepoUrl: git.gitRepoUrl,
        branch: git.branch,
        signal,
        baseUrl,
        getAccessToken: opts.getAccessToken,
        permissionMode: opts.permissionMode,
      })
      if (sid) {
        initialSessionId = sid
        log(`created initial session ${sid}`)
      }
    } catch (err) {
      log(`session pre-creation failed (non-fatal): ${errorMessage(err)}`)
    }
  }

  await deps.runBridgeLoop(
    config,
    environmentId,
    environmentSecret,
    api,
    spawner,
    logger,
    signal,
    undefined,
    initialSessionId,
    async () => opts.getAccessToken(),
  )
}
