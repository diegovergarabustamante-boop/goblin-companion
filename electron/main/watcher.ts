import { existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

import chokidar, { type FSWatcher } from 'chokidar'

import { appendActivity } from './activity-log'
import { normalizeSavedVariablesPath } from './path-utils'
import { getSettings } from './settings'

export type WatchedKind = 'inventory' | 'accounting'

export interface WatchedFileEvent {
  kind: WatchedKind
  filePath: string
}

type WatchHandler = (event: WatchedFileEvent) => void

/**
 * Archivos a vigilar y qué syncs disparan.
 * Inventario + accounting usan el mismo TradeSkillMaster.lua (como TSM Analyzer).
 * AppHelper es flujo Decoder en la web, no de la companion.
 */
const WATCH_SPECS: Array<{ fileName: string; kinds: WatchedKind[] }> = [
  { fileName: 'TradeSkillMaster.lua', kinds: ['inventory', 'accounting'] }
]

/** Tamaño mínimo razonable (bytes) — un .lua vacío/casi vacío no se sincroniza. */
const MIN_FILE_BYTES = 64

let watcher: FSWatcher | null = null
let onChange: WatchHandler | null = null

function resolveWatchTargets(savedVariablesPath: string): Array<{ kinds: WatchedKind[]; filePath: string }> {
  return WATCH_SPECS.map((spec) => ({
    kinds: spec.kinds,
    filePath: join(savedVariablesPath, spec.fileName)
  }))
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
  const folder = normalizeSavedVariablesPath(wowSavedVariablesPath)
  if (!folder) {
    appendActivity('warn', 'Watcher no iniciado: falta la carpeta SavedVariables en Settings')
    return
  }
  if (!existsSync(folder)) {
    appendActivity('error', 'Carpeta SavedVariables no encontrada', folder)
    return
  }

  const stabilityMs = Number(process.env.WATCHER_STABILITY_MS ?? 2000)
  const targets = resolveWatchTargets(folder).filter((t) => existsSync(t.filePath))
  if (targets.length === 0) {
    appendActivity('error', 'No hay TradeSkillMaster.lua en SavedVariables', folder)
    return
  }

  const paths = targets.map((t) => t.filePath)
  const kindsByPath = new Map(targets.map((t) => [t.filePath.toLowerCase(), t.kinds]))

  watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: Number.isFinite(stabilityMs) ? stabilityMs : 2000,
      pollInterval: 100
    }
  })

  watcher.on('change', (changedPath) => {
    const kinds = kindsByPath.get(changedPath.toLowerCase())
    if (!kinds?.length || !onChange) return

    const validation = validateLuaFile(changedPath)
    if (!validation.ok) {
      appendActivity('warn', `Cambio ignorado en ${basename(changedPath)}`, validation.reason)
      return
    }

    appendActivity('info', `Archivo estable: ${basename(changedPath)}`, kinds.join('+'))
    for (const kind of kinds) {
      onChange({ kind, filePath: changedPath })
    }
  })

  watcher.on('error', (error) => {
    appendActivity('error', 'Error del watcher', error instanceof Error ? error.message : String(error))
  })

  appendActivity(
    'success',
    'Watcher activo',
    targets.map((t) => `${basename(t.filePath)} → ${t.kinds.join('+')}`).join(', ')
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
