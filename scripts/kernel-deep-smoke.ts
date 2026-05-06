#!/usr/bin/env bun

import { access } from 'fs/promises'
import { randomUUID } from 'crypto'
import { join, resolve } from 'path'
import { spawn } from 'child_process'

type Target = {
  name: string
  cwd: string
  kind: 'source' | 'built-bun' | 'built-node'
}

type Options = {
  includeBuilt: boolean
  includeOriginal: boolean
  originalPath: string
  prompt: string
  timeoutMs: number
}

type RunResult = {
  stdout: string
  stderr: string
  exitCode: number
}

const NODE_RUNNER_CONFIG_ENV = 'KERNEL_DEEP_SMOKE_RUNNER_CONFIG'
const NODE_RUNNER_SCRIPT = `
const { spawn } = require("child_process");

const config = JSON.parse(process.env.${NODE_RUNNER_CONFIG_ENV});
const child = spawn(config.binary, config.args, {
  cwd: config.cwd,
  env: {
    ...process.env,
    ...config.env,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";

child.stdout.on("data", chunk => {
  stdout += chunk.toString();
});
child.stderr.on("data", chunk => {
  stderr += chunk.toString();
});

child.stdin.write(config.prompt);
child.stdin.end();

const timeout = setTimeout(() => {
  child.kill("SIGTERM");
  setTimeout(() => {
    child.kill("SIGKILL");
  }, 2000).unref?.();
}, config.timeoutMs);
timeout.unref?.();

child.on("close", code => {
  clearTimeout(timeout);
  process.stdout.write(
    JSON.stringify({
      exitCode: code ?? 1,
      stderr,
      stdout,
    }),
  );
});
`

const repoRoot = resolve(import.meta.dir, '..')
const defaultOriginalPath = '/Users/apple/Downloads/claude-code-main'
function createDefaultPrompt(): string {
  return `Reply with exactly this token and no tools: HARE_API_PONG_${randomUUID()}`
}

function parseOptions(argv: string[]): Options {
  const getValue = (name: string): string | undefined => {
    const index = argv.indexOf(name)
    return index === -1 ? undefined : argv[index + 1]
  }

  return {
    includeBuilt: argv.includes('--built'),
    includeOriginal: argv.includes('--original'),
    originalPath:
      getValue('--original-path') ??
      process.env.KERNEL_DEEP_TEST_ORIGINAL ??
      defaultOriginalPath,
    prompt:
      getValue('--prompt') ??
      process.env.KERNEL_DEEP_TEST_PROMPT ??
      createDefaultPrompt(),
    timeoutMs: Number.parseInt(getValue('--timeout-ms') ?? '120000', 10),
  }
}

function printUsage(): void {
  console.log(`Usage: bun run scripts/kernel-deep-smoke.ts [--built] [--original] [--original-path <path>] [--prompt <text>]

Runs a live OpenAI-compatible headless smoke test without storing secrets.

Required env:
  KERNEL_DEEP_TEST_API_KEY or OPENAI_API_KEY
  KERNEL_DEEP_TEST_BASE_URL or OPENAI_BASE_URL
  KERNEL_DEEP_TEST_MODEL or OPENAI_MODEL

Optional:
  --built                 Also run dist/cli-bun.js and dist/cli-node.js.
  --original              Also run the reference checkout.
  --original-path <path>  Defaults to ${defaultOriginalPath}.
  KERNEL_DEEP_TEST_EFFORT Defaults to high; use this for gateways that reject xhigh.
  --timeout-ms <ms>       Defaults to 120000.`)
}

async function assertFile(path: string): Promise<void> {
  await access(path)
}

function getDeepEnv(): Record<string, string> {
  const apiKey = process.env.KERNEL_DEEP_TEST_API_KEY ?? process.env.OPENAI_API_KEY
  const baseUrl =
    process.env.KERNEL_DEEP_TEST_BASE_URL ?? process.env.OPENAI_BASE_URL
  const model = process.env.KERNEL_DEEP_TEST_MODEL ?? process.env.OPENAI_MODEL
  const effort = process.env.KERNEL_DEEP_TEST_EFFORT ?? 'high'

  if (!apiKey || !baseUrl || !model) {
    throw new Error(
      'Missing deep smoke env: set API key, base URL, and model via KERNEL_DEEP_TEST_* or OPENAI_* variables.',
    )
  }

  return {
    CLAUDE_CODE_USE_OPENAI: '1',
    CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: baseUrl,
    OPENAI_MODEL: model,
    OPENAI_DEFAULT_HAIKU_MODEL: model,
    OPENAI_DEFAULT_SONNET_MODEL: model,
    OPENAI_DEFAULT_OPUS_MODEL: model,
    CLAUDE_CODE_EFFORT_LEVEL: effort,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    NO_COLOR: '1',
  }
}

