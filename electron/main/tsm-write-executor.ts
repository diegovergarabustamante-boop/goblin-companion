/**
 * TSM Write Executor
 *
 * Ejecuta localmente las escrituras de grupos TSM encoladas desde la web.
 * Corre en el proceso main (Node/Electron) con acceso completo al FS.
 *
 * Flujo:
 * 1. connection-monitor / sync-manager llama checkAndExecutePendingWrite()
 * 2. Pide a Django si hay un PendingTsmWrite pendiente para este usuario
 * 3. Si hay uno, lo ejecuta en el .lua local (con backup automático)
 * 4. Reporta el resultado a Django (done/failed)
 * 5. Emite una entrada en el activity log y una notificación al usuario
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import { appendActivity } from './activity-log'
import {
  completePendingWrite,
  pollPendingWrite,
  syncTsmGroups,
  type PendingWrite,
  type TsmGroup
} from './http-client'
import { notify } from './notifications'
import { getSettings } from './settings'

/** Semáforo para evitar ejecuciones paralelas */
let executing = false

// ─────────────────────────────────────────────────────────────────────────────
// POLLING — llamado por connection-monitor
// ─────────────────────────────────────────────────────────────────────────────

export async function checkAndExecutePendingWrite(): Promise<void> {
  if (executing) return

  const settings = getSettings()
  if (!settings.companionToken || !settings.djangoUrl) return

  const pending = await pollPendingWrite(settings)
  if (!pending) return

  executing = true
  appendActivity('info', `✍️ Write TSM recibido (#${pending.writeId})`, `${pending.assignments.length} grupos`)

  try {
    // Construir la ruta al TradeSkillMaster.lua desde la carpeta configurada
    const tsmPath = resolveTsmLuaPath(settings)
    if (!tsmPath) {
      await completePendingWrite(settings, pending.writeId, false, undefined, 'No se encontró TradeSkillMaster.lua. Configurá la ruta de SavedVariables en Settings.')
      appendActivity('error', `❌ Write #${pending.writeId} fallido`, 'Carpeta SavedVariables no configurada')
      notify('Goblin Companion', '❌ Write TSM fallido: configurá la carpeta SavedVariables en Settings.')
      return
    }

    if (!fs.existsSync(tsmPath)) {
      await completePendingWrite(settings, pending.writeId, false, undefined, `Archivo no encontrado: ${tsmPath}`)
      appendActivity('error', `❌ Write #${pending.writeId} fallido`, `No existe: ${path.basename(tsmPath)}`)
      notify('Goblin Companion', `❌ Write TSM fallido: no se encontró ${path.basename(tsmPath)}`)
      return
    }

    const result = await executeTsmWrite(tsmPath, pending)

    await completePendingWrite(settings, pending.writeId, result.ok, result.stats, result.error)

    if (result.ok) {
      appendActivity('ok', `✅ Write TSM #${pending.writeId} completado`, `written=${result.stats?.written ?? 0} updated=${result.stats?.updated ?? 0}`)
      notify('Goblin Companion', `✅ Grupos TSM actualizados: ${result.stats?.written ?? 0} nuevos, ${result.stats?.updated ?? 0} actualizados`)
    } else {
      appendActivity('error', `❌ Write TSM #${pending.writeId} fallido`, result.error ?? 'Error desconocido')
      notify('Goblin Companion', `❌ Write TSM fallido: ${result.error}`)
    }
  } finally {
    executing = false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye la ruta completa al TradeSkillMaster.lua desde la carpeta
 * SavedVariables configurada en Settings.
 *
 * wowSavedVariablesPath puede ser:
 *   - La carpeta: D:\WoW\_retail_\WTF\Account\78125981#3\SavedVariables
 *   - O ya el archivo completo: ...SavedVariables\TradeSkillMaster.lua
 */
function resolveTsmLuaPath(settings: { wowSavedVariablesPath: string }): string | null {
  const raw = (settings.wowSavedVariablesPath ?? '').trim()
  if (!raw) return null

  // Si ya termina en .lua, asumimos que es el archivo directo
  if (raw.toLowerCase().endsWith('.lua')) return raw

  // Si es una carpeta, construimos la ruta
  return path.join(raw, 'TradeSkillMaster.lua')
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC GROUPS — sube los grupos TSM de este usuario a Django
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadTsmGroupsToDjango(luaContent: string): Promise<void> {
  const settings = getSettings()
  if (!settings.companionToken || !settings.djangoUrl) return

  try {
    const groups = extractGroupNames(luaContent)
    if (groups.length === 0) return

    const result = await syncTsmGroups(settings, groups)
    if (result.ok) {
      appendActivity('info', `📋 Grupos TSM sincronizados`, `${groups.length} grupos enviados a la web`)
    }
  } catch {
    // no-op, non-critical
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LÓGICA INTERNA DE ESCRITURA (igual que Django pero en Node.js local)
// ─────────────────────────────────────────────────────────────────────────────

interface WriteResult {
  ok: boolean
  stats?: Record<string, number>
  error?: string
  backupPath?: string
}

async function executeTsmWrite(luaPath: string, pending: PendingWrite): Promise<WriteResult> {
  try {
    // 1. Crear backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = luaPath + `.bak_${timestamp}`
    fs.copyFileSync(luaPath, backupPath)
    appendActivity('info', '💾 Backup creado', path.basename(backupPath))

    // 2. Leer el .lua
    const luaContent = fs.readFileSync(luaPath, 'utf-8')

    // 3. Localizar la sección de items
    const sectionMatch = luaContent.match(/\["p@Default@userData@items"\]\s*=\s*\{/)
    if (!sectionMatch || sectionMatch.index === undefined) {
      return { ok: false, error: 'No se encontró la sección "p@Default@userData@items" en el archivo TSM.' }
    }

    const braceOpen = luaContent.indexOf('{', sectionMatch.index)
    let depth = 0
    let sectionEnd = braceOpen
    for (let i = braceOpen; i < luaContent.length; i++) {
      if (luaContent[i] === '{') depth++
      else if (luaContent[i] === '}') {
        depth--
        if (depth === 0) { sectionEnd = i; break }
      }
    }

    const sectionBody = luaContent.slice(braceOpen + 1, sectionEnd)

    // 4. Parsear mappings existentes
    const existing = new Map<string, string>()
    for (const m of sectionBody.matchAll(/\["(i:\d+)"\]\s*=\s*"([^"]+)"/g)) {
      existing.set(m[1], m[2])
    }

    // 5. Aplicar assignments
    const stats = { written: 0, updated: 0, cleared: 0, moved: 0 }

    for (const assignment of pending.assignments) {
      const { group, item_ids, clear_first } = assignment
      if (!group || !item_ids?.length) continue

      if (clear_first) {
        for (const [itemId, groupName] of existing.entries()) {
          if (groupName === group) { existing.delete(itemId); stats.cleared++ }
        }
      }

      for (const rawId of item_ids) {
        const normalized = rawId.replace(/^(i:\d+).*$/, '$1')
        if (!/^i:\d+$/.test(normalized)) continue

        const currentGroup = existing.get(normalized)
        if (currentGroup && currentGroup !== group) {
          stats.moved++
        } else if (currentGroup === group) {
          stats.updated++
        } else {
          stats.written++
        }
        existing.set(normalized, group)
      }
    }

    // 6. Reconstruir la sección
    const lines: string[] = []
    for (const [itemId, group] of [...existing.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`\t\t["${itemId}"] = "${group}",`)
    }
    const newSectionBody = '\n' + lines.join('\n') + '\n\t'
    const newLua = luaContent.slice(0, braceOpen + 1) + newSectionBody + luaContent.slice(sectionEnd)

    // 7. Escribir
    fs.writeFileSync(luaPath, newLua, 'utf-8')

    return { ok: true, stats, backupPath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACCIÓN DE GRUPOS desde el .lua (para subirlos a Django)
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_OPERATIONS = new Set([
  'Auctioning', 'Auctioneering', 'Mailing', 'Mail', 'Shopping',
  'Shop', 'Sniper', 'Vendoring', 'Vendor', 'Warehousing',
  'Warehouse', 'Crafting', 'Storage', 'Inventory'
])

export function extractGroupNames(luaContent: string): TsmGroup[] {
  const match = luaContent.match(/\["p@Default@userData@groups"\]\s*=\s*\{/)
  if (!match || match.index === undefined) return []

  const braceOpen = luaContent.indexOf('{', match.index)
  let depth = 0
  let sectionEnd = braceOpen
  const limit = Math.min(braceOpen + 500_000, luaContent.length)
  for (let i = braceOpen; i < limit; i++) {
    if (luaContent[i] === '{') depth++
    else if (luaContent[i] === '}') {
      depth--
      if (depth === 0) { sectionEnd = i; break }
    }
  }

  const section = luaContent.slice(braceOpen, sectionEnd)
  const groups: TsmGroup[] = []

  for (const m of section.matchAll(/\["([^"@[\]]+)"\]\s*=\s*\{/g)) {
    const name = m[1]
    if (name.includes('@') || name.startsWith('p:') || name.startsWith('s:')) continue
    const baseName = name.split('\\')[0]
    if (KNOWN_OPERATIONS.has(baseName)) continue

    const isSubgroup = name.includes('\\')
    groups.push({
      value: name,
      label: isSubgroup ? `${name} (subgrupo)` : name,
      is_subgroup: isSubgroup
    })
  }

  return groups
}
