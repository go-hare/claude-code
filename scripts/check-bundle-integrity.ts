#!/usr/bin/env bun

import { readdir, readFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

type FindingType =
  | 'broken-chunk-ref'
  | 'third-party-require'
  | 'third-party-import'
  | 'third-party-node-require'
  | 'bun-runtime-only'

interface Finding {
  type: FindingType
  severity: 'error' | 'warning'
  file: string
  line: number
  moduleName: string
  snippet: string
}

const NODE_BUILTINS = new Set([
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
])

const NODE_RUNTIME_MODULES = new Set(['undici'])
const BUN_MODULES = new Set(['bun', 'bun:ffi', 'bun:sqlite', 'bun:test'])
const NATIVE_FRAMEWORKS = new Set([
  'AppKit',
  'CoreGraphics',
  'Foundation',
  'UIKit',
])

const STATIC_IMPORT_RE =
  /(?:from\s+|import\s*)["'](\.\/[^"']+\.js)["']/g
const REQUIRE_RE = /__require\(["']([^"']+)["']\)/g
const DYNAMIC_IMPORT_RE = /import\(["']([^"']+)["']\)/g
const NODE_REQUIRE_RE = /nodeRequire\(["']([^"']+)["']\)/g

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(
  await readFile(join(repoRoot, 'package.json'), 'utf8'),
) as {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const PACKAGE_DEPS = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
])

async function main(): Promise<void> {
  const distDir = resolve(process.argv[2] ?? './dist')
  const files = await readBundleFiles(distDir)
  const fileSet = new Set(files)
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = join(distDir, file)
    const content = await readFile(filePath, 'utf8')
    const lines = content.split('\n')

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const lineNumber = index + 1

      collectStaticImportFindings(findings, fileSet, file, line, lineNumber)
      collectModuleFindings(findings, file, line, lineNumber, REQUIRE_RE, {
        type: 'third-party-require',
        bunType: 'bun-runtime-only',
      })
      collectModuleFindings(
        findings,
        file,
        line,
        lineNumber,
        DYNAMIC_IMPORT_RE,
        {
          type: 'third-party-import',
          bunType: 'bun-runtime-only',
          skipRelative: true,
        },
      )
      collectModuleFindings(findings, file, line, lineNumber, NODE_REQUIRE_RE, {
        type: 'third-party-node-require',
        bunType: 'bun-runtime-only',
      })
    }
  }

  printSummary(findings)

  const errors = findings.filter(finding => finding.severity === 'error')
  process.exit(errors.length > 0 ? 1 : 0)
}

async function readBundleFiles(distDir: string): Promise<string[]> {
  try {
    return (await readdir(distDir)).filter(file => file.endsWith('.js'))
  } catch {
    console.error(`Unable to read bundle directory: ${distDir}`)
    console.error('Run `bun run build` before `bun run check:bundle`.')
    process.exit(1)
  }
}

function collectStaticImportFindings(
  findings: Finding[],
  fileSet: Set<string>,
  file: string,
  line: string,
  lineNumber: number,
): void {
  for (const match of line.matchAll(STATIC_IMPORT_RE)) {
    const moduleName = match[1]
    const refFile = moduleName.replace(/^\.\//, '')

    if (!fileSet.has(refFile)) {
      findings.push({
        type: 'broken-chunk-ref',
        severity: 'error',
        file,
        line: lineNumber,
        moduleName,
        snippet: line.trim().slice(0, 120),
      })
    }
  }
}

function collectModuleFindings(
  findings: Finding[],
  file: string,
  line: string,
  lineNumber: number,
  pattern: RegExp,
  options: {
    type: Exclude<FindingType, 'broken-chunk-ref' | 'bun-runtime-only'>
    bunType: 'bun-runtime-only'
    skipRelative?: boolean
  },
): void {
  for (const match of line.matchAll(pattern)) {
    const moduleName = match[1]

    if (options.skipRelative && isRelativeModule(moduleName)) {
      continue
    }

    if (isAllowedRuntimeModule(moduleName)) {
      continue
    }

    if (BUN_MODULES.has(moduleName)) {
      findings.push({
        type: options.bunType,
        severity: 'warning',
        file,
        line: lineNumber,
        moduleName,
        snippet: line.trim().slice(0, 120),
      })
      continue
    }

    findings.push({
      type: options.type,
      severity: 'error',
      file,
      line: lineNumber,
      moduleName,
      snippet: line.trim().slice(0, 120),
    })
  }
}

function isRelativeModule(moduleName: string): boolean {
  return moduleName.startsWith('./') || moduleName.startsWith('../')
}

function isAllowedRuntimeModule(moduleName: string): boolean {
  return (
    moduleName.startsWith('node:') ||
    NODE_BUILTINS.has(moduleName) ||
    NODE_RUNTIME_MODULES.has(moduleName) ||
    NATIVE_FRAMEWORKS.has(moduleName) ||
    PACKAGE_DEPS.has(getPackageName(moduleName))
  )
}

function getPackageName(moduleName: string): string {
  if (moduleName.startsWith('@')) {
    return moduleName.split('/').slice(0, 2).join('/')
  }
  return moduleName.split('/')[0]
}

function printSummary(findings: Finding[]): void {
  const errors = findings.filter(finding => finding.severity === 'error')
  const warnings = findings.filter(finding => finding.severity === 'warning')

  printGroup(
    'Broken chunk references',
    findings.filter(finding => finding.type === 'broken-chunk-ref'),
  )
  printGroupedByModule(
    'Third-party __require() calls',
    findings.filter(finding => finding.type === 'third-party-require'),
  )
  printGroupedByModule(
    'Third-party dynamic import() calls',
    findings.filter(finding => finding.type === 'third-party-import'),
  )
  printGroupedByModule(
    'Third-party nodeRequire() calls',
    findings.filter(finding => finding.type === 'third-party-node-require'),
  )
  printGroupedByModule(
    'Bun-only runtime modules',
    findings.filter(finding => finding.type === 'bun-runtime-only'),
  )

  if (findings.length === 0) {
    console.log('Bundle integrity check passed.')
    return
  }

  console.log(`${errors.length} errors, ${warnings.length} warnings found.`)
}

function printGroup(title: string, findings: Finding[]): void {
  if (findings.length === 0) {
    return
  }

  console.log(`${title}:`)
  for (const finding of findings) {
    console.log(`  ${finding.file}:${finding.line} ${finding.moduleName}`)
  }
  console.log()
}

function printGroupedByModule(title: string, findings: Finding[]): void {
  if (findings.length === 0) {
    return
  }

  console.log(`${title}:`)
  for (const [moduleName, items] of groupByModule(findings)) {
    console.log(`  ${moduleName} (${items.length})`)
    for (const item of items.slice(0, 5)) {
      console.log(`    ${item.file}:${item.line}`)
    }
    if (items.length > 5) {
      console.log(`    ... ${items.length - 5} more`)
    }
  }
  console.log()
}

function groupByModule(findings: Finding[]): Map<string, Finding[]> {
  const grouped = new Map<string, Finding[]>()

  for (const finding of findings) {
    const items = grouped.get(finding.moduleName) ?? []
    items.push(finding)
    grouped.set(finding.moduleName, items)
  }

  return new Map(
    [...grouped.entries()].sort((left, right) => {
      return right[1].length - left[1].length
    }),
  )
}

await main()
