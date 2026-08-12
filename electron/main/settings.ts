import Store from 'electron-store'

import { CompanionSettings, DEFAULT_SETTINGS } from '../../shared/settings'
import { normalizeSavedVariablesPath } from './path-utils'

/**
 * Prioridad de configuración (plan sección 10): UI Settings > .env > defaults.
 * El .env solo aporta los defaults iniciales; una vez el usuario guarda desde
 * la UI, electron-store es la fuente de verdad.
 */
function envDefaults(): Partial<CompanionSettings> {
  const env = process.env
  return {
    djangoUrl: env.DJANGO_URL ?? DEFAULT_SETTINGS.djangoUrl,
    companionToken: env.COMPANION_TOKEN ?? DEFAULT_SETTINGS.companionToken,
    wowSavedVariablesPath: env.WOW_SAVED_VARIABLES_PATH ?? DEFAULT_SETTINGS.wowSavedVariablesPath,
    localServerPort: env.LOCAL_SERVER_PORT ? Number(env.LOCAL_SERVER_PORT) : DEFAULT_SETTINGS.localServerPort
  }
}

const store = new Store<CompanionSettings>({
  name: 'goblin-companion-settings',
  defaults: { ...DEFAULT_SETTINGS, ...envDefaults() }
})

export function getSettings(): CompanionSettings {
  const merged = { ...DEFAULT_SETTINGS, ...store.store }

  // Migración Stage 8: instalaciones previas ya configuradas no deben ver el wizard.
  if (
    !store.has('firstRunCompleted') &&
    Boolean(merged.companionToken || merged.wowSavedVariablesPath)
  ) {
    merged.firstRunCompleted = true
    store.set('firstRunCompleted', true)
  }

  return merged
}

export function updateSettings(patch: Partial<CompanionSettings>): CompanionSettings {
  const next = { ...store.store, ...patch }
  if (typeof next.wowSavedVariablesPath === 'string') {
    next.wowSavedVariablesPath = normalizeSavedVariablesPath(next.wowSavedVariablesPath)
  }
  store.set(next)
  return getSettings()
}
