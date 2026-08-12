import { useEffect, useState, type JSX } from 'react'

import type { AppTab } from '../shared/ipc'
import type { CompanionSettings, CompanionStatusSnapshot } from '../shared/settings'
import ActivityLog from './pages/ActivityLog'
import Backups from './pages/Backups'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import LoginScreen from './components/LoginScreen'
import StatusDot from './components/StatusDot'
import TitleBar from './components/TitleBar'

type TabId = AppTab

const TABS: Array<{ id: TabId; label: string; disabled?: boolean }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'activity-log', label: 'Activity Log' },
  { id: 'backups', label: 'Backups' },
  { id: 'settings', label: 'Settings' }
]

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [status, setStatus] = useState<CompanionStatusSnapshot | null>(null)
  const [settings, setSettings] = useState<CompanionSettings | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([window.goblin.getStatus(), window.goblin.getSettings()]).then(([snapshot, cfg]) => {
      if (cancelled) return
      setStatus(snapshot)
      setSettings(cfg)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => window.goblin.onNavigate((tab) => setActiveTab(tab)), [])
  useEffect(() => window.goblin.onStatusChange((snapshot) => setStatus(snapshot)), [])

  // Still loading
  if (!loaded || !settings) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#fbbf24', fontSize: '1em' }}>
        🤖 Cargando Goblin Companion…
      </div>
    )
  }

  // Not logged in — show login screen first
  if (!settings.companionToken) {
    return (
      <LoginScreen
        initialSettings={settings}
        onLoginSuccess={(updatedSettings) => {
          setSettings(updatedSettings)
          setActiveTab('dashboard')
        }}
      />
    )
  }

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
        {activeTab === 'settings' && <Settings onLogout={() => setSettings((s) => s ? { ...s, companionToken: '', username: '' } : s)} />}
      </main>
      <footer className="status-bar">
        <StatusDot status={status?.trayStatus ?? 'gray'} />
        <span>{status?.autoSyncEnabled ? 'Auto-sync activo' : 'Auto-sync apagado'}</span>
        <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.78em' }}>
          👤 {settings.username}
        </span>
      </footer>
    </div>
  )
}

export default App
