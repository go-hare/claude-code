import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const nodeRequire = createRequire(import.meta.url)

export const sharp = createSharp

export type ClipboardImageResult = {
  png: Buffer
  originalWidth: number
  originalHeight: number
  width: number
  height: number
}

interface NativeImageProcessor {
  processImage(input: Buffer): Promise<ImageProcessor>
  hasClipboardImage?: () => boolean
  readClipboardImage?: (
    maxWidth: number,
    maxHeight: number,
  ) => ClipboardImageResult | null
}

interface ImageProcessor {
  metadata(): { width: number; height: number; format: string }
  resize(
    width: number,
    height: number,
    options?: { fit?: string; withoutEnlargement?: boolean },
  ): ImageProcessor
  jpeg(quality?: number): ImageProcessor
  png(options?: {
    compressionLevel?: number
    palette?: boolean
    colors?: number
  }): ImageProcessor
  webp(quality?: number): ImageProcessor
  toBuffer(): Promise<Buffer>
}

interface SharpInstance {
  metadata(): Promise<{ width: number; height: number; format: string }>
  resize(
    width: number,
    height: number,
    options?: { fit?: string; withoutEnlargement?: boolean },
  ): SharpInstance
  jpeg(options?: { quality?: number }): SharpInstance
  png(options?: {
    compressionLevel?: number
    palette?: boolean
    colors?: number
  }): SharpInstance
  webp(options?: { quality?: number }): SharpInstance
  toBuffer(): Promise<Buffer>
}

let cachedNativeModule: NativeImageProcessor | null = null
let nativeLoadAttempted = false

function loadNativeModule(): NativeImageProcessor | null {
  if (nativeLoadAttempted) {
    return cachedNativeModule
  }
  nativeLoadAttempted = true

  const platform = process.platform
  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
    return null
  }

  const platformDir = `${process.arch}-${platform}`
  const explicitPath = process.env.IMAGE_PROCESSOR_NODE_PATH
  const sourceDir = dirname(fileURLToPath(import.meta.url))
  const candidates = explicitPath
    ? [explicitPath]
    : [
        `./vendor/image-processor/${platformDir}/image-processor.node`,
        `../vendor/image-processor/${platformDir}/image-processor.node`,
        join(
          sourceDir,
          '..',
          '..',
          '..',
          'vendor',
          'image-processor',
          platformDir,
          'image-processor.node',
        ),
        join(
          process.cwd(),
          'vendor',
          'image-processor',
          platformDir,
          'image-processor.node',
        ),
      ]

  for (const candidate of candidates) {
    try {
      if (!explicitPath && candidate.startsWith('/') && !existsSync(candidate)) {
        continue
      }
      cachedNativeModule = nodeRequire(candidate) as NativeImageProcessor
      return cachedNativeModule
    } catch {
      // Try the next source/bundled/package layout.
    }
  }

  return null
}

export function getNativeModule(): NativeImageProcessor | null {
  return loadNativeModule()
}

function createSharp(input: Buffer): SharpInstance {
  const nativeModule = loadNativeModule()
  if (!nativeModule) {
    throw new Error('Native image processor module not available')
  }
  const processorFactory = nativeModule.processImage

  let processorPromise: Promise<ImageProcessor> | null = null
  const operations: Array<(proc: ImageProcessor) => void> = []
  let appliedOperationsCount = 0

  function ensureProcessor(): Promise<ImageProcessor> {
    processorPromise ??= processorFactory(input)
    return processorPromise
  }

  function applyPendingOperations(proc: ImageProcessor): void {
    for (let i = appliedOperationsCount; i < operations.length; i++) {
      operations[i]?.(proc)
    }
    appliedOperationsCount = operations.length
  }

  const instance: SharpInstance = {
    async metadata() {
      const proc = await ensureProcessor()
      return proc.metadata()
    },

    resize(width, height, options) {
      operations.push(proc => {
        proc.resize(width, height, options)
      })
      return instance
    },

    jpeg(options) {
      operations.push(proc => {
        proc.jpeg(options?.quality)
      })
      return instance
    },

    png(options) {
      operations.push(proc => {
        proc.png(options)
      })
      return instance
    },

    webp(options) {
      operations.push(proc => {
        proc.webp(options?.quality)
      })
      return instance
    },

    async toBuffer() {
      const proc = await ensureProcessor()
      applyPendingOperations(proc)
      return proc.toBuffer()
    },
  }

  return instance
}

export default createSharp
