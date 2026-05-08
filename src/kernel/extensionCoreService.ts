import type {
  RuntimeHookRegisterRequest,
  RuntimeHookRunRequest,
} from '../runtime/contracts/hook.js'
import type {
  RuntimePluginInstallRequest,
  RuntimePluginSetEnabledRequest,
  RuntimePluginUninstallRequest,
  RuntimePluginUpdateRequest,
} from '../runtime/contracts/plugin.js'
import type { RuntimeSkillPromptContextRequest } from '../runtime/contracts/skill.js'
import type { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import { stripUndefined } from './corePayload.js'
import {
  createDefaultKernelRuntimeHookCatalog,
  createDefaultKernelRuntimePluginCatalog,
  createDefaultKernelRuntimeSkillCatalog,
  type RuntimeHookCatalog,
  type RuntimePluginCatalog,
  type RuntimeSkillCatalog,
} from './runtimeExtensionCatalogs.js'

export type ExtensionCoreServiceOptions = {
  workspacePath?: string
  eventBus?: RuntimeEventBus
  hookCatalog?: RuntimeHookCatalog
  skillCatalog?: RuntimeSkillCatalog
  pluginCatalog?: RuntimePluginCatalog
}

export class ExtensionCoreService {
  private readonly hookCatalog: RuntimeHookCatalog
  private readonly skillCatalog: RuntimeSkillCatalog
  private readonly pluginCatalog: RuntimePluginCatalog

  constructor(private readonly options: ExtensionCoreServiceOptions = {}) {
    this.hookCatalog =
      options.hookCatalog ??
      createDefaultKernelRuntimeHookCatalog(options.workspacePath)
    this.skillCatalog =
      options.skillCatalog ??
      createDefaultKernelRuntimeSkillCatalog(options.workspacePath)
    this.pluginCatalog =
      options.pluginCatalog ??
      createDefaultKernelRuntimePluginCatalog(options.workspacePath)
  }

  async listHooks(): Promise<unknown> {
    return {
      hooks: stripUndefined(await this.hookCatalog.listHooks(this.context())),
    }
  }

  async reloadHooks(): Promise<unknown> {
    await this.hookCatalog.reload(this.context())
    const snapshot = {
      hooks: await this.hookCatalog.listHooks(this.context()),
    }
    this.emit('hooks.reloaded', snapshot)
    return stripUndefined(snapshot)
  }

  async runHook(request: RuntimeHookRunRequest): Promise<unknown> {
    if (!this.hookCatalog.runHook) {
      throw new ExtensionCoreError('unavailable', 'Hook run is not available')
    }
    const result = await this.hookCatalog.runHook(
      request,
      this.context(request.metadata),
    )
    this.emit('hooks.ran', result, request.metadata)
    return stripUndefined(result)
  }

  async registerHook(request: RuntimeHookRegisterRequest): Promise<unknown> {
    if (!this.hookCatalog.registerHook) {
      throw new ExtensionCoreError(
        'unavailable',
        'Hook registration is not available',
      )
    }
    const result = await this.hookCatalog.registerHook(
      request,
      this.context(request.metadata),
    )
    this.emit('hooks.registered', result, request.metadata)
    return stripUndefined(result)
  }

  async listSkills(): Promise<unknown> {
    return {
      skills: stripUndefined(
        await this.skillCatalog.listSkills(this.context()),
      ),
    }
  }

  async reloadSkills(): Promise<unknown> {
    await this.skillCatalog.reload(this.context())
    const snapshot = {
      skills: await this.skillCatalog.listSkills(this.context()),
    }
    this.emit('skills.reloaded', snapshot)
    return stripUndefined(snapshot)
  }

  async resolveSkillContext(
    request: RuntimeSkillPromptContextRequest,
  ): Promise<unknown> {
    if (!this.skillCatalog.resolvePromptContext) {
      throw new ExtensionCoreError(
        'unavailable',
        'Skill prompt context resolution is not available',
      )
    }
    const result = await this.skillCatalog.resolvePromptContext(
      request,
      this.context(request.metadata),
    )
    this.emit('skills.context_resolved', result, request.metadata)
    return stripUndefined(result)
  }

  async listPlugins(): Promise<unknown> {
    const snapshot = await this.pluginCatalog.listPlugins(this.context())
    return stripUndefined({
      plugins: snapshot.plugins,
      errors: snapshot.errors ?? [],
    })
  }

  async reloadPlugins(): Promise<unknown> {
    await this.pluginCatalog.reload(this.context())
    const listed = await this.pluginCatalog.listPlugins(this.context())
    const snapshot = {
      plugins: listed.plugins,
      errors: listed.errors ?? [],
    }
    this.emit('plugins.reloaded', snapshot)
    return stripUndefined(snapshot)
  }

  async setPluginEnabled(
    request: RuntimePluginSetEnabledRequest,
  ): Promise<unknown> {
    const result = await this.requirePluginMutation(
      'setPluginEnabled',
      'Plugin enable/disable is not available',
    )(request, this.context(request.metadata))
    this.emit('plugins.enabled_changed', result, request.metadata)
    return stripUndefined(result)
  }

  async installPlugin(request: RuntimePluginInstallRequest): Promise<unknown> {
    const result = await this.requirePluginMutation(
      'installPlugin',
      'Plugin install is not available',
    )(request, this.context(request.metadata))
    this.emit('plugins.installed', result, request.metadata)
    return stripUndefined(result)
  }

  async uninstallPlugin(
    request: RuntimePluginUninstallRequest,
  ): Promise<unknown> {
    const result = await this.requirePluginMutation(
      'uninstallPlugin',
      'Plugin uninstall is not available',
    )(request, this.context(request.metadata))
    this.emit('plugins.uninstalled', result, request.metadata)
    return stripUndefined(result)
  }

  async updatePlugin(request: RuntimePluginUpdateRequest): Promise<unknown> {
    const result = await this.requirePluginMutation(
      'updatePlugin',
      'Plugin update is not available',
    )(request, this.context(request.metadata))
    this.emit('plugins.updated', result, request.metadata)
    return stripUndefined(result)
  }

  private requirePluginMutation<TName extends keyof RuntimePluginCatalog>(
    name: TName,
    message: string,
  ): NonNullable<RuntimePluginCatalog[TName]> {
    const fn = this.pluginCatalog[name]
    if (typeof fn !== 'function') {
      throw new ExtensionCoreError('unavailable', message)
    }
    return fn as NonNullable<RuntimePluginCatalog[TName]>
  }

  private context(metadata?: Record<string, unknown>): {
    cwd: string
    metadata: Record<string, unknown>
  } {
    return {
      cwd: this.options.workspacePath ?? process.cwd(),
      metadata: {
        protocol: 'json-rpc-lite',
        ...metadata,
      },
    }
  }

  private emit(
    type: string,
    payload: unknown,
    metadata?: Record<string, unknown>,
  ): void {
    this.options.eventBus?.emit({
      type,
      replayable: true,
      payload: stripUndefined(payload),
      metadata: {
        protocol: 'json-rpc-lite',
        ...metadata,
      },
    })
  }
}

export class ExtensionCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ExtensionCoreError'
  }
}
