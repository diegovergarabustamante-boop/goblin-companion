import { appendActivity } from './activity-log'
import { checkDjangoConnection } from './sync-manager'
import { checkAndExecutePendingWrite } from './tsm-write-executor'

const DEFAULT_INTERVAL_MS = 15_000

let timer: ReturnType<typeof setInterval> | null = null
let running = false

/**
 * Ping periódico a Django. Si vuelve online y hay cola, sync-manager
 * dispara flush automáticamente vía markDjangoReachable.
 *
 * También hace polling de PendingTsmWrite — si la web encoló una escritura,
 * la Companion la ejecuta localmente aquí.
 */
export function startConnectionMonitor(intervalMs = DEFAULT_INTERVAL_MS): void {
  stopConnectionMonitor()
  appendActivity('info', 'Connection monitor activo', `cada ${Math.round(intervalMs / 1000)}s`)

  const tick = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      await checkDjangoConnection()
      // Polling de escrituras pendientes (no bloquea el connection check)
      void checkAndExecutePendingWrite()
    } finally {
      running = false
    }
  }

  void tick()
  timer = setInterval(() => void tick(), intervalMs)
}

export function stopConnectionMonitor(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
