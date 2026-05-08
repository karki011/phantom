// Author: Subash Karki
import type { SessionLifecycle } from '@/core/composer/types'
import { chipBase, chipStatus } from './Chip.css'

interface SessionLifecycleChipProps {
  lifecycle: SessionLifecycle
}

const lifecycleConfig: Record<SessionLifecycle, { label: string; status: keyof typeof chipStatus }> = {
  active: { label: 'Session: active', status: 'success' },
  hibernated: { label: 'Session: hibernated', status: 'warning' },
  resuming: { label: 'Session: resuming...', status: 'active' },
  archived: { label: 'Session: archived', status: 'neutral' },
}

export function SessionLifecycleChip(props: SessionLifecycleChipProps) {
  const config = () => lifecycleConfig[props.lifecycle] || lifecycleConfig.active

  return (
    <span class={`${chipBase} ${chipStatus[config().status]}`}>
      {config().label}
    </span>
  )
}
