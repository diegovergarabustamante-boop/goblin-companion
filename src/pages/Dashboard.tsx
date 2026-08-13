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
  const [preview, setPreview] = useState<TsmWritePreviewDto | null>(null)

  async function toggleAutoSync(): Promise<void> {
    await window.goblin.updateSettings({ autoSyncEnabled: !autoSyncEnabled })
  }

  async function forceSync(): Promise<void> {
    setBusy('sync')
    setMessage('Syncing inventory + accounting…')
    const invRes = await window.goblin.syncInventory()
    const accRes = await window.goblin.syncAccounting()
    setBusy(null)
    const ok = invRes.ok && accRes.ok
    setMessage(ok ? '✓ Sync completed (inventory + accounting)' : `✗ ${invRes.error || accRes.error || 'Sync failed'}`)
  }

  async function handlePreviewWrite(): Promise<void> {
    setBusy('write')
    setMessage(null)
    setPreview(null)
    const result = await window.goblin.previewTsmWrite()
    setBusy(null)
    setPreview(result)
    if (!result.ok) setMessage(`✗ ${result.error}`)
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
      setMessage(`✓ Write OK — added=${stats.written ?? 0} updated=${stats.updated ?? 0} moved=${stats.moved ?? 0}`)
    } else {
      setMessage(`✗ Write failed: ${result.error}`)
    }
  }

  const djangoLabel =
    status?.djangoReachable === null ? 'Unverified' : status?.djangoReachable ? 'OK' : 'Not responding'

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Sub-tab Navigation Bar inside Dashboard */}
      <nav
        aria-label="Dashboard Sub-Sections"
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid rgba(251, 191, 36, 0.25)',
          paddingBottom: '8px'
        }}
      >
        <button
          type="button"
          onClick={() => setSubTab('overview')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: subTab === 'overview' ? '1px solid #fbbf24' : '1px solid transparent',
            background: subTab === 'overview' ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
            color: subTab === 'overview' ? '#fbbf24' : '#94a3b8',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.9em',
            transition: 'all 0.2s ease'
          }}
        >
          ⚙️ Status & Controls
        </button>
        <button
          type="button"
          onClick={() => setSubTab('pnl')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: subTab === 'pnl' ? '1px solid #c084fc' : '1px solid transparent',
            background: subTab === 'pnl' ? 'rgba(192, 132, 252, 0.15)' : 'transparent',
            color: subTab === 'pnl' ? '#c084fc' : '#94a3b8',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.9em',
            transition: 'all 0.2s ease'
          }}
        >
          📊 P&L (Profit & Loss) · Coming soon
        </button>
      </nav>

      {subTab === 'overview' ? (
        <>
          <div className="glass-panel dashboard-grid">
            <div className="dashboard-card">
              <span className="dashboard-card__label">Auto-sync</span>
              <label className="switch">
                <input type="checkbox" checked={autoSyncEnabled} onChange={() => void toggleAutoSync()} />
                <span className="switch__track" />
              </label>
              <span className="dashboard-card__hint">{autoSyncEnabled ? 'On' : 'Off'}</span>
            </div>

            <div className="dashboard-card">
              <span className="dashboard-card__label">Django Status</span>
              <span className="dashboard-card__value">{djangoLabel}</span>
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
              <span className="dashboard-card__value">{status?.queueLength ?? 0}</span>
              <span className="dashboard-card__hint">pending</span>
            </div>
          </div>

          {/* Card / Banner de Última Escritura TSM (Web -> Companion Sync) */}
          <div
            className="glass-panel"
            style={{
              padding: '14px 18px',
              borderRadius: '10px',
              border: status?.lastTsmWrite?.status === 'failed'
                ? '1px solid rgba(239, 68, 68, 0.4)'
                : status?.lastTsmWrite?.status === 'processing'
                ? '1px solid rgba(96, 165, 250, 0.4)'
                : '1px solid rgba(74, 222, 128, 0.25)',
              background: status?.lastTsmWrite?.status === 'failed'
                ? 'rgba(239, 68, 68, 0.08)'
                : status?.lastTsmWrite?.status === 'processing'
                ? 'rgba(96, 165, 250, 0.08)'
                : 'rgba(74, 222, 128, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '1.1em' }}>
                  {status?.lastTsmWrite?.status === 'processing'
                    ? '⚡'
                    : status?.lastTsmWrite?.status === 'failed'
                    ? '❌'
                    : status?.lastTsmWrite?.status === 'done'
                    ? '✅'
                    : '✍️'}
                </span>
                <strong style={{ fontSize: '0.95em', color: '#f1f5f9' }}>
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
            {status?.lastTsmWrite?.status === 'processing' ? (
              <span className="badge" style={{ fontSize: '0.78em', padding: '4px 8px', background: 'rgba(96, 165, 250, 0.2)', color: '#60a5fa' }}>
                Executing…
              </span>
            ) : status?.lastTsmWrite?.status === 'done' ? (
              <span className="badge" style={{ fontSize: '0.78em', padding: '4px 8px', background: 'rgba(74, 222, 128, 0.2)', color: '#4ade80' }}>
                Completed
              </span>
            ) : status?.lastTsmWrite?.status === 'failed' ? (
              <span className="badge" style={{ fontSize: '0.78em', padding: '4px 8px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
                Failed
              </span>
            ) : null}
          </div>

          <div className="button-row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={Boolean(status?.syncing || busy !== null)}
              onClick={() => void forceSync()}
            >
              {status?.syncing || busy === 'sync' ? '⏳ Syncing (inventory + accounting)…' : 'Force sync now'}
            </button>
          </div>

          {message ? (
            <div
              className={`activity-item ${message.startsWith('✓') ? 'activity-item--success' : 'activity-item--error'}`}
              style={{ padding: '10px 14px' }}
            >
              <span className="activity-item__message">{message}</span>
            </div>
          ) : null}

          {/* SECCIÓN WRITE TO TSM GROUPS */}
          <section className="glass-panel">
            <h2>Write TSM Groups</h2>
            <p className="page__note">
              Single-group shortcut: uses the saved Cart mapping + all items in cart. For multi-group, write from web Cart (the companion will automatically create a pre-write backup).
            </p>
            <div className="button-row">
              <button
                type="button"
                className="btn btn--warning"
                disabled={busy !== null}
                onClick={() => void handlePreviewWrite()}
              >
                {busy === 'write' ? 'Preparing…' : 'Preview Write…'}
              </button>
              {preview?.ok ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy !== null}
                  onClick={() => void handleConfirmWrite()}
                >
                  Confirm Write
                </button>
              ) : null}
            </div>
            {preview?.ok ? (
              <div className="write-preview" style={{ marginTop: 12 }}>
                <p className="page__note">
                  {preview.itemCount ?? 0} items · {preview.preview?.length ?? 0} group(s) · affected≈
                  {preview.totalItemsAffected ?? '—'}
                </p>
                <ul className="activity-list">
                  {(preview.preview ?? []).map((row) => (
                    <li key={row.group} className="activity-item activity-item--info">
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
            padding: '36px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            border: '1px solid rgba(192, 132, 252, 0.35)',
            background: 'linear-gradient(135deg, rgba(24, 17, 35, 0.6) 0%, rgba(12, 8, 20, 0.8) 100%)'
          }}
        >
          <div style={{ fontSize: '2.5em', margin: 0 }}>📊</div>
          <h2 style={{ margin: 0, color: '#c084fc', fontSize: '1.4em' }}>
            Profit & Loss (P&L) Analytics
          </h2>
          <p style={{ maxWidth: '520px', margin: 0, color: '#94a3b8', fontSize: '0.92em', lineHeight: 1.6 }}>
            The P&L financial analysis module will calculate your net profits, sales margins, accumulated gold, and accounting history extracted directly from TSM Accounting.
          </p>
          <div
            style={{
              padding: '6px 16px',
              borderRadius: '999px',
              background: 'rgba(192, 132, 252, 0.15)',
              border: '1px solid rgba(192, 132, 252, 0.4)',
              color: '#e9d5ff',
              fontSize: '0.82em',
              fontWeight: 700,
              letterSpacing: '0.05em',
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
