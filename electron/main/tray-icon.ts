import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage, type NativeImage } from 'electron'

import type { TrayStatus } from '../../shared/settings'

const STATUS_COLOR: Record<TrayStatus, [number, number, number]> = {
  green: [34, 197, 94], // --color-success
  yellow: [245, 158, 11], // --color-warning
  gray: [148, 163, 184], // --color-text-muted
  red: [239, 68, 68] // --color-danger
}

function resolveAssetPath(): string | null {
  try {
    const candidates = [
      join(app.getAppPath(), 'public/images/goblin_assets/coin_badge_1.png'),
      join(app.getAppPath(), 'build/icon.png'),
      join(import.meta.dirname, '../../public/images/goblin_assets/coin_badge_1.png'),
      join(import.meta.dirname, '../../build/icon.png'),
      join(process.resourcesPath, 'icon.png')
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
  } catch {
    // ignore during early init
  }
  return null
}

const iconCache = new Map<TrayStatus, NativeImage>()

export function getTrayIcon(status: TrayStatus): NativeImage {
  const cached = iconCache.get(status)
  if (cached) return cached

  const assetPath = resolveAssetPath()
  let image: NativeImage

  if (assetPath) {
    const baseImg = nativeImage.createFromPath(assetPath)
    const resized = baseImg.resize({ width: 32, height: 32, quality: 'high' })
    const buffer = resized.toBitmap()

    const [r, g, b] = STATUS_COLOR[status]
    const size = 32

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - 24
        const dy = y - 24
        const distSq = dx * dx + dy * dy

        if (distSq <= 5.5 * 5.5) {
          const offset = (y * size + x) * 4
          buffer[offset] = b
          buffer[offset + 1] = g
          buffer[offset + 2] = r
          buffer[offset + 3] = 255
        } else if (distSq <= 6.8 * 6.8) {
          const offset = (y * size + x) * 4
          buffer[offset] = 10
          buffer[offset + 1] = 7
          buffer[offset + 2] = 3
          buffer[offset + 3] = 255
        }
      }
    }

    image = nativeImage.createFromBuffer(buffer, { width: 32, height: 32 })
  } else {
    const [r, g, b] = STATUS_COLOR[status]
    const SIZE = 16
    const CENTER = SIZE / 2
    const RADIUS = 6.5
    const buffer = Buffer.alloc(SIZE * SIZE * 4)

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x + 0.5 - CENTER
        const dy = y + 0.5 - CENTER
        const inside = dx * dx + dy * dy <= RADIUS * RADIUS
        const offset = (y * SIZE + x) * 4
        buffer[offset] = r
        buffer[offset + 1] = g
        buffer[offset + 2] = b
        buffer[offset + 3] = inside ? 255 : 0
      }
    }

    image = nativeImage.createFromBuffer(buffer, { width: SIZE, height: SIZE })
  }

  iconCache.set(status, image)
  return image
}
