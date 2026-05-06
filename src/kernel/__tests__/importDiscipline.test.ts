import { describe, expect, test } from 'bun:test'
import { readdir, readFile } from 'fs/promises'
import { join, relative } from 'path'

const repoRoot = join(import.meta.dir, '../../..')

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(join(repoRoot, relativePath), 'utf8')
}

async function listRepoTypeScriptFiles(
  relativeDir: string,
): Promise<string[]> {
  const root = join(repoRoot, relativeDir)
  const files: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) {
        continue
      }
      files.push(relative(repoRoot, path).replaceAll('\\', '/'))
    }
  }

  await walk(root)
  return files.sort()
}

async function expectNotToContain(
  relativePath: string,
  forbiddenPatterns: RegExp[],
): Promise<void> {
  const content = await readRepoFile(relativePath)
  for (const pattern of forbiddenPatterns) {
    expect(pattern.test(content)).toBe(false)
  }
}

async function collectFilesContaining(
  relativePaths: readonly string[],
  forbiddenPatterns: readonly RegExp[],
): Promise<string[]> {
  const offenders: string[] = []
  for (const relativePath of relativePaths) {
    const content = await readRepoFile(relativePath)
    if (forbiddenPatterns.some(pattern => pattern.test(content))) {
      offenders.push(relativePath)
    }
  }
  return offenders
}

describe('kernel import discipline', () => {
  test('main host does not bypass kernel for direct-connect session wiring', async () => {
    await expectNotToContain('src/main.tsx', [
      /import\s*\(\s*['"].\/server\/createDirectConnectSession\.js['"]\s*\)/,
      /\bcreateDirectConnectSession\(/,
      /\bDirectConnectError\b/,
      /\bapplyDirectConnectSessionState\(/,
    ])
  })

  test('bridge host no longer reaches around kernel bridge session/runtime seams', async () => {
    await expectNotToContain('src/bridge/bridgeMain.ts', [
      /import\('\.\/createSession\.js'\)/,
      /runHeadlessBridgeRuntime\(/,
    ])
  })

  test('kernel production sources do not import bootstrap singleton state directly', async () => {
    const kernelSources = (await listRepoTypeScriptFiles('src/kernel')).filter(
      path => !path.includes('/__tests__/') && !path.endsWith('.d.ts'),
    )
    const offenders = await collectFilesContaining(kernelSources, [
      /from\s+['"][^'"]*bootstrap\/state\.js['"]/,
      /import\s*\([^)]*['"][^'"]*bootstrap\/state\.js['"][^)]*\)/,
    ])

    expect(offenders).toEqual([])
  })

  test('REPL host goes through the kernel runtime controller instead of execution internals', async () => {
    const screenSources = (await listRepoTypeScriptFiles('src/screens')).filter(
      path => !path.includes('/__tests__/'),
    )
    const offenders = await collectFilesContaining(screenSources, [
      /runtime\/capabilities\/execution\/internal\//,
      /runtime\/capabilities\/execution\/headlessCapabilityMaterializer\.js/,
      /runtime\/capabilities\/permissions\/RuntimePermissionService\.js/,
      /runtime\/core\/events\/KernelRuntimeEventFacade\.js/,
      /runtime\/core\/events\/RuntimeEventBus\.js/,
    ])

    expect(offenders).toEqual([])
  })

  test('daemon host no longer wires bridge runtime directly', async () => {
    await expectNotToContain('src/daemon/workerRegistry.ts', [
      /bridgeMain\.js/,
      /hosts\/daemon/,
      /BridgeHeadlessPermanentError/,
    ])
  })

  test('cli host commands stay off direct-connect and server implementation internals', async () => {
    await expectNotToContain('src/hosts/cli/registerCliHostCommands.ts', [
      /\bcreateDirectConnectSession\(/,
      /\bDirectConnectError\b/,
      /\bassembleServerHost\(/,
      /server\/sessionManager\.js/,
      /server\/backends\/dangerousBackend\.js/,
      /server\/serverLog\.js/,
      /server\/serverBanner\.js/,
      /server\/lockfile\.js/,
      /process\.once\(\s*['"]SIGINT['"]/,
      /process\.once\(\s*['"]SIGTERM['"]/,
    ])
  })

  test('remote-control host surface re-exports from kernel instead of runtime bridge internals', async () => {
    await expectNotToContain('src/hosts/remote-control/index.ts', [
      /runtime\/capabilities\/bridge\/BridgeRuntime\.js/,
    ])
  })

  test('daemon host surface re-exports from kernel instead of runtime daemon internals', async () => {
    await expectNotToContain('src/hosts/daemon/index.ts', [
      /runtime\/capabilities\/daemon\/DaemonWorkerRuntime\.js/,
      /\brunDaemonWorkerRuntime\b/,
    ])
  })
})
