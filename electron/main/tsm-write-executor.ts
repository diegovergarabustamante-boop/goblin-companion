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
import { updateLastTsmWrite } from './sync-manager'

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
  const now = new Date().toISOString()
  updateLastTsmWrite({
    at: now,
    writeId: pending.writeId,
    status: 'processing',
    detail: `Processing ${pending.assignments.length} group(s)…`
  })

  appendActivity('info', `📥 Write order received (#${pending.writeId}) from web`, `${pending.assignments.length} group(s) to write`)

  try {
    const tsmPath = resolveTsmLuaPath(settings)
    if (!tsmPath) {
      const errMsg = 'TradeSkillMaster.lua not found. Please set SavedVariables path in Settings.'
      await completePendingWrite(settings, pending.writeId, false, undefined, errMsg)
      updateLastTsmWrite({ at: new Date().toISOString(), writeId: pending.writeId, status: 'failed', detail: errMsg, error: errMsg })
      appendActivity('error', `❌ Write #${pending.writeId} failed`, 'SavedVariables folder not configured')
      notify('Goblin Companion', '❌ TSM Write failed: Please set SavedVariables path in Settings.', 'error')
      return
    }

    if (!fs.existsSync(tsmPath)) {
      const errMsg = `File not found: ${path.basename(tsmPath)}`
      await completePendingWrite(settings, pending.writeId, false, undefined, errMsg)
      updateLastTsmWrite({ at: new Date().toISOString(), writeId: pending.writeId, status: 'failed', detail: errMsg, error: errMsg })
      appendActivity('error', `❌ Write #${pending.writeId} failed`, errMsg)
      notify('Goblin Companion', `❌ TSM Write failed: ${errMsg}`, 'error')
      return
    }

    const result = await executeTsmWrite(tsmPath, pending)

    await completePendingWrite(settings, pending.writeId, result.ok, result.stats, result.error)

    if (result.ok) {
      const s = result.stats ?? {}
      const detailStr = `New: ${s.written ?? 0} · Updated: ${s.updated ?? 0} · Moved: ${s.moved ?? 0} · Cleared: ${s.cleared ?? 0}`
      updateLastTsmWrite({
        at: new Date().toISOString(),
        writeId: pending.writeId,
        status: 'done',
        detail: detailStr,
        stats: s
      })
      appendActivity('ok', `✅ TSM Write #${pending.writeId} completed successfully`, detailStr)
      notify('Goblin Companion', `✅ TSM Groups updated (#${pending.writeId}): ${detailStr}`, 'write')
    } else {
      const errMsg = result.error ?? 'Unknown error'
      updateLastTsmWrite({
        at: new Date().toISOString(),
        writeId: pending.writeId,
        status: 'failed',
        detail: errMsg,
        error: errMsg
      })
      appendActivity('error', `❌ TSM Write #${pending.writeId} failed`, errMsg)
      notify('Goblin Companion', `❌ TSM Write failed (#${pending.writeId}): ${errMsg}`, 'error')
    }
  } finally {
    executing = false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the full path to TradeSkillMaster.lua from the configured SavedVariables folder.
 */
function resolveTsmLuaPath(settings: { wowSavedVariablesPath: string }): string | null {
  const raw = (settings.wowSavedVariablesPath ?? '').trim()
  if (!raw) return null

  if (raw.toLowerCase().endsWith('.lua')) return raw
  return path.join(raw, 'TradeSkillMaster.lua')
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC GROUPS — upload user TSM groups to Django
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadTsmGroupsToDjango(luaContent: string): Promise<void> {
  const settings = getSettings()
  if (!settings.companionToken || !settings.djangoUrl) return

  try {
    const groups = extractGroupNames(luaContent)
    if (groups.length === 0) return

    const result = await syncTsmGroups(settings, groups)
    if (result.ok) {
      appendActivity('info', `📋 TSM Groups synced`, `${groups.length} group(s) uploaded to web`)
    }
  } catch {
    // no-op, non-critical
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL WRITE LOGIC
// ─────────────────────────────────────────────────────────────────────────────

interface WriteResult {
  ok: boolean
  stats?: Record<string, number>
  error?: string
  backupPath?: string
}

async function executeTsmWrite(luaPath: string, pending: PendingWrite): Promise<WriteResult> {
  try {
    // 1. Create backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = luaPath + `.bak_${timestamp}`
    fs.copyFileSync(luaPath, backupPath)
    appendActivity('info', '💾 Backup created', path.basename(backupPath))

    // 2. Read .lua
    const luaContent = fs.readFileSync(luaPath, 'utf-8')

    // 3. Find items section
    const sectionMatch = luaContent.match(/\["p@Default@userData@items"\]\s*=\s*\{/)
    if (!sectionMatch || sectionMatch.index === undefined) {
      return { ok: false, error: 'Could not find "p@Default@userData@items" section in TSM file.' }
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

    // 4. Parse existing mappings
    const existing = new Map<string, string>()
    for (const m of sectionBody.matchAll(/\["(i:\d+)"\]\s*=\s*"([^"]+)"/g)) {
      existing.set(m[1], m[2])
    }

    // 5. Apply assignments
    const stats = { written: 0, updated: 0, cleared: 0, moved: 0 }

    for (const assignment of pending.assignments) {
      const { group, item_ids, clear_first } = assignment
      if (!group || !item_ids?.length) continue

      appendActivity(
        'info',
        `✍️ Assigning to group "${group}"`,
        `${item_ids.length} item(s) · mode: ${clear_first ? 'clear group first' : 'merge with existing'}`
      )

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
