import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { RuntimeRegisteredHookMatchers } from '../../utils/hooks.js'

const loadPluginHookMatchers = mock(async () => ({}))
const getRegisteredHooks = mock(
  (): RuntimeRegisteredHookMatchers | null => null,
)

import { createDefaultKernelRuntimeHookCatalog } from '../runtimeExtensionCatalogs.js'

describe('createDefaultKernelRuntimeHookCatalog', () => {
  beforeEach(() => {
    getRegisteredHooks.mockReset()
    getRegisteredHooks.mockImplementation(() => null)
    loadPluginHookMatchers.mockReset()
    loadPluginHookMatchers.mockImplementation(async () => ({}))
  })

  afterEach(() => {
    getRegisteredHooks.mockReset()
  })

  test('lists registered callback hooks from the injected host provider', async () => {
    getRegisteredHooks.mockImplementation(() => ({
      Notification: [
        {
          matcher: 'runtime',
          hooks: [
            {
              type: 'callback' as const,
              timeout: 1,
              callback: async () => ({
                systemMessage: 'listed',
              }),
            },
          ],
        },
      ],
    }))

    const catalog = createDefaultKernelRuntimeHookCatalog(undefined, {
      getRegisteredHooks,
      loadPluginHookMatchers,
    })
    const hooks = await catalog.listHooks()

    expect(hooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'Notification',
          type: 'callback',
          source: 'builtinHook',
          matcher: 'runtime',
        }),
      ]),
    )
  })

  test('reports unbound registered hooks when a local registration matches runHook', async () => {
    const catalog = createDefaultKernelRuntimeHookCatalog(undefined)
    await catalog.registerHook?.({
      hook: {
        event: 'Notification',
        type: 'callback',
        source: 'sessionHook',
        matcher: 'runtime',
      },
      handlerRef: 'local-handler',
      metadata: { source: 'sdk' },
    })

    const result = await catalog.runHook?.({
      event: 'Notification',
      matcher: 'runtime',
      input: {
        notification_type: 'runtime',
      },
      metadata: { source: 'sdk' },
    })

    expect(result).toMatchObject({
      event: 'Notification',
      handled: true,
      metadata: { source: 'sdk' },
    })
    expect(result?.errors).toEqual([
      expect.objectContaining({
        code: 'unbound_handler',
        hook: expect.objectContaining({
          event: 'Notification',
          matcher: 'runtime',
          displayName: 'local-handler',
        }),
      }),
    ])
  })

  test('runs locally registered callback hooks without requiring a bootstrap provider', async () => {
    const catalog = createDefaultKernelRuntimeHookCatalog(undefined)

    await catalog.registerHook?.({
      hook: {
        event: 'Notification',
        type: 'callback',
        source: 'sessionHook',
        matcher: 'runtime',
      },
      handlerRef: 'local-callback',
      metadata: {
        source: 'sdk',
        callback: async (input: { notification_type?: unknown }) => ({
          systemMessage: `local:${String((input as { notification_type?: unknown }).notification_type)}`,
        }),
      },
    })

    const result = await catalog.runHook?.({
      event: 'Notification',
      matcher: 'runtime',
      input: {
        notification_type: 'runtime',
      },
      metadata: { source: 'sdk' },
    })

    expect(result).toMatchObject({
      event: 'Notification',
      handled: true,
      metadata: { source: 'sdk' },
    })
    expect(result?.outputs).toEqual([
      expect.objectContaining({
        command: 'callback',
        succeeded: true,
        output: 'local:runtime',
        blocked: false,
      }),
    ])
    expect(result?.errors).toBeUndefined()
    expect(getRegisteredHooks).not.toHaveBeenCalled()
  })

  test('runs plugin hooks through the default runtime hook runner without requiring a bootstrap provider', async () => {
    loadPluginHookMatchers.mockImplementation(async () => ({
      Notification: [
        {
          matcher: 'runtime',
          pluginRoot: process.cwd(),
          pluginName: 'audit-plugin',
          pluginId: 'audit-plugin@local',
          hooks: [
            {
              type: 'command',
              command: 'printf plugin:runtime',
            },
          ],
        },
      ],
    }))
    const catalog = createDefaultKernelRuntimeHookCatalog(undefined, {
      loadPluginHookMatchers,
    })

    const result = await catalog.runHook?.({
      event: 'Notification',
      matcher: 'runtime',
      input: {
        notification_type: 'runtime',
      },
      metadata: { source: 'sdk' },
    })

    expect(loadPluginHookMatchers).toHaveBeenCalled()
    expect(result).toMatchObject({
      event: 'Notification',
      handled: true,
      metadata: { source: 'sdk' },
    })
    expect(result?.outputs).toEqual([
      expect.objectContaining({
        command: 'printf plugin:runtime',
        succeeded: true,
        output: 'plugin:runtime',
        blocked: false,
      }),
    ])
    expect(result?.errors).toBeUndefined()
    expect(getRegisteredHooks).not.toHaveBeenCalled()
  })

  test('adds registered hook descriptors to the default catalog listing', async () => {
    const catalog = createDefaultKernelRuntimeHookCatalog(undefined)

    const mutation = await catalog.registerHook?.({
      hook: {
        event: 'SessionEnd',
        type: 'command',
        source: 'sessionHook',
      },
      handlerRef: 'session-end-hook',
      metadata: { source: 'sdk' },
    })
    const hooks = await catalog.listHooks()

    expect(mutation).toMatchObject({
      registered: true,
      handlerRef: 'session-end-hook',
      metadata: { source: 'sdk' },
      hook: {
        event: 'SessionEnd',
        source: 'sessionHook',
        displayName: 'session-end-hook',
      },
    })
    expect(hooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'SessionEnd',
          source: 'sessionHook',
          displayName: 'session-end-hook',
        }),
      ]),
    )
  })
})
