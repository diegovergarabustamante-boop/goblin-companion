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
          <span className="dashboard-card__value">{status?.lastSyncAt ?? '—'}</span>
        </div>

        <div className="dashboard-card">
          <span className="dashboard-card__label">Estado Django</span>
          <span className="dashboard-card__value">
            {status?.djangoReachable === null ? 'Sin verificar' : status?.djangoReachable ? 'OK' : 'No responde'}
          </span>
        </div>

        <div className="dashboard-card">
          <span className="dashboard-card__label">Items / Chars</span>
          <span className="dashboard-card__value">—</span>
        </div>
      </div>

      <button type="button" className="btn btn--primary" disabled title="Disponible cuando el watcher esté activo (Etapa 3)">
        Forzar sync ahora
      </button>
      <p className="page__note">
        El watcher de archivos y el sync real contra Django todavía no están conectados: esto es el shell visual de
        la Etapa 0 del plan.
      </p>
    </div>
  )
}

export default Dashboard
