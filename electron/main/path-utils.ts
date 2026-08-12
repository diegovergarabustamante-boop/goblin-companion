import { dirname } from 'node:path'

/**
 * Settings pide la carpeta SavedVariables. Si el usuario pega la ruta a un .lua,
 * usamos el directorio padre para no generar …/TradeSkillMaster.lua/TradeSkillMaster.lua.
 */
export function normalizeSavedVariablesPath(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '')
  if (!trimmed) return ''
  if (/\.lua$/i.test(trimmed)) return dirname(trimmed)
  return trimmed
}
