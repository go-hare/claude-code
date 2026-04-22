#!/usr/bin/env node

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")
const {
  getArchiveBaseUrl,
  getArchiveName,
  getBinaryBaseName,
  getInstalledBinaryPath,
  getNativeInstallDir,
  getTargetInfoByRuntime,
} = require("./release-assets.cjs")

const { setDefaultResultOrder } = require("node:dns")
try {
  setDefaultResultOrder("ipv4first")
} catch {
  // ignore
}

const scriptDir = path.dirname(__filename)
const projectRoot = path.resolve(scriptDir, "..")
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
)
const binaryBaseName = getBinaryBaseName(packageJson)

const force = process.argv.includes("--force")
const dryRun = process.argv.includes("--dry-run")
const skipDownload =
  process.env.CLAUDE_CODE_SKIP_BINARY_DOWNLOAD === "1" ||
  process.env.npm_config_ignore_scripts === "true"

function fetchRelease(url) {
  if (
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy
  ) {
    const undici = require("undici")
    return undici.fetch(url, {
      redirect: "follow",
      dispatcher: new undici.EnvHttpProxyAgent(),
    })
  }
  return fetch(url, { redirect: "follow" })
}

async function downloadUrlToBuffer(url) {
  const response = await fetchRelease(url)
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

function tryPowerShellDownload(url, dest) {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Invoke-WebRequest -Uri '${url.replace(/'/g, "''")}' -OutFile '${dest.replace(/'/g, "''")}' -UseBasicParsing`,
    ],
    { stdio: "pipe", windowsHide: true },
  )
  return result.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 0
}

function tryCurlDownload(url, dest) {
  const curl = process.platform === "win32" ? "curl.exe" : "curl"
  const result = spawnSync(curl, ["-fsSL", "-L", "--fail", "-o", dest, url], {
    stdio: "pipe",
    windowsHide: true,
  })
  return result.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 0
}

async function downloadUrlToBufferWithFallback(url) {
  let firstError
  try {
    return await downloadUrlToBuffer(url)
  } catch (error) {
    firstError = error
  }

  const tmpRoot = path.join(os.tmpdir(), `${binaryBaseName}-bin-${process.pid}-${Date.now()}`)
  const tmpFile = path.join(tmpRoot, "archive")
  fs.mkdirSync(tmpRoot, { recursive: true })
  try {
    if (process.platform === "win32" && tryPowerShellDownload(url, tmpFile)) {
      return fs.readFileSync(tmpFile)
    }
    if (tryCurlDownload(url, tmpFile)) {
      return fs.readFileSync(tmpFile)
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }

  throw firstError
}

function extractZip(buffer, destinationDir) {
  const { unzipSync } = require("fflate")
  const files = unzipSync(new Uint8Array(buffer))
  fs.rmSync(destinationDir, { recursive: true, force: true })
  fs.mkdirSync(destinationDir, { recursive: true })

  for (const [relativePath, content] of Object.entries(files)) {
    const normalized = relativePath.replace(/\\/g, "/")
    const fullPath = path.join(destinationDir, normalized)
    if (normalized.endsWith("/")) {
      fs.mkdirSync(fullPath, { recursive: true })
      continue
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, Buffer.from(content))
  }
}

function extractTarGz(buffer, destinationDir, archiveName) {
  const tmpRoot = path.join(os.tmpdir(), `${binaryBaseName}-bin-${process.pid}-${Date.now()}`)
  const archivePath = path.join(tmpRoot, archiveName)
  fs.rmSync(destinationDir, { recursive: true, force: true })
  fs.mkdirSync(destinationDir, { recursive: true })
  fs.mkdirSync(tmpRoot, { recursive: true })

  try {
    fs.writeFileSync(archivePath, buffer)
    const result = spawnSync("tar", ["-xzf", archivePath, "-C", destinationDir], {
      stdio: "pipe",
      windowsHide: true,
    })
    if (result.status !== 0) {
      throw new Error(result.stderr?.toString().trim() || "tar extraction failed")
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
}

async function main() {
  if (skipDownload) {
    console.log("[cli-binary] Skipping native binary download (env override).")
    return
  }

  const targetInfo = getTargetInfoByRuntime(process.platform, process.arch)
  if (!targetInfo) {
    console.warn(
      `[cli-binary] No packaged binary target for ${process.platform}-${process.arch}, skipping.`,
    )
    return
  }

  const binaryPath = getInstalledBinaryPath(projectRoot, packageJson, targetInfo)
  const nativeInstallDir = getNativeInstallDir(projectRoot, targetInfo)
  const archiveName = getArchiveName(binaryBaseName, targetInfo)
  const archiveBaseUrl = getArchiveBaseUrl(packageJson)
  const downloadUrl = `${archiveBaseUrl}/${archiveName}`

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          target: targetInfo.compileTarget,
          archiveName,
          downloadUrl,
          nativeInstallDir,
          binaryPath,
        },
        null,
        2,
      ),
    )
    return
  }

  if (!force && fs.existsSync(binaryPath) && fs.statSync(binaryPath).size > 0) {
    console.log(`[cli-binary] Binary already exists at ${binaryPath}, skipping.`)
    return
  }

  try {
    console.log(`[cli-binary] Downloading ${archiveName}...`)
    const archive = await downloadUrlToBufferWithFallback(downloadUrl)
    console.log(
      `[cli-binary] Downloaded ${Math.round(archive.length / 1024)} KB from ${downloadUrl}`,
    )
    if (targetInfo.archiveExt === "zip") {
      extractZip(archive, nativeInstallDir)
    } else {
      extractTarGz(archive, nativeInstallDir, archiveName)
    }
    if (process.platform !== "win32" && fs.existsSync(binaryPath)) {
      fs.chmodSync(binaryPath, 0o755)
    }
    console.log(`[cli-binary] Installed native binary to ${binaryPath}`)
  } catch (error) {
    console.warn(
      `[cli-binary] Binary download skipped: ${error instanceof Error ? error.message : error}`,
    )
  }
}

main().catch(error => {
  console.warn(
    `[cli-binary] Binary download skipped: ${error instanceof Error ? error.message : error}`,
  )
})
