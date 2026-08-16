import { contextBridge, ipcRenderer } from 'electron'

import { IpcChannel, type AppTab, type UpdateStatusInfo } from '../../shared/ipc'
import type {
  ActivityEvent,
  CompanionSettings,
  CompanionStatusSnapshot,
  DjangoPingResult
} from '../../shared/settings'

export type ActivityEventDto = ActivityEvent

export interface SyncActionResult {
  ok: boolean
  error?: string
}

export interface BackupInfoDto {
  id: string
  kind: 'write' | 'snapshot'
  fileType: 'main' | 'apphelper'
  fileName: string
  filePath: string
  targetFilename: string
  createdAt: string
  sizeBytes: number
}

export interface TsmWritePreviewDto {
  ok: boolean
  preview?: Array<{ group: string; details: string; total_items: number }>
  assignments?: Array<{ group: string; item_ids: string[]; clear_first?: boolean }>
  itemCount?: number
  totalItemsAffected?: number
  error?: string
}

export interface TsmWriteResultDto {
  ok: boolean
  stats?: Record<string, number>
  error?: string
}

const goblinApi = {
  getSettings: (): Promise<CompanionSettings> => ipcRenderer.invoke(IpcChannel.GetSettings),

  updateSettings: (patch: Partial<CompanionSettings>): Promise<CompanionSettings> =>
    ipcRenderer.invoke(IpcChannel.UpdateSettings, patch),

  getStatus: (): Promise<CompanionStatusSnapshot> => ipcRenderer.invoke(IpcChannel.GetStatus),

  testConnection: (override?: Partial<CompanionSettings>): Promise<DjangoPingResult> =>
    ipcRenderer.invoke(IpcChannel.TestConnection, override),

  login: (djangoUrl: string, username: string, password: string): Promise<{ ok: boolean; token?: string; username?: string; error?: string }> =>
    ipcRenderer.invoke(IpcChannel.LoginCompanion, djangoUrl, username, password),

  logout: (): Promise<void> => ipcRenderer.invoke(IpcChannel.LogoutCompanion),

  syncInventory: (): Promise<SyncActionResult> => ipcRenderer.invoke(IpcChannel.SyncInventory),

  syncAccounting: (): Promise<SyncActionResult> => ipcRenderer.invoke(IpcChannel.SyncAccounting),

  getActivityLog: (): Promise<ActivityEventDto[]> => ipcRenderer.invoke(IpcChannel.GetActivityLog),

  clearActivityLog: (): Promise<ActivityEventDto[]> => ipcRenderer.invoke(IpcChannel.ClearActivityLog),

  openActivityLogFolder: (): Promise<void> => ipcRenderer.invoke(IpcChannel.OpenActivityLogFolder),

  listBackups: (kind?: 'write' | 'snapshot'): Promise<BackupInfoDto[]> => ipcRenderer.invoke(IpcChannel.ListBackups, kind),

  createBackup: (kind?: 'write' | 'snapshot'): Promise<{ ok: boolean; backups?: BackupInfoDto[]; error?: string }> =>
    ipcRenderer.invoke(IpcChannel.CreateBackup, kind),

  restoreBackup: (backupId: string, kind?: 'write' | 'snapshot'): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannel.RestoreBackup, backupId, kind),

  deleteBackup: (backupId: string, kind?: 'write' | 'snapshot'): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannel.DeleteBackup, backupId, kind),

  openBackupsFolder: (): Promise<void> => ipcRenderer.invoke(IpcChannel.OpenBackupsFolder),

  previewTsmWrite: (): Promise<TsmWritePreviewDto> => ipcRenderer.invoke(IpcChannel.PreviewTsmWrite),

  confirmTsmWrite: (
    assignments: TsmWritePreviewDto['assignments']
  ): Promise<TsmWriteResultDto> => ipcRenderer.invoke(IpcChannel.ConfirmTsmWrite, assignments),

  getRecentSales: (limit = 100): Promise<import('../main/http-client').RecentSalesResponseDto> =>
    ipcRenderer.invoke(IpcChannel.GetRecentSales, limit),

  getItemTooltip: (blizzardId: number): Promise<import('../main/http-client').ItemTooltipDto | null> =>
    ipcRenderer.invoke(IpcChannel.GetItemTooltip, blizzardId),

  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IpcChannel.OpenExternal, url),

  getUpdateStatus: (): Promise<UpdateStatusInfo> => ipcRenderer.invoke(IpcChannel.GetUpdateStatus),

  checkForUpdates: (): Promise<UpdateStatusInfo> => ipcRenderer.invoke(IpcChannel.CheckUpdate),

  openReleaseUrl: (url?: string): Promise<void> => ipcRenderer.invoke(IpcChannel.OpenReleaseUrl, url),

  startUpdateDownload: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannel.StartUpdateDownload),

  minimizeWindow: (): void => ipcRenderer.send(IpcChannel.WindowMinimize),
  closeWindow: (): void => ipcRenderer.send(IpcChannel.WindowClose),

  onNavigate: (callback: (tab: AppTab) => void): (() => void) => {
    const listener = (_event: unknown, tab: AppTab): void => callback(tab)
    ipcRenderer.on(IpcChannel.NavigateTo, listener)
    return () => ipcRenderer.removeListener(IpcChannel.NavigateTo, listener)
  },

  onStatusChange: (callback: (status: CompanionStatusSnapshot) => void): (() => void) => {
    const listener = (_event: unknown, status: CompanionStatusSnapshot): void => callback(status)
    ipcRenderer.on(IpcChannel.StatusChanged, listener)
    return () => ipcRenderer.removeListener(IpcChannel.StatusChanged, listener)
  },

  onActivity: (callback: (event: ActivityEventDto) => void): (() => void) => {
    const listener = (_event: unknown, activity: ActivityEventDto): void => callback(activity)
    ipcRenderer.on(IpcChannel.ActivityAppended, listener)
    return () => ipcRenderer.removeListener(IpcChannel.ActivityAppended, listener)
  },

  onUpdateStatusChange: (callback: (status: UpdateStatusInfo) => void): (() => void) => {
    const listener = (_event: unknown, updateStatus: UpdateStatusInfo): void => callback(updateStatus)
    ipcRenderer.on(IpcChannel.UpdateStatusChanged, listener)
    return () => ipcRenderer.removeListener(IpcChannel.UpdateStatusChanged, listener)
  },

  onUpdateProgress: (callback: (progress: import('../../shared/ipc').UpdateDownloadProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: import('../../shared/ipc').UpdateDownloadProgress): void => callback(progress)
    ipcRenderer.on(IpcChannel.UpdateProgressChanged, listener)
    return () => ipcRenderer.removeListener(IpcChannel.UpdateProgressChanged, listener)
  }
}


export type GoblinApi = typeof goblinApi

contextBridge.exposeInMainWorld('goblin', goblinApi)
