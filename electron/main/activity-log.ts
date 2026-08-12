import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ActivityEvent, ActivityLevel } from '../../shared/settings'

export type { ActivityEvent, ActivityLevel }

const MAX_IN_MEMORY = 200
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
  if (events.length > MAX_IN_MEMORY) events.length = MAX_IN_MEMORY

  try {
    appendFileSync(logPath(), `${JSON.stringify(event)}\n`, 'utf8')
  } catch {
    // Disco lleno / sin permisos: el log en memoria sigue vivo.
  }

  for (const listener of listeners) listener(event)
  return event
}

export function getActivityLog(limit = 100): ActivityEvent[] {
  return events.slice(0, limit)
}

export function onActivity(listener: (event: ActivityEvent) => void): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

/** Carga los últimos eventos del JSONL al arrancar (best-effort). */
export function hydrateActivityLogFromDisk(): void {
  try {
    const path = logPath()
    if (!existsSync(path)) return
    const lines = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean)
    const recent = lines.slice(-MAX_IN_MEMORY)
    for (const line of recent) {
      try {
        events.unshift(JSON.parse(line) as ActivityEvent)
      } catch {
        // línea corrupta: ignorar
      }
    }
    events.splice(MAX_IN_MEMORY)
  } catch {
    // ignore
  }
}
