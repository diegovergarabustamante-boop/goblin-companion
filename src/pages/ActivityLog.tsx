import type { JSX } from 'react'

function ActivityLog(): JSX.Element {
  return (
    <div className="page">
      <div className="glass-panel empty-state">
        <p>El activity log (JSONL) se llenará cuando el watcher y el sync-manager existan (Etapa 3 del plan).</p>
      </div>
    </div>
  )
}

export default ActivityLog
