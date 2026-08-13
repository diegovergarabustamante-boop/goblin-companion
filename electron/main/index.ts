import { join } from 'node:path'
import { existsSync } from 'node:fs'

import { BrowserWindow, app, ipcMain, nativeImage, shell, type NativeImage } from 'electron'

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
  deleteBackup,
  listBackups,
  openBackupsFolder,
  restoreBackup
} from './backup-manager'
import { startConnectionMonitor, stopConnectionMonitor } from './connection-monitor'
import { executeTsmWrite, fetchItemTooltip, fetchRecentSales, loginDjango, pingDjango, previewTsmWrite } from './http-client'
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

if (process.platform === 'win32') {
  app.setAppUserModelId('com.goblin.companion')
}

let mainWindow: BrowserWindow | null = null

function resolveAppIcon(): NativeImage | undefined {
  const candidates = [
    join(app.getAppPath(), 'build/icon.png'),
    join(app.getAppPath(), 'build/icon.ico'),
    join(import.meta.dirname, '../../build/icon.png'),
    join(import.meta.dirname, '../../build/icon.ico'),
    join(import.meta.dirname, '../renderer/images/goblin_assets/coin_badge_1.png'),
    join(app.getAppPath(), 'out/renderer/images/goblin_assets/coin_badge_1.png'),
    join(app.getAppPath(), 'public/images/goblin_assets/coin_badge_1.png'),
    join(import.meta.dirname, '../../public/images/goblin_assets/coin_badge_1.png'),
    join(process.resourcesPath, 'build/icon.ico'),
    join(process.resourcesPath, 'build/icon.png'),
    join(process.resourcesPath, 'icon.ico'),
    join(process.resourcesPath, 'icon.png')
  ]
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        const img = nativeImage.createFromPath(candidate)
        if (!img.isEmpty()) return img
      }
    } catch {
      // ignore
    }
  }
  return undefined
}

function createMainWindow(): BrowserWindow {
  const bounds = getWindowBounds()
  const appIcon = resolveAppIcon()

  const window = new BrowserWindow({
    ...bounds,
    minWidth: 820,
    minHeight: 560,
    frame: false,
    show: false,
    backgroundColor: '#0b0f19',
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  if (bounds.x === undefined || bounds.y === undefined) {
    window.center()
  }

  if (appIcon) {
    window.setIcon(appIcon)
  }

  window.on('ready-to-show', () => {
    if (app.getLoginItemSettings().wasOpenedAsHidden) {
      window.hide()
    } else {
      window.show()
    }
  })

  const handleBoundsChange = () => {
    if (window && !window.isMinimized() && !window.isMaximized() && window.isVisible()) {
      saveWindowBounds(window.getBounds())
    }
  }

  window.on('resized', handleBoundsChange)
  window.on('moved', handleBoundsChange)

  window.on('close', (event) => {
    if (isQuittingApp()) return
    event.preventDefault()
    window.hide()
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
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
  if (!filePath) return { ok: false, error: 'SavedVariables not configured' }
  try {
    createRotatingBackup('write', filePath)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  const result = await executeTsmWrite(getSettings(), filePath, assignments)
  if (result.ok) {
    appendActivity('success', 'Write TSM Groups OK', JSON.stringify(result.stats ?? {}))
    notify('TSM Write OK', 'Groups written to TradeSkillMaster.lua', 'write')
  } else {
    appendActivity('error', 'Write TSM Groups failed', result.error)
    notify('TSM Write failed', result.error ?? 'Unknown error', 'error')
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

  ipcMain.handle(IpcChannel.LoginCompanion, async (_event, djangoUrl: string, username: string, password: string) => {
    const result = await loginDjango(djangoUrl, username, password)
    if (result.ok && result.token) {
      updateSettings({
        djangoUrl,
        username: result.username ?? username,
        companionToken: result.token,
        firstRunCompleted: true
      })
      markDjangoReachable(true)
      broadcastStatus()
    }
    return result
  })

  ipcMain.handle(IpcChannel.LogoutCompanion, () => {
    updateSettings({
      companionToken: '',
      username: ''
    })
    markDjangoReachable(false)
    broadcastStatus()
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

  ipcMain.handle(IpcChannel.ListBackups, (_event, kind?: 'write' | 'snapshot') => listBackups(kind))
  ipcMain.handle(IpcChannel.CreateBackup, (_event, kind: 'write' | 'snapshot' = 'snapshot') => {
    try {
      const backups = createRotatingBackup(kind)
      return { ok: true, backups }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle(IpcChannel.RestoreBackup, (_event, backupId: string, kind?: 'write' | 'snapshot') => restoreBackup(backupId, kind))
  ipcMain.handle(IpcChannel.DeleteBackup, (_event, backupId: string, kind?: 'write' | 'snapshot') => deleteBackup(backupId, kind))
  ipcMain.handle(IpcChannel.OpenBackupsFolder, () => {
    openBackupsFolder()
  })

  ipcMain.handle(IpcChannel.PreviewTsmWrite, () => runTsmWritePreview())
  ipcMain.handle(IpcChannel.ConfirmTsmWrite, (_event, assignments) => runTsmWriteConfirm(assignments))
  ipcMain.handle(IpcChannel.GetRecentSales, (_event, limit?: number) => fetchRecentSales(getSettings(), limit))
  ipcMain.handle(IpcChannel.GetItemTooltip, (_event, blizzardId: number) => fetchItemTooltip(blizzardId))
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
      writeTsm: () => showWindowOnTab('backups')
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
