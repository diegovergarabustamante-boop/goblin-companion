import type { JSX } from 'react'

import type { CompanionStatusSnapshot } from '../../shared/settings'

interface DashboardProps {
  status: CompanionStatusSnapshot | null
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
          <span className="dashboard-card__label">Último sync</span>
          <span className="dashboard-card__value">
            {status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString() : '—'}
          </span>
        </div>

        <div className="dashboard-card">
          <span className="dashboard-card__label">Estado Django</span>
          <span className="dashboard-card__value">{djangoLabel}</span>
        </div>

        <div className="dashboard-card">
          <span className="dashboard-card__label">Tray</span>
          <span className="dashboard-card__value">{status?.trayStatus ?? 'gray'}</span>
        </div>
      </div>

      <button type="button" className="btn btn--primary" onClick={() => void forceSync()}>
        Forzar sync ahora
      </button>
      <p className="page__note">
        Etapa 3a: el sync lee el `.lua` vía Django (`/api/companion/read-saved-variable/`). La persistencia a DB
        (inventario/accounting reales) llega en el siguiente incremento.
      </p>
    </div>
  )
}

export default Dashboard
