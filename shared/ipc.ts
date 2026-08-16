/** Nombres de canal IPC compartidos entre preload y proceso principal. */
export const IpcChannel = {
  GetSettings: 'settings:get',
  UpdateSettings: 'settings:update',
  GetStatus: 'status:get',
  StatusChanged: 'status:changed',
  TestConnection: 'settings:test-connection',
  SyncInventory: 'sync:inventory',
  SyncAccounting: 'sync:accounting',
  GetActivityLog: 'activity:get',
  ClearActivityLog: 'activity:clear',
  OpenActivityLogFolder: 'activity:open-folder',
  ActivityAppended: 'activity:appended',
  ListBackups: 'backups:list',
  CreateBackup: 'backups:create',
  RestoreBackup: 'backups:restore',
  DeleteBackup: 'backups:delete',
  OpenBackupsFolder: 'backups:open-folder',
  PreviewTsmWrite: 'tsm:preview-write',
  ConfirmTsmWrite: 'tsm:confirm-write',
  GetRecentSales: 'sales:get-recent',
  GetItemTooltip: 'item:get-tooltip',
  NavigateTo: 'nav:goto',
  LoginCompanion: 'auth:login',
  LogoutCompanion: 'auth:logout',
  WindowMinimize: 'window:minimize',
  WindowClose: 'window:close',
  OpenExternal: 'shell:open-external',
  GetUpdateStatus: 'updater:get-status',
  CheckUpdate: 'updater:check',
  UpdateStatusChanged: 'updater:status-changed',
  OpenReleaseUrl: 'updater:open-release-url',
  StartUpdateDownload: 'updater:download',
  UpdateProgressChanged: 'updater:progress'
} as const

export type AppTab = 'dashboard' | 'activity-log' | 'backups' | 'settings' | 'pnl'

export interface UpdateStatusInfo {
  checking: boolean
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  releaseUrl: string | null
  downloadUrl: string | null
  releaseNotes: string | null
  publishedAt: string | null
  error: string | null
  lastCheckedAt: string | null
}

export interface UpdateDownloadProgress {
  downloading: boolean
  percent: number
  transferredBytes: number
  totalBytes: number
  statusText: string
  error?: string | null
}

