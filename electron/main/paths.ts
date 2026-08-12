import { join } from 'node:path'

import { getSettings } from './settings'
import type { SyncKind } from './sync-manager'

const FILE_BY_KIND: Record<SyncKind, string> = {
  inventory: 'TradeSkillMaster.lua',
  accounting: 'TradeSkillMaster_Accounting.lua'
}

export function resolveLuaPath(kind: SyncKind): string | null {
  const { wowSavedVariablesPath } = getSettings()
  if (!wowSavedVariablesPath) return null
  return join(wowSavedVariablesPath, FILE_BY_KIND[kind])
}
