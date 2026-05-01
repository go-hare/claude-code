import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const loadPluginHookMatchers = mock(async () => ({}))

import {
  clearRegisteredHooks,
  getRegisteredHooks,
  registerHookCallbacks,
} from '../../bootstrap/state.js'
import { createDefaultKernelRuntimeHookCatalog } from '../runtimeExtensionCatalogs.js'

describe('createDefaultKernelRuntimeHookCatalog', () => {
  beforeEach(() => {
    clearRegisteredHooks()
    loadPluginHookMatchers.mockReset()
    loadPluginHookMatchers.mockImplementation(async () => ({}))
  })

  afterEach(() => {
    clearRegisteredHooks()
  })

  test('runs registered callback hooks through the default runtime hook runner', async () => {
    registerHookCallbacks({
      Notification: [
        {
          matcher: 'runtime',
          hooks: [
            {
              type: 'callback',
              timeout: 1,
              callback: async input => ({
                systemMessage: `seen:${String((input as { notification_type?: unknown }).notification_type)}`,
              }),
            },
          ],
        },
      ],
    })

    const catalog = createDefaultKernelRuntimeHookCatalog(undefined, {
      loadPluginHookMatchers,
    })
    const result = await catalog.runHook?.({
      event: 'Notification',
      matcher: 'runtime',
      input: {
        notification_type: 'runtime',
      },
      metadata: { source: 'test' },
    })

    expect(result).toMatchObject({
      event: 'Notification',
      handled: true,
      metadata: { source: 'test' },
    })
    expect(result?.outputs).toEqual([
      expect.objectContaining({
        command: 'callback',
        succeeded: true,
        output: 'seen:runtime',
        blocked: false,
      }),
    ])
    expect(result?.errors).toBeUndefined()
  })

  test('lists registered callback hooks from bootstrap state', async () => {
    registerHookCallbacks({
      Notification: [
        {
          matcher: 'runtime',
          hooks: [
            {
              type: 'callback',
              timeout: 1,
              callback: async () => ({
                systemMessage: 'listed',
              }),
            },
          ],
        },
      ],
    })

    const catalog = createDefaultKernelRuntimeHookCatalog(undefined, {
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

  test('runs locally registered callback hooks without writing bootstrap global state', async () => {
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

    expect(getRegisteredHooks()).toBeNull()

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
    expect(getRegisteredHooks()).toBeNull()
  })

  test('runs plugin hooks through the default runtime hook runner without writing bootstrap state', async () => {
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

    expect(getRegisteredHooks()).toBeNull()

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
    expect(getRegisteredHooks()).toBeNull()
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
