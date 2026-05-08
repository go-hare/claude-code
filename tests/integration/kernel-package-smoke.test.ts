import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { EXPECTED_KERNEL_PUBLIC_EXPORTS } from '../../src/kernel/__tests__/publicSurfaceManifest.js'

const repoRoot = join(import.meta.dir, '../..')
const packageJson = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8'),
) as {
  exports?: Record<string, { import?: string; default?: string } | string>
  bin?: Record<string, string>
}

function parsePackJson(output: string): Array<{ filename: string }> {
  const match = output.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/)
  if (!match) {
    throw new Error(`npm pack did not return JSON output:\n${output}`)
  }
  return JSON.parse(match[1]) as Array<{ filename: string }>
}

describe('kernel package smoke', () => {
  test('declares ./kernel export pointing at dist/kernel.js', () => {
    const kernelExport = packageJson.exports?.['./kernel']
    expect(kernelExport).toBeDefined()
    expect(typeof kernelExport).toBe('object')
    expect((kernelExport as { import?: string }).import).toBe(
      './dist/kernel.js',
    )
    expect((kernelExport as { default?: string }).default).toBe(
      './dist/kernel.js',
    )
  })

  test('declares the kernel runtime executable bin', () => {
    expect(packageJson.bin?.['claude-kernel-runtime']).toBe(
      'dist/kernel-runtime.js',
    )
  })

  test(
    'imports the built package-level kernel entry and runs the packaged runtime bin',
    async () => {
      execFileSync('bun', ['run', 'build'], {
        cwd: repoRoot,
        encoding: 'utf8',
      })

      const tempRoot = mkdtempSync(join(tmpdir(), 'hare-kernel-package-'))
      const consumerDir = join(tempRoot, 'consumer')
      mkdirSync(consumerDir, { recursive: true })
      writeFileSync(
        join(consumerDir, 'package.json'),
        JSON.stringify({
          name: 'kernel-smoke-consumer',
          private: true,
          type: 'module',
        }),
        'utf8',
      )

      try {
        const packOutput = execFileSync(
          'npm',
          [
            'pack',
            '--json',
            '--ignore-scripts',
            '--pack-destination',
            tempRoot,
          ],
          {
            cwd: repoRoot,
            encoding: 'utf8',
          },
        )
        const [{ filename }] = parsePackJson(packOutput)
        const tarballPath = join(tempRoot, filename)

        expect(existsSync(tarballPath)).toBe(true)

        execFileSync(
          'npm',
          ['install', '--ignore-scripts', '--no-package-lock', tarballPath],
          {
            cwd: consumerDir,
            encoding: 'utf8',
          },
        )

        const exportedKeys = JSON.parse(
          execFileSync(
            'node',
            [
              '--input-type=module',
              '-e',
              `import('claude-code/kernel').then(mod => process.stdout.write(JSON.stringify(Object.keys(mod).sort()))).catch(err => { console.error(err); process.exit(1) })`,
            ],
            {
              cwd: consumerDir,
              encoding: 'utf8',
            },
          ),
        ) as string[]

        expect(exportedKeys).toEqual([...EXPECTED_KERNEL_PUBLIC_EXPORTS].sort())

        const binName =
          process.platform === 'win32'
            ? 'claude-kernel-runtime.cmd'
            : 'claude-kernel-runtime'
        const binPath = join(consumerDir, 'node_modules', '.bin', binName)
        expect(existsSync(binPath)).toBe(true)

        const runtimeOutput = execFileSync(binPath, {
          cwd: consumerDir,
          input: `${JSON.stringify({
            id: 'packaged-bin-ping',
            method: 'runtime.ping',
          })}\n`,
          encoding: 'utf8',
        })
        const [pong] = runtimeOutput
          .trim()
          .split('\n')
          .map(line => JSON.parse(line) as Record<string, unknown>)

        expect(pong).toMatchObject({
          id: 'packaged-bin-ping',
          result: {
            pong: true,
          },
        })

        const workerOutput = execFileSync(
          'node',
          [
            '--input-type=module',
            '-e',
            `
              import { Readable, Writable } from 'node:stream'
              import { runKernelRuntimeJsonRpcLiteProtocol } from 'claude-code/kernel'

              const chunks = []
              const output = new Writable({
                write(chunk, _encoding, callback) {
                  chunks.push(Buffer.from(chunk).toString('utf8'))
                  callback()
                },
              })
              await runKernelRuntimeJsonRpcLiteProtocol({
                input: Readable.from([
                  JSON.stringify({
                    id: 'package-worker-ping',
                    method: 'runtime.ping',
                  }) + '\\n',
                ]),
                output,
                eventJournalPath: false,
                conversationJournalPath: false,
              })
              process.stdout.write(chunks.join(''))
            `,
          ],
          {
            cwd: consumerDir,
            encoding: 'utf8',
          },
        )
        const [workerPong] = workerOutput
          .trim()
          .split('\n')
          .map(line => JSON.parse(line) as Record<string, unknown>)

        expect(workerPong).toMatchObject({
          id: 'package-worker-ping',
          result: {
            pong: true,
          },
        })
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    },
    { timeout: 180_000 },
  )
})
