import { useState, type JSX } from 'react'

import type { TsmWritePreviewDto } from '../../electron/preload'
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
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<TsmWritePreviewDto | null>(null)

  async function toggleAutoSync(): Promise<void> {
    await window.goblin.updateSettings({ autoSyncEnabled: !autoSyncEnabled })
  }

  async function forceSync(): Promise<void> {
    setBusy('sync')
    setMessage('Sincronizando inventario + accounting…')
    const invRes = await window.goblin.syncInventory()
    const accRes = await window.goblin.syncAccounting()
    setBusy(null)
    const ok = invRes.ok && accRes.ok
    setMessage(ok ? '✓ Sincronización completada (inventario + accounting)' : `✗ ${invRes.error || accRes.error || 'Sincronización falló'}`)
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
      '¿Escribir grupos TSM?\n\nWoW debe estar cerrado (o sin personaje logueado).\nSe creará un backup rotatorio automático antes de escribir.'
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
      setMessage(`✗ Write falló: ${result.error}`)
    }
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

      <div className="button-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn--primary"
          disabled={Boolean(status?.syncing || busy !== null)}
          onClick={() => void forceSync()}
        >
          {status?.syncing || busy === 'sync' ? '⏳ Sincronizando (inventario + accounting)…' : 'Forzar sincronización ahora'}
        </button>
      </div>

      {message ? (
        <div
          className={`activity-item ${message.startsWith('✓') ? 'activity-item--success' : 'activity-item--error'}`}
          style={{ marginTop: 12, padding: '10px 14px' }}
        >
          <span className="activity-item__message">{message}</span>
        </div>
      ) : null}

      {/* SECCIÓN WRITE TO TSM GROUPS */}
      <section className="glass-panel" style={{ marginTop: 16 }}>
        <h2>Write TSM Groups</h2>
        <p className="page__note">
          Atajo single-group: usa el mapping guardado en el Cart + todos los items del carrito. Para multi-grupo,
          escribí desde el Cart web (la companion creará automáticamente un backup pre-escritura).
        </p>
        <div className="button-row">
          <button
            type="button"
            className="btn btn--warning"
            disabled={busy !== null}
            onClick={() => void handlePreviewWrite()}
          >
            {busy === 'write' ? 'Preparando…' : 'Preview Write…'}
          </button>
          {preview?.ok ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy !== null}
              onClick={() => void handleConfirmWrite()}
            >
              Confirmar Write
            </button>
          ) : null}
        </div>
        {preview?.ok ? (
          <div className="write-preview" style={{ marginTop: 12 }}>
            <p className="page__note">
              {preview.itemCount ?? 0} items · {preview.preview?.length ?? 0} grupo(s) · afectados≈
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

      <p className="page__note" style={{ marginTop: 16 }}>
        Con auto-sync ON, al cerrar WoW (o guardar SavedVariables) la companion lee el `.lua`.
        El carrito no se llena solo: en Decoder configurá chars/warbank/guilds y usá Apply, o
        “Load from Companion” en Cart/Arbitrage.
      </p>
    </div>
  )
}

export default Dashboard
