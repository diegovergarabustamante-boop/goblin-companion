import { Notification } from 'electron'

import { getSettings } from './settings'

export type NotificationKind = 'sync' | 'write' | 'error' | 'general'

/**
 * Notificaciones nativas de Windows.
 * Respetan Settings.notificationsEnabled y sub-toggles (notifyOnSync, notifyOnWrite, notifyOnError).
 */
export function notify(title: string, body: string, kind: NotificationKind = 'general'): void {
  const settings = getSettings()
  if (!settings.notificationsEnabled) return

  if (kind === 'sync' && settings.notifyOnSync === false) return
  if (kind === 'write' && settings.notifyOnWrite === false) return
  if (kind === 'error' && settings.notifyOnError === false) return

  if (!Notification.isSupported()) return

  try {
    const notification = new Notification({
      title,
      body,
      silent: false
    })
    notification.show()
  } catch {
    // Algunos entornos fallan silenciosamente.
  }
}
