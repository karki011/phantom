// Author: Subash Karki
//
// Reactive signal that tracks the currently focused editor file + cursor state.
// The composer attaches this to user_input events so the agent knows what
// the user is looking at.

import { createSignal, createEffect, onCleanup } from 'solid-js'
import { openFiles } from '@/core/editor/open-file-registry'
import { activePaneId, activeTab } from '@/core/panes/signals'
import type { EditorContext } from './types'

// ---------------------------------------------------------------------------
// EditorContext signal
// ---------------------------------------------------------------------------

const [editorFocus, setEditorFocus] = createSignal<EditorContext | null>(null)

export { editorFocus }

// ---------------------------------------------------------------------------
// Internal cursor/selection state updated via CustomEvent from EditorPane
// ---------------------------------------------------------------------------

interface CursorDetail {
  filePath: string
  language: string
  line: number
  column: number
  selection: string | null
}

/**
 * Initialise the reactive watcher. Call once at app startup (e.g. in the
 * composer root or the App component). The effect auto-disposes when the
 * owner scope is destroyed.
 */
export const initEditorContext = (): void => {
  // Track the latest cursor/selection detail reported by EditorPane
  let latestCursor: CursorDetail | null = null

  const handleCursorChange = (e: Event) => {
    const detail = (e as CustomEvent<CursorDetail>).detail
    latestCursor = detail
    setEditorFocus({
      filePath: detail.filePath,
      language: detail.language,
      cursor: `${detail.line}:${detail.column}`,
      selection: detail.selection,
    })
  }

  window.addEventListener('phantom:editor-cursor-change', handleCursorChange)
  onCleanup(() => {
    window.removeEventListener('phantom:editor-cursor-change', handleCursorChange)
  })

  // When the active pane changes away from an editor, clear the context
  createEffect(() => {
    const paneId = activePaneId()
    const tab = activeTab()
    if (!tab || !paneId) {
      setEditorFocus(null)
      return
    }

    const pane = tab.panes[paneId]
    if (!pane || pane.kind !== 'editor') {
      setEditorFocus(null)
      return
    }

    // Active pane IS an editor — pick the file it has open from the registry
    const files = openFiles()
    for (const [filePath, entry] of files) {
      if (entry.paneId === paneId) {
        // If we already have cursor info for this file, use it
        if (latestCursor && latestCursor.filePath === filePath) {
          setEditorFocus({
            filePath,
            language: latestCursor.language,
            cursor: `${latestCursor.line}:${latestCursor.column}`,
            selection: latestCursor.selection,
          })
        } else {
          // We know the file is open but haven't received cursor data yet
          setEditorFocus({
            filePath,
            language: null,
            cursor: null,
            selection: null,
          })
        }
        return
      }
    }

    // Editor pane is active but no file is registered yet
    setEditorFocus(null)
  })
}
