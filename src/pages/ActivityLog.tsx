import { useEffect, useState, type JSX } from 'react'

import type { ActivityEvent } from '../../shared/settings'

function ActivityLog(): JSX.Element {
  const [events, setEvents] = useState<ActivityEvent[]>([])

  useEffect(() => {
    void window.goblin.getActivityLog().then(setEvents)
    return window.goblin.onActivity((event) => {
      setEvents((current) => [event, ...current].slice(0, 200))
    })
  }, [])

  return (
    <div className="page">
      <div className="glass-panel activity-log">
        {events.length === 0 ? (
          <div className="empty-state">
            <p>Todavía no hay eventos. Activa auto-sync o dispara un sync manual.</p>
          </div>
        ) : (
          <ul className="activity-list">
            {events.map((event) => (
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
