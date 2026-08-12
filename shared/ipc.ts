/** Nombres de canal IPC compartidos entre preload y proceso principal. */
export const IpcChannel = {
  GetSettings: 'settings:get',
  UpdateSettings: 'settings:update',
  GetStatus: 'status:get',
  StatusChanged: 'status:changed',
  NavigateTo: 'nav:goto',
  WindowMinimize: 'window:minimize',
  WindowClose: 'window:close',
  OpenExternal: 'shell:open-external'
} as const

export type AppTab = 'dashboard' | 'activity-log' | 'controls' | 'settings'
