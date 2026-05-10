import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getNativeModule, sharp } from '../index.js'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
)

function currentPlatformNativePath(): string {
  return join(
    import.meta.dir,
    '..',
    '..',
    '..',
    '..',
    'vendor',
    'image-processor',
    `${process.arch}-${process.platform}`,
    'image-processor.node',
  )
}

describe('image-processor-napi', () => {
  test('loads the native image processor when a platform binary is present', () => {
    if (!existsSync(currentPlatformNativePath())) {
      return
    }

    expect(getNativeModule()?.processImage).toBeFunction()
  })

  test('reads image metadata through the native processor export', async () => {
    const metadata = await sharp(onePixelPng).metadata()

    expect(metadata.width).toBe(1)
    expect(metadata.height).toBe(1)
  })
})
