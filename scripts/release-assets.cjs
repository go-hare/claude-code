const path = require("path")

const TARGETS = [
  {
    id: "windows-x64",
    compileTarget: "bun-windows-x64-baseline",
    platform: "win32",
    arch: "x64",
    archiveExt: "zip",
    audioCaptureDir: "x64-win32",
  },
  {
    id: "windows-arm64",
    compileTarget: "bun-windows-arm64",
    platform: "win32",
    arch: "arm64",
    archiveExt: "zip",
    audioCaptureDir: "arm64-win32",
  },
  {
    id: "darwin-x64",
    compileTarget: "bun-darwin-x64",
    platform: "darwin",
    arch: "x64",
    archiveExt: "tar.gz",
    audioCaptureDir: "x64-darwin",
  },
  {
    id: "darwin-arm64",
    compileTarget: "bun-darwin-arm64",
    platform: "darwin",
    arch: "arm64",
    archiveExt: "tar.gz",
    audioCaptureDir: "arm64-darwin",
  },
  {
    id: "linux-x64-baseline",
    compileTarget: "bun-linux-x64-baseline",
    platform: "linux",
    arch: "x64",
    archiveExt: "tar.gz",
    audioCaptureDir: "x64-linux",
  },
  {
    id: "linux-arm64",
    compileTarget: "bun-linux-arm64",
    platform: "linux",
    arch: "arm64",
    archiveExt: "tar.gz",
    audioCaptureDir: "arm64-linux",
  },
]

function sanitizeBinaryBaseName(name) {
  return String(name || "hare")
    .replace(/^@/, "")
    .replace(/[\\/]/g, "-")
}

function getBinaryBaseName(packageJson) {
  return sanitizeBinaryBaseName(
    process.env.CLAUDE_CODE_BINARY_BASENAME ||
      packageJson.binaryName ||
      packageJson.name ||
      "hare",
  )
}

function getTargetInfoByCompileTarget(compileTarget) {
  return TARGETS.find(target => target.compileTarget === compileTarget) || null
}

function getTargetInfoByRuntime(platform, arch) {
  return (
    TARGETS.find(target => target.platform === platform && target.arch === arch) ||
    null
  )
}

function getExecutableFileName(binaryBaseName, targetInfo) {
  return targetInfo.platform === "win32"
    ? `${binaryBaseName}.exe`
    : binaryBaseName
}

function getArchiveName(binaryBaseName, targetInfo) {
  return `${binaryBaseName}-${targetInfo.id}.${targetInfo.archiveExt}`
}

function getArchiveBaseUrl(packageJson) {
  const explicit = process.env.CLAUDE_CODE_BINARY_RELEASE_BASE
  if (explicit) {
    return explicit.replace(/\/$/, "")
  }

  const repositoryUrl = String(packageJson?.repository?.url || "")
  const normalized = repositoryUrl
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
  const match = normalized.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i,
  )
  if (!match) {
    throw new Error(
      `Unsupported repository URL for binary downloads: ${repositoryUrl}`,
    )
  }

  return `https://github.com/${match[1]}/${match[2]}/releases/download/v${packageJson.version}`
}

function getNativeInstallDir(projectRoot, targetInfo) {
  return path.join(projectRoot, "bin", "native", targetInfo.id)
}

function getInstalledBinaryPath(projectRoot, packageJson, targetInfo) {
  const binaryBaseName = getBinaryBaseName(packageJson)
  return path.join(
    getNativeInstallDir(projectRoot, targetInfo),
    getExecutableFileName(binaryBaseName, targetInfo),
  )
}

module.exports = {
  TARGETS,
  getArchiveBaseUrl,
  getArchiveName,
  getBinaryBaseName,
  getExecutableFileName,
  getInstalledBinaryPath,
  getNativeInstallDir,
  getTargetInfoByCompileTarget,
  getTargetInfoByRuntime,
}
