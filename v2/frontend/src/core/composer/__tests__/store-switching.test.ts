// Author: Subash Karki

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock preferences — composerModel / composerPermissionMode / etc. call
// loadPref which reaches into Wails bindings at runtime.
// ---------------------------------------------------------------------------
vi.mock('../preferences', () => ({
  composerModel: vi.fn(() => 'claude-opus-4-5'),
  composerPermissionMode: vi.fn(() => 'default'),
  composerEffortLevel: vi.fn(() => 'normal'),
  composerFontSize: vi.fn(() => 14),
}))

import {
  getOrCreateSessionStore,
  listSessionIds,
  activeSessionId,
  setActiveSessionId,
  switchComposerWorkspace,
} from '../store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testCounter = 0

/**
 * Return a unique worktree ID per test so module-scoped Maps don't bleed.
 * Format: "wt-<counter>-<label>"
 */
const uniqueWt = (label: string): string => `wt-${++testCounter}-${label}`

/**
 * Advance to a fresh worktree, populating it with sessions, then return
 * its ID so callers can switch back to verify restore behaviour.
 */
const setupWorktreeWithSessions = (
  wtId: string,
  sessions: string[],
): void => {
  switchComposerWorkspace(wtId)
  for (const sid of sessions) {
    getOrCreateSessionStore(sid, wtId)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('switchComposerWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Basic save behaviour
  // -------------------------------------------------------------------------

  it('saves current sessions under old worktree ID when switching', () => {
    const wtA = uniqueWt('save-a')
    const wtB = uniqueWt('save-b')

    setupWorktreeWithSessions(wtA, ['sess-1', 'sess-2'])
    expect(listSessionIds()).toEqual(expect.arrayContaining(['sess-1', 'sess-2']))

    // Switch away — sessions for wtA should be saved internally
    switchComposerWorkspace(wtB)

    // Active sessions are now empty (fresh worktree)
    expect(listSessionIds()).toEqual([])
  })

  // -------------------------------------------------------------------------
  // Restore behaviour
  // -------------------------------------------------------------------------

  it('restores cached sessions when switching back to previous worktree', () => {
    const wtA = uniqueWt('restore-a')
    const wtB = uniqueWt('restore-b')

    setupWorktreeWithSessions(wtA, ['sess-alpha', 'sess-beta'])

    // Leave wtA, add some sessions to wtB
    setupWorktreeWithSessions(wtB, ['sess-gamma'])

    // Switch back to wtA
    switchComposerWorkspace(wtA)

    const ids = listSessionIds()
    expect(ids).toContain('sess-alpha')
    expect(ids).toContain('sess-beta')
    expect(ids).not.toContain('sess-gamma')
  })

  it('restores activeSessionId for the restored worktree', () => {
    const wtA = uniqueWt('active-restore-a')
    const wtB = uniqueWt('active-restore-b')

    switchComposerWorkspace(wtA)
    getOrCreateSessionStore('my-session', wtA)
    setActiveSessionId('my-session')
    expect(activeSessionId()).toBe('my-session')

    // Leave and come back
    switchComposerWorkspace(wtB)
    expect(activeSessionId()).toBeNull()

    switchComposerWorkspace(wtA)
    expect(activeSessionId()).toBe('my-session')
  })

  // -------------------------------------------------------------------------
  // Fresh worktree
  // -------------------------------------------------------------------------

  it('results in empty sessions when switching to a new (uncached) worktree', () => {
    const wtA = uniqueWt('fresh-a')
    const wtNew = uniqueWt('fresh-new')

    setupWorktreeWithSessions(wtA, ['existing-sess'])
    switchComposerWorkspace(wtNew)

    expect(listSessionIds()).toEqual([])
    expect(activeSessionId()).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Round-trip
  // -------------------------------------------------------------------------

  it('preserves sessions across multiple switches (round-trip)', () => {
    const wtA = uniqueWt('round-a')
    const wtB = uniqueWt('round-b')
    const wtC = uniqueWt('round-c')

    setupWorktreeWithSessions(wtA, ['s-a1', 's-a2'])
    setupWorktreeWithSessions(wtB, ['s-b1'])
    setupWorktreeWithSessions(wtC, ['s-c1', 's-c2', 's-c3'])

    // Go back to A
    switchComposerWorkspace(wtA)
    expect(listSessionIds()).toEqual(expect.arrayContaining(['s-a1', 's-a2']))
    expect(listSessionIds()).toHaveLength(2)

    // Go to B
    switchComposerWorkspace(wtB)
    expect(listSessionIds()).toEqual(['s-b1'])

    // Go to C
    switchComposerWorkspace(wtC)
    expect(listSessionIds()).toHaveLength(3)
  })

  // -------------------------------------------------------------------------
  // No-op when same worktree
  // -------------------------------------------------------------------------

  it('is a no-op when switching to the same worktree ID', () => {
    const wtA = uniqueWt('noop-a')

    switchComposerWorkspace(wtA)
    getOrCreateSessionStore('stable-sess', wtA)
    setActiveSessionId('stable-sess')

    const idsBefore = listSessionIds().slice()
    const activeBefore = activeSessionId()

    // Switch to the same ID — should early-return, state unchanged
    switchComposerWorkspace(wtA)

    expect(listSessionIds()).toEqual(idsBefore)
    expect(activeSessionId()).toBe(activeBefore)
  })

  // -------------------------------------------------------------------------
  // listSessionIds accuracy
  // -------------------------------------------------------------------------

  it('listSessionIds returns correct IDs after switch and restore', () => {
    const wtA = uniqueWt('list-a')
    const wtB = uniqueWt('list-b')

    switchComposerWorkspace(wtA)
    getOrCreateSessionStore('l-1', wtA)
    getOrCreateSessionStore('l-2', wtA)
    getOrCreateSessionStore('l-3', wtA)
    expect(listSessionIds()).toHaveLength(3)

    switchComposerWorkspace(wtB)
    expect(listSessionIds()).toHaveLength(0)

    switchComposerWorkspace(wtA)
    const restored = listSessionIds()
    expect(restored).toHaveLength(3)
    expect(restored).toContain('l-1')
    expect(restored).toContain('l-2')
    expect(restored).toContain('l-3')
  })
})
