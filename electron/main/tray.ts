import { Menu, Tray, app, shell, type BrowserWindow } from 'electron'

import type { TrayStatus } from '../../shared/settings'
import { markQuitting } from './app-state'
import { getTrayIcon } from './tray-icon'

const STATUS_LABEL: Record<TrayStatus, string> = {
  green: 'Watcher ON + Django OK',
  yellow: 'Django no responde / sync encolado',
  gray: 'Auto-sync OFF',
  red: 'Último sync falló'
}

interface CreateTrayOptions {
  getWindow: () => BrowserWindow | null
  showWindowOnTab: (tab: 'dashboard' | 'activity-log' | 'controls' | 'settings') => void
  getDjangoUrl: () => string
  syncInventory: () => void
  syncAccounting: () => void
  writeTsm: () => void
}

let tray: Tray | null = null

export function createTray(options: CreateTrayOptions): Tray {
  tray = new Tray(getTrayIcon('gray'))
  tray.setToolTip(`Goblin Companion — ${STATUS_LABEL.gray}`)

  tray.on('click', () => options.showWindowOnTab('dashboard'))
  tray.setContextMenu(buildMenu(options))

  return tray
}

export function setTrayStatus(status: TrayStatus): void {
  if (!tray) return
  tray.setImage(getTrayIcon(status))
  tray.setToolTip(`Goblin Companion — ${STATUS_LABEL[status]}`)
}

function buildMenu(options: CreateTrayOptions): Menu {
  return Menu.buildFromTemplate([
    { label: 'Sync inventario', click: () => options.syncInventory() },
    { label: 'Sync accounting', click: () => options.syncAccounting() },
    { label: 'Write TSM Groups…', click: () => options.writeTsm() },
    { type: 'separator' },
    {
      label: 'Abrir web',
      click: () => {
        void shell.openExternal(options.getDjangoUrl())
      }
    },
    { label: 'Activity Log', click: () => options.showWindowOnTab('activity-log') },
    { label: 'Settings', click: () => options.showWindowOnTab('settings') },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        markQuitting()
        app.quit()
      }
    }
  ])
}
