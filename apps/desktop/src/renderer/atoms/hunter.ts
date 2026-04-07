/**
 * Hunter Jotai Atoms
 * Writable atoms that keep previous data during refetch (no flash)
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';

import { type HunterData, type HunterProfile, type HunterStats, getHunter } from '../lib/api';

// ---------------------------------------------------------------------------
// Data atoms — hold current values, never cleared during refetch
// ---------------------------------------------------------------------------

const hunterDataAtom = atom<HunterData | null>(null);
const hunterLoadingAtom = atom(false);

// ---------------------------------------------------------------------------
// Refresh action — fetches in background, updates data atom when done
// ---------------------------------------------------------------------------

export const refreshHunterAtom = atom(null, async (_get, set) => {
  set(hunterLoadingAtom, true);
  try {
    const data = await getHunter();
    set(hunterDataAtom, data);
  } catch {
    // Keep previous data on error
  } finally {
    set(hunterLoadingAtom, false);
  }
});

// ---------------------------------------------------------------------------
// Derived read atoms
// ---------------------------------------------------------------------------

export const hunterProfileAtom = atom<HunterProfile | null>((get) => {
  const data = get(hunterDataAtom);
  return data?.profile ?? null;
});

export const hunterStatsAtom = atom<HunterStats | null>((get) => {
  const data = get(hunterDataAtom);
  return data?.stats ?? null;
});

export const hunterLoadingStateAtom = atom((get) => get(hunterLoadingAtom));
