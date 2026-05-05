// Author: Subash Karki

import { createSignal } from 'solid-js'
import { createStore, type SetStoreFunction } from 'solid-js/store'
import type { ComposerState } from './types'
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
// Default state factory
// ---------------------------------------------------------------------------

export const createDefaultState = (
  sessionId: string,
  worktreeId: string
): ComposerState => ({
  sessionId,
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