function commandForTarget(target: Target, model: string): string[] {
  const commonArgs = [
    '-p',
    '--disable-slash-commands',
    '--tools',
    '',
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-turns',
    '1',
    '--model',
    model,
    '--effort',
    process.env.KERNEL_DEEP_TEST_EFFORT ?? 'high',
  ]

  if (target.kind === 'built-bun') {
    return ['bun', 'dist/cli-bun.js', ...commonArgs]
  }
  if (target.kind === 'built-node') {
    return ['node', 'dist/cli-node.js', ...commonArgs]
  }
  return ['bun', 'run', 'scripts/dev.ts', ...commonArgs]
}

async function runTarget(
  target: Target,
  env: Record<string, string>,
  prompt: string,
  timeoutMs: number,
): Promise<RunResult> {
  if (target.kind === 'built-bun') {
    await assertFile(join(target.cwd, 'dist/cli-bun.js'))
  } else if (target.kind === 'built-node') {
    await assertFile(join(target.cwd, 'dist/cli-node.js'))
  } else {
    await assertFile(join(target.cwd, 'scripts/dev.ts'))
  }
  const command = commandForTarget(target, env.OPENAI_MODEL)
  const [binary, ...args] = command

  return await new Promise<RunResult>(resolveRun => {
    const proc = spawn('node', ['-e', NODE_RUNNER_SCRIPT], {
      cwd: target.cwd,
      env: {
        ...process.env,
        [NODE_RUNNER_CONFIG_ENV]: JSON.stringify({
          args,
          binary,
          cwd: target.cwd,
          env,
          prompt,
          timeoutMs,
        }),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let runnerStdout = ''
    let stderr = ''

    proc.stdout?.on('data', chunk => {
      runnerStdout += chunk.toString()
    })
    proc.stderr?.on('data', chunk => {
      stderr += chunk.toString()
    })

    proc.on('close', code => {
      if (code !== 0) {
        resolveRun({
          exitCode: code ?? 1,
          stderr,
          stdout: runnerStdout,
        })
        return
      }

      const parsed = JSON.parse(runnerStdout) as RunResult
      resolveRun({
        ...parsed,
        stderr: parsed.stderr || stderr,
      })
    })
  })
}

function assertSmokeResult(target: Target, result: RunResult): void {
  if (result.exitCode !== 0) {
    if (result.stdout.trim()) {
      console.log(result.stdout.trimEnd())
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trimEnd())
    }
    throw new Error(`${target.name} failed with exit code ${result.exitCode}`)
  }

  const hasResultLine = result.stdout
    .split('\n')
    .some(line => line.includes('"type":"result"') && line.includes('"success"'))
  if (!hasResultLine) {
    throw new Error(`${target.name} did not emit a successful result event`)
  }

  const lines = result.stdout.split('\n')
  const runtimeEnvelopeLines = lines.filter(line =>
    line.includes('"type":"kernel_runtime_event"'),
  )
  if (runtimeEnvelopeLines.length === 0) {
    return
  }

  const successResultLineIndex = lines.findIndex(
    line => line.includes('"type":"result"') && line.includes('"success"'),
  )
  const hasRuntimeSdkEnvelope = runtimeEnvelopeLines.some(line =>
    line.includes('"headless.sdk_message"'),
  )
  if (!hasRuntimeSdkEnvelope) {
    throw new Error(
      `${target.name} emitted runtime envelopes without headless SDK messages`,
    )
  }
  if (runtimeEnvelopeLines.some(line => line.includes('"turnId":""'))) {
    throw new Error(`${target.name} emitted an empty runtime turnId`)
  }
  if (
    successResultLineIndex !== -1 &&
    lines
      .slice(successResultLineIndex + 1)
      .some(
        line => line.includes('"turn.abort_requested"'),
      )
  ) {
    throw new Error(
      `${target.name} emitted a runtime abort after a successful result`,
    )
  }
  if (
    successResultLineIndex !== -1 &&
    lines
      .slice(successResultLineIndex + 1)
      .some(
        line =>
          line.includes('"turn.completed"') &&
          (line.includes('"stopReason":"shutdown"') ||
            line.includes('"stopReason":"aborted"')),
      )
  ) {
    throw new Error(
      `${target.name} overwrote successful turn completion with an abort reason`,
    )
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    return
  }

  const options = parseOptions(args)
  const env = getDeepEnv()
  const targets: Target[] = [
    {
      name: 'current-source',
      cwd: repoRoot,
      kind: 'source',
    },
  ]

  if (options.includeBuilt) {
    targets.push(
      {
        name: 'current-built-bun',
        cwd: repoRoot,
        kind: 'built-bun',
      },
      {
        name: 'current-built-node',
        cwd: repoRoot,
        kind: 'built-node',
      },
    )
  }

  if (options.includeOriginal) {
    targets.push({
      name: 'original-source',
      cwd: resolve(options.originalPath),
      kind: 'source',
    })
  }

  for (const target of targets) {
    console.log(`\n> Deep smoke: ${target.name}`)
    const result = await runTarget(target, env, options.prompt, options.timeoutMs)
    assertSmokeResult(target, result)
    console.log(`Deep smoke passed: ${target.name}`)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
