#!/usr/bin/env node

const { existsSync } = require("node:fs")
const { spawnSync } = require("node:child_process")
const path = require("node:path")

const scriptPath = path.join(__dirname, "dist", "scripts", "postinstall.js")

if (!existsSync(scriptPath)) {
  console.log(
    "[mcp-chrome-bridge] dist/scripts/postinstall.js not found, skipping workspace postinstall.",
  )
  process.exit(0)
}

const result = spawnSync(process.execPath, [scriptPath], {
  stdio: "inherit",
})

if (result.signal) {
  process.kill(process.pid, result.signal)
}

process.exit(result.status ?? 1)
