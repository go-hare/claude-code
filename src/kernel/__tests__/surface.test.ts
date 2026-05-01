import { describe, expect, test } from 'bun:test'

import * as bridge from '../bridge.js'
import * as companion from '../companion.js'
import * as daemon from '../daemon.js'
import * as context from '../context.js'
import * as headlessController from '../headlessController.js'
import * as headlessInputQueue from '../headlessInputQueue.js'
import * as headlessLaunch from '../headlessLaunch.js'
import * as headless from '../headless.js'
import * as headlessMcp from '../headlessMcp.js'
import * as headlessProvider from '../headlessProvider.js'
import * as headlessStartup from '../headlessStartup.js'
import * as events from '../events.js'
import * as kernel from '../index.js'
import * as kairos from '../kairos.js'
import * as memory from '../memory.js'
import * as outputProjection from '../outputProjection.js'
import * as permissions from '../permissions.js'
import * as runtime from '../runtime.js'
import * as runtimeEvents from '../runtimeEvents.js'
import * as sessions from '../sessions.js'
import * as serverHost from '../serverHost.js'
import * as wireProtocol from '../wireProtocol.js'
import * as serverTypes from '../../server/types.js'

const EXPECTED_KERNEL_EXPORTS = [
  'KERNEL_CAPABILITY_FAMILIES',
  'KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION',
  'KERNEL_RUNTIME_EVENT_TAXONOMY',
  'KERNEL_RUNTIME_EVENT_TYPES',
  'DirectConnectError',
  'applyDirectConnectSessionState',
  'assembleServerHost',
  'connectDefaultKernelHeadlessMcp',
  'connectDirectHostSession',
  'connectResponseSchema',
  'collectKernelRuntimeEventEnvelopes',
  'consumeKernelRuntimeEventMessage',
  'createDefaultKernelHeadlessEnvironment',
  'createDefaultKernelRuntimeWireRouter',
  'createHeadlessSDKMessageRuntimeEvent',
  'createDirectConnectSession',
  'createKernelCompanionRuntime',
  'createKernelContextManager',
  'createKernelHeadlessController',
  'createKernelHeadlessInputQueue',
  'createKernelHeadlessProviderEnv',
  'createKernelHeadlessSession',
  'createKernelHeadlessStore',
  'createKernelKairosRuntime',
  'createKernelMemoryManager',
  'createKernelPermissionBroker',
  'createKernelRuntimeEventFacade',
  'createKernelRuntimeInProcessWireTransport',
  'createKernelRuntimeStdioWireTransport',
  'createKernelRuntimeWireClient',
  'createKernelRuntime',
  'createKernelSessionManager',
  'emitKernelHeadlessRuntimeMessage',
  'getKernelCommandExecutionResult',
  'getKernelAgentRunCancelResult',
  'getKernelAgentSpawnResult',
  'getKernelHookMutationResult',
  'getKernelHookRegistrySnapshot',
  'getKernelHookRunResult',
  'getKernelMcpLifecycleResult',
  'getKernelMcpSnapshot',
  'filterKernelCapabilities',
  'getKernelPermissionDecision',
  'getKernelPermissionRequest',
  'getKernelPluginMutationResult',
  'getKernelPluginSnapshot',
  'getKernelSkillPromptContextResult',
  'getKernelSkillSnapshot',
  'getKernelTaskMutationResult',
  'getKernelCapabilityFamily',
  'createKernelSession',
  'getDirectConnectErrorMessage',
  'groupKernelCapabilities',
  'getKernelEventFromEnvelope',
  'getKernelRuntimeEventCategory',
  'getKernelRuntimeEventTaxonomyEntry',
  'getKernelRuntimeEventType',
  'getKernelRuntimeEnvelopeFromMessage',
  'getKernelToolCallResult',
  'getKernelTurnOutputText',
  'getKernelTurnTerminalSnapshot',
  'getSDKMessageFromRuntimeEnvelope',
  'getSDKResultTurnOutcome',
  'isKernelCommandsExecutedEvent',
  'isKernelAgentsRunCancelledEvent',
  'isKernelAgentsSpawnedEvent',
  'isKernelCapabilityReady',
  'isKernelCapabilityUnavailable',
  'isKernelHooksRanEvent',
  'isKernelHooksRegisteredEvent',
  'isKernelHooksReloadedEvent',
  'isKernelMcpAuthenticatedEvent',
  'isKernelMcpConnectedEvent',
  'isKernelMcpEnabledChangedEvent',
  'isKernelMcpReloadedEvent',
  'isKernelPermissionRequestedEvent',
  'isKernelPermissionResolvedEvent',
  'isKernelPluginsEnabledChangedEvent',
  'isKernelPluginsInstalledEvent',
  'isKernelPluginsReloadedEvent',
  'isKernelPluginsUninstalledEvent',
  'isKernelPluginsUpdatedEvent',
  'isKernelSkillsContextResolvedEvent',
  'isKernelSkillsReloadedEvent',
  'isKernelTasksAssignedEvent',
  'isKernelTasksCreatedEvent',
  'isKernelTasksUpdatedEvent',
  'isKernelToolsCalledEvent',
  'isKernelRuntimeEventEnvelope',
  'isKernelRuntimeEventOfType',
  'isKernelRuntimeEnvelope',
  'isKernelTurnTerminalEvent',
  'isKnownKernelRuntimeEventType',
  'KernelPermissionBrokerDisposedError',
  'KernelPermissionDecisionError',
  'KernelRuntimeRequestError',
  'KernelRuntimeOutputDeltaDedupe',
  'KernelRuntimeSDKMessageDedupe',
  'KernelRuntimeEventReplayError',
  'normalizeKernelHeadlessEvent',
  'prepareKernelHeadlessStartup',
  'reloadKernelRuntimeCapabilities',
  'resolveKernelRuntimeCapabilities',
  'runBridgeHeadless',
  'runConnectHeadless',
  'runDaemonWorker',
  'runKernelHeadless',
  'runKernelHeadlessLaunch',
  'runKernelHeadlessClient',
  'runKernelRuntimeWireProtocol',
  'startKernelServer',
  'startServer',
  'toKernelCapabilityView',
  'toKernelCapabilityViews',
  'toKernelRuntimeEventMessage',
  'projectRuntimeEnvelopeToLegacySDKMessage',
  'projectRuntimeEnvelopeToLegacyStreamJsonMessages',
  'projectSDKMessageToLegacyStreamJsonMessages',
] as const

