import type { JSX } from 'react'

import type { CompanionStatusSnapshot } from '../../shared/settings'

interface DashboardProps {
  status: CompanionStatusSnapshot | null
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function Dashboard({ status }: DashboardProps): JSX.Element {
  const autoSyncEnabled = status?.autoSyncEnabled ?? false

  async function toggleAutoSync(): Promise<void> {
    await window.goblin.updateSettings({ autoSyncEnabled: !autoSyncEnabled })
  }

  async function forceSync(): Promise<void> {
    await window.goblin.syncInventory()
    await window.goblin.syncAccounting()
  }

  const djangoLabel =
    status?.djangoReachable === null ? 'Sin verificar' : status?.djangoReachable ? 'OK' : 'No responde'

  return (
    <div className="page">
      <div className="glass-panel dashboard-grid">
        <div className="dashboard-card">
          <span className="dashboard-card__label">Auto-sync</span>
          <label className="switch">
            <input type="checkbox" checked={autoSyncEnabled} onChange={() => void toggleAutoSync()} />
            <span className="switch__track" />
          </label>
          <span className="dashboard-card__hint">{autoSyncEnabled ? 'Encendido' : 'Apagado'}</span>
        </div>

        <div className="dashboard-card">
          <span className="dashboard-card__label">Estado Django</span>
          <span className="dashboard-card__value">{djangoLabel}</span>
          <span className="dashboard-card__hint">{status?.syncing ? 'Sincronizando…' : ' '}</span>
        </div>

        <div className="dashboard-card">
          <span className="dashboard-card__label">Inventario</span>
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
          <span className="dashboard-card__label">Cola</span>
          <span className="dashboard-card__value">{status?.queueLength ?? 0}</span>
          <span className="dashboard-card__hint">pendientes</span>
        </div>
      </div>

      <div className="button-row">
        <button type="button" className="btn btn--primary" disabled={Boolean(status?.syncing)} onClick={() => void forceSync()}>
          {status?.syncing ? '⏳ Sincronizando (inventario + accounting)…' : 'Forzar sincronización ahora'}
        </button>
      </div>

      {status?.syncing ? (
        <div className="activity-item activity-item--info" style={{ marginTop: 12, padding: '10px 14px' }}>
          <span className="activity-item__message">
            🔄 {status.syncStep || 'Sincronizando datos en tiempo real…'}
          </span>
        </div>
      ) : null}
      <p className="page__note">
        Con auto-sync ON, al cerrar WoW (o guardar SavedVariables) la companion lee el `.lua`.
        El carrito no se llena solo: en Decoder configurá chars/warbank/guilds y usá Apply, o
        “Load from Companion” en Cart/Arbitrage.
      </p>
    </div>
  )
}

export default Dashboard
