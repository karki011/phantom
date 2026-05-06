// Author: Subash Karki

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock preferences module — loadPref / setPref call Wails bindings at runtime
// ---------------------------------------------------------------------------
vi.mock('../preferences', () => ({
  loadPref: vi.fn(),
  setPref: vi.fn().mockResolvedValue(undefined),
}))

import { loadPref, setPref } from '../preferences'
import {
  mruWorktrees,
  pushMru,
  pruneMru,
  initMru,
} from '../worktree-mru'

const mockLoadPref = loadPref as ReturnType<typeof vi.fn>
const mockSetPref = setPref as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reset the module-scoped MRU signal to [] between tests.
 * The only way to do this without re-importing the module is to call
 * initMru() with an empty seed while loadPref returns null.
 */
const resetMru = async (): Promise<void> => {
  mockLoadPref.mockResolvedValueOnce('')
  await initMru([])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('worktree-mru', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockSetPref.mockResolvedValue(undefined)
    await resetMru()
  })

  // -------------------------------------------------------------------------
  // pushMru
  // -------------------------------------------------------------------------

  describe('pushMru', () => {
    it('moves ID to front and deduplicates', () => {
      pushMru('a')
      pushMru('b')
      pushMru('c')
      expect(mruWorktrees()).toEqual(['c', 'b', 'a'])

      // Push 'a' again — should move it to front
      pushMru('a')
      expect(mruWorktrees()).toEqual(['a', 'c', 'b'])
    })

    it('caps at MAX_MRU (20)', () => {
      for (let i = 0; i < 25; i++) {
        pushMru(`id-${i}`)
      }
      expect(mruWorktrees()).toHaveLength(20)
      // Most recently pushed should be first
      expect(mruWorktrees()[0]).toBe('id-24')
    })

    it('calls setPref to persist after each push', () => {
      pushMru('x')
      expect(mockSetPref).toHaveBeenCalledTimes(1)
      expect(mockSetPref).toHaveBeenCalledWith(
        'worktree_mru',
        JSON.stringify(['x']),
      )
    })

    it('deduplicates correctly when pushing existing first item', () => {
      pushMru('a')
      pushMru('b')
      // 'b' is already at front — push it again
      pushMru('b')
      expect(mruWorktrees()).toEqual(['b', 'a'])
    })
  })

  // -------------------------------------------------------------------------
  // pruneMru
  // -------------------------------------------------------------------------

  describe('pruneMru', () => {
    it('removes IDs not in the valid set', () => {
      pushMru('a')
      pushMru('b')
      pushMru('c')
      vi.clearAllMocks()
      mockSetPref.mockResolvedValue(undefined)

      pruneMru(new Set(['a', 'c']))
      expect(mruWorktrees()).toEqual(['c', 'a'])
    })

    it('is a no-op when all IDs are valid (does not call setPref)', () => {
      pushMru('a')
      pushMru('b')
      vi.clearAllMocks()
      mockSetPref.mockResolvedValue(undefined)

      pruneMru(new Set(['b', 'a']))
      expect(mruWorktrees()).toEqual(['b', 'a'])
      // Length unchanged → no persist call
      expect(mockSetPref).not.toHaveBeenCalled()
    })

    it('results in empty list when no IDs are valid', () => {
      pushMru('x')
      pushMru('y')
      vi.clearAllMocks()
      mockSetPref.mockResolvedValue(undefined)

      pruneMru(new Set())
      expect(mruWorktrees()).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // initMru
  // -------------------------------------------------------------------------

  describe('initMru', () => {
    it('seeds from seedIds when no saved pref exists', async () => {
      mockLoadPref.mockResolvedValueOnce('')
      await initMru(['id-1', 'id-2', 'id-3'])
      expect(mruWorktrees()).toEqual(['id-1', 'id-2', 'id-3'])
    })

    it('restores from saved pref when one exists', async () => {
      const saved = ['z', 'y', 'x']
      mockLoadPref.mockResolvedValueOnce(JSON.stringify(saved))
      await initMru(['fallback-1'])
      // Saved pref wins over seedIds
      expect(mruWorktrees()).toEqual(saved)
    })

    it('falls back to seedIds when saved pref is malformed JSON', async () => {
      mockLoadPref.mockResolvedValueOnce('not-json{{')
      await initMru(['seed-a', 'seed-b'])
      expect(mruWorktrees()).toEqual(['seed-a', 'seed-b'])
    })

    it('falls back to seedIds when saved pref is valid JSON but not an array', async () => {
      mockLoadPref.mockResolvedValueOnce(JSON.stringify({ bad: true }))
      await initMru(['seed-1'])
      expect(mruWorktrees()).toEqual(['seed-1'])
    })

    it('caps restored list at MAX_MRU (20)', async () => {
      const oversized = Array.from({ length: 30 }, (_, i) => `id-${i}`)
      mockLoadPref.mockResolvedValueOnce(JSON.stringify(oversized))
      await initMru([])
      expect(mruWorktrees()).toHaveLength(20)
    })

    it('seeds with empty array when no pref and no seedIds', async () => {
      mockLoadPref.mockResolvedValueOnce('')
      await initMru()
      expect(mruWorktrees()).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // Reactivity
  // -------------------------------------------------------------------------

  describe('mruWorktrees reactivity', () => {
    it('returns updated value immediately after pushMru', () => {
      expect(mruWorktrees()).toEqual([])
      pushMru('reactive-id')
      // SolidJS signals are synchronous — no await needed
      expect(mruWorktrees()).toEqual(['reactive-id'])
    })

    it('reflects multiple pushes in order', () => {
      pushMru('first')
      pushMru('second')
      pushMru('third')
      expect(mruWorktrees()[0]).toBe('third')
      expect(mruWorktrees()).toHaveLength(3)
    })
  })
})
