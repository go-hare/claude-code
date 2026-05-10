import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const nodeRequire = createRequire(import.meta.url)

type UrlHandlerNapi = {
  waitForUrlEvent(timeoutMs: number): string | null
}

let cachedModule: UrlHandlerNapi | null = null
let loadAttempted = false

export async function waitForUrlEvent(
  timeoutMs: number,
): Promise<string | null> {
  const mod = loadModule()
  return mod?.waitForUrlEvent(timeoutMs) ?? null
}

function loadModule(): UrlHandlerNapi | null {
  if (loadAttempted) {
    return cachedModule
  }
  loadAttempted = true

  if (process.platform !== 'darwin') {
    return null
  }

  const platformDir = `${process.arch}-darwin`
  const explicitPath = process.env.URL_HANDLER_NODE_PATH
  const sourceDir = dirname(fileURLToPath(import.meta.url))
  const candidates = explicitPath
    ? [explicitPath]
    : [
        `./vendor/url-handler/${platformDir}/url-handler.node`,
        `../vendor/url-handler/${platformDir}/url-handler.node`,
        join(
          sourceDir,
          '..',
          '..',
          '..',
          'vendor',
          'url-handler',
          platformDir,
          'url-handler.node',
        ),
        join(
          process.cwd(),
          'vendor',
          'url-handler',
          platformDir,
          'url-handler.node',
        ),
      ]

  for (const candidate of candidates) {
    try {
      if (!explicitPath && candidate.startsWith('/') && !existsSync(candidate)) {
        continue
      }
      cachedModule = nodeRequire(candidate) as UrlHandlerNapi
      return cachedModule
    } catch {
      // Try the next source/bundled/package layout.
    }
  }

  return null
}
