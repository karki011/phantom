// Author: Subash Karki

import { Show, createMemo, type Component } from 'solid-js'
import { listSessionIds } from '@/core/composer/store'
import {
  streamingSessionCount,
  pendingPermissionCount,
  toggleComposerDrawer,
} from '@/core/composer/signals'
import * as css from './ComposerStatusPill.css'

const ComposerStatusPill: Component = () => {
  const sessionCount = createMemo(() => listSessionIds().length)

  const stateClass = createMemo(() => {
    if (pendingPermissionCount() > 0) return css.permissionNeeded
    if (streamingSessionCount() > 0) return css.streaming
    return css.idle
  })

  const label = createMemo(() => {
    const parts: string[] = []
    const total = sessionCount()
    parts.push(`${total} session${total !== 1 ? 's' : ''}`)

    const streaming = streamingSessionCount()
    if (streaming > 0) {
      parts.push(`${streaming} streaming`)
    }

    const pending = pendingPermissionCount()
    if (pending > 0) {
      parts.push(`! ${pending} awaiting`)
    }

    return parts.join(' · ')
  })

  return (
    <Show when={sessionCount() > 0}>
      <div
        class={`${css.pill} ${stateClass()}`}
        onClick={toggleComposerDrawer}
      >
        {label()}
      </div>
    </Show>
  )
}

export default ComposerStatusPill
