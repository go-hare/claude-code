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
import * as capabilities from '../capabilities.js'
import * as runtimeCapabilities from '../runtimeCapabilities.js'
import * as runtimeEvents from '../runtimeEvents.js'
import * as sessions from '../sessions.js'
import * as serverHost from '../serverHost.js'
import * as jsonRpcLiteProtocol from '../jsonRpcLiteProtocol.js'
import * as serverTypes from '../../server/types.js'
import {
  EXPECTED_KERNEL_PUBLIC_EXPORTS,
  KERNEL_PUBLIC_SURFACE_TIERS,
  KERNEL_PUBLIC_SURFACE_TIER_ORDER,
} from './publicSurfaceManifest.js'

describe('kernel index surface', () => {
  test('locks the exact stable public kernel export set', () => {
    expect(Object.keys(kernel).sort()).toEqual(
      [...EXPECTED_KERNEL_PUBLIC_EXPORTS].sort(),
    )
  })

  test('classifies every public value export into exactly one product tier', () => {
    const tieredExports = KERNEL_PUBLIC_SURFACE_TIER_ORDER.flatMap(
      tier => KERNEL_PUBLIC_SURFACE_TIERS[tier],
    )
    const duplicates = tieredExports.filter(
      (name, index) => tieredExports.indexOf(name) !== index,
    )

    expect(duplicates).toEqual([])
    expect([...tieredExports].sort()).toEqual(
      [...EXPECTED_KERNEL_PUBLIC_EXPORTS].sort(),
    )
    expect(KERNEL_PUBLIC_SURFACE_TIERS.stable_contract).toContain(
      'runKernelRuntimeJsonRpcLiteProtocol',
    )
    expect(KERNEL_PUBLIC_SURFACE_TIERS.host_integration).toContain(
      'runBridgeHeadless',
    )
    expect(KERNEL_PUBLIC_SURFACE_TIERS.experimental_runtime).toContain(
      'createKernelKairosRuntime',
    )
    expect(KERNEL_PUBLIC_SURFACE_TIERS.compat_projection).toContain(
      'getCanonicalProjectionFromKernelEvent',
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
        kernel.getKernelRuntimeLifecycleProjection,
        outputProjection.getKernelRuntimeLifecycleProjection,
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
    expect(kernel.KERNEL_RUNTIME_EVENT_TYPES).not.toContain(
      'headless.protocol_message',
    )
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
    const kernelRecord = kernel as unknown as Record<string, unknown>
    const capabilitiesRecord = capabilities as unknown as Record<
      string,
      unknown
    >
    for (const exportName of [
      'KERNEL_CAPABILITY_FAMILIES',
      'filterKernelCapabilities',
      'getKernelCapabilityFamily',
      'groupKernelCapabilities',
      'isKernelCapabilityReady',
      'isKernelCapabilityUnavailable',
      'toKernelCapabilityView',
      'toKernelCapabilityViews',
    ]) {
      expect(kernelRecord[exportName]).toBe(capabilitiesRecord[exportName])
      if (exportName === 'KERNEL_CAPABILITY_FAMILIES') {
        expect(Array.isArray(kernelRecord[exportName])).toBe(true)
      } else {
        expect(typeof kernelRecord[exportName]).toBe('function')
      }
    }
    for (const exportName of [
      'reloadKernelRuntimeCapabilities',
      'resolveKernelRuntimeCapabilities',
    ]) {
      expect(kernelRecord[exportName]).toBe(
        (runtimeCapabilities as unknown as Record<string, unknown>)[exportName],
      )
    }
    expect(
      Object.is(
        kernel.runKernelRuntimeJsonRpcLiteProtocol,
        jsonRpcLiteProtocol.runKernelRuntimeJsonRpcLiteProtocol,
      ),
    ).toBe(true)
    expect(kernel.KERNEL_RUNTIME_JSON_RPC_LITE_PROTOCOL_VERSION).toBe(
      jsonRpcLiteProtocol.KERNEL_RUNTIME_JSON_RPC_LITE_PROTOCOL_VERSION,
    )
  })
})
