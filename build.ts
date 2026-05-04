import { readdir, readFile, writeFile, cp } from 'fs/promises'
import { join } from 'path'
import { getMacroDefines } from './scripts/defines.ts'
import { DEFAULT_BUILD_FEATURES } from './scripts/defines.ts'

const outdir = 'dist'
const kernelBundleDir = join(outdir, 'kernel-bundle')

// Step 1: Clean output directory
const { existsSync, rmSync } = await import('fs')
rmSync(outdir, { recursive: true, force: true })

// Collect FEATURE_* env vars → Bun.build features
const envFeatures = Object.keys(process.env)
  .filter(k => k.startsWith('FEATURE_'))
  .map(k => k.replace('FEATURE_', ''))
const features = [...new Set([...DEFAULT_BUILD_FEATURES, ...envFeatures])]
const define = getMacroDefines()
const buildRoot = process.cwd()

async function buildEntrypoints(
  entrypoints: string[],
  options: { outdir: string; splitting: boolean },
): Promise<number> {
  const result = await Bun.build({
    entrypoints,
    outdir: options.outdir,
    root: buildRoot,
    target: 'bun',
    splitting: options.splitting,
    define,
    features,
  })

  if (!result.success) {
    console.error(`Build failed for ${entrypoints.join(', ')}:`)
    for (const log of result.logs) {
      console.error(log)
    }
    process.exit(1)
  }

  return result.outputs.length
}

async function collectJsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async entry => {
      const entryPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        return collectJsFiles(entryPath)
      }
      return entry.name.endsWith('.js') ? [entryPath] : []
    }),
  )
  return files.flat()
}

// Step 2: Bundle the interactive CLI separately so kernel entrypoints do not
// leak runtime-only shared chunks into the published CLI graph. Preserve the
// src/entrypoints directory shape because current runtime code still resolves
// several paths relative to that layout.
const cliOutputCount = await buildEntrypoints(['src/entrypoints/cli.tsx'], {
  outdir,
  splitting: true,
})
const kernelOutputCount = await buildEntrypoints(
  ['src/entrypoints/kernel.ts', 'src/entrypoints/kernel-runtime.ts'],
  {
    outdir: kernelBundleDir,
    splitting: true,
  },
)

// Step 3: Post-process — replace Bun-only `import.meta.require` with Node.js compatible version
const files = await collectJsFiles(outdir)
const IMPORT_META_REQUIRE = 'var __require = import.meta.require;'
const COMPAT_REQUIRE = `var __require = typeof import.meta.require === "function" ? import.meta.require : (await import("module")).createRequire(import.meta.url);`

let patched = 0
for (const file of files) {
  const content = await readFile(file, 'utf-8')
  if (content.includes(IMPORT_META_REQUIRE)) {
    await writeFile(
      file,
      content.replace(IMPORT_META_REQUIRE, COMPAT_REQUIRE),
    )
    patched++
  }
}

// Also patch unguarded globalThis.Bun destructuring from third-party deps
// (e.g. @anthropic-ai/sandbox-runtime) so Node.js doesn't crash at import time.
let bunPatched = 0
const BUN_DESTRUCTURE = /var \{([^}]+)\} = globalThis\.Bun;?/g
const BUN_DESTRUCTURE_SAFE = 'var {$1} = typeof globalThis.Bun !== "undefined" ? globalThis.Bun : {};'
for (const file of files) {
  const content = await readFile(file, 'utf-8')
  if (BUN_DESTRUCTURE.test(content)) {
    await writeFile(
      file,
      content.replace(BUN_DESTRUCTURE, BUN_DESTRUCTURE_SAFE),
    )
    bunPatched++
  }
}
BUN_DESTRUCTURE.lastIndex = 0

console.log(
  `Bundled ${cliOutputCount + kernelOutputCount} files to ${outdir}/ (patched ${patched} for import.meta.require, ${bunPatched} for Bun destructure)`,
)

// Step 4: Copy native .node addon files
for (const nativeVendor of [
  'audio-capture',
  'computer-use-input',
  'computer-use-swift',
  'image-processor',
  'url-handler',
]) {
  const vendorDir = join(outdir, 'vendor', nativeVendor)
  await cp(join('vendor', nativeVendor), vendorDir, { recursive: true })
  console.log(`Copied vendor/${nativeVendor}/ → ${vendorDir}/`)
}

// Step 4.1: Copy the bundled ripgrep binary for published Node installs
const ripgrepVendorSrc = join('src', 'utils', 'vendor', 'ripgrep')
if (existsSync(ripgrepVendorSrc)) {
  const ripgrepVendorDir = join(outdir, 'vendor', 'ripgrep')
  await cp(ripgrepVendorSrc, ripgrepVendorDir, { recursive: true })
  console.log(`Copied ${ripgrepVendorSrc}/ → ${ripgrepVendorDir}/`)
} else {
  console.warn(`Skipped copying ${ripgrepVendorSrc}/ because it does not exist`)
}

// Step 5: Generate executable entry points
const cliBun = join(outdir, 'cli-bun.js')
const cliNode = join(outdir, 'cli-node.js')
const kernelRuntime = join(outdir, 'kernel-runtime.js')
const kernelEntry = join(outdir, 'kernel.js')

await writeFile(cliBun, '#!/usr/bin/env bun\nimport "./src/entrypoints/cli.js"\n')

await writeFile(cliNode, '#!/usr/bin/env node\nimport "./src/entrypoints/cli.js"\n')

await writeFile(
  kernelEntry,
  'export * from "./kernel-bundle/src/entrypoints/kernel.js"\n',
)

await writeFile(
  kernelRuntime,
  '#!/usr/bin/env bun\nimport "./kernel-bundle/src/entrypoints/kernel-runtime.js"\n',
)

// Make both executable
const { chmodSync } = await import('fs')
chmodSync(cliBun, 0o755)
chmodSync(cliNode, 0o755)
chmodSync(kernelRuntime, 0o755)

console.log(
  `Generated ${cliBun} (shebang: bun), ${cliNode} (shebang: node), and ${kernelRuntime} (shebang: bun)`,
)