describe('kernel index surface', () => {
  test('locks the exact stable public kernel export set', () => {
    expect(Object.keys(kernel).sort()).toEqual(
      [...EXPECTED_KERNEL_EXPORTS].sort(),
    )
  })

  test('re-exports the stable public kernel API from its leaf modules', () => {
    expect(
      Object.is(
        kernel.createDefaultKernelHeadlessEnvironment,
        headless.createDefaultKernelHeadlessEnvironment,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelHeadlessSession,
        headless.createKernelHeadlessSession,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelHeadlessStore,
        headless.createKernelHeadlessStore,
      ),
    ).toBe(true)
    expect(
      Object.is(kernel.runKernelHeadless, headless.runKernelHeadless),
    ).toBe(true)
    expect(
      Object.is(
        kernel.runKernelHeadlessLaunch,
        headlessLaunch.runKernelHeadlessLaunch,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelHeadlessController,
        headlessController.createKernelHeadlessController,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.normalizeKernelHeadlessEvent,
        headlessController.normalizeKernelHeadlessEvent,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelHeadlessInputQueue,
        headlessInputQueue.createKernelHeadlessInputQueue,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelHeadlessProviderEnv,
        headlessProvider.createKernelHeadlessProviderEnv,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.connectDefaultKernelHeadlessMcp,
        headlessMcp.connectDefaultKernelHeadlessMcp,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.prepareKernelHeadlessStartup,
        headlessStartup.prepareKernelHeadlessStartup,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.projectRuntimeEnvelopeToLegacyStreamJsonMessages,
        outputProjection.projectRuntimeEnvelopeToLegacyStreamJsonMessages,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.emitKernelHeadlessRuntimeMessage,
        outputProjection.emitKernelHeadlessRuntimeMessage,
      ),
    ).toBe(true)

    expect(
      Object.is(
        kernel.createKernelSession,
        serverHost.createDirectConnectSession,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createDirectConnectSession,
        serverHost.createDirectConnectSession,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.connectDirectHostSession,
        serverHost.connectDirectHostSession,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.applyDirectConnectSessionState,
        serverHost.applyDirectConnectSessionState,
      ),
    ).toBe(true)
    expect(
      Object.is(kernel.assembleServerHost, serverHost.assembleServerHost),
    ).toBe(true)
    expect(
      Object.is(kernel.DirectConnectError, serverHost.DirectConnectError),
    ).toBe(true)
    expect(
      Object.is(kernel.runKernelHeadlessClient, serverHost.runConnectHeadless),
    ).toBe(true)
    expect(
      Object.is(kernel.runConnectHeadless, serverHost.runConnectHeadless),
    ).toBe(true)
    expect(Object.is(kernel.startKernelServer, serverHost.startServer)).toBe(
      true,
    )
    expect(Object.is(kernel.startServer, serverHost.startServer)).toBe(true)
    expect(
      Object.is(
        kernel.createKernelRuntimeEventFacade,
        events.createKernelRuntimeEventFacade,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.getKernelRuntimeEnvelopeFromMessage,
        events.getKernelRuntimeEnvelopeFromMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.toKernelRuntimeEventMessage,
        events.toKernelRuntimeEventMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.consumeKernelRuntimeEventMessage,
        events.consumeKernelRuntimeEventMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.getKernelEventFromEnvelope,
        events.getKernelEventFromEnvelope,
      ),
    ).toBe(true)
    expect(
      Object.is(kernel.isKernelRuntimeEnvelope, events.isKernelRuntimeEnvelope),
    ).toBe(true)
    expect(kernel.KernelRuntimeEventReplayError).toBe(
      events.KernelRuntimeEventReplayError,
    )
    expect(kernel.KERNEL_RUNTIME_EVENT_TAXONOMY).toBe(
      runtimeEvents.KERNEL_RUNTIME_EVENT_TAXONOMY,
    )
    expect(kernel.KERNEL_RUNTIME_EVENT_TYPES).toBe(
      runtimeEvents.KERNEL_RUNTIME_EVENT_TYPES,
    )
    expect(
      Object.is(
        kernel.getKernelRuntimeEventType,
        runtimeEvents.getKernelRuntimeEventType,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.getKernelRuntimeEventCategory,
        runtimeEvents.getKernelRuntimeEventCategory,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.getKernelRuntimeEventTaxonomyEntry,
        runtimeEvents.getKernelRuntimeEventTaxonomyEntry,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.isKernelRuntimeEventEnvelope,
        runtimeEvents.isKernelRuntimeEventEnvelope,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.isKernelRuntimeEventOfType,
        runtimeEvents.isKernelRuntimeEventOfType,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.isKernelTurnTerminalEvent,
        runtimeEvents.isKernelTurnTerminalEvent,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.isKnownKernelRuntimeEventType,
        runtimeEvents.isKnownKernelRuntimeEventType,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelPermissionBroker,
        permissions.createKernelPermissionBroker,
      ),
    ).toBe(true)
    expect(kernel.KernelPermissionBrokerDisposedError).toBe(
      permissions.KernelPermissionBrokerDisposedError,
    )
    expect(kernel.KernelPermissionDecisionError).toBe(
      permissions.KernelPermissionDecisionError,
    )
    expect(
      Object.is(
        kernel.connectResponseSchema,
        serverTypes.connectResponseSchema,
      ),
    ).toBe(true)

    expect(Object.is(kernel.runBridgeHeadless, bridge.runBridgeHeadless)).toBe(
      true,
    )
    expect(Object.is(kernel.runDaemonWorker, daemon.runDaemonWorker)).toBe(true)
    expect(
      Object.is(
        kernel.createKernelCompanionRuntime,
        companion.createKernelCompanionRuntime,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelContextManager,
        context.createKernelContextManager,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelKairosRuntime,
        kairos.createKernelKairosRuntime,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelMemoryManager,
        memory.createKernelMemoryManager,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelSessionManager,
        sessions.createKernelSessionManager,
      ),
    ).toBe(true)
    expect(
      Object.is(kernel.createKernelRuntime, runtime.createKernelRuntime),
    ).toBe(true)
    expect(kernel.KernelRuntimeRequestError).toBe(
      runtime.KernelRuntimeRequestError,
    )
    const kernelRecord = kernel as unknown as Record<string, unknown>
    const runtimeRecord = runtime as unknown as Record<string, unknown>
    for (const exportName of [
      'KERNEL_CAPABILITY_FAMILIES',
      'filterKernelCapabilities',
      'getKernelCapabilityFamily',
      'groupKernelCapabilities',
      'isKernelCapabilityReady',
      'isKernelCapabilityUnavailable',
      'reloadKernelRuntimeCapabilities',
      'resolveKernelRuntimeCapabilities',
      'toKernelCapabilityView',
      'toKernelCapabilityViews',
    ]) {
      expect(kernelRecord[exportName]).toBe(runtimeRecord[exportName])
      if (exportName === 'KERNEL_CAPABILITY_FAMILIES') {
        expect(Array.isArray(kernelRecord[exportName])).toBe(true)
      } else {
        expect(typeof kernelRecord[exportName]).toBe('function')
      }
    }
    expect(
      Object.is(
        kernel.createDefaultKernelRuntimeWireRouter,
        wireProtocol.createDefaultKernelRuntimeWireRouter,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelRuntimeInProcessWireTransport,
        wireProtocol.createKernelRuntimeInProcessWireTransport,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelRuntimeStdioWireTransport,
        wireProtocol.createKernelRuntimeStdioWireTransport,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelRuntimeWireClient,
        wireProtocol.createKernelRuntimeWireClient,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.runKernelRuntimeWireProtocol,
        wireProtocol.runKernelRuntimeWireProtocol,
      ),
    ).toBe(true)
    expect(kernel.KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION).toBe(
      wireProtocol.KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    )
  })
})
