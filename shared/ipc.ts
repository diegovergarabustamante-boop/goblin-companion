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
  NavigateTo: 'nav:goto',
  WindowMinimize: 'window:minimize',
  WindowClose: 'window:close',
  OpenExternal: 'shell:open-external'
} as const

export type AppTab = 'dashboard' | 'activity-log' | 'controls' | 'backups' | 'settings'
