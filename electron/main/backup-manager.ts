import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { app, shell } from 'electron'

import { appendActivity } from './activity-log'
import { resolveLuaPath } from './paths'
import { getSettings } from './settings'

export type BackupKind = 'write' | 'snapshot'

export interface BackupInfo {
  id: string
  kind: BackupKind
  fileName: string
  filePath: string
  hasMain: boolean
  hasAppHelper: boolean
  createdAt: string
  sizeBytes: number
}

function backupsRoot(kind: BackupKind): string {
  const sub = kind === 'snapshot' ? 'snapshots' : 'write'
  const dir = join(app.getPath('userData'), 'backups', 'TradeSkillMaster', sub)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function parseBackupFilename(name: string): { timestamp: string; isAppHelper: boolean } | null {
  // Format: backup-20260812T180000.TradeSkillMaster.lua or backup-20260812T180000.TradeSkillMaster_AppHelper.lua
  const mNew = name.match(/^backup-(\d{8}T\d{6})\.TradeSkillMaster(_AppHelper)?\.lua$/i)
  if (mNew) {
    return { timestamp: mNew[1], isAppHelper: !!mNew[2] }
  }

  // Legacy format: backup_1_20260812T141500.lua OR backup_20260812T141500.lua
  const mOld = name.match(/^backup_(?:(\d+)_)?(\d{8}T\d{6})\.lua$/i)
  if (mOld) {
    return { timestamp: mOld[2], isAppHelper: false }
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
  const map = new Map<string, { mainFile?: string; mainPath?: string; helperFile?: string; helperPath?: string; totalSize: number; timestamp: string }>()

  for (const name of readdirSync(dir)) {
    const parsed = parseBackupFilename(name)
    if (!parsed) continue
    const filePath = join(dir, name)
    try {
      const st = statSync(filePath)
      if (!st.isFile()) continue

      let entry = map.get(parsed.timestamp)
      if (!entry) {
        entry = { totalSize: 0, timestamp: parsed.timestamp }
        map.set(parsed.timestamp, entry)
      }

      entry.totalSize += st.size
      if (parsed.isAppHelper) {
        entry.helperFile = name
        entry.helperPath = filePath
      } else {
        entry.mainFile = name
        entry.mainPath = filePath
      }
    } catch {
      // ignore
    }
  }

  const result: BackupInfo[] = []
  for (const [ts, entry] of map.entries()) {
    const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}.000Z`
    const mainFile = entry.mainFile || `backup-${ts}.TradeSkillMaster.lua`
    const mainPath = entry.mainPath || join(dir, mainFile)

    result.push({
      id: ts,
      kind: defaultKind,
      fileName: mainFile,
      filePath: mainPath,
      hasMain: !!entry.mainPath,
      hasAppHelper: !!entry.helperPath,
      createdAt: iso,
      sizeBytes: entry.totalSize
    })
  }

  result.sort((a, b) => b.id.localeCompare(a.id))
  return result
}

export function listBackups(filterKind?: BackupKind): BackupInfo[] {
  if (filterKind) {
    return listBackupsInDir(backupsRoot(filterKind), filterKind)
  }

  // Combine write and snapshot backups
  const writeBackups = listBackupsInDir(backupsRoot('write'), 'write')
  const snapshotBackups = listBackupsInDir(backupsRoot('snapshot'), 'snapshot')

  // Also read legacy root dir for any older files
  const legacyDir = join(app.getPath('userData'), 'backups', 'TradeSkillMaster')
  const legacyBackups = listBackupsInDir(legacyDir, 'write')

  const combined = [...writeBackups, ...snapshotBackups, ...legacyBackups]
  const seen = new Set<string>()
  const unique: BackupInfo[] = []

  for (const b of combined) {
    const key = `${b.kind}_${b.id}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(b)
    }
  }

  unique.sort((a, b) => b.id.localeCompare(a.id))
  return unique
}

/**
 * Creates a backup set (TradeSkillMaster.lua AND TradeSkillMaster_AppHelper.lua if present).
 * - 'write': Rotating backup before writing TSM groups (capped by backupCount in Settings).
 * - 'snapshot': Manual persistent snapshot.
 */
