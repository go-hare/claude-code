/**
 * Stable server/direct-connect host-facing kernel exports.
 *
 * Top-level hosts should depend on this surface instead of importing
 * `server/*` compatibility modules directly.
 */
import {
  createDirectConnectSessionRuntime,
  DirectConnectError,
} from '../runtime/capabilities/server/DirectConnectSessionApi.js'
import {
  runConnectHeadlessRuntime,
  startServerRuntimeHost,
} from '../runtime/capabilities/server/HostRuntime.js'
import { SessionManager } from '../runtime/capabilities/server/SessionManager.js'
import { DangerousBackend } from '../server/backends/dangerousBackend.js'
import { createServerLogger } from '../server/serverLog.js'
import type { SessionLogger } from '../runtime/capabilities/server/contracts.js'
import type { DirectConnectConfig, ServerConfig } from '../server/types.js'

type IntegerLike = string | number | undefined

export type KernelDirectConnectSessionState = {
  serverUrl: string
  workDir?: string
}

export type KernelDirectConnectSessionResult = {
  config: DirectConnectConfig
  workDir?: string
  state: KernelDirectConnectSessionState
}

export type KernelDirectConnectStateWriter = {
  setOriginalCwd: (cwd: string) => void
  setCwdState: (cwd: string) => void
  setDirectConnectServerUrl: (url: string) => void
}

export type KernelServerHostConfigInput = {
  port: IntegerLike
  host?: string
  authToken?: string
  unix?: string
  workspace?: string
  idleTimeoutMs?: IntegerLike
  maxSessions?: IntegerLike
  createAuthToken?: () => string
}

export type KernelServerHostAssembly = {
  authToken: string
  config: ServerConfig
  sessionManager: SessionManager
  logger: SessionLogger
  server: ReturnType<typeof startServerRuntimeHost>
}

function parseRequiredInteger(value: IntegerLike, field: string): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${field}: ${value}`)
  }
  return parsed
}

function parseOptionalInteger(
  value: IntegerLike,
  field: string,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback
  }
  return parseRequiredInteger(value, field)
}

export async function createDirectConnectSession(options: {
  serverUrl: string
  authToken?: string
  cwd: string
  dangerouslySkipPermissions?: boolean
  unixSocket?: string
}): Promise<KernelDirectConnectSessionResult> {
  const session = await createDirectConnectSessionRuntime(options)
  return {
    ...session,
    state: {
      serverUrl: options.serverUrl,
      workDir: session.workDir,
    },
  }
}

export async function createKernelDirectConnectSession(
  options: Parameters<typeof createDirectConnectSession>[0],
): Promise<KernelDirectConnectSessionResult> {
  return createDirectConnectSession(options)
}

export function applyDirectConnectSessionState(
  state: KernelDirectConnectSessionState,
  writer: KernelDirectConnectStateWriter,
): void {
  if (state.workDir) {
    writer.setOriginalCwd(state.workDir)
    writer.setCwdState(state.workDir)
  }
  writer.setDirectConnectServerUrl(state.serverUrl)
}

export function getDirectConnectErrorMessage(error: unknown): string {
  return error instanceof DirectConnectError ? error.message : String(error)
}

export async function connectDirectHostSession(
  options: Parameters<typeof createDirectConnectSession>[0],
  writer: KernelDirectConnectStateWriter,
): Promise<DirectConnectConfig> {
  const session = await createDirectConnectSession(options)
  applyDirectConnectSessionState(session.state, writer)
  return session.config
}

export function assembleServerHost(
  input: KernelServerHostConfigInput,
): KernelServerHostAssembly {
  const authToken =
    input.authToken ?? input.createAuthToken?.() ?? (() => {
      throw new Error('Server auth token factory did not return a token')
    })()
  const config: ServerConfig = {
    port: parseRequiredInteger(input.port, 'port'),
    host: input.host ?? '0.0.0.0',
    authToken,
    unix: input.unix,
    workspace: input.workspace,
    idleTimeoutMs: parseOptionalInteger(
      input.idleTimeoutMs,
      'idleTimeoutMs',
      600_000,
    ),
    maxSessions: parseOptionalInteger(input.maxSessions, 'maxSessions', 32),
  }
  const backend = new DangerousBackend()
  const sessionManager = new SessionManager(backend, {
    idleTimeoutMs: config.idleTimeoutMs,
    maxSessions: config.maxSessions,
  })
  const logger = createServerLogger()
  return {
    authToken,
    config,
    sessionManager,
    logger,
    server: startServerRuntimeHost(config, sessionManager, logger),
  }
}

export function startServer(
  config: ServerConfig,
  sessionManager: SessionManager,
  logger: SessionLogger,
) {
  return startServerRuntimeHost(config, sessionManager, logger)
}

export function startKernelServer(
  config: ServerConfig,
  sessionManager: SessionManager,
  logger: SessionLogger,
) {
  return startServer(config, sessionManager, logger)
}

export async function runConnectHeadless(
  ...args: Parameters<typeof runConnectHeadlessRuntime>
) {
  return runConnectHeadlessRuntime(...args)
}

export async function runKernelHeadlessClient(
  ...args: Parameters<typeof runConnectHeadless>
) {
  return runConnectHeadless(...args)
}

export { DirectConnectError }
