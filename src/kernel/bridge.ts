/**
 * Stable bridge-facing kernel exports.
 *
 * This keeps external hosts off internal runtime paths while reusing the
 * existing bridge capability implementation.
 */
import { basename } from 'path'
import { createBridgeApiClient } from '../bridge/bridgeApi.js'
import { getTrustedDeviceToken } from '../bridge/trustedDevice.js'
import { createSessionSpawner } from '../bridge/sessionRunner.js'
import { createBridgeLogger } from '../bridge/bridgeUI.js'
import {
  BRIDGE_LOGIN_ERROR,
  type BridgeLogger,
  type SessionSpawner,
  type SpawnMode,
} from '../bridge/types.js'
import { getBridgeBaseUrl } from '../bridge/bridgeConfig.js'
import { hasWorktreeCreateHook } from '../utils/hooks.js'
import { findGitRoot, getBranch, getRemoteUrl } from '../utils/git.js'
import { initSinks } from '../utils/sinks.js'
import { checkHasTrustDialogAccepted, enableConfigs } from '../utils/config.js'
import { setCwdState, setOriginalCwd } from '../bootstrap/state.js'
import { getBootstrapArgs, getScriptPath } from '../utils/cliLaunch.js'
import { BridgeHeadlessPermanentError, type HeadlessBridgeOpts } from '../runtime/capabilities/bridge/HeadlessBridgeRuntime.js'
import type {
  BridgeLoopRunner,
  HeadlessBridgeApiFactoryParams,
  HeadlessBridgeDeps,
  HeadlessBridgeInitialSessionParams,
} from '../runtime/capabilities/bridge/contracts.js'
import {
  archiveBridgeSessionRuntime,
  createBridgeSessionRuntime,
  getBridgeSessionRuntime,
  updateBridgeSessionTitleRuntime,
} from '../runtime/capabilities/bridge/SessionApi.js'
import {
  createBridgePersistenceOwner,
  runBridgeCliRuntime,
  runBridgeHeadlessRuntime,
  type BridgeCliEntry,
  type BridgeHeadlessEntry,
} from '../runtime/capabilities/bridge/BridgeRuntime.js'
import { runHeadlessBridgeRuntime } from '../runtime/capabilities/bridge/HeadlessBridgeEntry.js'

function spawnScriptArgs(): string[] {
  const bootstrap = [...getBootstrapArgs()]
  const script = getScriptPath()
  if (script) {
    bootstrap.push(script)
  }
  return bootstrap
}

export type BridgeCliHostAssembly = {
  spawner: SessionSpawner
  logger: BridgeLogger
  toggleAvailable: boolean
}

export type AssembleBridgeCliHostParams = {
  dir: string
  branch: string
  gitRepoUrl: string | null
  spawnMode: SpawnMode
  worktreeAvailable: boolean
  verbose: boolean
  sandbox: boolean
  debugFile?: string
  permissionMode?: string
  onDebug: (message: string) => void
}

export async function assembleBridgeCliHost(
  params: AssembleBridgeCliHostParams,
): Promise<BridgeCliHostAssembly> {
  const spawner = createSessionSpawner({
    execPath: process.execPath,
    scriptArgs: spawnScriptArgs(),
    env: process.env,
    verbose: params.verbose,
    sandbox: params.sandbox,
    debugFile: params.debugFile,
    permissionMode: params.permissionMode,
    onDebug: params.onDebug,
    onActivity: (sessionId, activity) => {
      params.onDebug(
        `[bridge:activity] sessionId=${sessionId} ${activity.type} ${activity.summary}`,
      )
    },
    onPermissionRequest: (sessionId, request) => {
      params.onDebug(
        `[bridge:perm] sessionId=${sessionId} tool=${request.request.tool_name} request_id=${request.request_id} (not auto-approving)`,
      )
    },
  })

  const logger = createBridgeLogger({ verbose: params.verbose })
  const { parseGitHubRepository } = await import('../utils/detectRepository.js')
  const ownerRepo = params.gitRepoUrl
    ? parseGitHubRepository(params.gitRepoUrl)
    : null
  const repoName = ownerRepo ? ownerRepo.split('/').pop()! : basename(params.dir)
  logger.setRepoInfo(repoName, params.branch)

  const toggleAvailable =
    params.spawnMode !== 'single-session' && params.worktreeAvailable
  if (toggleAvailable) {
    logger.setSpawnModeDisplay(params.spawnMode as 'same-dir' | 'worktree')
  }

  return {
    spawner,
    logger,
    toggleAvailable,
  }
}

