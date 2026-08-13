import { useState, type JSX } from 'react'

import type { CompanionSettings } from '../../shared/settings'

interface FirstRunWizardProps {
  initial: CompanionSettings
  onCompleted: (settings: CompanionSettings) => void
}

function FirstRunWizard({ initial, onCompleted }: FirstRunWizardProps): JSX.Element {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<CompanionSettings>(initial)
  const [testing, setTesting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Login inputs
  const [user, setUser] = useState(initial.username || '')
  const [pass, setPass] = useState('')

  function patch(update: Partial<CompanionSettings>): void {
    setDraft((current) => ({ ...current, ...update }))
  }

  async function handleLogin(): Promise<void> {
    if (!user.trim() || !pass.trim()) {
      setLoginError('Ingresá usuario y contraseña de la web')
      return
    }
    setTesting(true)
    setLoginError(null)

    try {
      const result = await window.goblin.login(draft.djangoUrl || 'http://127.0.0.1:8000', user.trim(), pass)
      if (result.ok && result.token) {
        setDraft((curr) => ({
          ...curr,
          username: result.username ?? user.trim(),
          companionToken: result.token!
        }))
        setStep(1) // Move to next step
      } else {
        setLoginError(result.error || 'Credenciales inválidas')
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  async function finish(): Promise<void> {
    setSaving(true)
    const next = await window.goblin.updateSettings({
      ...draft,
      firstRunCompleted: true
    })
    setSaving(false)
    onCompleted(next)
  }

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className="wizard-card glass-panel" style={{ border: '1.5px solid var(--border-color-glow)' }}>
        <p className="wizard-kicker">Goblin Companion</p>
        <h2 id="wizard-title">
          {step === 0 && (
            <>
              <img src="/images/goblin_assets/database.png" alt="" style={{ width: 22, height: 22 }} />
              <span>Iniciar Sesión con tu Cuenta Web</span>
            </>
          )}
          {step === 1 && (
            <>
              <img src="/images/goblin_assets/TSM.png" alt="" style={{ width: 22, height: 22 }} />
              <span>Carpeta de WoW</span>
            </>
          )}
          {step === 2 && (
            <>
              <img src="/images/goblin_assets/icon_config.png" alt="" style={{ width: 22, height: 22 }} />
              <span>Preferencias</span>
            </>
          )}
        </h2>

        {step === 0 ? (
          <>
            <p className="page__note">
              Ingresá con las mismas credenciales que usás en la web <strong>Auction House Profit</strong>.
            </p>
            <label className="field">
              <span>URL del Servidor</span>
              <input
                type="text"
                value={draft.djangoUrl}
                onChange={(e) => patch({ djangoUrl: e.target.value })}
                placeholder="http://127.0.0.1:8000"
              />
            </label>
            <label className="field">
              <span>Usuario Web</span>
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="Tu usuario"
              />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Tu contraseña web"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleLogin()
                }}
              />
            </label>

            {loginError ? (
              <div style={{ color: '#f87171', fontSize: '0.85em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <img src="/images/goblin_assets/failure.png" alt="" style={{ width: 14, height: 14 }} />
                <span>{loginError}</span>
              </div>
            ) : null}

            {draft.companionToken ? (
              <div style={{ color: '#4ade80', fontSize: '0.85em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <img src="/images/goblin_assets/success.png" alt="" style={{ width: 14, height: 14 }} />
                <span>Conectado como {draft.username || 'Usuario Web'}</span>
              </div>
            ) : null}

            <div className="button-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--primary" disabled={testing} onClick={() => void handleLogin()}>
                <img src="/images/goblin_assets/login.png" alt="" style={{ width: 16, height: 16 }} />
                <span>{testing ? 'Verificando…' : 'Iniciar Sesión'}</span>
              </button>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <p className="page__note">
              Ruta a …/_retail_/WTF/Account/&lt;TU_CUENTA&gt;/SavedVariables (donde está TradeSkillMaster.lua).
            </p>
            <label className="field">
              <span>SavedVariables</span>
              <input
                type="text"
                value={draft.wowSavedVariablesPath}
                onChange={(e) => patch({ wowSavedVariablesPath: e.target.value })}
                placeholder="…\SavedVariables  (carpeta, no el archivo .lua)"
              />
            </label>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <p className="page__note">Podés cambiar estos valores en Settings más tarde.</p>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.autoSyncEnabled}
                onChange={(e) => patch({ autoSyncEnabled: e.target.checked })}
              />
              <span style={{ color: '#f3f4f6' }}>Auto-sync al detectar cambios en SavedVariables</span>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.notificationsEnabled}
                onChange={(e) => patch({ notificationsEnabled: e.target.checked })}
              />
              <span style={{ color: '#f3f4f6' }}>Notificaciones de escritorio</span>
            </label>
          </>
        ) : null}

        <div className="wizard-actions button-row">
          {step > 0 ? (
            <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>
              Anterior
            </button>
          ) : null}

          {step < 2 ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={step === 0 && !draft.companionToken}
              onClick={() => setStep((s) => s + 1)}
            >
              Siguiente
            </button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void finish()}>
              <img src="/images/goblin_assets/save.png" alt="" style={{ width: 16, height: 16 }} />
              <span>{saving ? 'Guardando…' : 'Comenzar a usar'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default FirstRunWizard
