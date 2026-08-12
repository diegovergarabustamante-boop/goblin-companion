import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { app, shell } from 'electron'

import { appendActivity } from './activity-log'
import { normalizeSavedVariablesPath, resolveLuaPath } from './paths'
import { getSettings } from './settings'

export type BackupKind = 'write' | 'snapshot'
export type BackupFileType = 'main' | 'apphelper'

export interface BackupInfo {
  id: string
  kind: BackupKind
  fileType: BackupFileType
  fileName: string
  filePath: string
  targetFilename: string
  createdAt: string
  sizeBytes: number
}

function backupsRoot(kind: BackupKind): string {
  const sub = kind === 'snapshot' ? 'snapshots' : 'write'
  const dir = join(app.getPath('userData'), 'backups', 'TradeSkillMaster', sub)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function parseBackupFilename(name: string): { timestamp: string; fileType: BackupFileType; targetFilename: string } | null {
  // Format: backup-20260812T180000.TradeSkillMaster.lua or backup-20260812T180000.TradeSkillMaster_AppHelper.lua
  const mNew = name.match(/^backup-([0-9A-Za-z_-]+)\.(TradeSkillMaster(?:_AppHelper)?\.lua)$/i)
  if (mNew) {
    const targetFilename = mNew[2]
    const isAppHelper = targetFilename.toLowerCase().includes('apphelper')
    return {
      timestamp: mNew[1],
      fileType: isAppHelper ? 'apphelper' : 'main',
      targetFilename
    }
  }

  // Legacy format: backup_1_20260812T141500.lua OR backup_20260812T141500.lua
  const mOld = name.match(/^backup_(?:(\d+)_)?(\d{8}T\d{6})\.lua$/i)
  if (mOld) {
    return {
      timestamp: mOld[2],
      fileType: 'main',
      targetFilename: 'TradeSkillMaster.lua'
    }
  }

  return null
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function listBackupsInDir(dir: string, defaultKind: BackupKind): BackupInfo[] {
  if (!existsSync(dir)) return []
  const entries: BackupInfo[] = []

  for (const name of readdirSync(dir)) {
    const parsed = parseBackupFilename(name)
    if (!parsed) continue
    const filePath = join(dir, name)
    try {
      const st = statSync(filePath)
      if (!st.isFile()) continue

      const ts = parsed.timestamp
      const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}.000Z`

      entries.push({
        id: name,
        kind: defaultKind,
        fileType: parsed.fileType,
        fileName: name,
        filePath,
        targetFilename: parsed.targetFilename,
        createdAt: iso,
        sizeBytes: st.size
      })
    } catch {
      // ignore unreadable
    }
  }

  entries.sort((a, b) => b.fileName.localeCompare(a.fileName))
  return entries
}

export function listBackups(filterKind?: BackupKind): BackupInfo[] {
  if (filterKind) {
    return listBackupsInDir(backupsRoot(filterKind), filterKind)
  }

  const writeBackups = listBackupsInDir(backupsRoot('write'), 'write')
  const snapshotBackups = listBackupsInDir(backupsRoot('snapshot'), 'snapshot')

  const legacyDir = join(app.getPath('userData'), 'backups', 'TradeSkillMaster')
  const legacyBackups = listBackupsInDir(legacyDir, 'write')

  const combined = [...writeBackups, ...snapshotBackups, ...legacyBackups]
  const seen = new Set<string>()
  const unique: BackupInfo[] = []

  for (const b of combined) {
    if (!seen.has(b.filePath)) {
      seen.add(b.filePath)
      unique.push(b)
    }
  }

  unique.sort((a, b) => b.fileName.localeCompare(a.fileName))
  return unique
}

/**
 * Creates backup files for TradeSkillMaster.lua AND TradeSkillMaster_AppHelper.lua (if present).
 */
export function createRotatingBackup(kind: BackupKind = 'write', customSourcePath?: string): BackupInfo[] {
  const mainSrc = customSourcePath ?? resolveLuaPath('inventory')
  if (!mainSrc || !existsSync(mainSrc)) {
    throw new Error('TradeSkillMaster.lua no encontrado — configurá SavedVariables')
  }

  const savedVarDir = dirname(mainSrc)
  const candidate1 = join(savedVarDir, 'TradeSkillMaster_AppHelper.lua')
  const candidate2 = getSettings().wowSavedVariablesPath
    ? join(normalizeSavedVariablesPath(getSettings().wowSavedVariablesPath) || '', 'TradeSkillMaster_AppHelper.lua')
    : null

  let appHelperSrc: string | null = null
  if (existsSync(candidate1)) {
    appHelperSrc = candidate1
  } else if (candidate2 && existsSync(candidate2)) {
    appHelperSrc = candidate2
  }

  const dir = backupsRoot(kind)
  const ts = stamp()
  const createdItems: BackupInfo[] = []

  // 1. Main TSM.lua
  const destMainName = `backup-${ts}.TradeSkillMaster.lua`
  const destMainPath = join(dir, destMainName)
  copyFileSync(mainSrc, destMainPath)
  const mainStat = statSync(destMainPath)
  createdItems.push({
    id: destMainName,
    kind,
    fileType: 'main',
    fileName: destMainName,
    filePath: destMainPath,
    targetFilename: 'TradeSkillMaster.lua',
    createdAt: new Date().toISOString(),
    sizeBytes: mainStat.size
  })

  // 2. AppHelper.lua
  if (appHelperSrc) {
    const destHelperName = `backup-${ts}.TradeSkillMaster_AppHelper.lua`
    const destHelperPath = join(dir, destHelperName)
    copyFileSync(appHelperSrc, destHelperPath)
    const helperStat = statSync(destHelperPath)
    createdItems.push({
      id: destHelperName,
      kind,
      fileType: 'apphelper',
      fileName: destHelperName,
      filePath: destHelperPath,
      targetFilename: 'TradeSkillMaster_AppHelper.lua',
      createdAt: new Date().toISOString(),
      sizeBytes: helperStat.size
    })
  }

  const kindLabel = kind === 'snapshot' ? 'Snapshot manual' : 'Backup por escritura'
  const logMessage = createdItems.map((i) => i.fileName).join(' + ')
  appendActivity('success', `${kindLabel} creado`, logMessage)

  // Rotate Write backups strictly obeying backupCount setting
  if (kind === 'write') {
    const maxCount = Math.min(10, Math.max(1, getSettings().backupCount || 3))
    const allWrites = listBackupsInDir(dir, 'write')

    // Group by timestamp to count backup sessions
    const sessions = new Map<string, BackupInfo[]>()
    for (const item of allWrites) {
      const parsed = parseBackupFilename(item.fileName)
      const tsKey = parsed ? parsed.timestamp : item.id
      let list = sessions.get(tsKey)
      if (!list) {
        list = []
        sessions.set(tsKey, list)
      }
      list.push(item)
    }

    const sortedTimestamps = Array.from(sessions.keys()).sort((a, b) => b.localeCompare(a))

    // Remove older backup sessions exceeding maxCount limit
    if (sortedTimestamps.length > maxCount) {
      const oldTimestamps = sortedTimestamps.slice(maxCount)
      for (const oldTs of oldTimestamps) {
        const itemsToDelete = sessions.get(oldTs) || []
        for (const item of itemsToDelete) {
          try {
            if (existsSync(item.filePath)) unlinkSync(item.filePath)
            appendActivity('info', 'Write backup rotado (eliminado)', item.fileName)
          } catch {
            // ignore
          }
        }
      }
    }
  }

  return createdItems
}

/**
 * Delete a specific backup file by fileName.
 */
export function deleteBackup(fileName: string, kind?: BackupKind): { ok: true } | { ok: false; error: string } {
  try {
    const kinds: BackupKind[] = kind ? [kind] : ['write', 'snapshot']
    let deleted = false

    for (const k of kinds) {
      const dir = backupsRoot(k)
      const filePath = join(dir, fileName)
      if (existsSync(filePath)) {
        unlinkSync(filePath)
        deleted = true
        break
      }
    }

    if (!deleted) {
      // Fallback check legacy root
      const legacyPath = join(app.getPath('userData'), 'backups', 'TradeSkillMaster', fileName)
      if (existsSync(legacyPath)) {
        unlinkSync(legacyPath)
        deleted = true
      }
    }

    if (!deleted) {
      return { ok: false, error: `Archivo ${fileName} no encontrado` }
    }

    appendActivity('info', 'Archivo de backup eliminado', fileName)
    return { ok: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    appendActivity('error', 'Error al eliminar backup', msg)
    return { ok: false, error: msg }
  }
}

/**
 * Restores an individual backup file to its target SavedVariables file.
 */
export function restoreBackup(fileName: string, kind?: BackupKind): { ok: true; restoredTo: string } | { ok: false; error: string } {
  const all = listBackups(kind)
  const chosen = all.find((b) => b.fileName === fileName || b.id === fileName)
  if (!chosen) return { ok: false, error: `Archivo ${fileName} no encontrado` }

  const mainTarget = resolveLuaPath('inventory')
  if (!mainTarget) return { ok: false, error: 'SavedVariables no configurado' }

  const savedVarDir = dirname(mainTarget)
  const targetPath = join(savedVarDir, chosen.targetFilename)

  try {
    // Create safety snapshot of current target file before overwriting
    if (existsSync(targetPath)) {
      createRotatingBackup('snapshot', targetPath)
    }

    // Atomic-ish restore: copy + replace
    const tmp = `${targetPath}.restoring`
    copyFileSync(chosen.filePath, tmp)
    copyFileSync(tmp, targetPath)
    if (existsSync(tmp)) unlinkSync(tmp)

    appendActivity('success', 'Archivo restaurado', `${chosen.fileName} → ${chosen.targetFilename}`)
    return { ok: true, restoredTo: targetPath }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    appendActivity('error', 'Restore falló', message)
    return { ok: false, error: message }
  }
}

export function openBackupsFolder(): void {
  void shell.openPath(join(app.getPath('userData'), 'backups', 'TradeSkillMaster'))
}

export function getBackupsDirectory(): string {
  return join(app.getPath('userData'), 'backups', 'TradeSkillMaster')
}
