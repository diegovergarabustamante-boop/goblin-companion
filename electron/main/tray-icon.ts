import { nativeImage, type NativeImage } from 'electron'

import type { TrayStatus } from '../../shared/settings'

/**
 * Íconos del tray generados en runtime (círculo de color sobre fondo
 * transparente) en vez de assets estáticos. Evita depender de arte todavía
 * inexistente; cuando haya diseño final basta con reemplazar esta función.
 */
const STATUS_COLOR: Record<TrayStatus, [number, number, number]> = {
  green: [34, 197, 94], // --color-success
  yellow: [245, 158, 11], // --color-warning
  gray: [148, 163, 184], // --color-text-muted
  red: [239, 68, 68] // --color-danger
}

const SIZE = 16
const CENTER = SIZE / 2
const RADIUS = 6.5

const iconCache = new Map<TrayStatus, NativeImage>()

export function getTrayIcon(status: TrayStatus): NativeImage {
  const cached = iconCache.get(status)
  if (cached) return cached

  const [r, g, b] = STATUS_COLOR[status]
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

  const image = nativeImage.createFromBuffer(buffer, { width: SIZE, height: SIZE })
  iconCache.set(status, image)
  return image
}
