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
        <StatusDot status={status?.trayStatus ?? 'gray'} />
        <span className="title-bar__title">Goblin Companion</span>
      </div>
      <div className="title-bar__controls">
        <button type="button" aria-label="Minimizar" onClick={() => window.goblin.minimizeWindow()}>
          &minus;
        </button>
        <button type="button" aria-label="Cerrar a la bandeja" onClick={() => window.goblin.closeWindow()}>
          &times;
        </button>
      </div>
    </div>
  )
}

export default TitleBar
