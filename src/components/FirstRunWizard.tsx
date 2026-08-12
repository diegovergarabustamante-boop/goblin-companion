import { useState, type JSX } from 'react'

import type { CompanionSettings, DjangoPingResult } from '../../shared/settings'

interface FirstRunWizardProps {
  initial: CompanionSettings
  onCompleted: (settings: CompanionSettings) => void
}

function FirstRunWizard({ initial, onCompleted }: FirstRunWizardProps): JSX.Element {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<CompanionSettings>(initial)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<DjangoPingResult | null>(null)
  const [saving, setSaving] = useState(false)

  // Login inputs
  const [user, setUser] = useState(initial.username || '')
  const [pass, setPass] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  function patch(update: Partial<CompanionSettings>): void {
    setDraft((current) => ({ ...current, ...update }))
    setTestResult(null)
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
        setTestResult({ ok: true, user: result.username })
        setStep(1) // Move to next step!
      } else {
        setLoginError(result.error || 'Credenciales inválidas')
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true)
    setTestResult(null)
    const result = await window.goblin.testConnection({
      djangoUrl: draft.djangoUrl,
      companionToken: draft.companionToken
    })
    setTestResult(result)
    setTesting(false)
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
      <div className="wizard-card glass-panel">
        <p className="wizard-kicker">Goblin Companion</p>
        <h2 id="wizard-title">
          {step === 0 && '🔐 Iniciar Sesión con tu Cuenta Web'}
          {step === 1 && '📁 Carpeta de WoW'}
          {step === 2 && '⚙️ Preferencias'}
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
              <div style={{ color: '#f87171', fontSize: '0.85em', fontWeight: 600 }}>
                ✗ {loginError}
              </div>
            ) : null}

            {draft.companionToken ? (
              <div style={{ color: '#4ade80', fontSize: '0.85em', fontWeight: 600 }}>
                ✓ Conectado como {draft.username || 'Usuario Web'}
              </div>
            ) : null}

            <div className="button-row">
              <button type="button" className="btn btn--primary" disabled={testing} onClick={() => void handleLogin()}>
                {testing ? '🔐 Verificando…' : '🔐 Iniciar Sesión'}
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
              <span>Auto-sync al detectar cambios en SavedVariables</span>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.notificationsEnabled}
                onChange={(e) => patch({ notificationsEnabled: e.target.checked })}
              />
              <span>Notificaciones de escritorio</span>
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
              {saving ? 'Guardando…' : 'Comenzar a usar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default FirstRunWizard
