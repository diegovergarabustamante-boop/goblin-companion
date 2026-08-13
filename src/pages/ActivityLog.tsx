import { useEffect, useState, type JSX } from 'react'

import type { ActivityEvent, ActivityLevel } from '../../shared/settings'

const FILTERS: Array<{ id: 'all' | ActivityLevel; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'success', label: 'OK' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Error' }
]

function getIconForLevel(level: ActivityLevel): string {
  switch (level) {
    case 'success':
      return '/images/goblin_assets/success.png'
    case 'warn':
      return '/images/goblin_assets/warning.png'
    case 'error':
      return '/images/goblin_assets/failure.png'
    case 'info':
    default:
      return '/images/goblin_assets/info.png'
  }
}

function ActivityLog(): JSX.Element {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [filter, setFilter] = useState<'all' | ActivityLevel>('all')

  useEffect(() => {
    void window.goblin.getActivityLog().then(setEvents)
    return window.goblin.onActivity((event) => {
      setEvents((current) => [event, ...current].slice(0, 300))
    })
  }, [])

  async function handleClear(): Promise<void> {
    if (!window.confirm('Clear activity log (memory + disk file)?')) return
    await window.goblin.clearActivityLog()
    setEvents([])
  }

  const visible = filter === 'all' ? events : events.filter((e) => e.level === filter)

  return (
    <div className="page">
      <div className="button-row" style={{ marginBottom: 14 }}>
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
        <button
          type="button"
          className="btn"
          onClick={() => void window.goblin.openActivityLogFolder()}
          style={{ marginLeft: 'auto' }}
        >
          <img src="/images/goblin_assets/bag.png" alt="" style={{ width: 16, height: 16 }} />
          <span>Open Folder</span>
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => void handleClear()}
          disabled={events.length === 0}
        >
          <img src="/images/goblin_assets/clear.png" alt="" style={{ width: 16, height: 16 }} />
          <span>Clear</span>
        </button>
      </div>

      <div className="glass-panel activity-log">
        <h2 style={{ marginBottom: 14 }}>
          <img src="/images/goblin_assets/icon_items.png" alt="" />
          <span>Live Activity Events</span>
        </h2>
        {visible.length === 0 ? (
          <div className="empty-state">
            <p>
              {events.length === 0
                ? 'No activity events recorded yet. Enable auto-sync or trigger a manual sync.'
                : 'No events matching this filter.'}
            </p>
          </div>
        ) : (
          <ul className="activity-list">
            {visible.map((event) => (
              <li key={event.id} className={`activity-item activity-item--${event.level}`}>
                <img
                  src={getIconForLevel(event.level)}
                  alt=""
                  className="activity-item__icon"
                />
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
