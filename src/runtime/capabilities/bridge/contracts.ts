import type {
  BackoffConfig,
  BridgeApiClient,
  BridgeConfig,
  BridgeLogger,
  SessionSpawner,
} from '../../../bridge/types.js'
import type { HeadlessBridgeOpts } from './HeadlessBridgeRuntime.js'

export type HeadlessBridgeGitMetadata = {
  branch: string
  gitRepoUrl: string | null
  worktreeAvailable: boolean
}

export type HeadlessBridgeApiFactoryParams = {
  baseUrl: string
  getAccessToken: () => string | undefined
  onAuth401: (failedToken: string) => Promise<boolean>
  log: (message: string) => void
}

export type HeadlessBridgeInitialSessionParams = {
  environmentId: string
  title?: string
  gitRepoUrl: string | null
  branch: string
  signal: AbortSignal
  baseUrl: string
  getAccessToken: () => string | undefined
  permissionMode?: string
}

export interface HeadlessBridgeDeps {
  bridgeLoginError: string
  getBaseUrl: () => Promise<string>
  setWorkingDirectory: (dir: string) => Promise<void>
  ensureTrustedWorkspace: (dir: string) => Promise<boolean>
  initRuntimeSinks: () => Promise<void>
  getGitMetadata: (
    dir: string,
    spawnMode: HeadlessBridgeOpts['spawnMode'],
  ) => Promise<HeadlessBridgeGitMetadata>
  createApi: (params: HeadlessBridgeApiFactoryParams) => BridgeApiClient
  createSpawner: (opts: HeadlessBridgeOpts) => Promise<SessionSpawner>
  runBridgeLoop: (
    config: BridgeConfig,
    environmentId: string,
    environmentSecret: string,
    api: BridgeApiClient,
    spawner: SessionSpawner,
    logger: BridgeLogger,
    signal: AbortSignal,
    backoffConfig?: BackoffConfig,
    initialSessionId?: string,
    getAccessToken?: () => string | undefined | Promise<string | undefined>,
  ) => Promise<void>
  createInitialSession: (
    params: HeadlessBridgeInitialSessionParams,
  ) => Promise<string | null>
}

export type BridgeLoopRunner = HeadlessBridgeDeps['runBridgeLoop']
