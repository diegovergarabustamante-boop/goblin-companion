import { useEffect, useState, type JSX } from 'react'

import type { ActivityEvent, ActivityLevel } from '../../shared/settings'

const FILTERS: Array<{ id: 'all' | ActivityLevel; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'success', label: 'OK' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Error' }
]

function ActivityLog(): JSX.Element {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [filter, setFilter] = useState<'all' | ActivityLevel>('all')

  useEffect(() => {
    void window.goblin.getActivityLog().then(setEvents)
    return window.goblin.onActivity((event) => {
      setEvents((current) => [event, ...current].slice(0, 200))
    })
  }, [])

  async function handleClear(): Promise<void> {
    if (!window.confirm('¿Vaciar el activity log (memoria + archivo)?')) return
    await window.goblin.clearActivityLog()
    setEvents([])
  }

  const visible = filter === 'all' ? events : events.filter((e) => e.level === filter)

  return (
    <div className="page">
      <div className="button-row" style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`btn${filter === f.id ? ' btn--primary' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
        <button type="button" className="btn" onClick={() => void window.goblin.openActivityLogFolder()}>
          Abrir carpeta
        </button>
        <button type="button" className="btn" onClick={() => void handleClear()} disabled={events.length === 0}>
          Vaciar
        </button>
      </div>

      <div className="glass-panel activity-log">
        {visible.length === 0 ? (
          <div className="empty-state">
            <p>
              {events.length === 0
                ? 'Todavía no hay eventos. Activa auto-sync o dispara un sync manual.'
                : 'Nada en este filtro.'}
            </p>
          </div>
        ) : (
          <ul className="activity-list">
            {visible.map((event) => (
              <li key={event.id} className={`activity-item activity-item--${event.level}`}>
                <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time>
                <span className="activity-item__message">{event.message}</span>
                {event.detail ? <span className="activity-item__detail">{event.detail}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default ActivityLog
