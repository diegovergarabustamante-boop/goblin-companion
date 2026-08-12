import { useEffect, useState, type JSX } from 'react'

function Controls(): JSX.Element {
  const [djangoUrl, setDjangoUrl] = useState('')

  useEffect(() => {
    window.goblin.getSettings().then((settings) => setDjangoUrl(settings.djangoUrl))
  }, [])

  return (
    <div className="page">
      <section className="glass-panel">
        <h2>Sync manual</h2>
        <div className="button-row">
          <button type="button" className="btn" disabled title="Etapa 3">
            Sync inventario
          </button>
          <button type="button" className="btn" disabled title="Etapa 3">
            Sync accounting
          </button>
        </div>
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
