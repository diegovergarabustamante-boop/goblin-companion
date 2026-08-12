import type { JSX } from 'react'

import type { TrayStatus } from '../../shared/settings'

const LABEL: Record<TrayStatus, string> = {
  green: 'Watcher activo + Django OK',
  yellow: 'Django no responde',
  gray: 'Auto-sync apagado',
  red: 'Último sync falló'
}

interface StatusDotProps {
  status: TrayStatus
}

function StatusDot({ status }: StatusDotProps): JSX.Element {
  return <span className={`status-dot status-dot--${status}`} title={LABEL[status]} aria-label={LABEL[status]} />
}

export default StatusDot
