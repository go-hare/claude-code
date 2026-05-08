import { randomUUID } from 'crypto'

import type {
  RuntimeHookDescriptor,
  RuntimeHookMutationResult,
  RuntimeHookSource,
  RuntimeHookRunError,
  RuntimeHookRunRequest,
  RuntimeHookRunResult,
  RuntimeHookRegisterRequest,
  RuntimeHookType,
} from '../runtime/contracts/hook.js'
import type {
  RuntimePluginDescriptor,
  RuntimePluginErrorDescriptor,
  RuntimePluginInstallRequest,
  RuntimePluginMutationResult,
  RuntimePluginSetEnabledRequest,
  RuntimePluginUninstallRequest,
  RuntimePluginUpdateRequest,
} from '../runtime/contracts/plugin.js'
import type {
  RuntimeSkillContext,
  RuntimeSkillDescriptor,
  RuntimeSkillPromptContextRequest,
  RuntimeSkillPromptContextResult,
  RuntimeSkillSource,
} from '../runtime/contracts/skill.js'
import type { Command, LocalJSXCommandContext } from '../types/command.js'
import type { LoadedPlugin, PluginError } from '../types/plugin.js'
import type { AppState } from '../state/AppState.js'
import type { HookInput } from 'src/types/protocol/index.js'
import type { RuntimeRegisteredHookMatchers } from '../utils/hooks.js'
import {
  isAsyncHookJSONOutput,
  isSyncHookJSONOutput,
  type HookCallback,
} from '../types/hooks.js'
import { normalizeLegacyToolName } from '../utils/permissions/permissionRuleParser.js'
import { errorMessage } from '../utils/errors.js'
import {
  contentBlocksToText,
  createKernelRuntimeNonInteractiveToolUseContext,
} from './nonInteractiveToolUseContext.js'

type KernelRuntimeHookCatalogDeps = {
  getRegisteredHooks?(): RuntimeRegisteredHookMatchers | null | undefined
  loadPluginHookMatchers?(): Promise<RuntimeRegisteredHookMatchers>
}

