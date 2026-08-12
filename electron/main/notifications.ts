import { Notification } from 'electron'

import { getSettings } from './settings'

/**
 * Notificaciones nativas de Windows (Etapa 7).
 * Respetan Settings.notificationsEnabled. No spamean en cooldown/encolados.
 */
export function notify(title: string, body: string): void {
  if (!getSettings().notificationsEnabled) return
  if (!Notification.isSupported()) return

  try {
    const notification = new Notification({
      title,
      body,
      silent: false
    })
    notification.show()
  } catch {
    // Algunos entornos (CI / sin toast) fallan silenciosamente.
  }
}
