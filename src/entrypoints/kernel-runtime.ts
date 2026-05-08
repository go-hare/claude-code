#!/usr/bin/env bun
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const SOURCE_REEXEC_ENV = 'HARE_KERNEL_RUNTIME_SOURCE_REEXEC'
const entrypointPath = fileURLToPath(import.meta.url)
const sourceRoot = resolve(dirname(entrypointPath), '../..')

if (shouldReexecFromSourceRoot()) {
  await reexecFromSourceRoot()
}

const { runKernelRuntimeJsonRpcLiteProtocol } = await import(
  '../kernel/jsonRpcLiteProtocol.js'
)
await runKernelRuntimeJsonRpcLiteProtocol()

function shouldReexecFromSourceRoot(): boolean {
  if (process.env[SOURCE_REEXEC_ENV] === '1') {
    return false
  }
  if (!entrypointPath.endsWith('/src/entrypoints/kernel-runtime.ts')) {
    return false
  }
  if (!existsSync(resolve(sourceRoot, 'package.json'))) {
    return false
  }
  return process.cwd() !== sourceRoot
}

async function reexecFromSourceRoot(): Promise<never> {
  const child = spawn(
    process.execPath,
    ['run', entrypointPath, ...process.argv.slice(2)],
    {
      cwd: sourceRoot,
      env: {
        ...process.env,
        [SOURCE_REEXEC_ENV]: '1',
      },
      stdio: 'inherit',
    },
  )

  const exitCode = await new Promise<number>((resolveExitCode, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code !== null) {
        resolveExitCode(code)
        return
      }
      reject(
        new Error(
          `Kernel runtime source re-exec exited from signal ${signal ?? 'unknown'}`,
        ),
      )
    })
  })
  process.exit(exitCode)
}
