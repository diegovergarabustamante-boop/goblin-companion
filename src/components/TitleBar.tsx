import type { JSX } from 'react'

import type { CompanionStatusSnapshot } from '../../shared/settings'
import StatusDot from './StatusDot'

interface TitleBarProps {
  status: CompanionStatusSnapshot | null
}

function TitleBar({ status }: TitleBarProps): JSX.Element {
  return (
    <div className="title-bar">
      <div className="title-bar__drag-region">
        <img
          src="/images/goblin_assets/coin_badge_1.png"
          alt="Goblin Companion"
          className="title-bar__brand-icon"
        />
        <StatusDot status={status?.trayStatus ?? 'gray'} />
        <span className="title-bar__title">Goblin Companion</span>
      </div>
      <div className="title-bar__controls">
        <button type="button" aria-label="Minimize" onClick={() => window.goblin.minimizeWindow()}>
          &minus;
        </button>
        <button type="button" className="close-btn" aria-label="Close to tray" onClick={() => window.goblin.closeWindow()}>
          &times;
        </button>
      </div>
    </div>
  )
}

export default TitleBar
