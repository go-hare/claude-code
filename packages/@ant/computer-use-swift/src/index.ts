import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type {
  AppInfo,
  DisplayGeometry,
  InstalledApp,
  PrepareDisplayResult,
  ResolvePrepareCaptureResult,
  RunningApp,
  ScreenshotResult,
  WindowDisplayInfo,
} from './types.js'

const nodeRequire = createRequire(import.meta.url)

type DisplayGeometry = {
  displayId: number
  width: number
  height: number
  scaleFactor: number
  originX: number
  originY: number
  label?: string
  isPrimary?: boolean
}

type AppInfo = {
  bundleId: string
  displayName: string
}

type InstalledApp = AppInfo & {
  path: string
  iconDataUrl?: string
}

type RunningApp = AppInfo & {
  pid?: number
}

type ScreenshotResult = {
  base64: string
  width: number
  height: number
  displayWidth: number
  displayHeight: number
  originX: number
  originY: number
  displayId?: number
  accessibilityText?: string
}

type ResolvePrepareCaptureResult = ScreenshotResult & {
  hidden: string[]
  activated?: string
  displayId: number
  captureError?: string
}

type DisplayAPI = {
  getSize(displayId?: number): DisplayGeometry
  listAll(): DisplayGeometry[]
}

type AppsAPI = {
  prepareDisplay(
    allowlistBundleIds: string[],
    surrogateHost: string,
    displayId?: number,
  ): Promise<{ activated: string; hidden: string[] }>
  previewHideSet(bundleIds: string[], displayId?: number): Promise<AppInfo[]>
  findWindowDisplays(
    bundleIds: string[],
  ): Promise<Array<{ bundleId: string; displayIds: number[] }>>
  appUnderPoint(x: number, y: number): Promise<AppInfo | null>
  listInstalled(): Promise<InstalledApp[]>
  iconDataUrl(path: string): string | null
  listRunning(): RunningApp[]
  open(bundleId: string): Promise<void>
  unhide(bundleIds: string[]): Promise<void>
}

type ScreenshotAPI = {
  captureExcluding(
    allowedBundleIds: string[],
    quality?: number,
    targetW?: number,
    targetH?: number,
    displayId?: number,
  ): Promise<ScreenshotResult>
  captureRegion(
    allowedBundleIds: string[],
    x: number,
    y: number,
    w: number,
    h: number,
    outW?: number,
    outH?: number,
    quality?: number,
    displayId?: number,
  ): Promise<ScreenshotResult>
  captureWindowTarget(titleOrHwnd: string | number): ScreenshotResult | null
}

type NativeComputerUse = {
  apps: AppsAPI
  display: DisplayAPI
  screenshot: ScreenshotAPI
  resolvePrepareCapture(
    allowedBundleIds: string[],
    surrogateHost: string,
    quality: number,
    targetW: number,
    targetH: number,
    displayId?: number,
  ): Promise<ResolvePrepareCaptureResult>
  _drainMainRunLoop?: () => void
  hotkey?: unknown
  tcc?: unknown
}

type NativeModule = {
  computerUse?: NativeComputerUse
}

let cachedComputerUse: NativeComputerUse | null = null
let loadAttempted = false

function loadNativeComputerUse(): NativeComputerUse | null {
  if (loadAttempted) {
    return cachedComputerUse
  }
  loadAttempted = true

  if (process.platform !== 'darwin') {
    return null
  }

  const platformDir = `${process.arch}-darwin`
  const explicitPath = process.env.COMPUTER_USE_SWIFT_NODE_PATH
  const sourceDir = dirname(fileURLToPath(import.meta.url))
  const candidates = explicitPath
    ? [explicitPath]
    : [
        `./vendor/computer-use-swift/${platformDir}/computer_use.node`,
        `../vendor/computer-use-swift/${platformDir}/computer_use.node`,
        join(
          sourceDir,
          '..',
          '..',
          '..',
          '..',
          'vendor',
          'computer-use-swift',
          platformDir,
          'computer_use.node',
        ),
        join(
          process.cwd(),
          'vendor',
          'computer-use-swift',
          platformDir,
          'computer_use.node',
        ),
      ]

  for (const candidate of candidates) {
    try {
      if (!explicitPath && candidate.startsWith('/') && !existsSync(candidate)) {
        continue
      }
      const native = nodeRequire(candidate) as NativeModule
      cachedComputerUse = native.computerUse ?? (native as unknown as NativeComputerUse)
      return cachedComputerUse
    } catch {
      // Try the next source/bundled/package layout.
    }
  }

  return null
}

function requireNativeComputerUse(): NativeComputerUse {
  const native = loadNativeComputerUse()
  if (!native) {
    throw new Error('@ant/computer-use-swift native module is not available')
  }
  return native
}

export class ComputerUseAPI {
  declare apps: AppsAPI
  declare display: DisplayAPI
  declare screenshot: ScreenshotAPI
  declare resolvePrepareCapture: NativeComputerUse['resolvePrepareCapture']
  declare _drainMainRunLoop?: () => void
  declare hotkey?: unknown
  declare tcc?: unknown

  constructor() {
    Object.assign(this, requireNativeComputerUse())
  }
}
