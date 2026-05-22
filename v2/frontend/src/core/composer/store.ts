// Author: Subash Karki

import { createSignal } from 'solid-js'
import { createStore, type SetStoreFunction } from 'solid-js/store'
import type { ChipData, ComposerState, SessionLifecycle } from './types'
import {
  composerModel,
  composerPermissionMode,
  composerEffortLevel,
  composerFontSize,
} from './preferences'

// ---------------------------------------------------------------------------
// Module-scoped store map — survives component unmount
// ---------------------------------------------------------------------------

export type StoreTuple = [ComposerState, SetStoreFunction<ComposerState>]

const sessionStores = new Map<string, StoreTuple>()

// Reactive signal tracking session IDs — plain Map mutations don't trigger
// SolidJS reactivity, so components like ComposerStatusPill / ComposerSubTabs
// need this signal to re-render when sessions are added or removed.
const [sessionIds, setSessionIds] = createSignal<string[]>([])

// ---------------------------------------------------------------------------
// Per-worktree session cache — mirrors the pane stateCache pattern
// ---------------------------------------------------------------------------

interface WorktreeComposerState {
  stores: Map<string, StoreTuple>
  activeId: string | null
}

const sessionCache = new Map<string, WorktreeComposerState>()
let previousComposerWorktreeId: string | null = null

// ---------------------------------------------------------------------------
// Default state factory
// ---------------------------------------------------------------------------

export const createDefaultState = (
  sessionId: string,
  worktreeId: string
): ComposerState => ({
  sessionId,
  resumeId: null,
  worktreeId,
  messages: [],
  toolUses: {},
  streaming: null,
  permission: null,
  strategy: null,
  mode: 'normal',
  permissionMode: composerPermissionMode(),
  effortLevel: composerEffortLevel() as ComposerState['effortLevel'],
  fontSize: composerFontSize(),
  editorContext: null,
  status: 'idle',
  label: '',
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUsd: 0,
  contextUsedPct: 0,
  model: composerModel(),
  chips: [] as ChipData[],
  lifecycle: 'active' as SessionLifecycle,
})

// ---------------------------------------------------------------------------
// Store CRUD
// ---------------------------------------------------------------------------

export const getOrCreateSessionStore = (
  sessionId: string,
  worktreeId: string
): StoreTuple => {
  const existing = sessionStores.get(sessionId)
  if (existing) return existing

  const tuple = createStore<ComposerState>(
    createDefaultState(sessionId, worktreeId)
  )
  sessionStores.set(sessionId, tuple)
  setSessionIds(Array.from(sessionStores.keys()))
  return tuple
}

export const getSessionStore = (sessionId: string): StoreTuple | null =>
  sessionStores.get(sessionId) ?? null

export const removeSessionStore = (sessionId: string): void => {
  sessionStores.delete(sessionId)
  setSessionIds(Array.from(sessionStores.keys()))
}

export const listSessionIds = (): string[] => sessionIds()

// ---------------------------------------------------------------------------
// Active session tracking
// ---------------------------------------------------------------------------

export const [activeSessionId, setActiveSessionId] = createSignal<
  string | null
>(null)

export const getActiveStore = (): StoreTuple | null => {
  const id = activeSessionId()
  return id ? getSessionStore(id) : null
}

// ---------------------------------------------------------------------------
// Worktree switching — save/restore session state per worktree
// ---------------------------------------------------------------------------

/**
 * Call this whenever the active worktree changes.
 *
 * - Saves current sessionStores + activeSessionId under the previous worktree.
 * - Restores cached state for the incoming worktree (or starts fresh).
 * - Does NOT disconnect bridges — Go-side sessions keep running in the background.
 */
export const switchComposerWorkspace = (worktreeId: string): void => {
  if (previousComposerWorktreeId === worktreeId) return

  // Save current state under the previous worktree
  if (previousComposerWorktreeId) {
    sessionCache.set(previousComposerWorktreeId, {
      stores: new Map(sessionStores),
      activeId: activeSessionId(),
    })

    const MAX_CACHED = 5
    if (sessionCache.size > MAX_CACHED) {
      const oldest = sessionCache.keys().next().value
      if (oldest && oldest !== worktreeId) sessionCache.delete(oldest)
    }
  }
  previousComposerWorktreeId = worktreeId

  // Clear the live map so it doesn't bleed into the new worktree's view
  sessionStores.clear()

  const cached = sessionCache.get(worktreeId)
  if (cached) {
    // Refresh LRU recency by re-inserting
    sessionCache.delete(worktreeId)
    sessionCache.set(worktreeId, cached)

    // Restore the saved session stores into the live map
    for (const [id, tuple] of cached.stores) {
      sessionStores.set(id, tuple)
    }
    setSessionIds(Array.from(sessionStores.keys()))
    setActiveSessionId(cached.activeId)
  } else {
    // Fresh worktree — no sessions yet
    setSessionIds([])
    setActiveSessionId(null)
  }
}
