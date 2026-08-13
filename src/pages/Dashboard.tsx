import { useState, type JSX } from 'react'

import type { TsmWritePreviewDto } from '../../electron/preload'
import type { CompanionStatusSnapshot } from '../../shared/settings'

interface DashboardProps {
  status: CompanionStatusSnapshot | null
}

type SubTab = 'overview' | 'pnl'

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function Dashboard({ status }: DashboardProps): JSX.Element {
  const [subTab, setSubTab] = useState<SubTab>('overview')
  const autoSyncEnabled = status?.autoSyncEnabled ?? false
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null)
  const [preview, setPreview] = useState<TsmWritePreviewDto | null>(null)

  async function toggleAutoSync(): Promise<void> {
    await window.goblin.updateSettings({ autoSyncEnabled: !autoSyncEnabled })
  }

  async function forceSync(): Promise<void> {
    setBusy('sync')
    setMessage('Syncing inventory + accounting…')
    setMessageType(null)
    const invRes = await window.goblin.syncInventory()
    const accRes = await window.goblin.syncAccounting()
    setBusy(null)
    const ok = invRes.ok && accRes.ok
    if (ok) {
      setMessage('Sync completed successfully (inventory + accounting)')
      setMessageType('success')
    } else {
      setMessage(invRes.error || accRes.error || 'Sync failed')
      setMessageType('error')
    }
  }

  async function handlePreviewWrite(): Promise<void> {
    setBusy('write')
    setMessage(null)
    setMessageType(null)
    setPreview(null)
    const result = await window.goblin.previewTsmWrite()
    setBusy(null)
    setPreview(result)
    if (!result.ok) {
      setMessage(result.error || 'Failed to preview TSM write')
      setMessageType('error')
    }
  }

  async function handleConfirmWrite(): Promise<void> {
    if (!preview?.ok || !preview.assignments) return
    const confirmed = window.confirm(
      'Write TSM groups?\n\nWoW should be closed (or logged out of character).\nAn automatic rotating backup will be created before writing.'
    )
    if (!confirmed) return

    setBusy('write')
    const result = await window.goblin.confirmTsmWrite(preview.assignments)
    setBusy(null)
    setPreview(null)
    if (result.ok) {
      const stats = result.stats ?? {}
      setMessage(`Write OK — added=${stats.written ?? 0} updated=${stats.updated ?? 0} moved=${stats.moved ?? 0}`)
      setMessageType('success')
    } else {
      setMessage(`Write failed: ${result.error}`)
      setMessageType('error')
    }
  }

  const djangoLabel =
    status?.djangoReachable === null ? 'Unverified' : status?.djangoReachable ? 'OK' : 'Not responding'

  return (
    <div className="page">
      {/* Sub-tab Navigation Bar */}
      <nav
        aria-label="Dashboard Sub-Sections"
        style={{
          display: 'flex',
          gap: '10px',
          borderBottom: '1.5px solid rgba(251, 191, 36, 0.25)',
          paddingBottom: '10px'
        }}
      >
        <button
          type="button"
          onClick={() => setSubTab('overview')}
          className="btn"
          style={{
            background: subTab === 'overview' ? 'linear-gradient(135deg, rgba(50, 35, 8, 0.95) 0%, rgba(30, 20, 4, 0.98) 100%)' : 'rgba(12, 8, 3, 0.6)',
            borderColor: subTab === 'overview' ? '#fbbf24' : 'rgba(251, 191, 36, 0.2)',
            color: subTab === 'overview' ? '#fbbf24' : '#94a3b8'
          }}
        >
          <img src="/images/goblin_assets/wrench.png" alt="" />
          <span>Status & Controls</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('pnl')}
          className="btn"
          style={{
            background: subTab === 'pnl' ? 'linear-gradient(135deg, rgba(40, 20, 50, 0.95) 0%, rgba(20, 10, 30, 0.98) 100%)' : 'rgba(12, 8, 3, 0.6)',
            borderColor: subTab === 'pnl' ? '#c084fc' : 'rgba(251, 191, 36, 0.2)',
            color: subTab === 'pnl' ? '#c084fc' : '#94a3b8'
          }}
        >
          <img src="/images/goblin_assets/coin_badge_1.png" alt="" />
          <span>P&L Analytics</span>
        </button>
      </nav>

      {subTab === 'overview' ? (
        <>
          <div className="glass-panel dashboard-grid">
            <div className="dashboard-card">
              <span className="dashboard-card__label">Auto-sync</span>
              <label className="switch" style={{ margin: '4px 0' }}>
                <input type="checkbox" checked={autoSyncEnabled} onChange={() => void toggleAutoSync()} />
                <span className="switch__track" />
              </label>
              <span className="dashboard-card__hint">{autoSyncEnabled ? 'Active' : 'Disabled'}</span>
            </div>

            <div className="dashboard-card">
              <span className="dashboard-card__label">Django Status</span>
              <span className="dashboard-card__value" style={{ color: status?.djangoReachable ? '#4ade80' : '#f87171' }}>
                {djangoLabel}
              </span>
              <span className="dashboard-card__hint">{status?.syncing ? 'Syncing…' : ' '}</span>
            </div>

            <div className="dashboard-card">
              <span className="dashboard-card__label">Inventory</span>
              <span className="dashboard-card__value dashboard-card__value--sm">
                {formatWhen(status?.lastInventorySyncAt)}
              </span>
            </div>

            <div className="dashboard-card">
              <span className="dashboard-card__label">Accounting</span>
              <span className="dashboard-card__value dashboard-card__value--sm">
                {formatWhen(status?.lastAccountingSyncAt)}
              </span>
            </div>

            <div className="dashboard-card">
              <span className="dashboard-card__label">Queue</span>
              <span className="dashboard-card__value" style={{ color: '#fbbf24' }}>
                {status?.queueLength ?? 0}
              </span>
              <span className="dashboard-card__hint">pending</span>
            </div>
          </div>

          {/* Banner de Última Escritura TSM */}
          <div
            className="glass-panel"
            style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              border: status?.lastTsmWrite?.status === 'failed'
                ? '1.5px solid rgba(239, 68, 68, 0.45)'
                : status?.lastTsmWrite?.status === 'processing'
                ? '1.5px solid rgba(96, 165, 250, 0.45)'
                : '1.5px solid rgba(34, 197, 94, 0.35)',
              background: status?.lastTsmWrite?.status === 'failed'
                ? 'rgba(239, 68, 68, 0.08)'
                : status?.lastTsmWrite?.status === 'processing'
                ? 'rgba(96, 165, 250, 0.08)'
                : 'rgba(20, 15, 8, 0.85)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <img
                src="/images/goblin_assets/TSM.png"
                alt="TSM"
                style={{ width: 36, height: 36, objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.4))' }}
              />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '3px' }}>
                  <strong style={{ fontSize: '0.95em', color: '#fbbf24', fontFamily: 'var(--font-header)' }}>
                    Web TSM Write {status?.lastTsmWrite?.writeId ? `(#${status.lastTsmWrite.writeId})` : ''}
                  </strong>
                  {status?.lastTsmWrite?.at ? (
                    <span style={{ fontSize: '0.78em', color: '#94a3b8' }}>
                      · {new Date(status.lastTsmWrite.at).toLocaleTimeString()}
                    </span>
                  ) : null}
                </div>
                <p style={{ margin: 0, fontSize: '0.85em', color: '#cbd5e1' }}>
                  {status?.lastTsmWrite
                    ? status.lastTsmWrite.detail
                    : 'No recent write orders. Write groups from the web Cart or use manual preview below.'}
                </p>
              </div>
            </div>
            {status?.lastTsmWrite?.status === 'processing' ? (
              <span className="gc-badge gc-badge--warn">Executing…</span>
            ) : status?.lastTsmWrite?.status === 'done' ? (
              <span className="gc-badge gc-badge--ok">Completed</span>
            ) : status?.lastTsmWrite?.status === 'failed' ? (
              <span className="gc-badge gc-badge--error">Failed</span>
            ) : null}
          </div>

          <div className="button-row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={Boolean(status?.syncing || busy !== null)}
              onClick={() => void forceSync()}
            >
              <img src="/images/goblin_assets/search.png" alt="" />
              <span>{status?.syncing || busy === 'sync' ? 'Syncing (inventory + accounting)…' : 'Force sync now'}</span>
            </button>
          </div>

          {message ? (
            <div className={`activity-item ${messageType === 'success' ? 'activity-item--success' : messageType === 'error' ? 'activity-item--error' : 'activity-item--info'}`}>
              <img
                src={messageType === 'success' ? '/images/goblin_assets/success.png' : messageType === 'error' ? '/images/goblin_assets/failure.png' : '/images/goblin_assets/info.png'}
                alt=""
                className="activity-item__icon"
              />
              <span className="activity-item__message">{message}</span>
            </div>
          ) : null}

          {/* SECCIÓN WRITE TO TSM GROUPS */}
          <section className="glass-panel">
            <h2>
              <img src="/images/goblin_assets/edit.png" alt="" />
              <span>Write TSM Groups</span>
            </h2>
            <p className="page__note" style={{ marginBottom: '14px' }}>
              Single-group shortcut: uses the saved Cart mapping + all items in cart. For multi-group, write from web Cart (the companion will automatically create a pre-write backup).
            </p>
            <div className="button-row">
              <button
                type="button"
                className="btn btn--warning"
                disabled={busy !== null}
                onClick={() => void handlePreviewWrite()}
              >
                <img src="/images/goblin_assets/wrench.png" alt="" />
                <span>{busy === 'write' ? 'Preparing…' : 'Preview Write…'}</span>
              </button>
              {preview?.ok ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy !== null}
                  onClick={() => void handleConfirmWrite()}
                >
                  <img src="/images/goblin_assets/save.png" alt="" />
                  <span>Confirm Write</span>
                </button>
              ) : null}
            </div>
            {preview?.ok ? (
              <div className="write-preview" style={{ marginTop: 14 }}>
                <p className="page__note" style={{ marginBottom: 8 }}>
                  {preview.itemCount ?? 0} items · {preview.preview?.length ?? 0} group(s) · affected≈
                  {preview.totalItemsAffected ?? '—'}
                </p>
                <ul className="activity-list">
                  {(preview.preview ?? []).map((row) => (
                    <li key={row.group} className="activity-item activity-item--info">
                      <img src="/images/goblin_assets/info.png" alt="" className="activity-item__icon" />
                      <span className="activity-item__message">{row.group}</span>
                      <span className="activity-item__detail">
                        {row.details} · {row.total_items} items
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <p className="page__note">
            With auto-sync ON, when WoW closes (or SavedVariables are written), the companion reads `.lua`.
            The cart does not auto-fill: configure chars/warbank/guilds in Decoder and use Apply, or “Load from Companion” in Cart/Arbitrage.
          </p>
        </>
      ) : (
        /* TAB 2: P&L (PROFIT & LOSS) PLACEHOLDER */
        <section
          className="glass-panel"
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            border: '1.5px solid rgba(192, 132, 252, 0.4)',
            background: 'linear-gradient(135deg, rgba(28, 18, 40, 0.9) 0%, rgba(14, 8, 22, 0.95) 100%)'
          }}
        >
          <img
            src="/images/goblin_assets/coin_badge_1.png"
            alt="Gold Coin"
            style={{ width: 54, height: 54, objectFit: 'contain', filter: 'drop-shadow(0 0 12px rgba(192, 132, 252, 0.6))' }}
          />
          <h2 style={{ margin: 0, color: '#c084fc', fontSize: '1.5em', justifyContent: 'center' }}>
            Profit & Loss (P&L) Analytics
          </h2>
          <p style={{ maxWidth: '520px', margin: 0, color: '#94a3b8', fontSize: '0.92em', lineHeight: 1.6 }}>
            The P&L financial analysis module will calculate your net profits, sales margins, accumulated gold, and accounting history extracted directly from TSM Accounting.
          </p>
          <div
            style={{
              padding: '6px 18px',
              borderRadius: '999px',
              background: 'rgba(192, 132, 252, 0.15)',
              border: '1px solid rgba(192, 132, 252, 0.4)',
              color: '#e9d5ff',
              fontSize: '0.82em',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase'
            }}
          >
            ✦ Coming soon · Module under development ✦
          </div>
        </section>
      )}
    </div>
  )
}

export default Dashboard
