import { join } from 'node:path'

import { normalizeSavedVariablesPath } from './path-utils'
import { getSettings } from './settings'
import type { SyncKind } from './sync-manager'

export { normalizeSavedVariablesPath } from './path-utils'

const FILE_BY_KIND: Record<SyncKind, string> = {
  // Inventario (grupos/bags) y accounting (CSV history) viven en el main TSM.lua
  // en TSM moderno. AppHelper es otro flujo (Decoder), no accounting.
  inventory: 'TradeSkillMaster.lua',
  accounting: 'TradeSkillMaster.lua'
}

export function resolveLuaPath(kind: SyncKind): string | null {
  const folder = normalizeSavedVariablesPath(getSettings().wowSavedVariablesPath)
  if (!folder) return null
  return join(folder, FILE_BY_KIND[kind])
}
