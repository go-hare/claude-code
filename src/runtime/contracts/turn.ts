import type { KernelConversationId } from './conversation.js'
import type { KernelCapabilityPlane } from './capability.js'
import type { KernelContextAssembly } from './context.js'
import type { RuntimeProviderSelection } from './provider.js'

export type KernelTurnId = string

export type KernelTurnState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'aborting'
  | 'completed'
  | 'failed'
  | 'disposed'

export type KernelTurnScope = {
  conversationId: KernelConversationId
  turnId: KernelTurnId
}

export type KernelExecutionMode =
  | 'interactive'
  | 'headless'
  | 'direct_connect'
  | 'acp'
  | 'agent'
  | 'async_agent'
  | 'teammate'
  | 'coordinator'
  | 'background'
  | 'unknown'

export type KernelTurnInputContract = {
  executionMode: KernelExecutionMode
  contextAssembly: KernelContextAssembly
  capabilityPlane: KernelCapabilityPlane
  metadata?: Record<string, unknown>
}

export type KernelTurnRunRequest = KernelTurnScope & {
  prompt: string | readonly unknown[]
  attachments?: readonly unknown[]
  providerOverride?: RuntimeProviderSelection
  executionMode?: KernelExecutionMode
  contextAssembly?: KernelContextAssembly
  capabilityPlane?: KernelCapabilityPlane
  metadata?: Record<string, unknown>
}

export type KernelTurnAbortRequest = KernelTurnScope & {
  reason?: string
  metadata?: Record<string, unknown>
}

export type KernelTurnSnapshot = KernelTurnScope & {
  state: KernelTurnState
  input?: KernelTurnInputContract
  startedAt?: string
  completedAt?: string
  stopReason?: string | null
  error?: unknown
}
