import { useEffect, useState, type JSX } from 'react'

function Controls(): JSX.Element {
  const [djangoUrl, setDjangoUrl] = useState('')
  const [busy, setBusy] = useState<'inventory' | 'accounting' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    window.goblin.getSettings().then((settings) => setDjangoUrl(settings.djangoUrl))
  }, [])

  async function run(kind: 'inventory' | 'accounting'): Promise<void> {
    setBusy(kind)
    setMessage(null)
    const result = kind === 'inventory' ? await window.goblin.syncInventory() : await window.goblin.syncAccounting()
    setBusy(null)
    setMessage(result.ok ? `✓ Sync ${kind} OK` : `✗ ${result.error ?? 'falló'}`)
  }

  return (
    <div className="page">
      <section className="glass-panel">
        <h2>Sync manual</h2>
        <div className="button-row">
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void run('inventory')}>
            {busy === 'inventory' ? 'Sincronizando…' : 'Sync inventario'}
          </button>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void run('accounting')}>
            {busy === 'accounting' ? 'Sincronizando…' : 'Sync accounting'}
          </button>
        </div>
        {message ? <p className="page__note">{message}</p> : null}
      </section>

      <section className="glass-panel">
        <h2>Write TSM Groups</h2>
        <p className="page__note">Preview + confirmación llegan en la Etapa 6, junto con los backups rotatorios.</p>
        <button type="button" className="btn btn--warning" disabled>
          Write to TSM Groups…
        </button>
      </section>

      <section className="glass-panel">
        <h2>Backups rotatorios</h2>
        <div className="empty-state">
          <p>Sin backups todavía. Se generarán antes de cada write (default: 3 copias).</p>
        </div>
        <button type="button" className="btn" disabled>
          Abrir carpeta de backups
        </button>
      </section>

      <section className="glass-panel">
        <h2>Web</h2>
        <button type="button" className="btn" onClick={() => void window.goblin.openExternal(djangoUrl)}>
          Abrir web ({djangoUrl || '…'})
        </button>
      </section>
    </div>
  )
}

export default Controls
