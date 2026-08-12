import { useState, type JSX } from 'react'

import type { CompanionSettings } from '../../shared/settings'

interface LoginScreenProps {
  initialSettings: CompanionSettings
  onLoginSuccess: (newSettings: CompanionSettings) => void
}

export default function LoginScreen({ initialSettings, onLoginSuccess }: LoginScreenProps): JSX.Element {
  const [djangoUrl, setDjangoUrl] = useState(initialSettings.djangoUrl || 'http://127.0.0.1:8000')
  const [username, setUsername] = useState(initialSettings.username || '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e?: React.FormEvent): Promise<void> {
    if (e) e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Por favor ingresá tu usuario y contraseña de la web')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await window.goblin.login(djangoUrl.trim() || 'http://127.0.0.1:8000', username.trim(), password)
      if (result.ok && result.token) {
        const updated = await window.goblin.getSettings()
        onLoginSuccess(updated)
      } else {
        setError(result.error || 'Credenciales inválidas. Revisa usuario y contraseña.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'linear-gradient(135deg, rgba(12, 8, 4, 0.98) 0%, rgba(24, 17, 8, 0.99) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '32px 28px',
          borderRadius: '16px',
          border: '1.5px solid rgba(251, 191, 36, 0.45)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.85), 0 0 20px rgba(251, 191, 36, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5em', marginBottom: '8px' }}>🤖</div>
          <h2 style={{ margin: 0, color: '#fbbf24', fontSize: '1.4em', letterSpacing: '0.02em' }}>
            Goblin Companion
          </h2>
          <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '0.86em' }}>
            Iniciá sesión con tu cuenta registrada en la web <strong>Auction House Profit</strong>.
          </p>
        </div>

        <form onSubmit={(e) => void handleLogin(e)} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label className="field">
            <span style={{ fontSize: '0.82em', color: '#cbd5e1', fontWeight: 600 }}>URL del Servidor Web</span>
            <input
              type="text"
              value={djangoUrl}
              onChange={(e) => setDjangoUrl(e.target.value)}
              placeholder="http://127.0.0.1:8000"
              style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '6px', color: '#f8fafc' }}
            />
          </label>

          <label className="field">
            <span style={{ fontSize: '0.82em', color: '#cbd5e1', fontWeight: 600 }}>Usuario Web</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Tu nombre de usuario"
              autoFocus
              style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '6px', color: '#f8fafc' }}
            />
          </label>

          <label className="field">
            <span style={{ fontSize: '0.82em', color: '#cbd5e1', fontWeight: 600 }}>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña web"
              style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '6px', color: '#f8fafc' }}
            />
          </label>

          {error ? (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                fontSize: '0.85em',
                fontWeight: 600
              }}
            >
              ✗ {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy}
            style={{
              padding: '10px 16px',
              fontSize: '0.95em',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#000',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginTop: '4px'
            }}
          >
            {busy ? '🔐 Verificando credenciales…' : '🔐 Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
