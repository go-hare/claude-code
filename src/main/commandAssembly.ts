import type { Command } from '../commands.js'
import { getCommands } from '../commands.js'
import { initBuiltinPlugins } from '../plugins/bundled/index.js'
import { initBundledSkills } from '../skills/bundled/index.js'
import { getAgentDefinitionsWithOverrides } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'

type AgentDefinitionsResult = Awaited<
  ReturnType<typeof getAgentDefinitionsWithOverrides>
>

export type PreloadedCommandAssembly = {
  commandsPromise: Promise<Command[]> | null
  agentDefinitionsPromise: Promise<AgentDefinitionsResult> | null
}

export function primeBundledCommandSources(entrypoint?: string): void {
  // Register bundled skills/plugins before kicking getCommands() — they're
  // pure in-memory array pushes (<1ms, zero I/O) that getBundledSkills()
  // reads synchronously.
  if (entrypoint !== 'local-agent') {
    initBuiltinPlugins()
    initBundledSkills()
  }
}

export function preloadCommandAssembly(
  preSetupCwd: string,
  worktreeEnabled: boolean,
): PreloadedCommandAssembly {
  const commandsPromise = worktreeEnabled ? null : getCommands(preSetupCwd)
  const agentDefinitionsPromise = worktreeEnabled
    ? null
    : getAgentDefinitionsWithOverrides(preSetupCwd)

  // Suppress transient unhandledRejection if these reject before the later
  // Promise.all join in main.tsx.
  commandsPromise?.catch(() => {})
  agentDefinitionsPromise?.catch(() => {})

  return { commandsPromise, agentDefinitionsPromise }
}

export async function resolveCommandAssembly(options: {
  currentCwd: string
  preloaded: PreloadedCommandAssembly
}): Promise<{
  commands: Command[]
  agentDefinitionsResult: AgentDefinitionsResult
}> {
  const { currentCwd, preloaded } = options

  const [commands, agentDefinitionsResult] = await Promise.all([
    preloaded.commandsPromise ?? getCommands(currentCwd),
    preloaded.agentDefinitionsPromise ??
      getAgentDefinitionsWithOverrides(currentCwd),
  ])

  return {
    commands,
    agentDefinitionsResult,
  }
}
