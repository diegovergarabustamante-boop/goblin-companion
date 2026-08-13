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

const TABS: Array<{ id: TabId; label: string; icon: string; disabled?: boolean }> = [
  { id: 'dashboard', label: 'Dashboard', icon: './images/goblin_assets/icon_home.png' },
  { id: 'activity-log', label: 'Activity Log', icon: './images/goblin_assets/icon_items.png' },
  { id: 'backups', label: 'Backups', icon: './images/goblin_assets/icon_inventory.png' },
  { id: 'settings', label: 'Settings', icon: './images/goblin_assets/icon_config.png' }
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

  // Loading state
  if (!loaded || !settings) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--color-bg) url("./images/bg/trade_princes_vault.png") no-repeat center center fixed',
          backgroundSize: 'cover',
          color: '#fbbf24',
          fontFamily: 'var(--font-header)',
          gap: '16px'
        }}
      >
        <img
          src="./images/goblin_assets/coin_badge_1.png"
          alt="Goblin"
          style={{ width: 64, height: 64, filter: 'drop-shadow(0 0 12px rgba(251, 191, 36, 0.7))' }}
        />
        <div style={{ fontSize: '1.2em', fontWeight: 700, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
          Loading Goblin Companion…
        </div>
      </div>
    )
  }

  // Not logged in — show login screen
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
      <nav className="tab-bar" aria-label="Sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button${activeTab === tab.id ? ' is-active' : ''}`}
            disabled={tab.disabled}
            onClick={() => setActiveTab(tab.id)}
          >
            <img src={tab.icon} alt="" className="tab-button__icon" />
            <span>{tab.label}</span>
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
        <span>{status?.autoSyncEnabled ? 'Auto-sync active' : 'Auto-sync disabled'}</span>
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.78em', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <img src="./images/goblin_assets/user.png" alt="User" style={{ width: 14, height: 14, objectFit: 'contain' }} />
          <span>{settings.username}</span>
        </span>
      </footer>
    </div>
  )
}

export default App
