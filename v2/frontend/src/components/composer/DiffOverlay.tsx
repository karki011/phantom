// Author: Subash Karki
//
// Overlay that shows a diff when the agent proposes an Edit/Write tool use.
// User can accept or reject the change.

import { createMemo, type Component } from 'solid-js'
import * as s from './DiffOverlay.css'
import DiffViewer from '@/shared/DiffViewer/DiffViewer'
import { computeDiff } from '@/shared/DiffViewer/diff-engine'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DiffOverlayProps {
  oldContent: string
  newContent: string
  filePath: string
  onAccept: () => void
  onReject: () => void
}

const DiffOverlay: Component<DiffOverlayProps> = (props) => {
  const diffResult = createMemo(() => computeDiff(props.oldContent, props.newContent))
  const stats = createMemo(() => diffResult().stats)

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onReject()
  }

  return (
    <div class={s.overlay} onKeyDown={handleKeyDown} tabIndex={-1}>
      <div class={s.panel}>
        {/* Header */}
        <div class={s.header}>
          <span class={s.filePath}>{props.filePath}</span>
          <div class={s.statsBar}>
            <span class={s.statAdd}>+{stats().added}</span>
            <span class={s.statRemove}>-{stats().removed}</span>
          </div>
        </div>

        {/* Diff body */}
        <div class={s.diffBody}>
          <DiffViewer
            originalContent={props.oldContent}
            modifiedContent={props.newContent}
            mode="unified"
          />
        </div>

        {/* Footer */}
        <div class={s.footer}>
          <button
            class={`${s.btnBase} ${s.btnReject}`}
            onClick={props.onReject}
          >
            Reject
          </button>
          <button
            class={`${s.btnBase} ${s.btnAccept}`}
            onClick={props.onAccept}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}

export default DiffOverlay
