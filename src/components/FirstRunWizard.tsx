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

  function patch(update: Partial<CompanionSettings>): void {
    setDraft((current) => ({ ...current, ...update }))
    setTestResult(null)
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
          {step === 0 && 'Conexión con Django'}
          {step === 1 && 'Carpeta de WoW'}
          {step === 2 && 'Preferencias'}
        </h2>

        {step === 0 ? (
          <>
            <p className="page__note">Mismo token que COMPANION_TOKEN en el .env de Django.</p>
            <label className="field">
              <span>Django URL</span>
              <input
                type="text"
                value={draft.djangoUrl}
                onChange={(e) => patch({ djangoUrl: e.target.value })}
                placeholder="http://127.0.0.1:8000"
              />
            </label>
            <label className="field">
              <span>Companion Token</span>
              <input
                type="password"
                value={draft.companionToken}
                onChange={(e) => patch({ companionToken: e.target.value })}
                placeholder="X-Companion-Token"
              />
            </label>
            <div className="button-row">
              <button type="button" className="btn" disabled={testing} onClick={() => void handleTest()}>
                {testing ? 'Probando…' : 'Probar conexión'}
              </button>
              {testResult ? (
                <span className={testResult.ok ? 'test-result test-result--ok' : 'test-result test-result--error'}>
                  {testResult.ok ? '✓ OK' : `✗ ${testResult.error}`}
                </span>
              ) : null}
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
                placeholder="C:\Program Files (x86)\World of Warcraft\_retail_\WTF\Account\…\SavedVariables"
              />
            </label>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.autoSyncEnabled}
                onChange={(e) => patch({ autoSyncEnabled: e.target.checked })}
              />
              <span>Activar auto-sync ahora</span>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.notificationsEnabled}
                onChange={(e) => patch({ notificationsEnabled: e.target.checked })}
              />
              <span>Notificaciones nativas</span>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.startWithWindows}
                onChange={(e) => patch({ startWithWindows: e.target.checked })}
              />
              <span>Iniciar con Windows</span>
            </label>
          </>
        ) : null}

        <div className="wizard-actions button-row">
          {step > 0 ? (
            <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>
              Atrás
            </button>
          ) : null}
          {step < 2 ? (
            <button type="button" className="btn btn--primary" onClick={() => setStep((s) => s + 1)}>
              Siguiente
            </button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void finish()}>
              {saving ? 'Guardando…' : 'Empezar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default FirstRunWizard
