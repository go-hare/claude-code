import { spawn } from "node:child_process"

const scripts = process.argv.slice(2)
if (scripts.length === 0) {
  process.exit(0)
}

function runScript(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      shell: false,
    })

    child.on("error", (error) => {
      console.error(`[run-parallel] Failed to start ${script}:`, error)
      resolve({ script, code: 1 })
    })

    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`[run-parallel] ${script} exited with signal ${signal}`)
        resolve({ script, code: 1 })
        return
      }
      resolve({ script, code: code ?? 0 })
    })
  })
}

const results = await Promise.all(scripts.map(runScript))
const failures = results.filter((result) => result.code !== 0)

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(
      `[run-parallel] ${failure.script} exited with code ${failure.code}`,
    )
  }
  process.exitCode = 1
}
