import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

const repoRoot = process.cwd()

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(join(repoRoot, relativePath), 'utf8')
}

describe('server runtime contracts', () => {
  test('defines the runtime-owned backend and logger contracts', async () => {
    const content = await readRepoFile(
      'src/runtime/capabilities/server/contracts.ts',
    )
    const sessionContract = await readRepoFile(
      'src/runtime/contracts/session.ts',
    )

    expect(sessionContract).toContain(
      'export interface RuntimeSessionLifecycle',
    )
    expect(sessionContract).toContain(
      'export interface RuntimeSessionSink<TMessage = unknown>',
    )
    expect(sessionContract).toContain(
      'export interface AttachableRuntimeSession<',
    )
    expect(content).toContain('export interface SessionRuntimeHandle')
    expect(content).toContain('export interface SessionRuntimeSink')
    expect(content).toContain('export interface RuntimeManagedSession')
    expect(content).toContain('export type SessionLifecycleFactory')
    expect(content).toContain('export interface SessionRuntimeBackend')
    expect(content).toContain('export interface SessionLogger')
    expect(content).toContain('export const noopSessionLogger')
    expect(content).toContain("from '../../contracts/session.js'")
    expect(content).toContain('extends IndexedRuntimeSession,')
    expect(content).toContain('AttachableRuntimeSession<SessionRuntimeSink>')
    expect(content).toContain('RuntimeSessionLifecycle')
  })

  test('session manager and direct-connect session depend on contracts, not server implementations', async () => {
    const sessionManager = await readRepoFile(
      'src/runtime/capabilities/server/SessionManager.ts',
    )
    const directSession = await readRepoFile(
      'src/runtime/capabilities/server/RuntimeDirectConnectSession.ts',
    )
    const registryCompat = await readRepoFile(
      'src/runtime/capabilities/server/SessionRegistry.ts',
    )

    expect(sessionManager).toContain("from './contracts.js'")
    expect(sessionManager).toContain(
      "from '../../core/session/RuntimeSessionRegistry.js'",
    )
    expect(sessionManager).toContain('createManagedSession')
    expect(sessionManager).not.toContain('new RuntimeDirectConnectSession')
    expect(sessionManager).not.toContain('server/backends/dangerousBackend.js')
    expect(sessionManager).not.toContain('server/serverLog.js')
    expect(sessionManager).not.toContain(
      '../persistence/ServerSessionIndexStore.js',
    )

    expect(directSession).toContain("from './contracts.js'")
    expect(directSession).toContain('attachSink(')
    expect(directSession).toContain('handleInput(')
    expect(directSession).not.toContain('export type DirectConnectClientSocket')
    expect(directSession).not.toContain('server/backends/dangerousBackend.js')
    expect(directSession).not.toContain('server/serverLog.js')

    expect(registryCompat.trim()).toBe(
      "export { RuntimeSessionRegistry } from '../../core/session/RuntimeSessionRegistry.js'",
    )
  })
})
