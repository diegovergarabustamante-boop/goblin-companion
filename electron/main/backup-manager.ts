import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'

import { app, shell } from 'electron'

import { appendActivity } from './activity-log'
import { resolveLuaPath } from './paths'
import { getSettings } from './settings'

export interface BackupInfo {
  id: string
  fileName: string
  filePath: string
  createdAt: string
  sizeBytes: number
}

const BACKUP_PREFIX = 'backup_'

function backupsRoot(): string {
  // Plan: AppData/Roaming/Goblin-Companion/backups/TradeSkillMaster/
  const dir = join(app.getPath('userData'), 'backups', 'TradeSkillMaster')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function parseBackupName(name: string): { rank: number; timestamp: string } | null {
  // backup_1_20260812T141500.lua  OR  backup_20260812T141500.lua (legacy-safe)
  const m = name.match(/^backup_(?:(\d+)_)?(\d{8}T\d{6})\.lua$/i)
  if (!m) return null
  return { rank: m[1] ? Number(m[1]) : 0, timestamp: m[2] }
}

/**
 * Lista backups ordenados por timestamp descendente (más reciente primero).
 * No usa sort() léxico ingenuo sobre el nombre completo.
 */
export function listBackups(): BackupInfo[] {
  const dir = backupsRoot()
  const entries: BackupInfo[] = []

  for (const name of readdirSync(dir)) {
    const parsed = parseBackupName(name)
    if (!parsed) continue
    const filePath = join(dir, name)
    try {
      const st = statSync(filePath)
      if (!st.isFile()) continue
      const iso = `${parsed.timestamp.slice(0, 4)}-${parsed.timestamp.slice(4, 6)}-${parsed.timestamp.slice(6, 8)}T${parsed.timestamp.slice(9, 11)}:${parsed.timestamp.slice(11, 13)}:${parsed.timestamp.slice(13, 15)}.000Z`
      entries.push({
        id: parsed.timestamp,
        fileName: name,
        filePath,
        createdAt: iso,
        sizeBytes: st.size
      })
    } catch {
      // ignore unreadable
    }
  }

  entries.sort((a, b) => b.id.localeCompare(a.id))
  return entries
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/**
 * Crea un backup rotatorio del TradeSkillMaster.lua actual.
 * Rota por timestamp (no rename en cascada backup_2→backup_3).
 */
export function createRotatingBackup(sourcePath?: string): BackupInfo {
  const src = sourcePath ?? resolveLuaPath('inventory')
  if (!src || !existsSync(src)) {
    throw new Error('TradeSkillMaster.lua no encontrado — configurá SavedVariables')
  }

  const max = Math.min(10, Math.max(1, getSettings().backupCount || 3))
  const dir = backupsRoot()
  const ts = stamp()
  const destName = `${BACKUP_PREFIX}${ts}.lua`
  const destPath = join(dir, destName)

  copyFileSync(src, destPath)
  appendActivity('success', 'Backup creado', destName)

  // Rotar: conservar solo los N más recientes por timestamp
  const all = listBackups()
  for (const old of all.slice(max)) {
    try {
      unlinkSync(old.filePath)
      appendActivity('info', 'Backup rotado (eliminado)', old.fileName)
    } catch {
      // ignore
    }
  }

  const created = listBackups().find((b) => b.fileName === destName)
  if (!created) {
    return {
      id: ts,
      fileName: destName,
      filePath: destPath,
      createdAt: new Date().toISOString(),
      sizeBytes: statSync(destPath).size
    }
  }
  return created
}

/**
 * Restaura un backup sobre TradeSkillMaster.lua.
 * Antes de sobrescribir, guarda el estado actual como backup rotatorio.
 */
export function restoreBackup(backupId: string): { ok: true; restoredTo: string } | { ok: false; error: string } {
  const backups = listBackups()
  const chosen = backups.find((b) => b.id === backupId || b.fileName === backupId)
  if (!chosen) return { ok: false, error: 'Backup no encontrado' }

  const target = resolveLuaPath('inventory')
  if (!target) return { ok: false, error: 'SavedVariables no configurado' }

  try {
    if (existsSync(target)) {
      createRotatingBackup(target)
    }
    // Copia atómica-ish: temp + rename
    const tmp = `${target}.restoring`
    copyFileSync(chosen.filePath, tmp)
    renameSync(tmp, target)
    appendActivity('success', 'Backup restaurado', `${chosen.fileName} → ${basename(target)}`)
    return { ok: true, restoredTo: target }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    appendActivity('error', 'Restore falló', message)
    return { ok: false, error: message }
  }
}

export function openBackupsFolder(): void {
  void shell.openPath(backupsRoot())
}

export function getBackupsDirectory(): string {
  return backupsRoot()
}
