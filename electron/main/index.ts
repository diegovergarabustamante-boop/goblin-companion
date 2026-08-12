import { join } from 'node:path'

import { BrowserWindow, app, ipcMain, shell } from 'electron'

import { IpcChannel, type AppTab } from '../../shared/ipc'
import type { CompanionSettings } from '../../shared/settings'
import {
  appendActivity,
  clearActivityLog,
  getActivityLog,
  hydrateActivityLogFromDisk,
  onActivity,
  openActivityLogFolder
} from './activity-log'
import { isQuittingApp, markQuitting } from './app-state'
import {
  createRotatingBackup,
  listBackups,
  openBackupsFolder,
  restoreBackup
} from './backup-manager'
import { startConnectionMonitor, stopConnectionMonitor } from './connection-monitor'
import { executeTsmWrite, pingDjango, previewTsmWrite } from './http-client'
import { loadDotEnv } from './load-env'
import { startLocalServer, stopLocalServer } from './local-server'
import { notify } from './notifications'
import { resolveLuaPath } from './paths'
import { getSettings, updateSettings } from './settings'
import { applyAutostart } from './startup'
import { getSyncSnapshot, markDjangoReachable, onSyncStatusChange, syncFile } from './sync-manager'
import { createTray, setTrayStatus } from './tray'
import { restartWatcher, stopWatcher } from './watcher'
import { getWindowBounds, saveWindowBounds } from './window-state'

loadDotEnv()

let mainWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  const bounds = getWindowBounds()

  const window = new BrowserWindow({
    ...bounds,
    minWidth: 820,
    minHeight: 560,
    frame: false,
    show: false,
    backgroundColor: '#0b0f19',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  window.on('ready-to-show', () => window.show())

  window.on('resized', () => saveWindowBounds(window.getBounds()))
  window.on('moved', () => saveWindowBounds(window.getBounds()))

  window.on('close', (event) => {
    if (isQuittingApp()) return
    event.preventDefault()
    window.hide()
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return window
}

function showWindowOnTab(tab: AppTab): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send(IpcChannel.NavigateTo, tab)
}

function broadcastStatus(): void {
  const status = getSyncSnapshot()
  setTrayStatus(status.trayStatus)
  mainWindow?.webContents.send(IpcChannel.StatusChanged, status)
}

function wireWatcher(): void {
  restartWatcher((event) => {
    void syncFile(event.kind, event.filePath, 'auto')
  })
}

async function runManualSync(kind: 'inventory' | 'accounting'): Promise<{ ok: boolean; error?: string }> {
  const filePath = resolveLuaPath(kind)
  if (!filePath) {
    const error = 'Configura la carpeta SavedVariables en Settings'
    appendActivity('error', error)
    return { ok: false, error }
  }
  const result = await syncFile(kind, filePath, 'manual')
  return { ok: result.ok, error: result.error }
}

async function runTsmWritePreview() {
  const filePath = resolveLuaPath('inventory')
  if (!filePath) return { ok: false, error: 'SavedVariables no configurado' }
  return previewTsmWrite(getSettings(), filePath)
}

async function runTsmWriteConfirm(assignments: Parameters<typeof executeTsmWrite>[2]) {
  const filePath = resolveLuaPath('inventory')
  if (!filePath) return { ok: false, error: 'SavedVariables no configurado' }
  try {
    createRotatingBackup(filePath)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  const result = await executeTsmWrite(getSettings(), filePath, assignments)
  if (result.ok) {
    appendActivity('success', 'Write TSM Groups OK', JSON.stringify(result.stats ?? {}))
    notify('Write TSM OK', 'Grupos escritos en TradeSkillMaster.lua')
  } else {
    appendActivity('error', 'Write TSM Groups falló', result.error)
    notify('Write TSM falló', result.error ?? 'Error desconocido')
  }
  return result
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.GetSettings, () => getSettings())

  ipcMain.handle(IpcChannel.UpdateSettings, (_event, patch: Parameters<typeof updateSettings>[0]) => {
    const prev = getSettings()
    const next = updateSettings(patch)
    const watcherRelevant =
      prev.autoSyncEnabled !== next.autoSyncEnabled ||
      prev.wowSavedVariablesPath !== next.wowSavedVariablesPath
    if (watcherRelevant) wireWatcher()

    if (prev.localServerPort !== next.localServerPort) {
      startLocalServer(next.localServerPort)
    }

    if (prev.startWithWindows !== next.startWithWindows) {
      applyAutostart(next.startWithWindows)
    }

    broadcastStatus()
    return next
  })

  ipcMain.handle(IpcChannel.GetStatus, () => getSyncSnapshot())

  ipcMain.on(IpcChannel.WindowMinimize, () => mainWindow?.minimize())
  ipcMain.on(IpcChannel.WindowClose, () => mainWindow?.hide())

  ipcMain.handle(IpcChannel.OpenExternal, (_event, url: string) => shell.openExternal(url))

  ipcMain.handle(IpcChannel.TestConnection, async (_event, override?: Partial<CompanionSettings>) => {
    const result = await pingDjango({ ...getSettings(), ...override })
    markDjangoReachable(result.ok)
    broadcastStatus()
    return result
  })

  ipcMain.handle(IpcChannel.SyncInventory, () => runManualSync('inventory'))
  ipcMain.handle(IpcChannel.SyncAccounting, () => runManualSync('accounting'))
  ipcMain.handle(IpcChannel.GetActivityLog, () => getActivityLog())
  ipcMain.handle(IpcChannel.ClearActivityLog, () => {
    clearActivityLog()
    return []
  })
  ipcMain.handle(IpcChannel.OpenActivityLogFolder, () => {
    openActivityLogFolder()
  })

  ipcMain.handle(IpcChannel.ListBackups, () => listBackups())
  ipcMain.handle(IpcChannel.CreateBackup, () => {
    try {
      const backup = createRotatingBackup()
      return { ok: true, backup }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle(IpcChannel.RestoreBackup, (_event, backupId: string) => restoreBackup(backupId))
  ipcMain.handle(IpcChannel.OpenBackupsFolder, () => {
    openBackupsFolder()
  })

  ipcMain.handle(IpcChannel.PreviewTsmWrite, () => runTsmWritePreview())
  ipcMain.handle(IpcChannel.ConfirmTsmWrite, (_event, assignments) => runTsmWriteConfirm(assignments))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindowOnTab('dashboard'))

  void app.whenReady().then(() => {
    hydrateActivityLogFromDisk()
    registerIpcHandlers()
    mainWindow = createMainWindow()

    onSyncStatusChange(() => broadcastStatus())
    onActivity((event) => {
      mainWindow?.webContents.send(IpcChannel.ActivityAppended, event)
    })

    createTray({
      getWindow: () => mainWindow,
      showWindowOnTab,
      getDjangoUrl: () => getSettings().djangoUrl,
      syncInventory: () => void runManualSync('inventory'),
      syncAccounting: () => void runManualSync('accounting'),
      writeTsm: () => showWindowOnTab('controls')
    })

    wireWatcher()
    startLocalServer()
    startConnectionMonitor()
    applyAutostart(getSettings().startWithWindows)
    broadcastStatus()
    appendActivity('info', 'Goblin Companion listo')
  })

  app.on('before-quit', () => {
    stopWatcher()
    stopConnectionMonitor()
    stopLocalServer()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      markQuitting()
      app.quit()
    }
  })
}
