// Author: Subash Karki
//
// Overlay that shows a line-by-line diff when the agent proposes an
// Edit/Write tool use. User can accept or reject the change.

import { createMemo, For, type Component } from 'solid-js'
import * as s from './DiffOverlay.css'

// ---------------------------------------------------------------------------
// Simple line-by-line diff (LCS-based)
// ---------------------------------------------------------------------------

export interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
  oldNum: number | null
  newNum: number | null
}

/**
 * Longest Common Subsequence table for two string arrays.
 * Returns the LCS length matrix.
 */
const buildLcsTable = (a: string[], b: string[]): number[][] => {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  )

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  return dp
}

/**
 * Walk the LCS table backwards to produce a unified diff line array.
 */
export const computeLineDiff = (oldText: string, newText: string): DiffLine[] => {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const dp = buildLcsTable(oldLines, newLines)

  const result: DiffLine[] = []
  let i = oldLines.length
  let j = newLines.length

  // Backtrack to build the diff
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'same', text: oldLines[i - 1], oldNum: i, newNum: j })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', text: newLines[j - 1], oldNum: null, newNum: j })
      j--
    } else {
      result.push({ type: 'remove', text: oldLines[i - 1], oldNum: i, newNum: null })
      i--
    }
  }

  result.reverse()
  return result
}

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

const lineStyleMap: Record<DiffLine['type'], string> = {
  same: s.lineSame,
  add: s.lineAdd,
  remove: s.lineRemove,
}

const prefixMap: Record<DiffLine['type'], string> = {
  same: ' ',
  add: '+',
  remove: '-',
}

const DiffOverlay: Component<DiffOverlayProps> = (props) => {
  const diff = createMemo(() => computeLineDiff(props.oldContent, props.newContent))

  const stats = createMemo(() => {
    let added = 0
    let removed = 0
    for (const line of diff()) {
      if (line.type === 'add') added++
      if (line.type === 'remove') removed++
    }
    return { added, removed }
  })

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
          <For each={diff()}>
            {(line) => (
              <div class={`${s.lineRow} ${lineStyleMap[line.type]}`}>
                <span class={s.lineNumber}>
                  {line.oldNum ?? ''}
                </span>
                <span class={s.lineNumber}>
                  {line.newNum ?? ''}
                </span>
                <span class={s.lineContent}>
                  {prefixMap[line.type]} {line.text}
                </span>
              </div>
            )}
          </For>
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
