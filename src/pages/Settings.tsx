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
      setLoginError('Please enter your web username and password')
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
        setLoginError(result.error || 'Invalid credentials')
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoginBusy(false)
    }
  }

  async function handleLogout(): Promise<void> {
    if (!window.confirm('Log out of Goblin Companion?')) return
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
        <p className="page__note">Loading settings…</p>
      </div>
    )
  }

  const isLoggedIn = Boolean(settings.companionToken)

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* SECCIÓN 1: LOGIN Y CONEXIÓN */}
      <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h2>
          <img src="./images/goblin_assets/database.png" alt="" />
          <span>Web Connection & Account</span>
        </h2>

        {isLoggedIn ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.3)'
              }}
            >
              <div>
                <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.95em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <img src="./images/goblin_assets/user.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                  <span>Active Session: {settings.username || 'Web User'}</span>
                </span>
                <span style={{ color: '#94a3b8', fontSize: '0.82em', display: 'block', marginTop: '2px' }}>
                  Server: <code>{settings.djangoUrl}</code>
                </span>
              </div>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => void handleLogout()}
                style={{ padding: '6px 14px', fontSize: '0.82em' }}
              >
                <img src="./images/goblin_assets/logout.png" alt="" style={{ width: 14, height: 14 }} />
                <span>Log Out</span>
              </button>
            </div>

            <label className="field">
              <span>Django Server URL</span>
              <input
                type="text"
                value={settings.djangoUrl}
                onChange={(event) => patch({ djangoUrl: event.target.value })}
                placeholder="http://127.0.0.1:8000"
              />
            </label>

            <div className="button-row">
              <button type="button" className="btn" onClick={() => void handleTestConnection()} disabled={testState === 'testing'}>
                <img src="./images/goblin_assets/search.png" alt="" style={{ width: 16, height: 16 }} />
                <span>{testState === 'testing' ? 'Testing…' : 'Test Connection'}</span>
              </button>
              {testResult && (
                <span className={testResult.ok ? 'test-result test-result--ok' : 'test-result test-result--error'}>
                  {testResult.ok
                    ? `Connected${testResult.user ? ` as ${testResult.user}` : ''}`
                    : testResult.error}
                </span>
              )}
            </div>
          </div>
        ) : (
          /* FORMULARIO DE LOGIN SI NO HAY SESIÓN */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p className="page__note" style={{ margin: 0 }}>
              Sign in with the same account credentials you registered with on the <strong>Auction House Profit</strong> web app.
            </p>

            <label className="field">
              <span>Web Server URL</span>
              <input
                type="text"
                value={settings.djangoUrl}
                onChange={(event) => patch({ djangoUrl: event.target.value })}
                placeholder="http://127.0.0.1:8000"
              />
            </label>

            <label className="field">
              <span>Web Username</span>
              <input
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="Your web username"
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="Your web password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleLogin()
                }}
              />
            </label>

            {loginError ? (
              <div style={{ color: '#f87171', fontSize: '0.85em', fontWeight: 600 }}>
                {loginError}
              </div>
            ) : null}

            <button
              type="button"
              className="btn btn--primary"
              disabled={loginBusy}
              onClick={() => void handleLogin()}
              style={{ marginTop: '6px' }}
            >
              <img src="./images/goblin_assets/login.png" alt="" style={{ width: 16, height: 16 }} />
              <span>{loginBusy ? 'Authenticating…' : 'Sign In'}</span>
            </button>
          </div>
        )}
      </section>

      {/* SECCIÓN 2: WOW SAVEDVARIABLES */}
      <section className="glass-panel">
        <h2>
          <img src="./images/goblin_assets/TSM.png" alt="" />
          <span>WoW SavedVariables</span>
        </h2>
        <label className="field">
          <span>SavedVariables Folder (not the .lua file)</span>
          <input
            type="text"
            value={settings.wowSavedVariablesPath}
            onChange={(event) => patch({ wowSavedVariablesPath: event.target.value })}
            placeholder="…/SavedVariables (folder, not the .lua file)"
          />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(12, 8, 3, 0.6)', borderRadius: '8px', border: '1px solid rgba(251, 191, 36, 0.2)', marginTop: '8px' }}>
          <div>
            <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: '0.92em', display: 'block', fontFamily: 'var(--font-header)' }}>
              Automatic SavedVariables Sync
            </span>
            <span style={{ color: '#94a3b8', fontSize: '0.82em' }}>
              Automatically parse and sync .lua changes when WoW saves or exits
            </span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.autoSyncEnabled}
              onChange={(event) => patch({ autoSyncEnabled: event.target.checked })}
            />
            <span className="switch__track" />
          </label>
        </div>
      </section>

      {/* SECCIÓN 3: NOTIFICACIONES, LOGS Y ARRANQUE */}
      <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h2>
          <img src="./images/goblin_assets/info.png" alt="" />
          <span>Notifications, Logs & System</span>
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={(event) => patch({ notificationsEnabled: event.target.checked })}
            />
            <span style={{ fontWeight: 700, color: '#f3f4f6' }}>Enable native Windows desktop notifications</span>
          </label>

          {/* Sub-toggles granulares */}
          <div
            style={{
              marginLeft: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              opacity: settings.notificationsEnabled ? 1 : 0.45,
              pointerEvents: settings.notificationsEnabled ? 'auto' : 'none',
              transition: 'opacity 0.2s ease'
            }}
          >
            <label className="checkbox-field" style={{ fontSize: '0.88em' }}>
              <input
                type="checkbox"
                checked={settings.notifyOnSync ?? true}
                disabled={!settings.notificationsEnabled}
                onChange={(e) => patch({ notifyOnSync: e.target.checked })}
              />
              <span>Inventory and accounting syncs</span>
            </label>

            <label className="checkbox-field" style={{ fontSize: '0.88em' }}>
              <input
                type="checkbox"
                checked={settings.notifyOnWrite ?? true}
                disabled={!settings.notificationsEnabled}
                onChange={(e) => patch({ notifyOnWrite: e.target.checked })}
              />
              <span>TSM write orders received from web</span>
            </label>

            <label className="checkbox-field" style={{ fontSize: '0.88em' }}>
              <input
                type="checkbox"
                checked={settings.notifyOnError ?? true}
                disabled={!settings.notificationsEnabled}
                onChange={(e) => patch({ notifyOnError: e.target.checked })}
              />
              <span>Error alerts and failures</span>
            </label>
          </div>
        </div>

        <hr style={{ borderColor: 'rgba(251, 191, 36, 0.15)', margin: '4px 0' }} />

        <div>
          <span style={{ fontSize: '0.88em', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '4px', fontFamily: 'var(--font-header)' }}>
            Activity Log Retention
          </span>
          <p style={{ margin: 0, fontSize: '0.82em', color: '#94a3b8' }}>
            The system preserves a <strong>maximum of 300 events</strong> in memory and on disk. As new records arrive, older entries are automatically discarded.
          </p>
        </div>

        <hr style={{ borderColor: 'rgba(251, 191, 36, 0.15)', margin: '4px 0' }} />

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={settings.startWithWindows}
            onChange={(event) => patch({ startWithWindows: event.target.checked })}
          />
          <span style={{ color: '#f3f4f6' }}>Start with Windows (minimized to tray)</span>
        </label>
      </section>

      <button type="button" className="btn btn--primary" onClick={() => void handleSave()} style={{ padding: '12px 24px', fontSize: '0.95em' }}>
        <img src="./images/goblin_assets/save.png" alt="" style={{ width: 18, height: 18 }} />
        <span>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save Changes'}</span>
      </button>
    </div>

  )
}

export default Settings
