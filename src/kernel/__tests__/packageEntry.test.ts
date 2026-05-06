import { describe, expect, test } from 'bun:test'
import { readFile, stat } from 'fs/promises'
import { join } from 'path'

import * as kernel from '../index.js'
import * as runtimeEvents from '../runtimeEvents.js'
import {
  EXPECTED_KERNEL_PUBLIC_EXPORTS,
  KERNEL_CAPABILITY_API_EXPORTS,
  KERNEL_RUNTIME_EVENT_TAXONOMY_EXPORTS,
} from './publicSurfaceManifest.js'

const repoRoot = join(import.meta.dir, '../../..')

const packageEntry = await import('../../entrypoints/kernel.js')
const packageJson = JSON.parse(
  await readFile(join(repoRoot, 'package.json'), 'utf8'),
) as {
  exports?: Record<
    string,
    {
      types?: string
      import?: string
      default?: string
    }
  >
  bin?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

describe('kernel package entry', () => {
  test('declares the package-level ./kernel export', () => {
    expect(packageJson.exports).toBeDefined()
    expect(packageJson.exports?.['./kernel']).toBeDefined()
  })

  test('keeps package exports limited to the frozen public entrypoints', () => {
    expect(Object.keys(packageJson.exports ?? {}).sort()).toEqual([
      './kernel',
      './package.json',
    ])
  })

  test('does not ship or depend on the removed Agent SDK surface', async () => {
    expect(packageJson.dependencies).not.toHaveProperty(
      '@anthropic-ai/claude-agent-sdk',
    )
    expect(packageJson.devDependencies).not.toHaveProperty(
      '@anthropic-ai/claude-agent-sdk',
    )
    expect(
      await pathExists(join(repoRoot, 'src/entrypoints/agentSdkTypes.ts')),
    ).toBe(false)
    expect(await pathExists(join(repoRoot, 'src/entrypoints/sdk'))).toBe(false)
  })

  test('publishes a standalone declaration file for the ./kernel surface', async () => {
    const kernelExport = packageJson.exports?.['./kernel']
    expect(kernelExport?.types).toBe('./src/kernel/index.d.ts')

    const declaration = await readFile(
      join(repoRoot, kernelExport!.types!),
      'utf8',
    )

    expect(declaration).toContain('export type KernelHeadlessEnvironment = {')
    expect(declaration).toContain('export type KernelHeadlessController = {')
    expect(declaration).toContain('createKernelHeadlessController(')
    expect(declaration).toContain('createKernelHeadlessInputQueue(')
    expect(declaration).toContain('createKernelHeadlessProviderEnv(')
    expect(declaration).toContain('normalizeKernelHeadlessEvent(')
    expect(declaration).toContain('runKernelHeadlessLaunch(')
    expect(declaration).toContain('export type KernelHeadlessRunOptions = {')
    expect(declaration).toContain('continue: boolean | undefined')
    expect(declaration).toContain('resume: string | boolean | undefined')
    expect(declaration).toContain('resumeSessionAt: string | undefined')
    expect(declaration).toContain('verbose: boolean | undefined')
    expect(declaration).toContain('outputFormat: string | undefined')
    expect(declaration).toContain('replayUserMessages: boolean | undefined')
    expect(declaration).toContain('includePartialMessages: boolean | undefined')
    expect(declaration).toContain('rewindFiles: string | undefined')
    expect(declaration).toContain('export type KernelHeadlessLaunchRunOptions = Partial<')
    expect(declaration).toContain('runtimeEventSink?: KernelRuntimeEventSink')
    expect(declaration).toContain("schemaVersion: 'kernel.runtime.v1'")
    expect(declaration).toContain('KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION:')
    expect(declaration).toContain('runKernelRuntimeWireProtocol(')
    expect(declaration).toContain("KernelRuntimeCommandBase<'connect_host'>")
    expect(declaration).toContain('resumeSessionAt?: string')
    expect(declaration).toContain(
      "KernelRuntimeCommandBase<'decide_permission'>",
    )
    expect(declaration).toContain('decidePermission(')
    expect(declaration).toContain('requestPermission(')
    expect(declaration).toContain(
      'permissionBroker?: KernelRuntimeWirePermissionBroker',
    )
    expect(declaration).toContain('eventJournalPath?: string | false')
    expect(declaration).toContain('conversationJournalPath?: string | false')
    expect(declaration).toContain('export type RuntimeProviderSelection = {')
    expect(declaration).toContain('provider?: RuntimeProviderSelection')
    expect(declaration).toContain('defaultProvider?: RuntimeProviderSelection')
    expect(declaration).toContain('providerOverride?: RuntimeProviderSelection')
    expect(declaration).toContain('providerSelection?: RuntimeProviderSelection')
    expect(declaration).toContain('onEvent(handler: (event: KernelRuntimePermissionEvent) => void)')
    expect(declaration).toContain('onEvent(handler: (event: KernelRuntimeCommandEvent) => void)')
    expect(declaration).toContain('onEvent(handler: (event: KernelRuntimeToolEvent) => void)')
    expect(declaration).toContain('onEvent(handler: (event: KernelRuntimeHookEvent) => void)')
    expect(declaration).toContain('onEvent(handler: (event: KernelRuntimeMcpEvent) => void)')
    expect(declaration).toContain('onEvent(handler: (event: KernelRuntimeSkillEvent) => void)')
    expect(declaration).toContain('onEvent(handler: (event: KernelRuntimePluginEvent) => void)')
    expect(declaration).toContain('getKernelRuntimeLifecycleProjection(')
    expect(declaration).not.toContain('KernelLegacyProtocolMessage')
    expect(declaration).not.toContain('getProtocolMessageFromRuntimeEnvelope(')
    expect(declaration).not.toContain('projectRuntimeEnvelopeToLegacyProtocolMessage(')
    expect(declaration).not.toContain('projectRuntimeEnvelopeToLegacyStreamJsonMessages(')
    expect(declaration).not.toContain('projectProtocolMessageToLegacyStreamJsonMessages(')
    expect(declaration).not.toContain('emitKernelHeadlessRuntimeMessage(')
    expect(declaration).not.toContain('handleKernelRuntimeHostEvent(')
    expect(declaration).not.toContain("'headless.protocol_message'")
    expect(declaration).toContain(
      'capabilityResolver?: KernelRuntimeWireCapabilityResolver',
    )
    expect(declaration).toContain('mcpRegistry?: KernelRuntimeWireMcpRegistry')
    expect(declaration).toContain('export type KernelRuntimeEventFacade = {')
    expect(declaration).toContain('createKernelRuntimeEventFacade(')
    expect(declaration).toContain('export type KernelRuntimeEventMessage = {')
    expect(declaration).toContain('getKernelRuntimeEnvelopeFromMessage(')
    expect(declaration).toContain('toKernelRuntimeEventMessage(')
    expect(declaration).toContain('consumeKernelRuntimeEventMessage(')
    expect(declaration).toContain('getKernelEventFromEnvelope(')
    expect(declaration).toContain('export type KernelRuntimeEventCategory =')
    expect(declaration).toContain('export type KernelRuntimeEventScope =')
    expect(declaration).toContain(
      'export type KernelRuntimeEventTaxonomyEntry =',
    )
    expect(declaration).toContain('export type KernelRuntimeEventType =')
    expect(declaration).toContain(
      'export declare const KERNEL_RUNTIME_EVENT_TAXONOMY:',
    )
    expect(declaration).toContain(
      'export declare const KERNEL_RUNTIME_EVENT_TYPES:',
    )
    expect(declaration).toContain(
      'export type KnownKernelRuntimeEventEnvelope<',
    )
    expect(declaration).toContain("'turn.output_delta'")
    expect(declaration).toContain("'turn.completed'")
    expect(declaration).toContain("'turn.failed'")
    expect(declaration).toContain('isKnownKernelRuntimeEventType(')
    expect(declaration).toContain('getKernelRuntimeEventType(')
    expect(declaration).toContain('getKernelRuntimeEventCategory(')
    expect(declaration).toContain('getKernelRuntimeEventTaxonomyEntry(')
    expect(declaration).toContain('collectKernelRuntimeEventEnvelopes(')
    expect(declaration).toContain('isKernelRuntimeEventEnvelope(')
    expect(declaration).toContain('isKernelRuntimeEventOfType<')
    expect(declaration).toContain('isKernelTurnTerminalEvent(')
    expect(declaration).toContain('isKernelCommandsExecutedEvent(')
    expect(declaration).toContain('isKernelHooksReloadedEvent(')
    expect(declaration).toContain('isKernelHooksRanEvent(')
    expect(declaration).toContain('isKernelHooksRegisteredEvent(')
    expect(declaration).toContain('isKernelToolsCalledEvent(')
    expect(declaration).toContain('isKernelMcpReloadedEvent(')
    expect(declaration).toContain('isKernelMcpConnectedEvent(')
    expect(declaration).toContain('isKernelMcpAuthenticatedEvent(')
    expect(declaration).toContain('isKernelMcpEnabledChangedEvent(')
    expect(declaration).toContain('isKernelSkillsReloadedEvent(')
    expect(declaration).toContain('isKernelSkillsContextResolvedEvent(')
    expect(declaration).toContain('isKernelPluginsReloadedEvent(')
    expect(declaration).toContain('isKernelPluginsEnabledChangedEvent(')
    expect(declaration).toContain('isKernelPluginsInstalledEvent(')
    expect(declaration).toContain('isKernelPluginsUninstalledEvent(')
    expect(declaration).toContain('isKernelPluginsUpdatedEvent(')
    expect(declaration).toContain('isKernelAgentsSpawnedEvent(')
    expect(declaration).toContain('isKernelAgentsRunCancelledEvent(')
    expect(declaration).toContain('isKernelTasksCreatedEvent(')
    expect(declaration).toContain('isKernelTasksUpdatedEvent(')
    expect(declaration).toContain('isKernelTasksAssignedEvent(')
    expect(declaration).toContain('isKernelTasksNotificationEvent(')
    expect(declaration).toContain('isKernelCoordinatorLifecycleEvent(')
    expect(declaration).toContain('getKernelMcpSnapshot(')
    expect(declaration).toContain('getKernelMcpLifecycleResult(')
    expect(declaration).toContain('getKernelPluginSnapshot(')
    expect(declaration).toContain('getKernelPluginMutationResult(')
    expect(declaration).toContain('getKernelCommandExecutionResult(')
    expect(declaration).toContain('getKernelToolCallResult(')
    expect(declaration).toContain('getKernelSkillSnapshot(')
    expect(declaration).toContain('getKernelSkillPromptContextResult(')
    expect(declaration).toContain('getKernelAgentSpawnResult(')
    expect(declaration).toContain('getKernelAgentRunCancelResult(')
    expect(declaration).toContain('getKernelTaskMutationResult(')
    expect(declaration).toContain('getKernelHookRegistrySnapshot(')
    expect(declaration).toContain('getKernelHookRunResult(')
    expect(declaration).toContain('getKernelHookMutationResult(')
    expect(declaration).toContain('export type KernelPermissionRequest = {')
    expect(declaration).toContain('export type KernelPermissionBroker = {')
    expect(declaration).toContain('createKernelPermissionBroker(')
    expect(declaration).toContain('export type KernelRuntime = {')
    expect(declaration).toContain(
      'export type KernelRuntimeHostEventPublishOptions =',
    )
    expect(declaration).toContain(
      'export type KernelRuntimeHostEventPublishResult =',
    )
    expect(declaration).toContain('createKernelRuntime(')
    expect(declaration).toContain('publishHostEvent(')
    expect(declaration).toContain('export type KernelCompanionRuntime = {')
    expect(declaration).toContain('createKernelCompanionRuntime(')
    expect(declaration).toContain('export type KernelKairosRuntime = {')
    expect(declaration).toContain('createKernelKairosRuntime(')
    expect(declaration).toContain('export type KernelMemoryManager = {')
    expect(declaration).toContain('createKernelMemoryManager(')
    expect(declaration).toContain('export type KernelContextManager = {')
    expect(declaration).toContain('createKernelContextManager(')
    expect(declaration).toContain('export type KernelSessionManager = {')
    expect(declaration).toContain('createKernelSessionManager(')
    expect(declaration).toContain(
      'export declare class KernelRuntimeRequestError extends Error',
    )
    expect(declaration).toContain(
      'export declare class KernelPermissionDecisionError extends Error',
    )
    expect(declaration).toContain('export type KernelRuntimeWireTransport = {')
    expect(declaration).toContain('export type KernelRuntimeTransportConfig =')
    expect(declaration).toContain(
      'transportConfig?: KernelRuntimeTransportConfig',
    )
    expect(declaration).toContain('export type KernelCapabilityName = string')
    expect(declaration).toContain('export type KernelCapabilityFamily =')
    expect(declaration).toContain('export type KernelCapabilityStatus =')
    expect(declaration).toContain('export type KernelCapabilityError = {')
    expect(declaration).toContain('export type KernelCapabilityFilter = {')
    expect(declaration).toContain(
      'export type KernelCapabilityView = KernelCapabilityDescriptor & {',
    )
    expect(declaration).toContain(
      'export type KernelCapabilityGroups = Record<',
    )
    expect(declaration).toContain(
      'export declare const KERNEL_CAPABILITY_FAMILIES:',
    )
    expect(declaration).toContain('family: KernelCapabilityFamily')
    expect(declaration).toContain('status: KernelCapabilityStatus')
    expect(declaration).toContain('filterKernelCapabilities(')
    expect(declaration).toContain('getKernelCapabilityFamily(')
    expect(declaration).toContain('groupKernelCapabilities(')
    expect(declaration).toContain('isKernelCapabilityReady(')
    expect(declaration).toContain('isKernelCapabilityUnavailable(')
    expect(declaration).toContain('reloadKernelRuntimeCapabilities(')
    expect(declaration).toContain('resolveKernelRuntimeCapabilities(')
    expect(declaration).toContain('toKernelCapabilityView(')
    expect(declaration).toContain('toKernelCapabilityViews(')
    expect(declaration).toContain('export type KernelCommandDescriptor =')
    expect(declaration).toContain('export type KernelCommandEntry = {')
    expect(declaration).toContain('export type KernelCommandFilter = {')
    expect(declaration).toContain('export type KernelToolDescriptor = {')
    expect(declaration).toContain('export type KernelToolFilter = {')
    expect(declaration).toContain('export type KernelRuntimeCommands = {')
    expect(declaration).toContain('export type KernelRuntimeTools = {')
    expect(declaration).toContain('export type KernelRuntimeMcp = {')
    expect(declaration).toContain('export type KernelRuntimeHooks = {')
    expect(declaration).toContain('export type KernelRuntimeSkills = {')
    expect(declaration).toContain('export type KernelRuntimePlugins = {')
    expect(declaration).toContain('export type KernelRuntimeAgents = {')
    expect(declaration).toContain('export type KernelRuntimeTasks = {')
    expect(declaration).toContain("'list_commands'")
    expect(declaration).toContain("'list_tools'")
    expect(declaration).toContain("'list_mcp_servers'")
    expect(declaration).toContain("'reload_mcp'")
    expect(declaration).toContain("'connect_mcp'")
    expect(declaration).toContain("'authenticate_mcp'")
    expect(declaration).toContain('callbackUrl?: string')
    expect(declaration).toContain("'set_mcp_enabled'")
    expect(declaration).toContain("'list_hooks'")
    expect(declaration).toContain("'reload_hooks'")
    expect(declaration).toContain("'run_hook'")
    expect(declaration).toContain("'register_hook'")
    expect(declaration).toContain("'list_skills'")
    expect(declaration).toContain("'reload_skills'")
    expect(declaration).toContain("'resolve_skill_context'")
    expect(declaration).toContain("'list_plugins'")
    expect(declaration).toContain("'reload_plugins'")
    expect(declaration).toContain("'set_plugin_enabled'")
    expect(declaration).toContain("'install_plugin'")
    expect(declaration).toContain("'uninstall_plugin'")
    expect(declaration).toContain("'update_plugin'")
    expect(declaration).toContain("'list_agents'")
    expect(declaration).toContain("'reload_agents'")
    expect(declaration).toContain("'spawn_agent'")
    expect(declaration).toContain("'list_agent_runs'")
    expect(declaration).toContain("'get_agent_run'")
    expect(declaration).toContain("'get_agent_output'")
    expect(declaration).toContain("'cancel_agent_run'")
    expect(declaration).toContain("'list_tasks'")
    expect(declaration).toContain("'get_task'")
    expect(declaration).toContain("'create_task'")
    expect(declaration).toContain("'update_task'")
    expect(declaration).toContain("'assign_task'")
    expect(declaration).toContain('listCommands(')
    expect(declaration).toContain('executeCommand(')
    expect(declaration).toContain('listTools(')
    expect(declaration).toContain('callTool(')
    expect(declaration).toContain('listMcpServers(')
    expect(declaration).toContain('reloadMcp(')
    expect(declaration).toContain('connectMcp(')
    expect(declaration).toContain('authenticateMcp(')
    expect(declaration).toContain('setMcpEnabled(')
    expect(declaration).toContain('connect(')
    expect(declaration).toContain('authenticate(')
    expect(declaration).toContain('disable(')
    expect(declaration).toContain('KernelMcpLifecycleResult')
    expect(declaration).toContain('listHooks(')
    expect(declaration).toContain('reloadHooks(')
    expect(declaration).toContain('runHook(')
    expect(declaration).toContain('registerHook(')
    expect(declaration).toContain('KernelHookRunResult')
    expect(declaration).toContain('KernelHookMutationResult')
    expect(declaration).toContain('listSkills(')
    expect(declaration).toContain('reloadSkills(')
    expect(declaration).toContain('resolveSkillContext(')
    expect(declaration).toContain('resolveContext(')
    expect(declaration).toContain('KernelSkillPromptContextResult')
    expect(declaration).toContain('listPlugins(')
    expect(declaration).toContain('reloadPlugins(')
    expect(declaration).toContain('setPluginEnabled(')
    expect(declaration).toContain('installPlugin(')
    expect(declaration).toContain('uninstallPlugin(')
    expect(declaration).toContain('updatePlugin(')
    expect(declaration).toContain('setEnabled(')
    expect(declaration).toContain('install(')
    expect(declaration).toContain('uninstall(')
    expect(declaration).toContain('update(')
    expect(declaration).toContain('KernelPluginMutationResult')
    expect(declaration).toContain('KernelPluginInstallRequest')
    expect(declaration).toContain('KernelPluginUninstallRequest')
    expect(declaration).toContain('KernelPluginUpdateRequest')
    expect(declaration).toContain('listAgents(')
    expect(declaration).toContain('reloadAgents(')
    expect(declaration).toContain('spawnAgent(')
    expect(declaration).toContain('listAgentRuns(')
    expect(declaration).toContain('getAgentRun(')
    expect(declaration).toContain('getAgentOutput(')
    expect(declaration).toContain('cancelAgentRun(')
    expect(declaration).toContain('listTasks(')
    expect(declaration).toContain('getTask(')
    expect(declaration).toContain('createTask(')
    expect(declaration).toContain('updateTask(')
    expect(declaration).toContain('assignTask(')
    expect(declaration).toContain('invoke(')
    expect(declaration).toContain('KernelCoordinatorInvokeRequest')
    expect(declaration).toContain('KernelCoordinatorInvokeResult')
    expect(declaration).toContain('spawn(request: KernelAgentSpawnRequest)')
    expect(declaration).toContain(
      'onEvent(handler: (event: KernelRuntimeAgentEvent) => void)',
    )
    expect(declaration).toContain(
      'Promise<readonly KernelRuntimeAgentEvent[]>',
    )
    expect(declaration).toContain('runs(')
    expect(declaration).toContain('KernelAgentRunFilter')
    expect(declaration).toContain('status(runId: string)')
    expect(declaration).toContain('output(')
    expect(declaration).toContain('cancel(')
    expect(declaration).toContain('create(request: KernelTaskCreateRequest)')
    expect(declaration).toContain('update(request: KernelTaskUpdateRequest)')
    expect(declaration).toContain(
      'onEvent(handler: (event: KernelRuntimeTaskEvent) => void)',
    )
    expect(declaration).toContain(
      'Promise<readonly KernelRuntimeTaskEvent[]>',
    )
    expect(declaration).toContain('assign(request: KernelTaskAssignRequest)')
    expect(declaration).toContain('execute(')
    expect(declaration).toContain('call(')
    expect(declaration).toContain('KernelCommandExecutionResult')
    expect(declaration).toContain('KernelToolCallResult')
    expect(declaration).toContain('hookCatalog?: KernelRuntimeWireHookCatalog')
    expect(declaration).toContain(
      'skillCatalog?: KernelRuntimeWireSkillCatalog',
    )
    expect(declaration).toContain(
      'pluginCatalog?: KernelRuntimeWirePluginCatalog',
    )
    expect(declaration).toContain(
      'agentRegistry?: KernelRuntimeWireAgentRegistry',
    )
    expect(declaration).toContain(
      'taskRegistry?: KernelRuntimeWireTaskRegistry',
    )
    expect(declaration).toContain(
      'export type KernelRuntimeAgentProcessExecutorOptions = {',
    )
    expect(declaration).toContain(
      'agentExecutor?: false | KernelRuntimeAgentProcessExecutorOptions',
    )
    expect(declaration).toContain('export type KernelRuntimeEventEnvelope =')
    expect(declaration).toContain('export type KernelRuntimeEventHandler =')
    expect(declaration).toContain('export type KernelTurn = {')
    expect(declaration).toContain('startTurn(')
    expect(declaration).toContain('createKernelRuntimeWireClient(')
    expect(declaration).toContain('waitForTurn(')
    expect(declaration).toContain('runTurnAndWait(')
    expect(declaration).not.toContain("'src/")
    expect(declaration).not.toContain('"src/')
    expect(declaration).not.toContain('packages/')
  })

  test('declares the package-level kernel runtime bin', () => {
    expect(Object.keys(packageJson.bin ?? {}).sort()).toEqual([
      'claude',
      'claude-bun',
      'claude-kernel-runtime',
    ])
    expect(packageJson.bin?.['claude-kernel-runtime']).toBe(
      'dist/kernel-runtime.js',
    )
  })

  test('re-exports the stable kernel surface through src/entrypoints/kernel.ts', () => {
    expect(Object.keys(packageEntry).sort()).toEqual(
      [...EXPECTED_KERNEL_PUBLIC_EXPORTS].sort(),
    )
    expect(
      Object.is(packageEntry.runKernelHeadless, kernel.runKernelHeadless),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.runKernelHeadlessLaunch,
        kernel.runKernelHeadlessLaunch,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createDirectConnectSession,
        kernel.createDirectConnectSession,
      ),
    ).toBe(true)
    expect(
      Object.is(packageEntry.runBridgeHeadless, kernel.runBridgeHeadless),
    ).toBe(true)
    expect(
      Object.is(packageEntry.runDaemonWorker, kernel.runDaemonWorker),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.runKernelRuntimeWireProtocol,
        kernel.runKernelRuntimeWireProtocol,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createDefaultKernelRuntimeWireRouter,
        kernel.createDefaultKernelRuntimeWireRouter,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createKernelPermissionBroker,
        kernel.createKernelPermissionBroker,
      ),
    ).toBe(true)
    expect(packageEntry.KernelPermissionBrokerDisposedError).toBe(
      kernel.KernelPermissionBrokerDisposedError,
    )
    expect(packageEntry.KernelPermissionDecisionError).toBe(
      kernel.KernelPermissionDecisionError,
    )
    expect(
      Object.is(
        packageEntry.createKernelRuntimeEventFacade,
        kernel.createKernelRuntimeEventFacade,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.getKernelRuntimeEnvelopeFromMessage,
        kernel.getKernelRuntimeEnvelopeFromMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.toKernelRuntimeEventMessage,
        kernel.toKernelRuntimeEventMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.consumeKernelRuntimeEventMessage,
        kernel.consumeKernelRuntimeEventMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.getKernelEventFromEnvelope,
        kernel.getKernelEventFromEnvelope,
      ),
    ).toBe(true)
    for (const exportName of KERNEL_RUNTIME_EVENT_TAXONOMY_EXPORTS) {
      expect(packageEntry[exportName]).toBe(kernel[exportName])
      expect(packageEntry[exportName]).toBe(runtimeEvents[exportName])
    }
    const packageEntryRecord = packageEntry as unknown as Record<
      string,
      unknown
    >
    const kernelRecord = kernel as unknown as Record<string, unknown>
    for (const exportName of KERNEL_CAPABILITY_API_EXPORTS) {
      expect(packageEntryRecord[exportName]).toBe(kernelRecord[exportName])
      if (exportName === 'KERNEL_CAPABILITY_FAMILIES') {
        expect(Array.isArray(packageEntryRecord[exportName])).toBe(true)
      } else {
        expect(typeof packageEntryRecord[exportName]).toBe('function')
      }
    }
    expect(
      Object.is(
        packageEntry.createKernelRuntimeWireClient,
        kernel.createKernelRuntimeWireClient,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createKernelRuntimeInProcessWireTransport,
        kernel.createKernelRuntimeInProcessWireTransport,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createKernelRuntimeStdioWireTransport,
        kernel.createKernelRuntimeStdioWireTransport,
      ),
    ).toBe(true)
    expect(packageEntry.KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION).toBe(
      kernel.KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    )
    expect(
      Object.is(packageEntry.createKernelRuntime, kernel.createKernelRuntime),
    ).toBe(true)
    expect(packageEntry.KernelRuntimeRequestError).toBe(
      kernel.KernelRuntimeRequestError,
    )
    expect(
      Object.is(
        packageEntry.createKernelCompanionRuntime,
        kernel.createKernelCompanionRuntime,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createKernelContextManager,
        kernel.createKernelContextManager,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createKernelKairosRuntime,
        kernel.createKernelKairosRuntime,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createKernelMemoryManager,
        kernel.createKernelMemoryManager,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createKernelSessionManager,
        kernel.createKernelSessionManager,
      ),
    ).toBe(true)
  })
})
