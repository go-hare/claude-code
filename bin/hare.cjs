#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const { spawn } = require("child_process")
const {
  getInstalledBinaryPath,
  getTargetInfoByRuntime,
} = require("../scripts/release-assets.cjs")

const projectRoot = path.resolve(__dirname, "..")
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
)

function spawnAndMirror(command, args, options) {
  const child = spawn(command, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
  })

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })

  child.on("error", error => {
    console.error(`[hare-launcher] Failed to start ${command}: ${error.message}`)
    process.exit(1)
  })
}

function run() {
  const args = process.argv.slice(2)
  const targetInfo = getTargetInfoByRuntime(process.platform, process.arch)
  if (targetInfo) {
    const nativeBinary = getInstalledBinaryPath(projectRoot, packageJson, targetInfo)
    if (fs.existsSync(nativeBinary)) {
      spawnAndMirror(nativeBinary, args, {
        cwd: path.dirname(nativeBinary),
      })
      return
    }
  }

  const distEntry = path.join(projectRoot, "dist", "cli-node.js")
  if (fs.existsSync(distEntry)) {
    spawnAndMirror(process.execPath, [distEntry, ...args], { cwd: projectRoot })
    return
  }

  const srcEntry = path.join(projectRoot, "src", "entrypoints", "cli.tsx")
  if (fs.existsSync(srcEntry)) {
    spawnAndMirror("bun", ["run", srcEntry, ...args], { cwd: projectRoot })
    return
  }

  console.error(
    "[hare-launcher] No native binary or JS fallback found. Reinstall from a tagged release or run `bun run build` first.",
  )
  process.exit(1)
}

run()
