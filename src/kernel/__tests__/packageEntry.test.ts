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

function parseKernelImplementationExportNames(source: string): string[] {
  const names = new Set<string>()
  const exportBlockPattern =
    /export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from/g
  let match: RegExpExecArray | null
  while ((match = exportBlockPattern.exec(source))) {
    for (const rawItem of match[1].split(',')) {
      const item = rawItem.trim().replace(/^type\s+/, '')
      if (!item) {
        continue
      }
      const alias = item.match(/\bas\s+([A-Za-z_$][\w$]*)$/)
      const identifier = alias?.[1] ?? item.match(/^([A-Za-z_$][\w$]*)/)?.[1]
      if (identifier) {
        names.add(identifier)
      }
    }
  }
  return [...names].sort()
}

function parseKernelDeclarationExportNames(source: string): string[] {
  const names = new Set<string>()
  const exportBlockPattern =
    /export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from/g
  let blockMatch: RegExpExecArray | null
  while ((blockMatch = exportBlockPattern.exec(source))) {
    for (const rawItem of blockMatch[1].split(',')) {
      const item = rawItem.trim().replace(/^type\s+/, '')
      if (!item) {
        continue
      }
      const alias = item.match(/\bas\s+([A-Za-z_$][\w$]*)$/)
      const identifier = alias?.[1] ?? item.match(/^([A-Za-z_$][\w$]*)/)?.[1]
      if (identifier) {
        names.add(identifier)
      }
    }
  }
  for (const line of source.split(/\r?\n/)) {
    const typeMatch = line.match(/^export\s+type\s+([A-Za-z_$][\w$]*)\b/)
    if (typeMatch) {
      names.add(typeMatch[1])
      continue
    }
    const valueMatch = line.match(
      /^export\s+declare\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)\b/,
    )
    if (valueMatch) {
      names.add(valueMatch[1])
    }
  }
  return [...names].sort()
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

    for (const marker of [
      'createKernelHeadlessController',
      'createKernelHeadlessInputQueue',
      'createKernelHeadlessProviderEnv',
      'normalizeKernelHeadlessEvent',
      'runKernelHeadlessLaunch',
      'KERNEL_RUNTIME_JSON_RPC_LITE_PROTOCOL_VERSION',
      'runKernelRuntimeJsonRpcLiteProtocol',
      'createKernelRuntimeEventFacade',
      'createKernelPermissionBroker',
      'createKernelCompanionRuntime',
      'createKernelContextManager',
      'createKernelKairosRuntime',
      'createKernelMemoryManager',
      'createKernelSessionManager',
      'collectKernelRuntimeEventEnvelopes',
      'getKernelRuntimeEnvelopeFromMessage',
      'toKernelRuntimeEventMessage',
      'consumeKernelRuntimeEventMessage',
      'getKernelEventFromEnvelope',
      'getKernelRuntimeLifecycleProjection',
      'getKernelRuntimeCoordinatorLifecycleProjection',
      'getKernelRuntimeTaskNotificationProjection',
      'getKernelRuntimeTerminalProjection',
      'getCanonicalProjectionFromKernelEvent',
      'KernelRuntimeJsonRpcLiteProtocolOptions',
      'KernelRuntimeJsonRpcLiteRunnerOptions',
      'KernelCapabilityDescriptor',
      'KernelCapabilityReloadScope',
      'KernelEvent',
      'KernelPermissionDecision',
      'KernelPermissionRequest',
      'KernelRuntimeHostIdentity',
      'KernelRuntimeTransportKind',
      'KernelHeadlessEvent',
    ]) {
      expect(declaration).toContain(marker)
    }
    expect(declaration).not.toContain("'src/")
    expect(declaration).not.toContain('"src/')
    expect(declaration).not.toContain('packages/')
    expect(declaration).not.toContain('runKernelRuntimeWireProtocol(')
    expect(declaration).not.toContain("from './runtime.js'")
    expect(declaration).not.toContain('from "./runtime.js"')
    expect(declaration).not.toContain('wireProtocol')
    expect(declaration).not.toContain('KernelRuntimeWire')
    expect(declaration).not.toContain('KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION')
    expect(declaration).not.toContain('createDefaultKernelRuntimeWireRouter(')
    expect(declaration).not.toContain('createKernelRuntimeWireClient(')
    expect(declaration).not.toContain('getCompatibilityProjectionFromKernelEvent(')
    expect(declaration).not.toContain('hasCompatibilityProjection(')
  })

  test('keeps the declaration export names aligned with src/kernel/index.ts', async () => {
    const kernelExport = packageJson.exports?.['./kernel']
    const [implementation, declaration] = await Promise.all([
      readFile(join(repoRoot, 'src/kernel/index.ts'), 'utf8'),
      readFile(join(repoRoot, kernelExport!.types!), 'utf8'),
    ])

    expect(parseKernelDeclarationExportNames(declaration)).toEqual(
      parseKernelImplementationExportNames(implementation),
    )
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
        packageEntry.runKernelRuntimeJsonRpcLiteProtocol,
        kernel.runKernelRuntimeJsonRpcLiteProtocol,
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
    expect(packageEntry.KERNEL_RUNTIME_JSON_RPC_LITE_PROTOCOL_VERSION).toBe(
      kernel.KERNEL_RUNTIME_JSON_RPC_LITE_PROTOCOL_VERSION,
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

  test('does not expose the legacy runtime facade or wire surface', () => {
    const exports = Object.keys(packageEntry)
    expect(exports).not.toContain('createKernelRuntime')
    expect(exports).not.toContain('KernelRuntimeRequestError')
    expect(exports).not.toContain('runKernelRuntimeWireProtocol')
    expect(exports).not.toContain('createDefaultKernelRuntimeWireRouter')
    expect(exports).not.toContain('KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION')
    expect(exports.some(name => name.includes('Wire'))).toBe(false)
  })
})
