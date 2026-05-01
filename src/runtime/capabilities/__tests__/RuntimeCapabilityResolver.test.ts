import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

import {
  createRuntimeCapabilityResolver,
  RuntimeCapabilityUnavailableError,
  type RuntimeCapabilityDefinition,
} from '../RuntimeCapabilityResolver.js'
import { createDefaultRuntimeCapabilityDefinitions } from '../defaultRuntimeCapabilities.js'

describe('RuntimeCapabilityResolver', () => {
  test('returns a complete descriptor set before lazy capabilities load', () => {
    const resolver = createRuntimeCapabilityResolver([
      { name: 'events', lazy: false, reloadable: false },
      { name: 'tools', dependencies: ['events'] },
    ])

    expect(resolver.listDescriptors()).toEqual([
      {
        name: 'events',
        status: 'declared',
        lazy: false,
        dependencies: [],
        reloadable: false,
        error: undefined,
        metadata: undefined,
      },
      {
        name: 'tools',
        status: 'declared',
        lazy: true,
        dependencies: ['events'],
        reloadable: true,
        error: undefined,
        metadata: undefined,
      },
    ])
  })

  test('lazy loads dependencies before the requested capability', async () => {
    const calls: string[] = []
    const definitions: RuntimeCapabilityDefinition[] = [
      {
        name: 'permissions',
        load: async () => {
          calls.push('permissions')
          return { ok: true }
        },
      },
      {
        name: 'tools',
        dependencies: ['permissions'],
        load: async () => {
          calls.push('tools')
          return ['Bash', 'FileRead']
        },
      },
    ]
    const resolver = createRuntimeCapabilityResolver(definitions)

    await expect(resolver.requireCapability('tools')).resolves.toEqual([
      'Bash',
      'FileRead',
    ])
    expect(calls).toEqual(['permissions', 'tools'])
    expect(resolver.getDescriptor('permissions')?.status).toBe('ready')
    expect(resolver.getDescriptor('tools')?.status).toBe('ready')
  })

  test('records failed capability state and keeps the error visible', async () => {
    const resolver = createRuntimeCapabilityResolver([
      {
        name: 'mcp',
        load: async () => {
          throw new Error('mcp server refused connection')
        },
      },
    ])

    await expect(resolver.requireCapability('mcp')).rejects.toThrow(
      'mcp server refused connection',
    )

    expect(resolver.getDescriptor('mcp')).toMatchObject({
      name: 'mcp',
      status: 'failed',
      error: {
        code: 'Error',
        message: 'mcp server refused connection',
        retryable: true,
      },
    })

    await expect(resolver.requireCapability('mcp')).rejects.toThrow(
      RuntimeCapabilityUnavailableError,
    )
  })

  test('marks optional load failures as degraded without blocking the resolver', async () => {
    const resolver = createRuntimeCapabilityResolver([
      {
        name: 'kairos',
        metadata: { optional: true },
        load: async () => {
          throw new Error('provider unavailable')
        },
      },
    ])

    await expect(resolver.requireCapability('kairos')).resolves.toBeUndefined()
    expect(resolver.getDescriptor('kairos')).toMatchObject({
      name: 'kairos',
      status: 'degraded',
      error: {
        code: 'Error',
        message: 'provider unavailable',
        retryable: true,
      },
      metadata: { optional: true },
    })

    await expect(resolver.requireCapability('kairos')).resolves.toBeUndefined()
  })

  test('supports explicit degraded predicates for partial capability availability', async () => {
    const resolver = createRuntimeCapabilityResolver([
      {
        name: 'hooks',
        degradeOnFailure: error =>
          error instanceof Error && error.message.includes('plugin'),
        load: async () => {
          throw new Error('plugin hook load failed')
        },
      },
    ])

    await expect(resolver.requireCapability('hooks')).resolves.toBeUndefined()
    expect(resolver.getDescriptor('hooks')).toMatchObject({
      status: 'degraded',
      error: {
        message: 'plugin hook load failed',
      },
    })
  })

  test('disabled capability returns a stable unavailable error', async () => {
    const resolver = createRuntimeCapabilityResolver([
      { name: 'kairos', enabled: false, metadata: { optional: true } },
    ])

    await expect(resolver.requireCapability('kairos')).rejects.toMatchObject({
      code: 'CAPABILITY_DISABLED',
      capabilityName: 'kairos',
    })
    expect(resolver.getDescriptor('kairos')).toMatchObject({
      status: 'disabled',
      metadata: { optional: true },
    })
  })

  test('reload resets only the requested dependency closure', async () => {
    const resolver = createRuntimeCapabilityResolver([
      { name: 'events', reloadable: false },
      { name: 'permissions', dependencies: ['events'] },
      { name: 'tools', dependencies: ['permissions'] },
      { name: 'commands' },
    ])

    await resolver.requireCapability('tools')
    await resolver.requireCapability('commands')

    await resolver.reloadCapabilities({
      type: 'dependency-closure',
      name: 'tools',
    })

    expect(resolver.getDescriptor('events')?.status).toBe('ready')
    expect(resolver.getDescriptor('permissions')?.status).toBe('declared')
    expect(resolver.getDescriptor('tools')?.status).toBe('declared')
    expect(resolver.getDescriptor('commands')?.status).toBe('ready')
  })

  test('default graph declares full runtime capability families', () => {
    const names = createDefaultRuntimeCapabilityDefinitions().map(
      definition => definition.name,
    )

    expect(names).toEqual(
      expect.arrayContaining([
        'commands',
        'tools',
        'mcp',
        'hooks',
        'skills',
        'plugins',
        'agents',
        'companion',
        'kairos',
        'memory',
        'sessions',
      ]),
    )
  })

  test('resolver files do not statically import terminal UI modules', async () => {
    const root = join(import.meta.dir, '..')
    const files = [
      'RuntimeCapabilityResolver.ts',
      'defaultRuntimeCapabilities.ts',
    ]

    for (const file of files) {
      const source = await readFile(join(root, file), 'utf8')
      expect(source).not.toContain('screens/')
      expect(source).not.toContain('ink')
      expect(source).not.toContain('react')
    }
  })
})