export type RuntimeHookCatalog = {
  listHooks(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Promise<readonly RuntimeHookDescriptor[]>
  reload(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Promise<void>
  runHook(
    request: RuntimeHookRunRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<RuntimeHookRunResult>
  registerHook(
    request: RuntimeHookRegisterRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<RuntimeHookMutationResult>
}

export type RuntimeSkillCatalog = {
  listSkills(context?: {
    cwd?: string
  }): Promise<readonly RuntimeSkillDescriptor[]>
  reload(context?: { cwd?: string }): Promise<void>
  resolvePromptContext(
    request: RuntimeSkillPromptContextRequest,
    context?: { cwd?: string },
  ): Promise<RuntimeSkillPromptContextResult>
}

export type RuntimePluginCatalog = {
  listPlugins(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Promise<{
    plugins: readonly RuntimePluginDescriptor[]
    errors: readonly RuntimePluginErrorDescriptor[]
  }>
  reload(context?: {
    cwd?: string
    metadata?: Record<string, unknown>
  }): Promise<void>
  setPluginEnabled(
    request: RuntimePluginSetEnabledRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<RuntimePluginMutationResult>
  installPlugin(
    request: RuntimePluginInstallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<RuntimePluginMutationResult>
  uninstallPlugin(
    request: RuntimePluginUninstallRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<RuntimePluginMutationResult>
  updatePlugin(
    request: RuntimePluginUpdateRequest,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<RuntimePluginMutationResult>
}

export function createDefaultKernelRuntimeHookCatalog(
  _workspacePath: string | undefined,
  deps: KernelRuntimeHookCatalogDeps = {},
): RuntimeHookCatalog {
  let cachedStaticHooks: readonly RuntimeHookDescriptor[] | undefined
  let appStateCache: AppState | undefined
  const registeredHooks: Array<{
    request: RuntimeHookRegisterRequest
    executable: boolean
    callback?: HookCallback['callback']
  }> = []

  async function ensureAppState(): Promise<AppState> {
    if (!appStateCache) {
      const { getDefaultAppState } = await import('../state/AppStateStore.js')
      appStateCache = getDefaultAppState()
    }
    return appStateCache
  }

  function getRegisteredHookDescriptors(): readonly RuntimeHookDescriptor[] {
    return registeredHooks.map(({ request }) => ({
      ...request.hook,
      displayName:
        request.hook.displayName ?? request.handlerRef ?? request.hook.event,
    }))
  }

  function getBootstrapRegisteredHookDescriptors(): readonly RuntimeHookDescriptor[] {
    const descriptors: RuntimeHookDescriptor[] = []
    const registered = deps.getRegisteredHooks?.()
    if (!registered) {
      return descriptors
    }

    for (const [event, matchers] of Object.entries(registered)) {
      for (const matcher of matchers ?? []) {
        const source = 'pluginRoot' in matcher ? 'pluginHook' : 'builtinHook'
        const pluginName =
          'pluginName' in matcher ? matcher.pluginName : undefined
        for (const hook of matcher.hooks) {
          descriptors.push(
            toRuntimeHookDescriptor({
              event,
              config: hook as Record<string, unknown>,
              matcher: matcher.matcher,
              source,
              pluginName,
            }),
          )
        }
      }
    }

    return descriptors
  }

  async function listHooks(): Promise<readonly RuntimeHookDescriptor[]> {
    if (!cachedStaticHooks) {
      const [hooksModule, hooksSettings, { loadAllPluginsCacheOnly }] =
        await Promise.all([
          import('../utils/hooks.js'),
          import('../utils/hooks/hooksSettings.js'),
          import('../utils/plugins/pluginLoader.js'),
        ])
      const appState = await ensureAppState()
      const appStateHooks = hooksSettings.getAllHooks(appState).map(hook =>
        toRuntimeHookDescriptor({
          event: hook.event,
          config: hook.config,
          matcher: hook.matcher,
          source: hook.source,
          pluginName: hook.pluginName,
          displayName: hooksSettings.getHookDisplayText(hook.config),
        }),
      )
      const { enabled } = await loadAllPluginsCacheOnly()
      cachedStaticHooks = [
        ...appStateHooks,
        ...enabled.flatMap(plugin => toRuntimePluginHookDescriptors(plugin)),
      ]
      void hooksModule
    }
    return dedupeHookDescriptors([
      ...cachedStaticHooks,
      ...getBootstrapRegisteredHookDescriptors(),
      ...getRegisteredHookDescriptors(),
    ])
  }

  return {
    listHooks,
    async reload() {
      cachedStaticHooks = undefined
      await listHooks()
    },
    async runHook(
      request: RuntimeHookRunRequest,
    ): Promise<RuntimeHookRunResult> {
      const [
        { createBaseHookInput, executeHooksOutsideREPL },
        { isHookEvent },
      ] = await Promise.all([
        import('../utils/hooks.js'),
        import('../types/hooks.js'),
      ])
      const loadPluginHookMatchers =
        deps.loadPluginHookMatchers ??
        (await import('../utils/plugins/loadPluginHooks.js'))
          .loadPluginHookMatchers
      if (!isHookEvent(request.event)) {
        return {
          event: request.event,
          handled: false,
          errors: [
            {
              message: `Unknown hook event: ${request.event}`,
              code: 'unknown_event',
            },
          ],
          metadata: request.metadata,
        }
      }

      const hookInput = toRuntimeHookInput(
        request,
        createBaseHookInput(undefined),
      )
      const appState = await ensureAppState()
      const pluginHookLoadErrors: RuntimeHookRunError[] = []
      const extraRegisteredHooks = await loadPluginHookMatchers().catch(
        error => {
          pluginHookLoadErrors.push({
            message: `Failed to load plugin hooks: ${errorMessage(error)}`,
            code: 'plugin_load_failed',
          })
          return undefined
        },
      )
      const results = await executeHooksOutsideREPL({
        getAppState: () => appState,
        hookInput,
        timeoutMs: 10_000,
        extraRegisteredHooks,
      })
      const localCallbackResults = await runExecutableRegisteredHooks(
        request,
        hookInput,
        registeredHooks,
      )
      const unboundRegisteredHooks = getUnboundRegisteredHookMatches(
        request,
        hookInput,
        registeredHooks,
      )
      const allResults = [...results, ...localCallbackResults]
      const errors = [
        ...toRuntimeHookRunErrors(allResults),
        ...toUnboundRegisteredHookErrors(unboundRegisteredHooks),
        ...pluginHookLoadErrors,
      ]

      return {
        event: request.event,
        handled: allResults.length > 0 || unboundRegisteredHooks.length > 0,
        outputs:
          allResults.length > 0
            ? allResults.map(result =>
                stripUndefinedFields({
                  command: result.command,
                  succeeded: result.succeeded,
                  output: result.output,
                  blocked: result.blocked,
                  watchPaths:
                    'watchPaths' in result ? result.watchPaths : undefined,
                  systemMessage:
                    'systemMessage' in result
                      ? result.systemMessage
                      : undefined,
                }),
              )
            : undefined,
        errors: errors.length > 0 ? errors : undefined,
        metadata: request.metadata,
      }
    },
    async registerHook(
      request: RuntimeHookRegisterRequest,
    ): Promise<RuntimeHookMutationResult> {
      const callback = getExecutableCallbackFromMetadata(request)
      registeredHooks.push({
        request,
        executable: callback !== undefined && request.hook.type === 'callback',
        callback,
      })
      return {
        hook: {
          ...request.hook,
          displayName:
            request.hook.displayName ??
            request.handlerRef ??
            request.hook.event,
        },
        registered: true,
        handlerRef: request.handlerRef,
        metadata: request.metadata,
      }
    },
  }
}

export function createDefaultKernelRuntimeSkillCatalog(
  workspacePath: string | undefined,
): RuntimeSkillCatalog {
  let cachedCommands: readonly Command[] | undefined
  let cachedSkills: readonly RuntimeSkillDescriptor[] | undefined

  async function loadSkillCommands(context?: {
    cwd?: string
  }): Promise<readonly Command[]> {
    if (!cachedCommands) {
      const { getSkillToolCommands } = await import('../commands.js')
      const cwd = context?.cwd ?? workspacePath ?? process.cwd()
      cachedCommands = await getSkillToolCommands(cwd)
    }
    return cachedCommands
  }

  async function listSkills(context?: {
    cwd?: string
  }): Promise<readonly RuntimeSkillDescriptor[]> {
    if (!cachedSkills) {
      cachedSkills = (await loadSkillCommands(context))
        .map(toRuntimeSkillDescriptor)
        .filter((skill): skill is RuntimeSkillDescriptor => !!skill)
    }
    return cachedSkills
  }

  return {
    listSkills,
    async reload(context) {
      const { clearCommandMemoizationCaches } = await import('../commands.js')
      clearCommandMemoizationCaches()
      cachedCommands = undefined
      cachedSkills = undefined
      await listSkills(context)
    },
    async resolvePromptContext(
      request: RuntimeSkillPromptContextRequest,
      context,
    ): Promise<RuntimeSkillPromptContextResult> {
      const commands = await loadSkillCommands(context)
      const command = commands.find(
        candidate =>
          candidate.type === 'prompt' &&
          (candidate.name === request.name ||
            candidate.aliases?.includes(request.name)),
      )
      const descriptor =
        command && command.type === 'prompt'
          ? toRuntimeSkillDescriptor(command)
          : undefined
      const cwd = context?.cwd ?? workspacePath ?? process.cwd()
      const promptBlocks =
        command && command.type === 'prompt'
          ? await command.getPromptForCommand(
              request.args ?? '',
              await createKernelRuntimeNonInteractiveToolUseContext(
                commands,
                cwd,
              ),
            )
          : undefined
      return {
        name: request.name,
        descriptor,
        context: descriptor?.context ?? 'unknown',
        content: promptBlocks ? contentBlocksToText(promptBlocks) : undefined,
        messages: promptBlocks,
        allowedTools: descriptor?.allowedTools,
        metadata: request.metadata,
      }
    },
  }
}

export function createDefaultKernelRuntimePluginCatalog(
  _workspacePath: string | undefined,
): RuntimePluginCatalog {
  let cached:
    | {
        plugins: readonly RuntimePluginDescriptor[]
        errors: readonly RuntimePluginErrorDescriptor[]
      }
    | undefined

  async function listPlugins(): Promise<{
    plugins: readonly RuntimePluginDescriptor[]
    errors: readonly RuntimePluginErrorDescriptor[]
  }> {
    if (!cached) {
      const { loadAllPluginsCacheOnly } = await import(
        '../utils/plugins/pluginLoader.js'
      )
      const { enabled, disabled, errors } = await loadAllPluginsCacheOnly()
      cached = {
        plugins: [
          ...enabled.map(plugin => toRuntimePluginDescriptor(plugin, true)),
          ...disabled.map(plugin => toRuntimePluginDescriptor(plugin, false)),
        ],
        errors: errors.map(toRuntimePluginErrorDescriptor),
      }
    }
    return cached
  }

  return {
    listPlugins,
    async reload() {
      const { clearPluginCache } = await import(
        '../utils/plugins/pluginLoader.js'
      )
      clearPluginCache()
      cached = undefined
      await listPlugins()
    },
    async setPluginEnabled(
      request: RuntimePluginSetEnabledRequest,
    ): Promise<RuntimePluginMutationResult> {
      const { setPluginEnabledOp } = await import(
        '../services/plugins/pluginOperations.js'
      )
      const result = await setPluginEnabledOp(
        request.name,
        request.enabled,
        request.scope,
      )
      cached = undefined
      const snapshot = await listPlugins()
      const plugin = snapshot.plugins.find(candidate =>
        matchesPluginRequest(candidate, request.name),
      )
      const enabled = plugin?.enabled ?? request.enabled
      return {
        name: result.pluginName ?? plugin?.name ?? request.name,
        action: 'set_enabled',
        success: result.success,
        enabled,
        status: enabled ? 'enabled' : 'disabled',
        plugin,
        snapshot,
        message: result.message,
        metadata: request.metadata,
      }
    },
    async installPlugin(
      request: RuntimePluginInstallRequest,
    ): Promise<RuntimePluginMutationResult> {
      const { installPluginOp } = await import(
        '../services/plugins/pluginOperations.js'
      )
      const result = await installPluginOp(
        request.name,
        request.scope ?? 'user',
      )
      return toPluginMutationResult({
        action: 'install',
        requestName: request.name,
        requestEnabled: true,
        metadata: request.metadata,
        operation: result,
        snapshot: await reloadAndListPlugins(),
      })
    },
    async uninstallPlugin(
      request: RuntimePluginUninstallRequest,
    ): Promise<RuntimePluginMutationResult> {
      const { uninstallPluginOp } = await import(
        '../services/plugins/pluginOperations.js'
      )
      const result = await uninstallPluginOp(
        request.name,
        request.scope ?? 'user',
        !request.keepData,
      )
      return toPluginMutationResult({
        action: 'uninstall',
        requestName: request.name,
        requestEnabled: false,
        metadata: request.metadata,
        operation: result,
        snapshot: await reloadAndListPlugins(),
      })
    },
    async updatePlugin(
      request: RuntimePluginUpdateRequest,
    ): Promise<RuntimePluginMutationResult> {
      const { updatePluginOp } = await import(
        '../services/plugins/pluginOperations.js'
      )
      const result = await updatePluginOp(request.name, request.scope ?? 'user')
      return toPluginMutationResult({
        action: 'update',
        requestName: request.name,
        requestEnabled: true,
        metadata: request.metadata,
        operation: result,
        snapshot: await reloadAndListPlugins(),
      })
    },
  }

  async function reloadAndListPlugins(): Promise<{
    plugins: readonly RuntimePluginDescriptor[]
    errors: readonly RuntimePluginErrorDescriptor[]
  }> {
    cached = undefined
    return listPlugins()
  }
}

function toRuntimePluginHookDescriptors(
  plugin: LoadedPlugin,
): RuntimeHookDescriptor[] {
  const hooksConfig = plugin.hooksConfig
  if (!hooksConfig) {
    return []
  }

  const descriptors: RuntimeHookDescriptor[] = []
  for (const [event, matchers] of Object.entries(hooksConfig)) {
    for (const matcher of matchers ?? []) {
      for (const hook of matcher.hooks) {
        descriptors.push(
          toRuntimeHookDescriptor({
            event,
            config: hook,
            matcher: matcher.matcher,
            source: 'pluginHook',
            pluginName: plugin.name,
          }),
        )
      }
    }
  }
  return descriptors
}

function dedupeHookDescriptors(
  hooks: readonly RuntimeHookDescriptor[],
): readonly RuntimeHookDescriptor[] {
  const seen = new Set<string>()
  const deduped: RuntimeHookDescriptor[] = []

  for (const hook of hooks) {
    const key = [
      hook.event,
      hook.type,
      hook.source,
      hook.matcher ?? '',
      hook.pluginName ?? '',
      hook.displayName ?? '',
      hook.timeoutSeconds ?? '',
      hook.async ?? '',
      hook.once ?? '',
    ].join('\u0000')

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(hook)
  }

  return deduped
}

function toRuntimeHookDescriptor(input: {
  event: string
  config: Record<string, unknown>
  matcher?: string
  source: string
  pluginName?: string
  displayName?: string
}): RuntimeHookDescriptor {
  return {
    event: input.event,
    type: toRuntimeHookType(input.config.type),
    source: toRuntimeHookSource(input.source),
    matcher: input.matcher,
    pluginName: input.pluginName,
    displayName: input.displayName ?? getHookLabel(input.config),
    timeoutSeconds: numberOrUndefined(input.config.timeout),
    async: booleanOrUndefined(input.config.async),
    once: booleanOrUndefined(input.config.once),
  }
}

function toRuntimeHookRunErrors(
  results: ReadonlyArray<{
    succeeded: boolean
    blocked: boolean
    output: string
  }>,
): RuntimeHookRunError[] {
  return results
    .filter(result => !result.succeeded || result.blocked)
    .map(result => ({
      message:
        result.output ||
        (result.blocked
          ? 'Hook blocked continuation'
          : 'Hook execution failed'),
      code: result.blocked ? 'blocked' : 'execution_failed',
    }))
}

function getUnboundRegisteredHookMatches(
  request: RuntimeHookRunRequest,
  hookInput: HookInput,
  entries: ReadonlyArray<{
    request: RuntimeHookRegisterRequest
    executable: boolean
    callback?: HookCallback['callback']
  }>,
): RuntimeHookDescriptor[] {
  const matchQuery = getRuntimeHookMatchQuery(request, hookInput)

  return entries
    .filter(entry => !entry.executable)
    .map(entry => entry.request)
    .filter(
      registered =>
        registered.hook.event === request.event &&
        matchesRuntimeHookMatcher(matchQuery, registered.hook.matcher),
    )
    .map(registered => ({
      ...registered.hook,
      displayName:
        registered.hook.displayName ??
        registered.handlerRef ??
        registered.hook.event,
    }))
}

async function runExecutableRegisteredHooks(
  request: RuntimeHookRunRequest,
  hookInput: HookInput,
  entries: ReadonlyArray<{
    request: RuntimeHookRegisterRequest
    executable: boolean
    callback?: HookCallback['callback']
  }>,
): Promise<
  Array<{
    command: string
    succeeded: boolean
    output: string
    blocked: boolean
  }>
> {
  const matchQuery = getRuntimeHookMatchQuery(request, hookInput)
  const matchingCallbacks = entries.filter(
    entry =>
      entry.executable &&
      entry.request.hook.type === 'callback' &&
      entry.callback !== undefined &&
      entry.request.hook.event === request.event &&
      matchesRuntimeHookMatcher(matchQuery, entry.request.hook.matcher),
  )

  return Promise.all(
    matchingCallbacks.map(async entry => {
      const timeoutMs = (entry.request.hook.timeoutSeconds ?? 10) * 1000
      const controller = AbortSignal.timeout(timeoutMs)
      try {
        const output = await entry.callback!(
          hookInput,
          randomUUID(),
          controller,
        )
        if (isAsyncHookJSONOutput(output)) {
          return {
            command: 'callback',
            succeeded: true,
            output: '',
            blocked: false,
            watchPaths: undefined,
            systemMessage: undefined,
          }
        }
        const outputRecord = toRecord(output)
        const blocked =
          isSyncHookJSONOutput(output) && outputRecord?.decision === 'block'
        return {
          command: 'callback',
          succeeded: true,
          output:
            typeof outputRecord?.systemMessage === 'string'
              ? outputRecord.systemMessage
              : '',
          blocked,
          watchPaths: undefined,
          systemMessage:
            typeof outputRecord?.systemMessage === 'string'
              ? outputRecord.systemMessage
              : undefined,
        }
      } catch (error) {
        return {
          command: 'callback',
          succeeded: false,
          output: error instanceof Error ? error.message : String(error),
          blocked: false,
          watchPaths: undefined,
          systemMessage: undefined,
        }
      }
    }),
  )
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function toUnboundRegisteredHookErrors(
  hooks: readonly RuntimeHookDescriptor[],
): RuntimeHookRunError[] {
  return hooks.map(hook => ({
    message:
      `Hook "${hook.displayName ?? hook.event}" is registered in the default kernel runtime ` +
      'catalog, but no executable handler is bound to it.',
    hook,
    code: 'unbound_handler',
  }))
}

function toRuntimeHookInput(
  request: RuntimeHookRunRequest,
  baseInput: Record<string, unknown>,
): HookInput {
  const inputObject =
    request.input && typeof request.input === 'object'
      ? { ...(request.input as Record<string, unknown>) }
      : request.input === undefined
        ? {}
        : { input: request.input }

  const hookInput = {
    ...baseInput,
    ...inputObject,
    hook_event_name: request.event,
  } as Record<string, unknown>

  switch (request.event) {
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'PermissionRequest':
    case 'PermissionDenied':
      hookInput.tool_name ??= request.matcher ?? 'runtime_hook'
      break
    case 'Notification':
      hookInput.notification_type ??= request.matcher ?? 'runtime_hook'
      break
    case 'SessionStart':
      hookInput.source ??= request.matcher ?? 'kernel-runtime'
      break
    case 'SessionEnd':
      hookInput.reason ??= request.matcher ?? 'kernel-runtime'
      break
    case 'Setup':
    case 'PreCompact':
    case 'PostCompact':
      hookInput.trigger ??= request.matcher ?? 'kernel-runtime'
      break
    case 'SubagentStart':
      hookInput.agent_type ??= request.matcher ?? 'kernel-runtime'
      break
    case 'TaskCreated':
    case 'TaskCompleted':
      hookInput.task_id ??= request.matcher ?? 'runtime-task'
      break
  }

  return hookInput as HookInput
}

function getRuntimeHookMatchQuery(
  request: RuntimeHookRunRequest,
  hookInput: HookInput,
): string | undefined {
  switch (request.event) {
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'PermissionRequest':
    case 'PermissionDenied':
      return stringOrUndefined(hookInput.tool_name) ?? request.matcher
    case 'SessionStart':
      return stringOrUndefined(hookInput.source) ?? request.matcher
    case 'Setup':
    case 'PreCompact':
    case 'PostCompact':
      return stringOrUndefined(hookInput.trigger) ?? request.matcher
    case 'Notification':
      return stringOrUndefined(hookInput.notification_type) ?? request.matcher
    case 'SessionEnd':
      return stringOrUndefined(hookInput.reason) ?? request.matcher
    case 'StopFailure':
      return stringOrUndefined(hookInput.error) ?? request.matcher
    case 'SubagentStart':
    case 'SubagentStop':
      return stringOrUndefined(hookInput.agent_type) ?? request.matcher
    case 'Elicitation':
    case 'ElicitationResult':
      return stringOrUndefined(hookInput.mcp_server_name) ?? request.matcher
    case 'ConfigChange':
      return stringOrUndefined(hookInput.source) ?? request.matcher
    case 'InstructionsLoaded':
      return stringOrUndefined(hookInput.load_reason) ?? request.matcher
    case 'FileChanged':
      return stringOrUndefined(hookInput.file_path) ?? request.matcher
    default:
      return request.matcher
  }
}

function matchesRuntimeHookMatcher(
  matchQuery: string | undefined,
  matcher: string | undefined,
): boolean {
  if (!matchQuery || !matcher || matcher === '*') {
    return true
  }

  if (/^[a-zA-Z0-9_|-]+$/.test(matcher)) {
    if (matcher.includes('|')) {
      const patterns = matcher
        .split('|')
        .map(pattern => normalizeLegacyToolName(pattern.trim()))
      return patterns.includes(normalizeLegacyToolName(matchQuery))
    }

    return (
      normalizeLegacyToolName(matchQuery) === normalizeLegacyToolName(matcher)
    )
  }

  try {
    return new RegExp(matcher).test(matchQuery)
  } catch {
    return false
  }
}

function getExecutableCallbackFromMetadata(
  request: RuntimeHookRegisterRequest,
): HookCallback['callback'] | undefined {
  const metadata = request.metadata
  if (!metadata || typeof metadata !== 'object') {
    return undefined
  }

  const candidate = (metadata as Record<string, unknown>).callback
  return typeof candidate === 'function'
    ? (candidate as HookCallback['callback'])
    : undefined
}

function toRuntimeSkillDescriptor(
  command: Command,
): RuntimeSkillDescriptor | undefined {
  if (command.type !== 'prompt') {
    return undefined
  }
  return {
    name: command.name,
    description: command.description,
    source: toRuntimeSkillSource(command.source),
    loadedFrom: command.loadedFrom,
    aliases: command.aliases,
    whenToUse: command.whenToUse,
    version: command.version,
    userInvocable: command.userInvocable,
    modelInvocable: !command.disableModelInvocation,
    context: toRuntimeSkillContext(command.context),
    agent: command.agent,
    allowedTools: command.allowedTools,
    paths: command.paths,
    contentLength: command.contentLength,
    plugin: command.pluginInfo
      ? {
          name: command.pluginInfo.pluginManifest.name,
          repository: command.pluginInfo.repository,
        }
      : undefined,
  }
}

function toRuntimePluginDescriptor(
  plugin: LoadedPlugin,
  enabled: boolean,
): RuntimePluginDescriptor {
  return {
    name: plugin.name,
    source: plugin.source,
    path: plugin.path,
    repository: plugin.repository,
    status: enabled ? 'enabled' : 'disabled',
    enabled,
    builtin: plugin.isBuiltin,
    version: stringOrUndefined(plugin.manifest.version),
    sha: plugin.sha,
    description: stringOrUndefined(plugin.manifest.description),
    components: {
      commands: hasPathComponent(plugin.commandsPath, plugin.commandsPaths),
      agents: hasPathComponent(plugin.agentsPath, plugin.agentsPaths),
      skills: hasPathComponent(plugin.skillsPath, plugin.skillsPaths),
      hooks: hasHookComponent(plugin),
      mcp: hasRecordComponent(plugin.mcpServers),
      lsp: hasRecordComponent(plugin.lspServers),
      outputStyles: hasPathComponent(
        plugin.outputStylesPath,
        plugin.outputStylesPaths,
      ),
      settings: hasRecordComponent(plugin.settings),
    },
  }
}

function toRuntimePluginErrorDescriptor(
  error: PluginError,
): RuntimePluginErrorDescriptor {
  const record = error as Record<string, unknown>
  return {
    type: error.type,
    source: error.source,
    plugin:
      stringOrUndefined(record.plugin) ?? stringOrUndefined(record.pluginId),
    message:
      stringOrUndefined(record.error) ??
      stringOrUndefined(record.reason) ??
      stringOrUndefined(record.validationError) ??
      stringOrUndefined(record.parseError) ??
      stringOrUndefined(record.details),
  }
}

function matchesPluginRequest(
  plugin: RuntimePluginDescriptor,
  requestName: string,
): boolean {
  return (
    plugin.name === requestName ||
    plugin.repository === requestName ||
    plugin.source === requestName
  )
}

function toPluginMutationResult(input: {
  action: 'install' | 'uninstall' | 'update'
  requestName: string
  requestEnabled: boolean
  metadata?: Record<string, unknown>
  operation: {
    success: boolean
    message: string
    pluginId?: string
    pluginName?: string
    oldVersion?: string
    newVersion?: string
    alreadyUpToDate?: boolean
  }
  snapshot: {
    plugins: readonly RuntimePluginDescriptor[]
    errors: readonly RuntimePluginErrorDescriptor[]
  }
}): RuntimePluginMutationResult {
  const plugin = input.snapshot.plugins.find(candidate =>
    matchesPluginRequest(
      candidate,
      input.operation.pluginId ??
        input.operation.pluginName ??
        input.requestName,
    ),
  )
  const enabled = plugin?.enabled ?? input.requestEnabled
  return {
    name: input.operation.pluginName ?? plugin?.name ?? input.requestName,
    action: input.action,
    success: input.operation.success,
    enabled,
    status: enabled ? 'enabled' : 'disabled',
    plugin,
    snapshot: input.snapshot,
    message: input.operation.message,
    oldVersion: input.operation.oldVersion,
    newVersion: input.operation.newVersion,
    alreadyUpToDate: input.operation.alreadyUpToDate,
    metadata: input.metadata,
  }
}

function toRuntimeHookType(value: unknown): RuntimeHookType {
  switch (value) {
    case 'command':
    case 'prompt':
    case 'agent':
    case 'http':
    case 'callback':
    case 'function':
      return value
    default:
      return 'unknown'
  }
}

function toRuntimeHookSource(value: string): RuntimeHookSource {
  switch (value) {
    case 'userSettings':
    case 'projectSettings':
    case 'localSettings':
    case 'policySettings':
    case 'pluginHook':
    case 'sessionHook':
    case 'builtinHook':
      return value
    default:
      return 'unknown'
  }
}

function toRuntimeSkillSource(value: string): RuntimeSkillSource {
  switch (value) {
    case 'userSettings':
    case 'projectSettings':
    case 'localSettings':
    case 'policySettings':
    case 'builtin':
    case 'bundled':
    case 'plugin':
    case 'mcp':
    case 'managed':
      return value
    default:
      return 'unknown'
  }
}

function toRuntimeSkillContext(
  value: Command extends { context?: infer T } ? T : unknown,
): RuntimeSkillContext | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === 'inline' || value === 'fork') {
    return value
  }
  return 'unknown'
}

function getHookLabel(config: Record<string, unknown>): string | undefined {
  return (
    stringOrUndefined(config.statusMessage) ??
    stringOrUndefined(config.command) ??
    stringOrUndefined(config.prompt) ??
    stringOrUndefined(config.url)
  )
}

function hasPathComponent(
  path: unknown,
  paths: readonly unknown[] | undefined,
) {
  return typeof path === 'string' || !!paths?.length
}

function hasRecordComponent(value: unknown): boolean {
  return !!value && typeof value === 'object' && Object.keys(value).length > 0
}

function hasHookComponent(plugin: LoadedPlugin): boolean {
  const hooks = plugin.hooksConfig
  return (
    !!hooks &&
    Object.values(hooks).some(matchers =>
      (matchers ?? []).some(matcher => matcher.hooks.length > 0),
    )
  )
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function stripUndefinedFields<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T
}
