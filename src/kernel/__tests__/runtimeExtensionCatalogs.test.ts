import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  clearRegisteredHooks,
  registerHookCallbacks,
} from '../../bootstrap/state.js'
import { createDefaultKernelRuntimeHookCatalog } from '../runtimeExtensionCatalogs.js'

describe('createDefaultKernelRuntimeHookCatalog', () => {
  beforeEach(() => {
    clearRegisteredHooks()
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

    const catalog = createDefaultKernelRuntimeHookCatalog(undefined)
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

    const catalog = createDefaultKernelRuntimeHookCatalog(undefined)
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
