import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

const contractsRoot = join(import.meta.dir, '..')

const CONTRACT_FILES = [
  'runtime.ts',
  'conversation.ts',
  'context.ts',
  'turn.ts',
  'events.ts',
  'capability.ts',
  'agent.ts',
  'command.ts',
  'tool.ts',
  'hook.ts',
  'skill.ts',
  'plugin.ts',
  'task.ts',
  'permissions.ts',
] as const

const BANNED_IMPORT_PATTERNS = [
  "from 'src/",
  'from "src/',
  "from '../",
  'from "../',
  "from '@",
  'from "@',
  "from 'bun:",
  'from "bun:',
  "from 'react",
  'from "react',
  "from 'ink",
  'from "ink',
  'bootstrap/state',
  'entrypoints/',
  'screens/',
  'commands/',
]

async function readContract(file: string): Promise<string> {
  return readFile(join(contractsRoot, file), 'utf8')
}

describe('public kernel contract skeleton', () => {
  test('keeps contract files free of host and UI imports', async () => {
    for (const file of CONTRACT_FILES) {
      const content = await readContract(file)
      for (const pattern of BANNED_IMPORT_PATTERNS) {
        expect(content.includes(pattern), `${file} contains ${pattern}`).toBe(
          false,
        )
      }
    }
  })

  test('publishes the serial-spine contract names from runtime/contracts', async () => {
    const index = await readContract('index.ts')

    expect(index).toContain("export * from './runtime.js'")
    expect(index).toContain("export * from './conversation.js'")
    expect(index).toContain("export * from './context.js'")
    expect(index).toContain("export * from './turn.js'")
    expect(index).toContain("export * from './events.js'")
    expect(index).toContain("export * from './capability.js'")

    expect(await readContract('runtime.ts')).toContain('KernelRuntimeId')
    expect(await readContract('conversation.ts')).toContain(
      'KernelConversationId',
    )
    expect(await readContract('context.ts')).toContain(
      'KernelContextAssembly',
    )
    expect(await readContract('context.ts')).toContain(
      'KernelContextAssemblyPhase',
    )
    expect(await readContract('turn.ts')).toContain('KernelTurnId')
    expect(await readContract('turn.ts')).toContain('KernelExecutionMode')
    expect(await readContract('turn.ts')).toContain('KernelTurnInputContract')
    expect(await readContract('turn.ts')).toContain('contextAssembly')
    expect(await readContract('turn.ts')).toContain('capabilityPlane')
    expect(await readContract('events.ts')).toContain(
      'KernelRuntimeEnvelopeBase',
    )
    expect(await readContract('events.ts')).toContain('KernelRuntimeEventSink')
    expect(await readContract('capability.ts')).toContain(
      'KernelCapabilityDescriptor',
    )
    expect(await readContract('capability.ts')).toContain(
      'KernelCapabilityPlane',
    )
    expect(await readContract('command.ts')).toContain(
      'RuntimeCommandGraphEntry',
    )
    expect(await readContract('agent.ts')).toContain('RuntimeAgentDescriptor')
    expect(await readContract('agent.ts')).toContain(
      'RuntimeAgentRunDescriptor',
    )
    expect(await readContract('tool.ts')).toContain('RuntimeToolDescriptor')
    expect(await readContract('hook.ts')).toContain('RuntimeHookDescriptor')
    expect(await readContract('skill.ts')).toContain('RuntimeSkillDescriptor')
    expect(await readContract('plugin.ts')).toContain('RuntimePluginDescriptor')
    expect(await readContract('task.ts')).toContain('RuntimeTaskDescriptor')
    expect(await readContract('permissions.ts')).toContain(
      'KernelPermissionRequestId',
    )
  })
})
