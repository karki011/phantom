/**
 * Achievements Jotai Atoms
 * Writable atoms that keep previous data during refetch (no flash)
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';

import { type AchievementData, getAchievements } from '../lib/api';

// ---------------------------------------------------------------------------
// Data atoms — hold current values, never cleared during refetch
// ---------------------------------------------------------------------------

const achievementsDataAtom = atom<AchievementData[]>([]);

// ---------------------------------------------------------------------------
// Refresh action
// ---------------------------------------------------------------------------

export const refreshAchievementsAtom = atom(null, async (_get, set) => {
  try {
    const data = await getAchievements();
    set(achievementsDataAtom, data);
  } catch {
    // Keep previous data on error
  }
});

// ---------------------------------------------------------------------------
// Read atoms
// ---------------------------------------------------------------------------

export const achievementsAtom = atom((get) => get(achievementsDataAtom));

export const unlockedCountAtom = atom((get) => {
  const achievements = get(achievementsDataAtom);
  return achievements.filter((a) => a.unlockedAt !== null).length;
});
