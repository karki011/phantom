// Author: Subash Karki

import { createSignal, createMemo, type Accessor } from 'solid-js'
import { listSessionIds, getSessionStore, activeSessionId, type StoreTuple } from './store'

// ---------------------------------------------------------------------------
// Cross-pane aggregate signals
// ---------------------------------------------------------------------------

export const [streamingSessionCount, setStreamingSessionCount] =
  createSignal<number>(0)

export const [pendingPermissionCount, setPendingPermissionCount] =
  createSignal<number>(0)

/**
 * Iterates every live session store and recalculates the global
 * streaming / permission counters. Call after any session state change.
 */
export const refreshGlobalSignals = (): void => {
  let streaming = 0
  let permissions = 0

  for (const id of listSessionIds()) {
    const tuple = getSessionStore(id)
    if (!tuple) continue

    const [state] = tuple

    if (state.streaming !== null) streaming += 1
    if (state.permission !== null) permissions += 1
  }

  setStreamingSessionCount(streaming)
  setPendingPermissionCount(permissions)
}

// ---------------------------------------------------------------------------
// Composer drawer toggle
// ---------------------------------------------------------------------------

export const [composerDrawerOpen, setComposerDrawerOpen] =
  createSignal<boolean>(false)

export const toggleComposerDrawer = (): void => {
  setComposerDrawerOpen((prev) => !prev)
}

// ---------------------------------------------------------------------------
// Active session accessor
// ---------------------------------------------------------------------------

/**
 * Reactive memo that resolves the active session's store tuple.
 * Returns `null` when no session is selected.
 */
export const useActiveSession = (): Accessor<StoreTuple | null> =>
  createMemo<StoreTuple | null>(() => {
    const id = activeSessionId()
    return id ? getSessionStore(id) : null
  })
