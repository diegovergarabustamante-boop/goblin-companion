import Store from 'electron-store'

export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
}

const DEFAULT_BOUNDS: WindowBounds = { width: 960, height: 640 }

const store = new Store<{ bounds: WindowBounds }>({
  name: 'goblin-companion-window-state',
  defaults: { bounds: DEFAULT_BOUNDS }
})

export function getWindowBounds(): WindowBounds {
  return store.get('bounds', DEFAULT_BOUNDS)
}

export function saveWindowBounds(bounds: WindowBounds): void {
  store.set('bounds', bounds)
}