export type CreateBridgeCliInitialSessionParams = {
  resumeSessionId?: string
  preCreateSession: boolean
  environmentId: string
  title?: string
  gitRepoUrl: string | null
  branch: string
  signal: AbortSignal
  baseUrl: string
  getAccessToken: () => string | undefined
  permissionMode?: string
  onDebug: (message: string) => void
}

export async function createBridgeCliInitialSession(
  params: CreateBridgeCliInitialSessionParams,
): Promise<string | null> {
  let initialSessionId = params.resumeSessionId ?? null
  if (params.preCreateSession && !params.resumeSessionId) {
    try {
      initialSessionId = await createBridgeSessionRuntime({
        environmentId: params.environmentId,
        title: params.title,
        events: [],
        gitRepoUrl: params.gitRepoUrl,
        branch: params.branch,
        signal: params.signal,
        baseUrl: params.baseUrl,
        getAccessToken: params.getAccessToken,
        permissionMode: params.permissionMode,
      })
      if (initialSessionId) {
        params.onDebug(`[bridge:init] Created initial session ${initialSessionId}`)
      }
    } catch (err) {
      const { errorMessage } = await import('../utils/errors.js')
      params.onDebug(
        `[bridge:init] Session creation failed (non-fatal): ${errorMessage(err)}`,
      )
    }
  }

  return initialSessionId
}

export function createBridgeHeadlessDeps(
  runBridgeLoop: BridgeLoopRunner,
): HeadlessBridgeDeps {
  return {
    bridgeLoginError: BRIDGE_LOGIN_ERROR,
    async getBaseUrl() {
      return getBridgeBaseUrl()
    },
    async setWorkingDirectory(dir: string) {
      process.chdir(dir)
      setOriginalCwd(dir)
      setCwdState(dir)
    },
    async ensureTrustedWorkspace() {
      enableConfigs()
      return checkHasTrustDialogAccepted()
    },
    async initRuntimeSinks() {
      initSinks()
    },
    async getGitMetadata(dir: string, spawnMode: HeadlessBridgeOpts['spawnMode']) {
      return {
        branch: await getBranch(),
        gitRepoUrl: await getRemoteUrl(),
        worktreeAvailable:
          spawnMode !== 'worktree'
            ? true
            : hasWorktreeCreateHook() || findGitRoot(dir) !== null,
      }
    },
    createApi({
      baseUrl,
      getAccessToken,
      onAuth401,
      log,
    }: HeadlessBridgeApiFactoryParams) {
      return createBridgeApiClient({
        baseUrl,
        getAccessToken,
        runnerVersion: MACRO.VERSION,
        onDebug: log,
        onAuth401,
        getTrustedDeviceToken,
      })
    },
    async createSpawner(runtimeOpts: HeadlessBridgeOpts) {
      return createSessionSpawner({
        execPath: process.execPath,
        scriptArgs: spawnScriptArgs(),
        env: process.env,
        verbose: false,
        sandbox: runtimeOpts.sandbox,
        permissionMode: runtimeOpts.permissionMode,
        onDebug: runtimeOpts.log,
      })
    },
    runBridgeLoop,
    async createInitialSession(params: HeadlessBridgeInitialSessionParams) {
      return createBridgeSessionRuntime({
        environmentId: params.environmentId,
        title: params.title,
        events: [],
        gitRepoUrl: params.gitRepoUrl,
        branch: params.branch,
        signal: params.signal,
        baseUrl: params.baseUrl,
        getAccessToken: params.getAccessToken,
        permissionMode: params.permissionMode,
      })
    },
  }
}

export async function runBridgeHeadless(
  opts: HeadlessBridgeOpts,
  signal: AbortSignal,
  runBridgeLoop?: BridgeLoopRunner,
): Promise<void> {
  const effectiveRunBridgeLoop =
    runBridgeLoop ??
    (await import('../bridge/bridgeMain.js')).runBridgeLoop
  return runHeadlessBridgeRuntime(
    opts,
    signal,
    createBridgeHeadlessDeps(effectiveRunBridgeLoop),
  )
}

export {
  runBridgeCliRuntime,
  runBridgeHeadlessRuntime,
  createBridgePersistenceOwner,
  type BridgeCliEntry,
  type BridgeHeadlessEntry,
  type BridgeLoopRunner,
  type HeadlessBridgeOpts,
  archiveBridgeSessionRuntime,
  createBridgeSessionRuntime,
  getBridgeSessionRuntime,
  updateBridgeSessionTitleRuntime,
}