export function createRotatingBackup(kind: BackupKind = 'write', customSourcePath?: string): BackupInfo {
  const mainSrc = customSourcePath ?? resolveLuaPath('inventory')
  if (!mainSrc || !existsSync(mainSrc)) {
    throw new Error('TradeSkillMaster.lua no encontrado — configurá SavedVariables')
  }

  const savedVarDir = dirname(mainSrc)
  const appHelperSrc = join(savedVarDir, 'TradeSkillMaster_AppHelper.lua')

  const dir = backupsRoot(kind)
  const ts = stamp()

  const destMainName = `backup-${ts}.TradeSkillMaster.lua`
  const destMainPath = join(dir, destMainName)
  copyFileSync(mainSrc, destMainPath)

  let hasAppHelper = false
  if (existsSync(appHelperSrc)) {
    const destHelperName = `backup-${ts}.TradeSkillMaster_AppHelper.lua`
    const destHelperPath = join(dir, destHelperName)
    copyFileSync(appHelperSrc, destHelperPath)
    hasAppHelper = true
  }

  const kindLabel = kind === 'snapshot' ? 'Snapshot manual' : 'Backup por escritura'
  appendActivity('success', `${kindLabel} creado`, destMainName)

  // Rotate Write backups strictly obeying backupCount setting
  if (kind === 'write') {
    const max = Math.min(10, Math.max(1, getSettings().backupCount || 3))
    const allWrites = listBackupsInDir(dir, 'write')
    for (const old of allWrites.slice(max)) {
      try {
        const oldMain = join(dir, `backup-${old.id}.TradeSkillMaster.lua`)
        const oldHelper = join(dir, `backup-${old.id}.TradeSkillMaster_AppHelper.lua`)
        const oldLegacy = join(dir, old.fileName)

        if (existsSync(oldMain)) unlinkSync(oldMain)
        if (existsSync(oldHelper)) unlinkSync(oldHelper)
        if (existsSync(oldLegacy)) unlinkSync(oldLegacy)

        appendActivity('info', 'Write backup rotado (eliminado)', old.fileName)
      } catch {
        // ignore
      }
    }
  }

  const createdList = listBackupsInDir(dir, kind)
  const created = createdList.find((b) => b.id === ts)
  if (created) return created

  return {
    id: ts,
    kind,
    fileName: destMainName,
    filePath: destMainPath,
    hasMain: true,
    hasAppHelper,
    createdAt: new Date().toISOString(),
    sizeBytes: statSync(destMainPath).size
  }
}

/**
 * Restores a backup set (TradeSkillMaster.lua and TradeSkillMaster_AppHelper.lua if present).
 * Automatically creates a safety backup before overwriting.
 */
export function restoreBackup(backupId: string, kind?: BackupKind): { ok: true; restoredTo: string } | { ok: false; error: string } {
  const all = listBackups(kind)
  const chosen = all.find((b) => b.id === backupId || b.fileName === backupId)
  if (!chosen) return { ok: false, error: 'Backup o Snapshot no encontrado' }

  const mainTarget = resolveLuaPath('inventory')
  if (!mainTarget) return { ok: false, error: 'SavedVariables no configurado' }

  const savedVarDir = dirname(mainTarget)
  const appHelperTarget = join(savedVarDir, 'TradeSkillMaster_AppHelper.lua')

  const dir = backupsRoot(chosen.kind)
  const backupMainPath = join(dir, `backup-${chosen.id}.TradeSkillMaster.lua`)
  const backupHelperPath = join(dir, `backup-${chosen.id}.TradeSkillMaster_AppHelper.lua`)

  // Fallback to legacy file path
  const actualMainPath = existsSync(backupMainPath) ? backupMainPath : chosen.filePath

  try {
    // Create safety snapshot before overwriting
    if (existsSync(mainTarget)) {
      createRotatingBackup('snapshot', mainTarget)
    }

    // Restore TradeSkillMaster.lua
    if (existsSync(actualMainPath)) {
      const tmpMain = `${mainTarget}.restoring`
      copyFileSync(actualMainPath, tmpMain)
      copyFileSync(tmpMain, mainTarget)
      if (existsSync(tmpMain)) unlinkSync(tmpMain)
    }

    // Restore TradeSkillMaster_AppHelper.lua if present
    if (existsSync(backupHelperPath)) {
      const tmpHelper = `${appHelperTarget}.restoring`
      copyFileSync(backupHelperPath, tmpHelper)
      copyFileSync(tmpHelper, appHelperTarget)
      if (existsSync(tmpHelper)) unlinkSync(tmpHelper)
    }

    appendActivity('success', 'Backup restaurado', `${chosen.fileName} → ${basename(mainTarget)}`)
    return { ok: true, restoredTo: mainTarget }
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
