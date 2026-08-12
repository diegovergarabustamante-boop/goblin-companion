import type { CompanionStatusSnapshot, TrayStatus } from '../../shared/settings'
import { appendActivity } from './activity-log'
import { pingDjango, syncAccounting, syncInventory } from './http-client'
import { notify } from './notifications'
import { getSettings } from './settings'
import { validateLuaFile, type WatchedKind } from './watcher'

export type SyncKind = WatchedKind

export interface SyncResult {
  ok: boolean
  kind: SyncKind
  filePath: string
  filename?: string
  sizeFormatted?: string
  detail?: string
  error?: string
  queued?: boolean
}

interface QueuedSync {
  kind: SyncKind
  filePath: string
  enqueuedAt: string
}

interface SyncState {
  lastSyncAt: string | null
  lastError: string | null
  djangoReachable: boolean | null
  syncing: boolean
  lastInventorySyncAt: string | null
  lastAccountingSyncAt: string | null
  queue: QueuedSync[]
}

const state: SyncState = {
  lastSyncAt: null,
  lastError: null,
  djangoReachable: null,
  syncing: false,
  lastInventorySyncAt: null,
  lastAccountingSyncAt: null,
  queue: []
}

const lastSyncedAtByPath = new Map<string, number>()
let statusListener: ((snapshot: CompanionStatusSnapshot) => void) | null = null
let flushing = false

function cooldownMs(): number {
  const seconds = Number(process.env.SYNC_COOLDOWN_SECONDS ?? 10)
  return (Number.isFinite(seconds) ? seconds : 10) * 1000
}

function deriveTrayStatus(autoSyncEnabled: boolean): TrayStatus {
  if (!autoSyncEnabled) return 'gray'
  if (state.lastError && state.queue.length === 0 && state.djangoReachable !== false) return 'red'
  if (state.djangoReachable === false || state.queue.length > 0) return 'yellow'
  return 'green'
}

export function getSyncSnapshot(): CompanionStatusSnapshot {
  const { autoSyncEnabled } = getSettings()
  return {
    trayStatus: deriveTrayStatus(autoSyncEnabled),
    autoSyncEnabled,
    djangoReachable: state.djangoReachable,
    lastSyncAt: state.lastSyncAt,
    lastInventorySyncAt: state.lastInventorySyncAt,
    lastAccountingSyncAt: state.lastAccountingSyncAt,
    queueLength: state.queue.length,
    syncing: state.syncing
  }
}

export function onSyncStatusChange(listener: (snapshot: CompanionStatusSnapshot) => void): void {
  statusListener = listener
}

function emitStatus(): void {
  statusListener?.(getSyncSnapshot())
}

function enqueue(kind: SyncKind, filePath: string): void {
  const key = filePath.toLowerCase()
  const existing = state.queue.findIndex((q) => q.filePath.toLowerCase() === key && q.kind === kind)
  const entry: QueuedSync = { kind, filePath, enqueuedAt: new Date().toISOString() }
  if (existing >= 0) state.queue[existing] = entry
  else state.queue.push(entry)
  appendActivity('warn', `Sync ${kind} encolado`, `${state.queue.length} pendiente(s)`)
  emitStatus()
}

export async function flushSyncQueue(): Promise<void> {
  if (flushing || state.queue.length === 0) return
  flushing = true
  appendActivity('info', `Reintentando cola (${state.queue.length})…`)

  while (state.queue.length > 0) {
    const next = state.queue.shift()
    if (!next) break
    const result = await syncFile(next.kind, next.filePath, 'manual')
    if (!result.ok && result.error !== 'cooldown') {
      // syncFile ya re-encoló si Django sigue caído
      break
    }
  }

  flushing = false
  emitStatus()
}

export async function syncFile(kind: SyncKind, filePath: string, reason: 'auto' | 'manual'): Promise<SyncResult> {
  const settings = getSettings()
  const now = Date.now()
  const last = lastSyncedAtByPath.get(filePath.toLowerCase()) ?? 0
  const remaining = cooldownMs() - (now - last)

  if (reason === 'auto' && remaining > 0) {
    appendActivity('info', `Cooldown: omitiendo ${basenameSafe(filePath)}`, `${Math.ceil(remaining / 1000)}s restantes`)
    return { ok: false, kind, filePath, error: 'cooldown' }
  }

  if (!settings.companionToken) {
    const error = 'Falta Companion Token en Settings'
    state.lastError = error
    state.djangoReachable = false
    appendActivity('error', error)
    emitStatus()
    return { ok: false, kind, filePath, error }
  }

  const validation = validateLuaFile(filePath)
  if (!validation.ok) {
    appendActivity('warn', `Sync cancelado: ${basenameSafe(filePath)}`, validation.reason)
    return { ok: false, kind, filePath, error: validation.reason }
  }

  // Si ya sabemos que Django está caído, encolar sin intentar (salvo ping fresco en flush).
  if (state.djangoReachable === false && reason === 'auto') {
    enqueue(kind, filePath)
    return { ok: false, kind, filePath, error: 'django_down', queued: true }
  }

  state.syncing = true
  emitStatus()
  appendActivity('info', `Sync ${kind} (${reason})…`, basenameSafe(filePath))

  const result =
    kind === 'inventory' ? await syncInventory(settings, filePath) : await syncAccounting(settings, filePath)

  state.syncing = false

  if (!result.ok) {
    state.lastError = result.error ?? 'sync falló'
    state.djangoReachable = false
    appendActivity('error', `Sync ${kind} falló`, result.error)
    enqueue(kind, filePath)
    notify('Sync falló', result.error ?? `No se pudo sincronizar ${kind}`)
    emitStatus()
    return { ok: false, kind, filePath, error: result.error, queued: true }
  }

  lastSyncedAtByPath.set(filePath.toLowerCase(), Date.now())
  state.lastError = null
  state.djangoReachable = true
  state.lastSyncAt = new Date().toISOString()
  if (kind === 'inventory') state.lastInventorySyncAt = state.lastSyncAt
  if (kind === 'accounting') state.lastAccountingSyncAt = state.lastSyncAt

  appendActivity(
    'success',
    `Sync ${kind} OK`,
    `${result.filename ?? basenameSafe(filePath)} · ${result.detail ?? result.sizeFormatted ?? '?'}`
  )
  if (reason === 'manual') {
    notify(
      `Sync ${kind} OK`,
      result.detail ?? result.filename ?? basenameSafe(filePath)
    )
  }
  emitStatus()

  return {
    ok: true,
    kind,
    filePath,
    filename: result.filename,
    sizeFormatted: result.sizeFormatted,
    detail: result.detail
  }
}

export function markDjangoReachable(ok: boolean): void {
  const wasDown = state.djangoReachable === false
  state.djangoReachable = ok
  if (ok) {
    state.lastError = null
    if (wasDown && state.queue.length > 0) {
      void flushSyncQueue()
    }
  }
  emitStatus()
}

export async function checkDjangoConnection(): Promise<boolean> {
  const settings = getSettings()
  if (!settings.companionToken) {
    markDjangoReachable(false)
    return false
  }
  const result = await pingDjango(settings)
  markDjangoReachable(result.ok)
  return result.ok
}

function basenameSafe(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}
