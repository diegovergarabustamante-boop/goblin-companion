/**
 * Forma de la configuración persistida (electron-store).
 * Mantenida en `shared/` porque la necesitan tanto el proceso principal
 * (electron/main/settings.ts) como el renderer (src/pages/Settings.tsx)
 * a través del preload.
 */
export interface CompanionSettings {
  djangoUrl: string
  companionToken: string
  username: string
  autoSyncEnabled: boolean
  backupCount: number
  wowSavedVariablesPath: string
  localServerPort: number
  firstRunCompleted: boolean
  notificationsEnabled: boolean
  startWithWindows: boolean
}

export const DEFAULT_SETTINGS: CompanionSettings = {
  djangoUrl: 'http://127.0.0.1:8000',
  companionToken: '',
  username: '',
  autoSyncEnabled: false,
  backupCount: 3,
  wowSavedVariablesPath: '',
  localServerPort: 8765,
  firstRunCompleted: false,
  notificationsEnabled: true,
  startWithWindows: false
}

/** Estados de color del tray, ver plan sección 8. */
export type TrayStatus = 'green' | 'yellow' | 'gray' | 'red'

export interface CompanionStatusSnapshot {
  trayStatus: TrayStatus
  autoSyncEnabled: boolean
  djangoReachable: boolean | null
  lastSyncAt: string | null
  lastInventorySyncAt: string | null
  lastAccountingSyncAt: string | null
  queueLength: number
  syncing: boolean
  syncStep?: string | null
  lastTsmWrite?: {
    at: string
    writeId: number
    status: 'processing' | 'done' | 'failed'
    detail: string
    stats?: Record<string, number>
    error?: string
  } | null
}

/** Resultado de golpear `GET /api/companion/ping/` (botón "Probar conexión"). */
export interface DjangoPingResult {
  ok: boolean
  serverTime?: string
  user?: string | null
  error?: string
}

export type ActivityLevel = 'info' | 'success' | 'warn' | 'error'

export interface ActivityEvent {
  id: string
  at: string
  level: ActivityLevel
  message: string
  detail?: string
}
