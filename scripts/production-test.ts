#!/usr/bin/env bun

import { access, stat } from 'fs/promises'
import { join, resolve } from 'path'
import { spawn } from 'bun'

type Step = {
  name: string
  command: string[]
  env?: Record<string, string>
}

type Options = {
  bunRuntime: boolean
  offline: boolean
  verbose: boolean
}

const repoRoot = resolve(import.meta.dir, '..')

function parseOptions(argv: string[]): Options {
  return {
    bunRuntime: argv.includes('--bun'),
    offline: argv.includes('--offline'),
    verbose: argv.includes('--verbose'),
  }
}

function printUsage(): void {
  console.log(`Usage: bun run scripts/production-test.ts [--offline] [--verbose] [--bun]

Runs a production-oriented validation pass:
  1. build dist artifacts
  2. verify bundle integrity
  3. smoke-test the built CLI entry

Options:
  --offline   Keep the smoke test network-free.
  --verbose   Print command output for passing steps.
  --bun       Smoke-test dist/cli-bun.js instead of dist/cli-node.js.`)
}

async function runStep(step: Step, options: Options): Promise<void> {
  const commandText = step.command.join(' ')
  console.log(`\n> ${step.name}`)
  if (options.verbose) {
    console.log(`$ ${commandText}`)
  }

  const proc = spawn(step.command, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...step.env,
      NO_COLOR: process.env.NO_COLOR ?? '1',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (exitCode !== 0) {
    if (stdout.trim()) {
      console.log(stdout.trimEnd())
    }
    if (stderr.trim()) {
      console.error(stderr.trimEnd())
    }
    throw new Error(`${step.name} failed with exit code ${exitCode}`)
  }

  if (options.verbose) {
    if (stdout.trim()) {
      console.log(stdout.trimEnd())
    }
    if (stderr.trim()) {
      console.error(stderr.trimEnd())
    }
  }
}

async function assertDistEntryExists(entry: string): Promise<void> {
  const entryPath = join(repoRoot, entry)
  await access(entryPath)
  const stats = await stat(entryPath)
  if (!stats.isFile()) {
    throw new Error(`${entry} is not a file`)
  }
}

function getSmokeCommand(options: Options): string[] {
  const entry = options.bunRuntime ? 'dist/cli-bun.js' : 'dist/cli-node.js'
  const runtime = options.bunRuntime ? 'bun' : 'node'
  return [runtime, entry, '--version']
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    return
  }

  const options = parseOptions(args)
  if (!options.offline) {
    console.log(
      'No live API smoke is configured; running offline production checks.',
    )
  }

  await runStep(
    {
      name: 'Build production bundle',
      command: ['bun', 'run', 'build'],
    },
    options,
  )

  await runStep(
    {
      name: 'Check bundle integrity',
      command: ['bun', 'run', 'check:bundle'],
    },
    options,
  )

  const distEntry = options.bunRuntime ? 'dist/cli-bun.js' : 'dist/cli-node.js'
  await assertDistEntryExists(distEntry)

  await runStep(
    {
      name: `Smoke built CLI (${options.bunRuntime ? 'bun' : 'node'})`,
      command: getSmokeCommand(options),
      env: {
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      },
    },
    options,
  )

  console.log('\nProduction validation passed.')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
