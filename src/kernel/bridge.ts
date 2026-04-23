/**
 * Stable bridge-facing kernel exports.
 *
 * This keeps external hosts off internal runtime paths while reusing the
 * existing bridge capability implementation.
 */
import { createBridgeApiClient } from '../bridge/bridgeApi.js'
import { getTrustedDeviceToken } from '../bridge/trustedDevice.js'
import { createSessionSpawner } from '../bridge/sessionRunner.js'
import { BRIDGE_LOGIN_ERROR } from '../bridge/types.js'
import { getBridgeBaseUrl } from '../bridge/bridgeConfig.js'
import { hasWorktreeCreateHook } from '../utils/hooks.js'
import { findGitRoot, getBranch, getRemoteUrl } from '../utils/git.js'
import { initSinks } from '../utils/sinks.js'
import { checkHasTrustDialogAccepted, enableConfigs } from '../utils/config.js'
import { setCwdState, setOriginalCwd } from '../bootstrap/state.js'
import { getBootstrapArgs, getScriptPath } from '../utils/cliLaunch.js'
import { BridgeHeadlessPermanentError, createHeadlessBridgeLogger, type HeadlessBridgeOpts } from '../runtime/capabilities/bridge/HeadlessBridgeRuntime.js'
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
  createBridgeRuntimeCapability,
  runBridgeCliRuntime,
  runBridgeHeadlessRuntime,
  type BridgeCliEntry,
  type BridgeHeadlessEntry,
  type BridgeRuntimeCapability,
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
  createBridgeRuntimeCapability,
  type BridgeCliEntry,
  type BridgeHeadlessEntry,
  type BridgeRuntimeCapability,
  runHeadlessBridgeRuntime,
  type BridgeLoopRunner,
  BridgeHeadlessPermanentError,
  createHeadlessBridgeLogger,
  type HeadlessBridgeOpts,
  archiveBridgeSessionRuntime,
  createBridgeSessionRuntime,
  getBridgeSessionRuntime,
  updateBridgeSessionTitleRuntime,
}
