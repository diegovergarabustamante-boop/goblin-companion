import { dirname } from 'node:path'

/**
 * Settings pide la carpeta SavedVariables. Si el usuario pega la ruta a un .lua,
 * usamos el directorio padre para no generar …/TradeSkillMaster.lua/TradeSkillMaster.lua.
 */
export function normalizeSavedVariablesPath(raw: string): string {
  let cleaned = raw.trim().replace(/^["']|["']$/g, '')
  if (!cleaned) return ''
  // Limpia espacios accidentales alrededor de separadores \ y /
  cleaned = cleaned.replace(/\s*[\/\\]\s*/g, '\\')
  if (/\.lua$/i.test(cleaned)) return dirname(cleaned)
  return cleaned
}
