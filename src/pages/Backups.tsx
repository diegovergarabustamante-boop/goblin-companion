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
        const count = result.backups?.length || 0
        setMessage(`✓ Snapshot creado: ${count} archivo(s) respaldado(s)`)
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
    const confirmMsg = `¿Restaurar solo el archivo "${b.fileName}"?\n\nDestino en WoW: ${b.targetFilename}\nFecha de creación: ${new Date(b.createdAt).toLocaleString()}\n\nSe creará un snapshot de seguridad antes de sobreescribir. WoW debe estar cerrado.`
    if (!window.confirm(confirmMsg)) return

    setBusy(b.fileName)
    setMessage(null)
    try {
      const result = await window.goblin.restoreBackup(b.fileName, b.kind)
      if (result.ok) {
        setMessage(`✓ Restaurado "${b.fileName}" con éxito sobre ${result.restoredTo}`)
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

  const handleDelete = async (b: BackupInfoDto): Promise<void> => {
    const confirmMsg = `¿Eliminar de forma permanente el archivo de backup:\n"${b.fileName}"?\n\nFecha: ${new Date(b.createdAt).toLocaleString()}\n\nEsta acción NO se puede deshacer.`
    if (!window.confirm(confirmMsg)) return

    setBusy(`del_${b.fileName}`)
    setMessage(null)
    try {
      if (typeof window.goblin.deleteBackup !== 'function') {
        throw new Error('La función deleteBackup no está disponible. Reiniciá la app.')
      }
      const result = await window.goblin.deleteBackup(b.fileName, b.kind)
      if (result.ok) {
        setMessage(`✓ Archivo eliminado: "${b.fileName}"`)
        reloadAll()
      } else {
        setMessage(`✗ Error al eliminar: ${result.error}`)
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

  const renderTable = (items: BackupInfoDto[], kindLabel: string) => {
    if (items.length === 0) {
      return (
        <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '0.88em', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          Sin archivos de {kindLabel.toLowerCase()} registrados aún.
        </div>
      )
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#fbbf24' }}>
              <th style={{ padding: '8px 12px' }}>Fecha y Hora</th>
              <th style={{ padding: '8px 12px' }}>Nombre del Archivo</th>
              <th style={{ padding: '8px 12px' }}>Destino en WoW</th>
              <th style={{ padding: '8px 12px' }}>Tamaño</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Acciones Individuales</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => {
              const isAppHelper = b.fileType === 'apphelper'
              return (
                <tr key={b.fileName} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 12px', color: '#f8fafc', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {new Date(b.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        background: isAppHelper ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                        color: isAppHelper ? '#34d399' : '#fbbf24',
                        border: isAppHelper ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(251,191,36,0.3)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '0.9em',
                        wordBreak: 'break-all'
                      }}
                    >
                      {b.fileName}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#cbd5e1', fontFamily: 'monospace' }}>
                    {b.targetFilename}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{formatSize(b.sizeBytes)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy !== null}
                        onClick={() => void handleRestore(b)}
                        style={{ padding: '4px 12px', fontSize: '0.82em' }}
                        title={`Restaurar solo ${b.targetFilename}`}
                      >
                        {busy === b.fileName ? '⏳ Restaurando…' : '🔄 Restaurar'}
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy !== null}
                        onClick={() => void handleDelete(b)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.82em',
                          background: 'rgba(239,68,68,0.15)',
                          color: '#f87171',
                          border: '1px solid rgba(239,68,68,0.3)'
                        }}
                        title={`Eliminar solo ${b.fileName}`}
                      >
                        {busy === `del_${b.fileName}` ? '⏳…' : '🗑️ Eliminar'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="page-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#fbbf24', fontSize: '1.4em' }}>Backups & Snapshots Manager</h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.88em' }}>
            Gestioná y restaurá cada archivo individualmente (<code>TradeSkillMaster.lua</code> y <code>TradeSkillMaster_AppHelper.lua</code>).
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
              Puntos de restauración manuales. Crean una copia individual por cada archivo de WoW SavedVariables presente.
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

        {renderTable(snapshots, 'Snapshots Manuales')}
      </section>

      {/* SECCIÓN 2: BACKUPS POR ESCRITURA */}
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '1.1em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🛡️ Backups por Escritura (Pre-Write)
          </h3>
          <span style={{ color: '#94a3b8', fontSize: '0.82em' }}>
            Archivos creados automáticamente <strong>antes de escribir o actualizar grupos TSM</strong> en WoW. Rotan según el límite configurado en Settings.
          </span>
        </div>

        {renderTable(writeBackups, 'Backups por Escritura')}
      </section>
    </div>
  )
}
