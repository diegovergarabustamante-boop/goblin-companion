import { contextBridge, ipcRenderer } from 'electron'

import { IpcChannel, type AppTab } from '../../shared/ipc'
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

const goblinApi = {
  getSettings: (): Promise<CompanionSettings> => ipcRenderer.invoke(IpcChannel.GetSettings),

  updateSettings: (patch: Partial<CompanionSettings>): Promise<CompanionSettings> =>
    ipcRenderer.invoke(IpcChannel.UpdateSettings, patch),

  getStatus: (): Promise<CompanionStatusSnapshot> => ipcRenderer.invoke(IpcChannel.GetStatus),

  testConnection: (override?: Partial<CompanionSettings>): Promise<DjangoPingResult> =>
    ipcRenderer.invoke(IpcChannel.TestConnection, override),

  syncInventory: (): Promise<SyncActionResult> => ipcRenderer.invoke(IpcChannel.SyncInventory),

  syncAccounting: (): Promise<SyncActionResult> => ipcRenderer.invoke(IpcChannel.SyncAccounting),

  getActivityLog: (): Promise<ActivityEventDto[]> => ipcRenderer.invoke(IpcChannel.GetActivityLog),

  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IpcChannel.OpenExternal, url),

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
  }
}

export type GoblinApi = typeof goblinApi

contextBridge.exposeInMainWorld('goblin', goblinApi)
