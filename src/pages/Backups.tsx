import { useEffect, useState, type JSX } from 'react'

import type { BackupInfoDto } from '../../electron/preload'

export default function Backups(): JSX.Element {
  const [snapshots, setSnapshots] = useState<BackupInfoDto[]>([])
  const [writeBackups, setWriteBackups] = useState<BackupInfoDto[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const reloadAll = (): void => {
    void Promise.all([
      window.goblin.listBackups('snapshot'),
      window.goblin.listBackups('write')
    ]).then(([snaps, writes]) => {
      setSnapshots(snaps)
      setWriteBackups(writes)
    })
  }

  useEffect(() => {
    reloadAll()
  }, [])

  const handleCreateSnapshot = async (): Promise<void> => {
    setBusy('create')
    setMessage(null)
    try {
      const result = await window.goblin.createBackup('snapshot')
      if (result.ok) {
        setMessage(`✓ Snapshot creado: ${result.backup?.fileName}`)
        reloadAll()
      } else {
        setMessage(`✗ Error: ${result.error}`)
      }
    } catch (err) {
      setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const handleRestore = async (b: BackupInfoDto): Promise<void> => {
    const title = b.kind === 'snapshot' ? 'snapshot' : 'backup'
    const confirmMsg = `¿Restaurar ${title} de fecha ${new Date(b.createdAt).toLocaleString()}?\n\nSe restaurará ${b.fileName}${b.hasAppHelper ? ' y TradeSkillMaster_AppHelper.lua' : ''}.\nSe creará un snapshot de seguridad antes de sobreescribir. WoW debe estar cerrado.`
    if (!window.confirm(confirmMsg)) return

    setBusy(b.id)
    setMessage(null)
    try {
      const result = await window.goblin.restoreBackup(b.id, b.kind)
      if (result.ok) {
        setMessage(`✓ Restaurado con éxito sobre ${result.restoredTo}`)
        reloadAll()
      } else {
        setMessage(`✗ Error al restaurar: ${result.error}`)
      }
    } catch (err) {
      setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className="page-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#fbbf24', fontSize: '1.4em' }}>Backups & Snapshots Manager</h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.88em' }}>
            Administrá los snapshots manuales y los backups automáticos pre-escritura de TSM.
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => void window.goblin.openBackupsFolder()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          📂 Abrir carpeta de backups
        </button>
      </header>

      {message ? (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            background: message.startsWith('✓') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            border: message.startsWith('✓') ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(239,68,68,0.4)',
            color: message.startsWith('✓') ? '#4ade80' : '#f87171',
            fontSize: '0.9em',
            fontWeight: 600
          }}
        >
          {message}
        </div>
      ) : null}

      {/* SECCIÓN 1: SNAPSHOTS MANUALES */}
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#a78bfa', fontSize: '1.1em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📸 Snapshots Manuales
            </h3>
            <span style={{ color: '#94a3b8', fontSize: '0.82em' }}>
              Puntos de restauración manuales. Guardan copia de <code>TradeSkillMaster.lua</code> y <code>TradeSkillMaster_AppHelper.lua</code>.
            </span>
          </div>
          <button
            type="button"
            className="button primary"
            disabled={busy === 'create'}
            onClick={() => void handleCreateSnapshot()}
            style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', color: '#fff' }}
          >
            {busy === 'create' ? '⏳ Creando…' : '📸 Crear Snapshot Manual ahora'}
          </button>
        </div>

        {snapshots.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '0.88em', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            Sin snapshots manuales aún. Podés crear uno en cualquier momento presionando el botón superior.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#a78bfa' }}>
                  <th style={{ padding: '8px 12px' }}>Fecha y Hora</th>
                  <th style={{ padding: '8px 12px' }}>Archivos respaldados</th>
                  <th style={{ padding: '8px 12px' }}>Tamaño Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 12px', color: '#f8fafc', fontWeight: 600 }}>
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                      <span style={{ background: 'rgba(167,139,250,0.15)', color: '#c084fc', padding: '2px 8px', borderRadius: '4px', marginRight: '6px' }}>
                        TSM.lua
                      </span>
                      {s.hasAppHelper ? (
                        <span style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '4px' }}>
                          AppHelper.lua
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{formatSize(s.sizeBytes)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy === s.id}
                        onClick={() => void handleRestore(s)}
                        style={{ padding: '4px 12px', fontSize: '0.82em' }}
                      >
                        {busy === s.id ? '⏳ Restaurando…' : '🔄 Restaurar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SECCIÓN 2: BACKUPS POR ESCRITURA */}
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '1.1em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🛡️ Backups por Escritura (Pre-Write)
          </h3>
          <span style={{ color: '#94a3b8', fontSize: '0.82em' }}>
            Backups automáticos que la app realiza <strong>antes de escribir o actualizar grupos TSM</strong>. Rotan automáticamente según la cantidad configurada en Settings.
          </span>
        </div>

        {writeBackups.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '0.88em', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            Sin backups por escritura registrados aún. Se crearán automáticamente cuando envíes grupos TSM desde la app web o hagas un Write.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#fbbf24' }}>
                  <th style={{ padding: '8px 12px' }}>Fecha y Hora</th>
                  <th style={{ padding: '8px 12px' }}>Archivos respaldados</th>
                  <th style={{ padding: '8px 12px' }}>Tamaño Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {writeBackups.map((w) => (
                  <tr key={w.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 12px', color: '#f8fafc', fontWeight: 600 }}>
                      {new Date(w.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                      <span style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', marginRight: '6px' }}>
                        TSM.lua
                      </span>
                      {w.hasAppHelper ? (
                        <span style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '4px' }}>
                          AppHelper.lua
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{formatSize(w.sizeBytes)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy === w.id}
                        onClick={() => void handleRestore(w)}
                        style={{ padding: '4px 12px', fontSize: '0.82em' }}
                      >
                        {busy === w.id ? '⏳ Restaurando…' : '🔄 Restaurar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
