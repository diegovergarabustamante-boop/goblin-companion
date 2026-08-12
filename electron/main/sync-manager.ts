import { basename } from 'node:path'

import type { CompanionStatusSnapshot, TrayStatus } from '../../shared/settings'
import { appendActivity } from './activity-log'
import { readSavedVariable } from './http-client'
import { getSettings } from './settings'
import { validateLuaFile, type WatchedKind } from './watcher'

export type SyncKind = WatchedKind

export interface SyncResult {
  ok: boolean
  kind: SyncKind
  filePath: string
  filename?: string
  sizeFormatted?: string
  error?: string
}

interface SyncState {
  lastSyncAt: string | null
  lastError: string | null
  djangoReachable: boolean | null
  syncing: boolean
  lastInventorySyncAt: string | null
  lastAccountingSyncAt: string | null
}

const state: SyncState = {
  lastSyncAt: null,
  lastError: null,
  djangoReachable: null,
  syncing: false,
  lastInventorySyncAt: null,
  lastAccountingSyncAt: null
}

const lastSyncedAtByPath = new Map<string, number>()
let statusListener: ((snapshot: CompanionStatusSnapshot) => void) | null = null

function cooldownMs(): number {
  const seconds = Number(process.env.SYNC_COOLDOWN_SECONDS ?? 10)
  return (Number.isFinite(seconds) ? seconds : 10) * 1000
}

function deriveTrayStatus(autoSyncEnabled: boolean): TrayStatus {
  if (!autoSyncEnabled) return 'gray'
  if (state.lastError) return 'red'
  if (state.djangoReachable === false) return 'yellow'
  return 'green'
}

export function getSyncSnapshot(): CompanionStatusSnapshot {
  const { autoSyncEnabled } = getSettings()
  return {
    trayStatus: deriveTrayStatus(autoSyncEnabled),
    autoSyncEnabled,
    djangoReachable: state.djangoReachable,
    lastSyncAt: state.lastSyncAt
  }
}

export function onSyncStatusChange(listener: (snapshot: CompanionStatusSnapshot) => void): void {
  statusListener = listener
}

function emitStatus(): void {
  statusListener?.(getSyncSnapshot())
}

export async function syncFile(kind: SyncKind, filePath: string, reason: 'auto' | 'manual'): Promise<SyncResult> {
  const settings = getSettings()
  const now = Date.now()
  const last = lastSyncedAtByPath.get(filePath.toLowerCase()) ?? 0
  const remaining = cooldownMs() - (now - last)

  if (reason === 'auto' && remaining > 0) {
    appendActivity('info', `Cooldown: omitiendo ${basename(filePath)}`, `${Math.ceil(remaining / 1000)}s restantes`)
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
    appendActivity('warn', `Sync cancelado: ${basename(filePath)}`, validation.reason)
    return { ok: false, kind, filePath, error: validation.reason }
  }

  state.syncing = true
  emitStatus()
  appendActivity('info', `Sync ${kind} (${reason})…`, basename(filePath))

  const result = await readSavedVariable(settings, filePath)
  state.syncing = false

  if (!result.ok) {
    state.lastError = result.error ?? 'sync falló'
    state.djangoReachable = false
    appendActivity('error', `Sync ${kind} falló`, result.error)
    emitStatus()
    return { ok: false, kind, filePath, error: result.error }
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
    `${result.filename ?? basename(filePath)} · ${result.sizeFormatted ?? '?'}`
  )
  emitStatus()

  return {
    ok: true,
    kind,
    filePath,
    filename: result.filename,
    sizeFormatted: result.sizeFormatted
  }
}

export function markDjangoReachable(ok: boolean): void {
  state.djangoReachable = ok
  if (ok) state.lastError = null
  emitStatus()
}
