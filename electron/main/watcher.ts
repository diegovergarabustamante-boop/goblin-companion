import { existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

import chokidar, { type FSWatcher } from 'chokidar'

import { appendActivity } from './activity-log'
import { getSettings } from './settings'

export type WatchedKind = 'inventory' | 'accounting'

export interface WatchedFileEvent {
  kind: WatchedKind
  filePath: string
}

type WatchHandler = (event: WatchedFileEvent) => void

const INVENTORY_FILES = ['TradeSkillMaster.lua'] as const
const ACCOUNTING_FILES = ['TradeSkillMaster_Accounting.lua'] as const

/** Tamaño mínimo razonable (bytes) — un .lua vacío/casi vacío no se sincroniza. */
const MIN_FILE_BYTES = 64

let watcher: FSWatcher | null = null
let onChange: WatchHandler | null = null

function resolveWatchTargets(savedVariablesPath: string): Array<{ kind: WatchedKind; filePath: string }> {
  const targets: Array<{ kind: WatchedKind; filePath: string }> = []
  for (const name of INVENTORY_FILES) {
    targets.push({ kind: 'inventory', filePath: join(savedVariablesPath, name) })
  }
  for (const name of ACCOUNTING_FILES) {
    targets.push({ kind: 'accounting', filePath: join(savedVariablesPath, name) })
  }
  return targets
}

export function validateLuaFile(filePath: string): { ok: true } | { ok: false; reason: string } {
  if (!existsSync(filePath)) return { ok: false, reason: 'archivo no existe' }
  try {
    const size = statSync(filePath).size
    if (size === 0) return { ok: false, reason: 'archivo vacío' }
    if (size < MIN_FILE_BYTES) return { ok: false, reason: `archivo demasiado pequeño (${size} bytes)` }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

export function startWatcher(handler: WatchHandler): void {
  stopWatcher()
  onChange = handler

  const { wowSavedVariablesPath, autoSyncEnabled } = getSettings()
  if (!autoSyncEnabled) {
    appendActivity('info', 'Watcher en pausa (auto-sync apagado)')
    return
  }
  if (!wowSavedVariablesPath) {
    appendActivity('warn', 'Watcher no iniciado: falta la carpeta SavedVariables en Settings')
    return
  }
  if (!existsSync(wowSavedVariablesPath)) {
    appendActivity('error', 'Carpeta SavedVariables no encontrada', wowSavedVariablesPath)
    return
  }

  const stabilityMs = Number(process.env.WATCHER_STABILITY_MS ?? 2000)
  const targets = resolveWatchTargets(wowSavedVariablesPath)
  const paths = targets.map((t) => t.filePath)

  watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: Number.isFinite(stabilityMs) ? stabilityMs : 2000,
      pollInterval: 100
    }
  })

  const kindByPath = new Map(targets.map((t) => [t.filePath.toLowerCase(), t.kind]))

  watcher.on('change', (changedPath) => {
    const kind = kindByPath.get(changedPath.toLowerCase())
    if (!kind || !onChange) return

    const validation = validateLuaFile(changedPath)
    if (!validation.ok) {
      appendActivity('warn', `Cambio ignorado en ${basename(changedPath)}`, validation.reason)
      return
    }

    appendActivity('info', `Archivo estable: ${basename(changedPath)}`, kind)
    onChange({ kind, filePath: changedPath })
  })

  watcher.on('error', (error) => {
    appendActivity('error', 'Error del watcher', error instanceof Error ? error.message : String(error))
  })

  appendActivity(
    'success',
    'Watcher activo',
    targets.map((t) => basename(t.filePath)).join(', ')
  )
}

export function stopWatcher(): void {
  if (watcher) {
    void watcher.close()
    watcher = null
  }
}

export function restartWatcher(handler: WatchHandler): void {
  startWatcher(handler)
}

export function isWatcherRunning(): boolean {
  return watcher !== null
}
