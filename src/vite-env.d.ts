/// <reference types="vite/client" />

import type { GoblinApi } from '../electron/preload'

declare global {
  interface Window {
    goblin: GoblinApi
  }
}
