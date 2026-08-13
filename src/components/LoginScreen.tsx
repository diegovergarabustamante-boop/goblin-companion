import { useState, type JSX } from 'react'

import type { CompanionSettings } from '../../shared/settings'
import TitleBar from './TitleBar'

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
      setError('Please enter your web username and password')
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
        setError(result.error || 'Invalid credentials. Please check your username and password.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <TitleBar status={null} />

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          background: 'var(--color-bg) url("/images/bg/fantasy_merchant_ledger.png") no-repeat center center fixed',
          backgroundSize: 'cover',
          position: 'relative'
        }}
      >
        {/* Dark overlay for login screen backdrop */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(11, 15, 25, 0.78)',
            backdropFilter: 'blur(3px)',
            zIndex: 0
          }}
        />

        <div
          className="glass-panel"
          style={{
            width: '100%',
            maxWidth: '420px',
            padding: '36px 30px',
            borderRadius: '16px',
            border: '1.5px solid var(--border-color-glow)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.85), 0 0 25px rgba(251, 191, 36, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            position: 'relative',
            zIndex: 1
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <img
              src="/images/goblin_assets/coin_badge_1.png"
              alt="Goblin"
              style={{
                width: 64,
                height: 64,
                margin: '0 auto 12px',
                display: 'block',
                filter: 'drop-shadow(0 0 10px rgba(251, 191, 36, 0.6))'
              }}
            />
            <h2 style={{ margin: 0, color: '#fbbf24', fontSize: '1.5em', fontFamily: 'var(--font-display)', justifyContent: 'center' }}>
              Goblin Companion
            </h2>
            <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '0.86em' }}>
              Sign in with your <strong>Auction House Profit</strong> account credentials.
            </p>
          </div>

          <form onSubmit={(e) => void handleLogin(e)} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label className="field">
              <span style={{ fontSize: '0.82em', color: '#cbd5e1', fontWeight: 600, fontFamily: 'var(--font-header)' }}>Web Server URL</span>
              <input
                type="text"
                value={djangoUrl}
                onChange={(e) => setDjangoUrl(e.target.value)}
                placeholder="http://127.0.0.1:8000"
              />
            </label>

            <label className="field">
              <span style={{ fontSize: '0.82em', color: '#cbd5e1', fontWeight: 600, fontFamily: 'var(--font-header)' }}>Web Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your web username"
                autoFocus
              />
            </label>

            <label className="field">
              <span style={{ fontSize: '0.82em', color: '#cbd5e1', fontWeight: 600, fontFamily: 'var(--font-header)' }}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your web password"
              />
            </label>

            {error ? (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  fontSize: '0.85em',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <img src="/images/goblin_assets/failure.png" alt="" style={{ width: 16, height: 16 }} />
                <span>{error}</span>
              </div>
            ) : null}

            <button
              type="submit"
              className="btn btn--primary"
              disabled={busy}
              style={{
                padding: '12px 18px',
                fontSize: '0.95em',
                fontWeight: 700,
                marginTop: '4px'
              }}
            >
              <img src="/images/goblin_assets/login.png" alt="" style={{ width: 18, height: 18 }} />
              <span>{busy ? 'Verifying credentials…' : 'Sign In'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
