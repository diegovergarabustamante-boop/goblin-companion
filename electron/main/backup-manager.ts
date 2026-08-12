import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { app, shell } from 'electron'

import { appendActivity } from './activity-log'
import { normalizeSavedVariablesPath, resolveLuaPath } from './paths'
import { getSettings } from './settings'

export type BackupKind = 'write' | 'snapshot'

export interface BackupInfo {
  id: string
  kind: BackupKind
  fileName: string
  filePath: string
  mainFileName: string
  appHelperFileName?: string
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
  const mNew = name.match(/^backup-([0-9A-Za-z_-]+)\.(TradeSkillMaster(?:_AppHelper)?\.lua)$/i)
  if (mNew) {
    const isAppHelper = mNew[2].toLowerCase().includes('apphelper')
    return { timestamp: mNew[1], isAppHelper }
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
      mainFileName: mainFile,
      appHelperFileName: entry.helperFile,
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

  const writeBackups = listBackupsInDir(backupsRoot('write'), 'write')
  const snapshotBackups = listBackupsInDir(backupsRoot('snapshot'), 'snapshot')

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

  const destMainName = `backup-${ts}.TradeSkillMaster.lua`
  const destMainPath = join(dir, destMainName)
  copyFileSync(mainSrc, destMainPath)

  let destHelperName: string | undefined
  let destHelperPath: string | undefined
  let hasAppHelper = false

  if (appHelperSrc) {
    destHelperName = `backup-${ts}.TradeSkillMaster_AppHelper.lua`
    destHelperPath = join(dir, destHelperName)
    copyFileSync(appHelperSrc, destHelperPath)
    hasAppHelper = true
  }

  const kindLabel = kind === 'snapshot' ? 'Snapshot manual' : 'Backup por escritura'
  const logDetails = hasAppHelper ? `${destMainName} + ${destHelperName}` : destMainName
  appendActivity('success', `${kindLabel} creado`, logDetails)

  // Rotate Write backups strictly obeying backupCount setting
  if (kind === 'write') {
    const max = Math.min(10, Math.max(1, getSettings().backupCount || 3))
    const allWrites = listBackupsInDir(dir, 'write')
    for (const old of allWrites.slice(max)) {
      try {
        deleteBackup(old.id, 'write')
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
    mainFileName: destMainName,
    appHelperFileName: destHelperName,
    hasMain: true,
    hasAppHelper,
    createdAt: new Date().toISOString(),
    sizeBytes: statSync(destMainPath).size + (destHelperPath ? statSync(destHelperPath).size : 0)
  }
}

/**
 * Delete a backup set by ID (removes both TradeSkillMaster.lua and AppHelper.lua for that timestamp).
 */
export function deleteBackup(backupId: string, kind?: BackupKind): { ok: true } | { ok: false; error: string } {
  try {
    const kinds: BackupKind[] = kind ? [kind] : ['write', 'snapshot']
    let deletedCount = 0

    for (const k of kinds) {
      const dir = backupsRoot(k)
      if (!existsSync(dir)) continue

      for (const file of readdirSync(dir)) {
        const parsed = parseBackupFilename(file)
        if (parsed && parsed.timestamp === backupId) {
          const filePath = join(dir, file)
          if (existsSync(filePath)) {
            unlinkSync(filePath)
            deletedCount++
          }
        }
      }
    }

    if (deletedCount === 0) {
      return { ok: false, error: 'Backup no encontrado para eliminar' }
    }

    appendActivity('info', 'Backup eliminado', backupId)
    return { ok: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    appendActivity('error', 'Error al eliminar backup', msg)
    return { ok: false, error: msg }
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
