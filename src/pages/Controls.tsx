import { useCallback, useEffect, useState, type JSX } from 'react'

import type { BackupInfoDto, TsmWritePreviewDto } from '../../electron/preload'

function Controls(): JSX.Element {
  const [djangoUrl, setDjangoUrl] = useState('')
  const [busy, setBusy] = useState<'inventory' | 'accounting' | 'write' | 'backup' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [backups, setBackups] = useState<BackupInfoDto[]>([])
  const [preview, setPreview] = useState<TsmWritePreviewDto | null>(null)

  const refreshBackups = useCallback(async () => {
    const list = await window.goblin.listBackups()
    setBackups(list)
  }, [])

  useEffect(() => {
    window.goblin.getSettings().then((settings) => setDjangoUrl(settings.djangoUrl))
    void refreshBackups()
  }, [refreshBackups])

  async function runAll(): Promise<void> {
    setBusy('inventory')
    setMessage('Sincronizando inventario (1/2)…')
    const invRes = await window.goblin.syncInventory()
    setBusy('accounting')
    setMessage('Sincronizando accounting (2/2)…')
    const accRes = await window.goblin.syncAccounting()
    setBusy(null)
    const ok = invRes.ok && accRes.ok
    setMessage(ok ? '✓ Sincronización completada (inventario + accounting)' : `✗ ${invRes.error || accRes.error || 'falló'}`)
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
      '¿Escribir grupos TSM?\n\nWoW debe estar cerrado (o sin personaje logueado).\nSe creará un backup rotatorio antes de escribir.'
    )
    if (!confirmed) return

    setBusy('write')
    const result = await window.goblin.confirmTsmWrite(preview.assignments)
    setBusy(null)
    setPreview(null)
    await refreshBackups()
    if (result.ok) {
      const stats = result.stats ?? {}
      setMessage(`✓ Write OK — added=${stats.written ?? 0} updated=${stats.updated ?? 0} moved=${stats.moved ?? 0}`)
    } else {
      setMessage(`✗ Write falló: ${result.error}`)
    }
  }

  async function handleCreateBackup(): Promise<void> {
    setBusy('backup')
    const result = await window.goblin.createBackup('snapshot')
    setBusy(null)
    await refreshBackups()
    setMessage(result.ok ? `✓ Snapshot ${result.backup?.fileName}` : `✗ ${result.error}`)
  }

  async function handleRestore(id: string, fileName: string): Promise<void> {
    const confirmed = window.confirm(
      `¿Restaurar ${fileName} sobre TradeSkillMaster.lua?\n\nSe creará un snapshot de seguridad antes de sobreescribir. WoW debe estar cerrado.`
    )
    if (!confirmed) return
    setBusy('backup')
    const result = await window.goblin.restoreBackup(id)
    setBusy(null)
    await refreshBackups()
    setMessage(result.ok ? `✓ Restaurado a ${result.restoredTo}` : `✗ ${result.error}`)
  }

  return (
    <div className="page">
      <section className="glass-panel">
        <h2>Sync manual</h2>
        <div className="button-row">
          <button type="button" className="btn btn--primary" disabled={busy !== null} onClick={() => void runAll()}>
            {busy !== null ? '⏳ Sincronizando (inventario + accounting)…' : 'Forzar sincronización (inventario + accounting)'}
          </button>
        </div>
        <p className="page__note">
          Sync lee y sincroniza automáticamente TradeSkillMaster.lua (inventario + historial accounting).
        </p>
      </section>

      <section className="glass-panel">
        <h2>Write TSM Groups</h2>
        <p className="page__note">
          Atajo single-group: usa el mapping guardado en el Cart + todos los items del carrito. Para multi-grupo,
          escribí desde el Cart web (la companion igual hace backup vía <code>/backup</code>).
        </p>
        <div className="button-row">
          <button type="button" className="btn btn--warning" disabled={busy !== null} onClick={() => void handlePreviewWrite()}>
            {busy === 'write' ? 'Preparando…' : 'Preview Write…'}
          </button>
          {preview?.ok ? (
            <button type="button" className="btn btn--primary" disabled={busy !== null} onClick={() => void handleConfirmWrite()}>
              Confirmar Write
            </button>
          ) : null}
        </div>
        {preview?.ok ? (
          <div className="write-preview">
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

      <section className="glass-panel">
        <h2>Backups rotatorios</h2>
        <div className="button-row" style={{ marginBottom: 12 }}>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void handleCreateBackup()}>
            {busy === 'backup' ? '…' : 'Crear backup ahora'}
          </button>
          <button type="button" className="btn" onClick={() => void window.goblin.openBackupsFolder()}>
            Abrir carpeta
          </button>
        </div>
        {backups.length === 0 ? (
          <div className="empty-state">
            <p>Sin backups todavía. Se crean antes de cada Write (default N=3).</p>
          </div>
        ) : (
          <ul className="activity-list">
            {backups.map((b) => (
              <li key={b.id} className="activity-item">
                <time dateTime={b.createdAt}>{new Date(b.createdAt).toLocaleString()}</time>
                <span className="activity-item__message">{b.fileName}</span>
                <span className="activity-item__detail">
                  {(b.sizeBytes / 1024).toFixed(1)} KB{' '}
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '2px 8px', fontSize: 11 }}
                    disabled={busy !== null}
                    onClick={() => void handleRestore(b.id, b.fileName)}
                  >
                    Restaurar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-panel">
        <h2>Web</h2>
        <button type="button" className="btn" onClick={() => void window.goblin.openExternal(`${djangoUrl.replace(/\/$/, '')}/cart/`)}>
          Abrir Cart (Write multi-grupo)
        </button>
      </section>

      {message ? <p className="page__note">{message}</p> : null}
    </div>
  )
}

export default Controls
