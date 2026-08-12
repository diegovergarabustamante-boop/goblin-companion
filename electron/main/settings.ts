import Store from 'electron-store'

import { CompanionSettings, DEFAULT_SETTINGS } from '../../shared/settings'

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
    localServerPort: env.LOCAL_SERVER_PORT ? Number(env.LOCAL_SERVER_PORT) : DEFAULT_SETTINGS.localServerPort
  }
}

const store = new Store<CompanionSettings>({
  name: 'goblin-companion-settings',
  defaults: { ...DEFAULT_SETTINGS, ...envDefaults() }
})

export function getSettings(): CompanionSettings {
  return { ...DEFAULT_SETTINGS, ...store.store }
}

export function updateSettings(patch: Partial<CompanionSettings>): CompanionSettings {
  store.set({ ...store.store, ...patch })
  return getSettings()
}
