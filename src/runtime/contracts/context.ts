export type KernelContextCategory =
  | 'model_visible'
  | 'host_visible'
  | 'operator_debug'

export type KernelContextSource =
  | 'user_input'
  | 'queued_command'
  | 'attachment'
  | 'task'
  | 'memory'
  | 'skill'
  | 'tool'
  | 'agent'
  | 'host'
  | 'runtime'
  | 'operator'

export type KernelContextAssemblyPhase =
  | 'turn_input'
  | 'attachment_batch'
  | 'memory_prefetch'
  | 'skill_prefetch'

export type KernelContextAssemblyMetadata = Record<string, unknown> & {
  phase: KernelContextAssemblyPhase
}

export type KernelContextEntry = {
  id?: string
  type: string
  category: KernelContextCategory
  source: KernelContextSource
  payload?: unknown
  metadata?: Record<string, unknown>
}

export type KernelContextAssembly = {
  modelVisible: readonly KernelContextEntry[]
  hostVisible: readonly KernelContextEntry[]
  operatorDebug: readonly KernelContextEntry[]
}

export type KernelContextAssemblySnapshot = {
  entries: readonly KernelContextEntry[]
  categories: KernelContextAssembly
}
