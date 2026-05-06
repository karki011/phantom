// Author: Subash Karki

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before module imports
// ---------------------------------------------------------------------------

vi.mock('../worktree-mru', () => ({
  mruWorktrees: vi.fn(() => []),
}))

vi.mock('../worktrees', () => ({
  selectWorktree: vi.fn(),
}))

vi.mock('../../panes/signals', () => ({
  switchWorkspace: vi.fn(),
}))

vi.mock('../app', () => ({
  setActiveTopTab: vi.fn(),
}))

import { mruWorktrees } from '../worktree-mru'
import { selectWorktree } from '../worktrees'
import { switchWorkspace } from '../../panes/signals'
import { setActiveTopTab } from '../app'
import {
  switcherVisible,
  switcherSelectedIndex,
  openSwitcher,
  closeSwitcher,
  advanceSwitcher,
  commitSwitcher,
  commitSwitcherAt,
} from '../worktree-switcher'

const mockMruWorktrees = mruWorktrees as ReturnType<typeof vi.fn>
const mockSelectWorktree = selectWorktree as ReturnType<typeof vi.fn>
const mockSwitchWorkspace = switchWorkspace as ReturnType<typeof vi.fn>
const mockSetActiveTopTab = setActiveTopTab as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Reset switcher state between tests
// ---------------------------------------------------------------------------

const resetSwitcher = (): void => {
  // closeSwitcher resets visible=false, selectedIndex=0
  closeSwitcher()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('worktree-switcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSwitcher()
    // Default: empty MRU
    mockMruWorktrees.mockReturnValue([])
  })

  // -------------------------------------------------------------------------
  // openSwitcher
  // -------------------------------------------------------------------------

  describe('openSwitcher', () => {
    it('sets visible=true and selectedIndex=1 when MRU has ≥2 items', () => {
      mockMruWorktrees.mockReturnValue(['wt-1', 'wt-2'])
      openSwitcher()
      expect(switcherVisible()).toBe(true)
      expect(switcherSelectedIndex()).toBe(1)
    })

    it('is a no-op when MRU has fewer than 2 items (0 items)', () => {
      mockMruWorktrees.mockReturnValue([])
      openSwitcher()
      expect(switcherVisible()).toBe(false)
      expect(switcherSelectedIndex()).toBe(0)
    })

    it('is a no-op when MRU has exactly 1 item', () => {
      mockMruWorktrees.mockReturnValue(['wt-only'])
      openSwitcher()
      expect(switcherVisible()).toBe(false)
    })

    it('sets visible=true with exactly 2 items (boundary)', () => {
      mockMruWorktrees.mockReturnValue(['a', 'b'])
      openSwitcher()
      expect(switcherVisible()).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // closeSwitcher
  // -------------------------------------------------------------------------

  describe('closeSwitcher', () => {
    it('sets visible=false and selectedIndex=0', () => {
      mockMruWorktrees.mockReturnValue(['wt-1', 'wt-2'])
      openSwitcher()
      expect(switcherVisible()).toBe(true)

      closeSwitcher()
      expect(switcherVisible()).toBe(false)
      expect(switcherSelectedIndex()).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // advanceSwitcher
  // -------------------------------------------------------------------------

  describe('advanceSwitcher', () => {
    beforeEach(() => {
      // Open switcher with 3-item MRU so we start at index 1
      mockMruWorktrees.mockReturnValue(['wt-a', 'wt-b', 'wt-c'])
      openSwitcher()
      // selectedIndex is now 1
    })

    it('increments selectedIndex by 1', () => {
      advanceSwitcher(1)
      expect(switcherSelectedIndex()).toBe(2)
    })

    it('wraps around forward past end', () => {
      // Currently at index 1 in a 3-item list
      advanceSwitcher(1) // → 2
      advanceSwitcher(1) // → 0 (wrap)
      expect(switcherSelectedIndex()).toBe(0)
    })

    it('decrements selectedIndex by 1', () => {
      // At index 1
      advanceSwitcher(-1)
      expect(switcherSelectedIndex()).toBe(0)
    })

    it('wraps around backward past 0', () => {
      // At index 1
      advanceSwitcher(-1) // → 0
      advanceSwitcher(-1) // → 2 (wrap)
      expect(switcherSelectedIndex()).toBe(2)
    })

    it('is a no-op when MRU list is empty', () => {
      mockMruWorktrees.mockReturnValue([])
      closeSwitcher() // reset to index 0
      advanceSwitcher(1)
      expect(switcherSelectedIndex()).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // commitSwitcher
  // -------------------------------------------------------------------------

  describe('commitSwitcher', () => {
    it('calls selectWorktree, switchWorkspace, setActiveTopTab for selected item', () => {
      const mru = ['current', 'target', 'other']
      mockMruWorktrees.mockReturnValue(mru)
      openSwitcher() // selectedIndex=1

      commitSwitcher()

      expect(mockSelectWorktree).toHaveBeenCalledWith('target')
      expect(mockSwitchWorkspace).toHaveBeenCalledWith('target')
      expect(mockSetActiveTopTab).toHaveBeenCalledWith('worktree')
    })

    it('closes switcher after commit', () => {
      mockMruWorktrees.mockReturnValue(['a', 'b'])
      openSwitcher()
      commitSwitcher()

      expect(switcherVisible()).toBe(false)
      expect(switcherSelectedIndex()).toBe(0)
    })

    it('closes even when MRU is empty (no action on empty list)', () => {
      // Don't open — just call commitSwitcher directly
      mockMruWorktrees.mockReturnValue([])
      commitSwitcher()

      expect(mockSelectWorktree).not.toHaveBeenCalled()
      expect(mockSwitchWorkspace).not.toHaveBeenCalled()
      expect(mockSetActiveTopTab).not.toHaveBeenCalled()
      expect(switcherVisible()).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // commitSwitcherAt
  // -------------------------------------------------------------------------

  describe('commitSwitcherAt', () => {
    it('sets selectedIndex to the given index then commits', () => {
      const mru = ['wt-0', 'wt-1', 'wt-2']
      mockMruWorktrees.mockReturnValue(mru)

      commitSwitcherAt(2)

      expect(mockSelectWorktree).toHaveBeenCalledWith('wt-2')
      expect(mockSwitchWorkspace).toHaveBeenCalledWith('wt-2')
      expect(mockSetActiveTopTab).toHaveBeenCalledWith('worktree')
      expect(switcherVisible()).toBe(false)
    })

    it('sets selectedIndex to 0 and commits the first item', () => {
      mockMruWorktrees.mockReturnValue(['first', 'second'])
      commitSwitcherAt(0)
      expect(mockSelectWorktree).toHaveBeenCalledWith('first')
    })
  })
})
