import { AgentCore } from './AgentCore.js'
import type { AgentCoreOptions } from './types.js'

export function createAgent(options: AgentCoreOptions): AgentCore {
  return new AgentCore(options)
}
