import { screen } from 'electron'
import Store from 'electron-store'

export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
}

const DEFAULT_BOUNDS: WindowBounds = { width: 960, height: 680 }

const store = new Store<{ bounds: WindowBounds }>({
  name: 'goblin-companion-window-state',
  defaults: { bounds: DEFAULT_BOUNDS }
})

export function getWindowBounds(): WindowBounds {
  const saved = store.get('bounds', DEFAULT_BOUNDS)

  // Ensure width and height are within reasonable limits
  const width = Math.max(820, Math.min(saved.width || 960, 2560))
  const height = Math.max(560, Math.min(saved.height || 680, 1440))

  // Validate if saved x,y coordinates fall within an active display work area
  if (saved.x !== undefined && saved.y !== undefined) {
    try {
      const displays = screen.getAllDisplays()
      const isVisible = displays.some((display) => {
        const { x, y, width: dW, height: dH } = display.workArea
        return (
          saved.x! >= x - 100 &&
          saved.x! <= x + dW - 100 &&
          saved.y! >= y - 50 &&
          saved.y! <= y + dH - 100
        )
      })

      if (isVisible) {
        return { width, height, x: saved.x, y: saved.y }
      }
    } catch {
      // Screen API not available yet during early init
    }
  }

  // Fallback to centered default width & height without off-screen x/y
  return { width, height }
}

export function saveWindowBounds(bounds: WindowBounds): void {
  store.set('bounds', bounds)
}
