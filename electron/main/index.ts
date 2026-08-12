import { join } from 'node:path'

import { BrowserWindow, app, ipcMain, shell } from 'electron'

import { IpcChannel, type AppTab } from '../../shared/ipc'
import type { CompanionStatusSnapshot } from '../../shared/settings'
import { isQuittingApp, markQuitting } from './app-state'
import { getSettings, updateSettings } from './settings'
import { createTray, setTrayStatus } from './tray'
import { getWindowBounds, saveWindowBounds } from './window-state'

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

  // Plan sección 8: cerrar [x] minimiza al tray, no cierra la app.
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

function computeStatus(): CompanionStatusSnapshot {
  // Watcher/sync-manager/connection-monitor llegan en Etapa 3-4 del plan.
  // Por ahora el único estado real disponible es el toggle de auto-sync.
  const { autoSyncEnabled } = getSettings()
  return {
    trayStatus: autoSyncEnabled ? 'green' : 'gray',
    autoSyncEnabled,
    djangoReachable: null,
    lastSyncAt: null
  }
}

function broadcastStatus(): void {
  const status = computeStatus()
  setTrayStatus(status.trayStatus)
  mainWindow?.webContents.send(IpcChannel.StatusChanged, status)
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.GetSettings, () => getSettings())

  ipcMain.handle(IpcChannel.UpdateSettings, (_event, patch: Parameters<typeof updateSettings>[0]) => {
    const next = updateSettings(patch)
    broadcastStatus()
    return next
  })

  ipcMain.handle(IpcChannel.GetStatus, computeStatus)

  ipcMain.on(IpcChannel.WindowMinimize, () => mainWindow?.minimize())
  ipcMain.on(IpcChannel.WindowClose, () => mainWindow?.hide())

  ipcMain.handle(IpcChannel.OpenExternal, (_event, url: string) => shell.openExternal(url))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindowOnTab('dashboard'))

  void app.whenReady().then(() => {
    registerIpcHandlers()
    mainWindow = createMainWindow()

    createTray({
      getWindow: () => mainWindow,
      showWindowOnTab,
      getDjangoUrl: () => getSettings().djangoUrl
    })

    setTrayStatus(getSettings().autoSyncEnabled ? 'green' : 'gray')
  })

  app.on('window-all-closed', () => {
    // La ventana se oculta (no se destruye) al cerrar, así que esto solo
    // dispara en plataformas donde el usuario cierra desde fuera del tray.
    if (process.platform !== 'darwin') {
      markQuitting()
      app.quit()
    }
  })
}
