import { useState, type JSX } from 'react'

import type { CompanionStatusSnapshot } from '../../shared/settings'
import { PnLSalesTable } from '../components/PnLSalesTable'

interface DashboardProps {
  status: CompanionStatusSnapshot | null
}

type SubTab = 'overview' | 'pnl'

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function getLatestSyncTime(invAt?: string | null, accAt?: string | null): string {
  if (!invAt && !accAt) return 'Never'
  if (!invAt) return formatWhen(accAt)
  if (!accAt) return formatWhen(invAt)
  const invTime = new Date(invAt).getTime()
  const accTime = new Date(accAt).getTime()
  return formatWhen(invTime >= accTime ? invAt : accAt)
}

function Dashboard({ status }: DashboardProps): JSX.Element {
  const [subTab, setSubTab] = useState<SubTab>('overview')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null)

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

  async function openWebCart(): Promise<void> {
    const cfg = await window.goblin.getSettings()
    const baseUrl = cfg.djangoUrl || 'http://127.0.0.1:8000'
    const cartUrl = baseUrl.endsWith('/') ? `${baseUrl}cart/` : `${baseUrl}/cart/`
    await window.goblin.openExternal(cartUrl)
  }

  const webConnectionLabel =
    status?.djangoReachable === null ? 'Unverified' : status?.djangoReachable ? 'Active' : 'Not Responding'

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
          <img src="./images/goblin_assets/wrench.png" alt="" />
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
          <img src="./images/goblin_assets/coin_badge_1.png" alt="" />
          <span>P&L Analytics</span>
        </button>
      </nav>

      {subTab === 'overview' ? (
        <>
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <span className="dashboard-card__label">Web Connection</span>
              <span className="dashboard-card__value" style={{ color: status?.djangoReachable ? '#4ade80' : '#f87171' }}>
                {webConnectionLabel}
              </span>
              <span className="dashboard-card__hint">{status?.syncing ? 'Syncing…' : 'Server Connected'}</span>
            </div>

            <div className="dashboard-card">
              <span className="dashboard-card__label">Last Scan Update</span>
              <span className="dashboard-card__value dashboard-card__value--sm">
                {getLatestSyncTime(status?.lastInventorySyncAt, status?.lastAccountingSyncAt)}
              </span>
              <span className="dashboard-card__hint">Latest Inventory & Accounting Sync</span>
            </div>
          </div>

          <div className="button-row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={Boolean(status?.syncing || busy !== null)}
              onClick={() => void forceSync()}
            >
              <img src="./images/goblin_assets/search.png" alt="" />
              <span>{status?.syncing || busy === 'sync' ? 'Syncing (inventory + accounting)…' : 'Force sync now'}</span>
            </button>
          </div>

          {message ? (
            <div className={`activity-item ${messageType === 'success' ? 'activity-item--success' : messageType === 'error' ? 'activity-item--error' : 'activity-item--info'}`}>
              <img
                src={messageType === 'success' ? './images/goblin_assets/success.png' : messageType === 'error' ? './images/goblin_assets/failure.png' : './images/goblin_assets/info.png'}
                alt=""
                className="activity-item__icon"
              />
              <span className="activity-item__message">{message}</span>
            </div>
          ) : null}

          {/* SECCIÓN ESCRITURA DE GRUPOS TSM */}
          <section className="glass-panel">
            <h2>
              <img src="./images/goblin_assets/cart.png" alt="" />
              <span>TSM GROUP WRITING & WEB CART</span>
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p className="page__note" style={{ fontSize: '0.88em', lineHeight: 1.6, color: '#e2e8f0' }}>
                To write or update item groups in <strong>TradeSkillMaster</strong>, configure your items in the <strong>AHP Web Cart</strong> and click <strong>"Write TSM Groups"</strong>. The Companion app receives the order automatically, creates a pre-write safety backup of your <code>TradeSkillMaster.lua</code>, and applies the group updates instantly.
              </p>

              <div className="button-row">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void openWebCart()}
                >
                  <img src="./images/goblin_assets/cart.png" alt="" />
                  <span>Open Web Cart in Browser</span>
                </button>
              </div>
            </div>
          </section>

          <p className="page__note">
            With auto-sync ON, when WoW closes (or SavedVariables are written), the companion reads `.lua`.
            The cart does not auto-fill: configure chars/warbank/guilds in Decoder and use Apply, or “Load from Companion” in Cart/Arbitrage.
          </p>
        </>
      ) : (
        <PnLSalesTable />
      )}
    </div>
  )
}

export default Dashboard
