import { useEffect, useState, type JSX } from 'react'

import type { CompanionSettings, DjangoPingResult } from '../../shared/settings'

type SaveState = 'idle' | 'saving' | 'saved'
type TestState = 'idle' | 'testing'

function Settings(): JSX.Element {
  const [settings, setSettings] = useState<CompanionSettings | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [testState, setTestState] = useState<TestState>('idle')
  const [testResult, setTestResult] = useState<DjangoPingResult | null>(null)

  useEffect(() => {
    window.goblin.getSettings().then(setSettings)
  }, [])

  function patch(update: Partial<CompanionSettings>): void {
    setSettings((current) => (current ? { ...current, ...update } : current))
    setTestResult(null)
  }

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaveState('saving')
    const next = await window.goblin.updateSettings(settings)
    setSettings(next)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  async function handleTestConnection(): Promise<void> {
    if (!settings) return
    setTestState('testing')
    setTestResult(null)
    const result = await window.goblin.testConnection({
      djangoUrl: settings.djangoUrl,
      companionToken: settings.companionToken
    })
    setTestResult(result)
    setTestState('idle')
  }

  if (!settings) {
    return (
      <div className="page">
        <p>Cargando…</p>
      </div>
    )
  }

  return (
    <div className="page">
      <section className="glass-panel">
        <h2>Conexión con Django</h2>
        <label className="field">
          <span>Django URL</span>
          <input
            type="text"
            value={settings.djangoUrl}
            onChange={(event) => patch({ djangoUrl: event.target.value })}
            placeholder="http://127.0.0.1:8000"
          />
        </label>
        <label className="field">
          <span>Companion Token</span>
          <input
            type="password"
            value={settings.companionToken}
            onChange={(event) => patch({ companionToken: event.target.value })}
            placeholder="X-Companion-Token"
          />
        </label>

        <div className="button-row">
          <button type="button" className="btn" onClick={() => void handleTestConnection()} disabled={testState === 'testing'}>
            {testState === 'testing' ? 'Probando…' : 'Probar conexión'}
          </button>
          {testResult && (
            <span className={testResult.ok ? 'test-result test-result--ok' : 'test-result test-result--error'}>
              {testResult.ok
                ? `✓ Conectado${testResult.user ? ` como ${testResult.user}` : ''}`
                : `✗ ${testResult.error}`}
            </span>
          )}
        </div>
      </section>

      <section className="glass-panel">
        <h2>WoW</h2>
        <label className="field">
          <span>Carpeta SavedVariables (no el archivo .lua)</span>
          <input
            type="text"
            value={settings.wowSavedVariablesPath}
            onChange={(event) => patch({ wowSavedVariablesPath: event.target.value })}
            placeholder="…/SavedVariables  (carpeta, no el .lua)"
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={settings.autoSyncEnabled}
            onChange={(event) => patch({ autoSyncEnabled: event.target.checked })}
          />
          <span>Auto-sync al detectar cambios en .lua</span>
        </label>
      </section>

      <section className="glass-panel">
        <h2>Backups</h2>
        <label className="field">
          <span>Copias rotatorias (1–10)</span>
          <input
            type="number"
            min={1}
            max={10}
            value={settings.backupCount}
            onChange={(event) => patch({ backupCount: Number(event.target.value) })}
          />
        </label>
      </section>

      <section className="glass-panel">
        <h2>Notificaciones y arranque</h2>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={(event) => patch({ notificationsEnabled: event.target.checked })}
          />
          <span>Notificaciones nativas (sync / write)</span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={settings.startWithWindows}
            onChange={(event) => patch({ startWithWindows: event.target.checked })}
          />
          <span>Iniciar con Windows (minimizado al tray)</span>
        </label>
      </section>

      <button type="button" className="btn btn--primary" onClick={() => void handleSave()}>
        {saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? 'Guardado ✓' : 'Guardar cambios'}
      </button>
    </div>
  )
}

export default Settings
