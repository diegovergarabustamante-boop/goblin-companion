import { useEffect, useState, type JSX } from 'react'

import type { CompanionSettings, DjangoPingResult } from '../../shared/settings'

type SaveState = 'idle' | 'saving' | 'saved'
type TestState = 'idle' | 'testing'

interface SettingsProps {
  onLogout?: () => void
}

function Settings({ onLogout }: SettingsProps): JSX.Element {
  const [settings, setSettings] = useState<CompanionSettings | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [testState, setTestState] = useState<TestState>('idle')
  const [testResult, setTestResult] = useState<DjangoPingResult | null>(null)

  // Login form state
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const reloadSettings = (): void => {
    window.goblin.getSettings().then((cfg) => {
      setSettings(cfg)
      if (cfg.username) setLoginUser(cfg.username)
    })
  }

  useEffect(() => {
    reloadSettings()
  }, [])

  function patch(update: Partial<CompanionSettings>): void {
    setSettings((current) => (current ? { ...current, ...update } : current))
    setTestResult(null)
  }

  async function handleLogin(): Promise<void> {
    if (!settings) return
    if (!loginUser.trim() || !loginPass.trim()) {
      setLoginError('Por favor ingresá tu usuario y contraseña de la web')
      return
    }

    setLoginBusy(true)
    setLoginError(null)

    try {
      const result = await window.goblin.login(settings.djangoUrl || 'http://127.0.0.1:8000', loginUser.trim(), loginPass)
      if (result.ok) {
        setLoginPass('')
        reloadSettings()
      } else {
        setLoginError(result.error || 'Credenciales inválidas')
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoginBusy(false)
    }
  }

  async function handleLogout(): Promise<void> {
    if (!window.confirm('¿Cerrar sesión en Goblin Companion?')) return
    await window.goblin.logout()
    setLoginPass('')
    setLoginError(null)
    setTestResult(null)
    onLogout?.()
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

  const isLoggedIn = Boolean(settings.companionToken)

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* SECCIÓN 1: LOGIN Y CONEXIÓN */}
      <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h2>🔐 Conexión & Cuenta Web</h2>

        {isLoggedIn ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.3)'
              }}
            >
              <div>
                <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.95em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  👤 Sesión Activa: {settings.username || 'Usuario Web'}
                </span>
                <span style={{ color: '#94a3b8', fontSize: '0.82em' }}>
                  Servidor: <code>{settings.djangoUrl}</code>
                </span>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => void handleLogout()}
                style={{ padding: '6px 12px', fontSize: '0.82em', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                🚪 Cerrar Sesión
              </button>
            </div>

            <label className="field">
              <span>URL del Servidor Django</span>
              <input
                type="text"
                value={settings.djangoUrl}
                onChange={(event) => patch({ djangoUrl: event.target.value })}
                placeholder="http://127.0.0.1:8000"
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
          </div>
        ) : (
          /* FORMULARIO DE LOGIN SI NO HAY SESIÓN */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p className="page__note" style={{ margin: 0 }}>
              Ingresá con las mismas credenciales de usuario con las que te registraste en la web <strong>Auction House Profit</strong>.
            </p>

            <label className="field">
              <span>URL del Servidor Web</span>
              <input
                type="text"
                value={settings.djangoUrl}
                onChange={(event) => patch({ djangoUrl: event.target.value })}
                placeholder="http://127.0.0.1:8000"
              />
            </label>

            <label className="field">
              <span>Usuario Web</span>
              <input
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="Tu nombre de usuario"
              />
            </label>

            <label className="field">
              <span>Contraseña</span>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="Tu contraseña web"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleLogin()
                }}
              />
            </label>

            {loginError ? (
              <div style={{ color: '#f87171', fontSize: '0.85em', fontWeight: 600 }}>
                ✗ {loginError}
              </div>
            ) : null}

            <button
              type="button"
              className="btn btn--primary"
              disabled={loginBusy}
              onClick={() => void handleLogin()}
              style={{ marginTop: '6px' }}
            >
              {loginBusy ? '🔐 Autenticando…' : '🔐 Iniciar Sesión'}
            </button>
          </div>
        )}
      </section>

      {/* SECCIÓN 2: WOW SAVEDVARIABLES */}
      <section className="glass-panel">
        <h2>WoW SavedVariables</h2>
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

      {/* SECCIÓN 3: NOTIFICACIONES Y ARRANQUE */}
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
