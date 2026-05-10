import type { RuntimeCommandResolver } from './command.js'
import type { RuntimeHostBridge } from './host.js'
import type { RuntimeMcpRegistry } from './mcp.js'
import type { RuntimePermissionEvaluator } from './permissions.js'
import type { RuntimePersistenceStore } from './persistence.js'
import type { RuntimeProviderRegistry } from './provider.js'
import type { RuntimeStateProviders } from './state.js'
import type { RuntimeToolCatalog, RuntimeToolExecutor } from './tool.js'

export type RuntimeExecutionStatus =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type RuntimeExecutionMode =
  | 'main'
  | 'agent'
  | 'async_agent'
  | 'teammate'
  | 'coordinator'

export type RuntimeExecutionEvent =
  | { type: 'status'; status: RuntimeExecutionStatus }
  | { type: 'message'; role: 'system' | 'user' | 'assistant'; messageId?: string }
  | {
      type: 'tool'
      toolName: string
      phase: 'queued' | 'started' | 'completed' | 'failed'
    }
  | {
      type: 'command'
      commandName: string
      phase: 'queued' | 'started' | 'completed' | 'failed'
    }
  | {
      type: 'permission'
      requestId: string
      phase: 'requested' | 'resolved'
    }
  | {
      type: 'persistence'
      phase: 'recorded' | 'restored' | 'compacted'
    }
  | { type: 'error'; error: unknown }

export interface RuntimeExecutionServices {
  commands: RuntimeCommandResolver
  tools: RuntimeToolCatalog
  toolExecutor: RuntimeToolExecutor
  mcp: RuntimeMcpRegistry
  providers: RuntimeProviderRegistry
  permissions: RuntimePermissionEvaluator
  persistence: RuntimePersistenceStore
}

export interface RuntimeExecutionContext {
  sessionId: string
  cwd: string
  host: RuntimeHostBridge
  state: RuntimeStateProviders
  services: RuntimeExecutionServices
  emit(event: RuntimeExecutionEvent): void
}

export type RuntimeTurnInput = {
  prompt: string | readonly unknown[]
  source?: string
  maxTurns?: number
  fallbackModel?: string
  maxOutputTokens?: number
  taskBudget?: { total: number }
}

export type RuntimeTurnResult = {
  stopReason: string | null
  turnCount: number
  durationMs: number
  isError: boolean
  output?: unknown
}

export interface RuntimeSession {
  readonly id: string
  readonly context: RuntimeExecutionContext
  submitTurn(input: RuntimeTurnInput): AsyncIterable<RuntimeExecutionEvent>
  cancel(reason?: string): void
}

export interface RuntimeExecutionContract {
  createSession(context: RuntimeExecutionContext): RuntimeSession
}
