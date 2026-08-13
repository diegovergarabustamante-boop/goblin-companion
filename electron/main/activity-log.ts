import { app, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { ActivityEvent, ActivityLevel } from '../../shared/settings'

export type { ActivityEvent, ActivityLevel }

/** Límite máximo de 300 registros (FIFO: los más antiguos se van descartando) */
const MAX_LOGS = 300
const events: ActivityEvent[] = []
let listeners: Array<(event: ActivityEvent) => void> = []

function logPath(): string {
  const dir = join(app.getPath('userData'), 'logs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'activity.jsonl')
}

export function appendActivity(
  level: ActivityLevel,
  message: string,
  detail?: string
): ActivityEvent {
  const event: ActivityEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    level,
    message,
    detail
  }
  events.unshift(event)
  if (events.length > MAX_LOGS) {
    events.length = MAX_LOGS
  }

  try {
    // Persiste los últimos 300 eventos en disco en orden cronológico (antiguos primero)
    const fileLines = events.slice().reverse().map((e) => JSON.stringify(e)).join('\n') + '\n'
    writeFileSync(logPath(), fileLines, 'utf8')
  } catch {
    // Disco lleno / sin permisos: el log en memoria sigue vivo.
  }

  for (const listener of listeners) listener(event)
  return event
}

export function getActivityLog(limit = MAX_LOGS): ActivityEvent[] {
  return events.slice(0, Math.min(limit, MAX_LOGS))
}

export function onActivity(listener: (event: ActivityEvent) => void): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

/** Carga los últimos 300 eventos del JSONL al arrancar (best-effort). */
export function hydrateActivityLogFromDisk(): void {
  try {
    const path = logPath()
    if (!existsSync(path)) return
    const lines = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean)
    const recent = lines.slice(-MAX_LOGS)
    for (const line of recent) {
      try {
        events.unshift(JSON.parse(line) as ActivityEvent)
      } catch {
        // línea corrupta: ignorar
      }
    }
    if (events.length > MAX_LOGS) {
      events.length = MAX_LOGS
    }
  } catch {
    // ignore
  }
}

export function clearActivityLog(): void {
  events.length = 0
  try {
    writeFileSync(logPath(), '', 'utf8')
  } catch {
    // ignore
  }
}

export function openActivityLogFolder(): void {
  void shell.openPath(dirname(logPath()))
}
