import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Carga un `.env` simple (KEY=VALUE) en process.env sin sobrescribir
 * variables ya definidas. electron-vite solo inyecta prefijos VITE_/MAIN_VITE_.
 */
export function loadDotEnv(explicitPath?: string): void {
  const candidates = [
    explicitPath,
    join(process.cwd(), '.env'),
    join(dirname(fileURLToPath(import.meta.url)), '../../.env')
  ].filter((p): p is string => Boolean(p))

  for (const path of candidates) {
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const eq = line.indexOf('=')
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      if (key && process.env[key] === undefined) {
        process.env[key] = value
      }
    }
    return
  }
}
