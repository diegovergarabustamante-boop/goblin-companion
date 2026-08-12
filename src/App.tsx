import { useEffect, useState, type JSX } from 'react'

import type { AppTab } from '../shared/ipc'
import type { CompanionSettings, CompanionStatusSnapshot } from '../shared/settings'
import ActivityLog from './pages/ActivityLog'
import Backups from './pages/Backups'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import FirstRunWizard from './components/FirstRunWizard'
import StatusDot from './components/StatusDot'
import TitleBar from './components/TitleBar'

type TabId = AppTab | 'pnl'

const TABS: Array<{ id: TabId; label: string; disabled?: boolean }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'activity-log', label: 'Activity Log' },
  { id: 'backups', label: 'Backups' },
  { id: 'settings', label: 'Settings' },
  { id: 'pnl', label: 'P&L · Coming soon', disabled: true }
]

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [status, setStatus] = useState<CompanionStatusSnapshot | null>(null)
  const [settings, setSettings] = useState<CompanionSettings | null>(null)
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([window.goblin.getStatus(), window.goblin.getSettings()]).then(([snapshot, cfg]) => {
      if (cancelled) return
      setStatus(snapshot)
      setSettings(cfg)
      setShowWizard(!cfg.firstRunCompleted)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => window.goblin.onNavigate((tab) => setActiveTab(tab)), [])
  useEffect(() => window.goblin.onStatusChange((snapshot) => setStatus(snapshot)), [])

  return (
    <div className="app-shell">
      <TitleBar status={status} />
      <nav className="tab-bar" aria-label="Secciones">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button${activeTab === tab.id ? ' is-active' : ''}`}
            disabled={tab.disabled}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="tab-content">
        {activeTab === 'dashboard' && <Dashboard status={status} />}
        {activeTab === 'activity-log' && <ActivityLog />}
        {activeTab === 'backups' && <Backups />}
        {activeTab === 'settings' && <Settings />}
      </main>
      <footer className="status-bar">
        <StatusDot status={status?.trayStatus ?? 'gray'} />
        <span>{status?.autoSyncEnabled ? 'Auto-sync activo' : 'Auto-sync apagado'}</span>
      </footer>

      {showWizard && settings ? (
        <FirstRunWizard
          initial={settings}
          onCompleted={(next) => {
            setSettings(next)
            setShowWizard(false)
            setActiveTab('dashboard')
          }}
        />
      ) : null}
    </div>
  )
}

export default App
