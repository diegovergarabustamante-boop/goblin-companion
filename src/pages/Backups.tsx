import { useEffect, useState, type JSX } from 'react'

import type { BackupInfoDto } from '../../electron/preload'

interface BackupSession {
  timestamp: string
  createdAt: string
  items: BackupInfoDto[]
}

export default function Backups(): JSX.Element {
  const [snapshots, setSnapshots] = useState<BackupInfoDto[]>([])
  const [writeBackups, setWriteBackups] = useState<BackupInfoDto[]>([])
  const [backupCount, setBackupCount] = useState<number>(3)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null)

  const reloadAll = (): void => {
    void Promise.all([
      window.goblin.listBackups('snapshot'),
      window.goblin.listBackups('write'),
      window.goblin.getSettings()
    ]).then(([snaps, writes, cfg]) => {
      setSnapshots(snaps)
      setWriteBackups(writes)
      setBackupCount(cfg.backupCount || 3)
    })
  }

  useEffect(() => {
    reloadAll()
  }, [])

  const handleUpdateBackupCount = async (val: number): Promise<void> => {
    const clamped = Math.min(10, Math.max(1, val || 1))
    setBackupCount(clamped)
    try {
      await window.goblin.updateSettings({ backupCount: clamped })
      setMessage(`Automatic backup limit updated to ${clamped}`)
      setMessageType('success')
      reloadAll()
    } catch (err) {
      setMessage(`Error updating limit: ${err instanceof Error ? err.message : String(err)}`)
      setMessageType('error')
    }
  }

  const handleCreateSnapshot = async (): Promise<void> => {
    setBusy('create')
    setMessage(null)
    setMessageType(null)
    try {
      const result = await window.goblin.createBackup('snapshot')
      if (result.ok) {
        const count = result.backups?.length || 0
        setMessage(`Snapshot created: ${count} file(s) backed up`)
        setMessageType('success')
        reloadAll()
      } else {
        setMessage(`Error: ${result.error}`)
        setMessageType('error')
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`)
      setMessageType('error')
    } finally {
      setBusy(null)
    }
  }

  const handleRestore = async (b: BackupInfoDto): Promise<void> => {
    const confirmMsg = `Restore file "${b.fileName}"?\n\nWoW Target: ${b.targetFilename}\nCreated: ${new Date(b.createdAt).toLocaleString()}\n\nA safety snapshot will be created before overwriting. WoW should be closed.`
    if (!window.confirm(confirmMsg)) return

    setBusy(b.fileName)
    setMessage(null)
    setMessageType(null)
    try {
      const result = await window.goblin.restoreBackup(b.fileName, b.kind)
      if (result.ok) {
        setMessage(`Successfully restored "${b.fileName}" to ${result.restoredTo || b.targetFilename}`)
        setMessageType('success')
        reloadAll()
      } else {
        setMessage(`Error restoring: ${result.error}`)
        setMessageType('error')
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`)
      setMessageType('error')
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (b: BackupInfoDto): Promise<void> => {
    const confirmMsg = `Permanently delete backup file:\n"${b.fileName}"?\n\nDate: ${new Date(b.createdAt).toLocaleString()}\n\nThis action CANNOT be undone.`
    if (!window.confirm(confirmMsg)) return

    setBusy(`del_${b.fileName}`)
    setMessage(null)
    setMessageType(null)
    try {
      if (typeof window.goblin.deleteBackup !== 'function') {
        throw new Error('deleteBackup function is not available. Please restart the app.')
      }
      const result = await window.goblin.deleteBackup(b.fileName, b.kind)
      if (result.ok) {
        setMessage(`File deleted: "${b.fileName}"`)
        setMessageType('success')
        reloadAll()
      } else {
        setMessage(`Error deleting: ${result.error}`)
        setMessageType('error')
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`)
      setMessageType('error')
    } finally {
      setBusy(null)
    }
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  // Group backup files by timestamp session
  const getSessions = (items: BackupInfoDto[]): BackupSession[] => {
    const map = new Map<string, BackupInfoDto[]>()
    for (const item of items) {
      const tsMatch = item.fileName.match(/^backup-([0-9A-Za-z_-]+)\./i)
      const tsKey = tsMatch ? tsMatch[1] : item.id
      let list = map.get(tsKey)
      if (!list) {
        list = []
        map.set(tsKey, list)
      }
      list.push(item)
    }

    const sessions: BackupSession[] = []
    for (const [ts, fileList] of map.entries()) {
      sessions.push({
        timestamp: ts,
        createdAt: fileList[0]?.createdAt || new Date().toISOString(),
        items: fileList
      })
    }

    sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return sessions
  }

  const renderSessionCards = (items: BackupInfoDto[], sectionKind: 'snapshot' | 'write') => {
    const sessions = getSessions(items)
    const isWrite = sectionKind === 'write'

    if (sessions.length === 0) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88em', background: 'rgba(12,8,3,0.5)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.15)' }}>
          No {isWrite ? 'automatic write backups' : 'manual snapshots'} recorded yet.
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {sessions.map((session, index) => (
          <div
            key={session.timestamp}
            style={{
              background: 'rgba(12, 8, 3, 0.6)',
              border: isWrite ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(139, 92, 246, 0.35)',
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)'
            }}
          >
            {/* Header de la Sesión de Backup */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                background: isWrite ? 'rgba(251,191,36,0.08)' : 'rgba(139,92,246,0.1)',
                borderBottom: isWrite ? '1px solid rgba(251,191,36,0.2)' : '1px solid rgba(139,92,246,0.2)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img src="/images/goblin_assets/info.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                <span style={{ color: isWrite ? '#fbbf24' : '#c084fc', fontWeight: 700, fontSize: '0.92em', fontFamily: 'var(--font-header)' }}>
                  Backup Session #{sessions.length - index} — {new Date(session.createdAt).toLocaleString()}
                </span>
              </div>
              <span style={{ fontSize: '0.78em', color: '#94a3b8', background: 'rgba(0,0,0,0.4)', padding: '3px 10px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.08)' }}>
                {session.items.length} file(s) in session
              </span>
            </div>

            {/* Tabla de Archivos */}
            <div style={{ padding: '8px 12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(251,191,36,0.15)', color: '#94a3b8', fontFamily: 'var(--font-header)' }}>
                    <th style={{ padding: '6px 8px' }}>Backup File</th>
                    <th style={{ padding: '6px 8px' }}>WoW Target</th>
                    <th style={{ padding: '6px 8px' }}>Size</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {session.items.map((b) => {
                    const isAppHelper = b.fileType === 'apphelper'
                    return (
                      <tr key={b.fileName} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px' }}>
                          <span
                            style={{
                              background: isAppHelper ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                              color: isAppHelper ? '#4ade80' : '#fbbf24',
                              border: isAppHelper ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(251,191,36,0.3)',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                              fontSize: '0.88em'
                            }}
                          >
                            {b.fileName}
                          </span>
                        </td>
                        <td style={{ padding: '8px', color: '#cbd5e1', fontFamily: 'monospace' }}>
                          {b.targetFilename}
                        </td>
                        <td style={{ padding: '8px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{formatSize(b.sizeBytes)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn"
                              disabled={busy !== null}
                              onClick={() => void handleRestore(b)}
                              style={{ padding: '4px 10px', fontSize: '0.82em' }}
                              title={`Restore only ${b.targetFilename}`}
                            >
                              <img src="/images/goblin_assets/anchor_key.png" alt="" style={{ width: 14, height: 14 }} />
                              <span>{busy === b.fileName ? 'Restoring…' : 'Restore'}</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn--danger"
                              disabled={busy !== null}
                              onClick={() => void handleDelete(b)}
                              style={{ padding: '4px 10px', fontSize: '0.82em' }}
                              title={`Delete only ${b.fileName}`}
                            >
                              <img src="/images/goblin_assets/clear.png" alt="" style={{ width: 14, height: 14 }} />
                              <span>{busy === `del_${b.fileName}` ? '…' : 'Delete'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="page">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#fbbf24', fontSize: '1.4em', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/images/goblin_assets/save.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span>Backups & Snapshots Manager</span>
          </h2>
          <p className="page__note" style={{ marginTop: '4px' }}>
            Manage and individually restore <code>TradeSkillMaster.lua</code> and <code>TradeSkillMaster_AppHelper.lua</code> files.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => void window.goblin.openBackupsFolder()}
        >
          <img src="/images/goblin_assets/bag.png" alt="" style={{ width: 18, height: 18 }} />
          <span>Open Backups Folder</span>
        </button>
      </header>

      {message ? (
        <div className={`activity-item ${messageType === 'success' ? 'activity-item--success' : 'activity-item--error'}`}>
          <img
            src={messageType === 'success' ? '/images/goblin_assets/success.png' : '/images/goblin_assets/failure.png'}
            alt=""
            className="activity-item__icon"
          />
          <span className="activity-item__message">{message}</span>
        </div>
      ) : null}

      {/* SECCIÓN 1: SNAPSHOTS MANUALES */}
      <section className="glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#c084fc', fontSize: '1.1em', fontFamily: 'var(--font-header)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/images/goblin_assets/save.png" alt="" style={{ width: 20, height: 20 }} />
              <span>Manual Snapshots</span>
            </h3>
            <span style={{ color: '#94a3b8', fontSize: '0.82em' }}>
              Manual restore points. Save independent copies of <code>TradeSkillMaster.lua</code> and <code>TradeSkillMaster_AppHelper.lua</code>.
            </span>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy === 'create'}
            onClick={() => void handleCreateSnapshot()}
          >
            <img src="/images/goblin_assets/save.png" alt="" style={{ width: 16, height: 16 }} />
            <span>{busy === 'create' ? 'Creating…' : 'Create Manual Snapshot'}</span>
          </button>
        </div>

        {renderSessionCards(snapshots, 'snapshot')}
      </section>

      {/* SECCIÓN 2: BACKUPS POR ESCRITURA */}
      <section className="glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '1.1em', fontFamily: 'var(--font-header)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/images/goblin_assets/warning.png" alt="" style={{ width: 20, height: 20 }} />
              <span>Pre-Write Backups</span>
            </h3>
            <span style={{ color: '#94a3b8', fontSize: '0.82em' }}>
              Files automatically created before writing or updating TSM groups in WoW.
            </span>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(12, 8, 3, 0.7)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              padding: '6px 14px',
              borderRadius: '8px'
            }}
          >
            <span style={{ fontSize: '0.85em', color: '#fbbf24', fontWeight: 600, fontFamily: 'var(--font-header)' }}>
              Retention Limit (1–10):
            </span>
            <input
              type="number"
              min={1}
              max={10}
              value={backupCount}
              onChange={(e) => void handleUpdateBackupCount(Number(e.target.value))}
              style={{
                width: '56px',
                padding: '4px 6px',
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid rgba(251, 191, 36, 0.4)',
                borderRadius: '6px',
                color: '#fbbf24',
                fontWeight: 700,
                textAlign: 'center'
              }}
            />
          </div>
        </div>

        {renderSessionCards(writeBackups, 'write')}
      </section>
    </div>
  )
}
