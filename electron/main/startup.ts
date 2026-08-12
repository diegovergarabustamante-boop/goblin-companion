import { app } from 'electron'

/**
 * Autostart con Windows vía login items de Electron (Etapa 7).
 * En desarrollo apunta al binario de Electron; en el .exe empaquetado al propio app.
 */
export function applyAutostart(enabled: boolean): void {
  const args = process.defaultApp ? [app.getAppPath()] : []
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    path: process.execPath,
    args
  })
}

export function isAutostartEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin
}

/** Sincroniza el flag de store con lo que realmente tiene el SO. */
export function syncAutostartFromOs(): boolean {
  return isAutostartEnabled()
}
