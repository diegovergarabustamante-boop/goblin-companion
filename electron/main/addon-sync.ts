/**
 * Addon Sync — baja la buy list por reino desde Django y escribe el addon de
 * datos `GoblinCompanion_Data` (Data.lua + .toc) en Interface\AddOns.
 *
 * El addon principal `GoblinCompanion` vive en un repo aparte y solo lee la
 * global `GoblinCompanionData`; esta app nunca modifica sus archivos.
 *
 * WoW carga los addons en login o /reload, así que los cambios con el juego
 * abierto se ven tras un /reload.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { AddonSyncStatus } from '../../shared/settings'
import { appendActivity } from './activity-log'
import {
  DATA_ADDON_NAME,
  DEFAULT_INTERFACE_VERSION,
  MAIN_ADDON_NAME,
  buildDataLua,
  buildDataToc,
  deriveAddonsPath,
  parseInterfaceVersion
} from './addon-lua'
import { ackBuyList, fetchBuyList } from './http-client'
import { notify } from './notifications'
import { getSettings } from './settings'

const state: AddonSyncStatus = {
  enabled: true,
  addonsPath: null,
  mainAddonInstalled: false,
  lastWriteAt: null,
  lastCheckAt: null,
  hash: null,
  generatedAt: null,
  realms: 0,
  items: 0,
  lastError: null
}

let listener: ((status: AddonSyncStatus) => void) | null = null
let running = false
let lastLoggedError: string | null = null

export function onAddonStatusChange(cb: (status: AddonSyncStatus) => void): void {
  listener = cb
}

function emit(): void {
  listener?.({ ...state })
}

export function getAddonStatus(): AddonSyncStatus {
  const settings = getSettings()
  state.enabled = settings.addonSyncEnabled
  state.addonsPath = resolveAddonsPath()
  state.mainAddonInstalled = state.addonsPath
    ? existsSync(join(state.addonsPath, MAIN_ADDON_NAME, `${MAIN_ADDON_NAME}.toc`))
    : false
  return { ...state }
}

function resolveAddonsPath(): string | null {
  const settings = getSettings()
  const explicit = settings.wowAddonsPath.trim()
  const candidate = explicit || deriveAddonsPath(settings.wowSavedVariablesPath)
  if (!candidate) return null
  return existsSync(candidate) ? candidate : null
}

function dataFolder(addonsPath: string): string {
  return join(addonsPath, DATA_ADDON_NAME)
}

/** Hash que ya está escrito en disco (sobrevive reinicios de la Companion). */
function readHashOnDisk(addonsPath: string): string | null {
  try {
    const toc = readFileSync(join(dataFolder(addonsPath), `${DATA_ADDON_NAME}.toc`), 'utf-8')
    const m = toc.match(/^##\s*X-DataHash\s*:\s*(\S+)/im)
    return m ? m[1] : null
  } catch {
    return null
  }
}

function detectInterfaceVersion(addonsPath: string): string {
  for (const name of ['TradeSkillMaster', MAIN_ADDON_NAME]) {
    try {
      const toc = readFileSync(join(addonsPath, name, `${name}.toc`), 'utf-8')
      const v = parseInterfaceVersion(toc)
      if (v) return v
    } catch {
      // siguiente candidato
    }
  }
  return DEFAULT_INTERFACE_VERSION
}

function writeAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.tmp`
  writeFileSync(tmp, content, { encoding: 'utf-8' })
  renameSync(tmp, filePath)
}

function setError(message: string | null): void {
  state.lastError = message
  if (message && message !== lastLoggedError) {
    appendActivity('error', 'Addon sync failed', message)
  }
  lastLoggedError = message
}

export interface AddonSyncResult {
  ok: boolean
  wrote?: boolean
  error?: string
}

/**
 * Un ciclo de sync. `force` ignora el hash local y re-escribe los archivos
 * (botón "Re-sync addon"). Se llama desde el connection monitor cada ~15s.
 */
export async function checkAndSyncBuyList(opts: { force?: boolean } = {}): Promise<AddonSyncResult> {
  if (running) return { ok: true }
  const settings = getSettings()
  state.enabled = settings.addonSyncEnabled
  if (!settings.addonSyncEnabled) return { ok: true }
  if (!settings.companionToken || !settings.djangoUrl) return { ok: true }

  running = true
  try {
    const addonsPath = resolveAddonsPath()
    state.addonsPath = addonsPath
    state.lastCheckAt = new Date().toISOString()

    if (!addonsPath) {
      const msg = 'AddOns folder not found. Set the SavedVariables path (or AddOns path) in Settings.'
      setError(msg)
      emit()
      return { ok: false, error: msg }
    }

    state.mainAddonInstalled = existsSync(join(addonsPath, MAIN_ADDON_NAME, `${MAIN_ADDON_NAME}.toc`))

    const folder = dataFolder(addonsPath)
    const luaPath = join(folder, 'Data.lua')
    const diskHash = readHashOnDisk(addonsPath)
    const filesPresent = existsSync(luaPath) && diskHash !== null
    const sinceHash = !opts.force && filesPresent ? diskHash ?? undefined : undefined

    const result = await fetchBuyList(settings, sinceHash)
    if (!result.ok) {
      setError(result.error ?? 'Could not fetch buy list')
      emit()
      return { ok: false, error: result.error }
    }

    setError(null)

    if (result.empty || result.unchanged || !result.payload || !result.hash) {
      if (result.unchanged && result.hash) state.hash = result.hash
      emit()
      return { ok: true, wrote: false }
    }

    mkdirSync(folder, { recursive: true })
    const writtenAt = new Date().toISOString()
    const interfaceVersion = detectInterfaceVersion(addonsPath)

    // Data.lua primero; el .toc lleva el hash, así que va al final: si algo falla
    // a mitad, el próximo ciclo ve un hash viejo y reintenta.
    writeAtomic(luaPath, buildDataLua(result.payload, result.hash, writtenAt))
    writeAtomic(join(folder, `${DATA_ADDON_NAME}.toc`), buildDataToc(interfaceVersion, result.hash))

    const realms = result.payload.realms.length
    const items = result.payload.realms.reduce((sum, r) => sum + r.items.length, 0)
    state.hash = result.hash
    state.generatedAt = result.payload.generated_at ?? null
    state.lastWriteAt = writtenAt
    state.realms = realms
    state.items = items

    await ackBuyList(settings, result.hash)

    appendActivity(
      'success',
      'Addon buy list updated',
      `${items} item(s) across ${realms} realm(s) · /reload in WoW to apply`
    )
    notify('Addon buy list updated', `${items} items across ${realms} realms. Use /reload in WoW.`, 'sync')
    emit()
    return { ok: true, wrote: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    setError(msg)
    emit()
    return { ok: false, error: msg }
  } finally {
    running = false
  }
}
