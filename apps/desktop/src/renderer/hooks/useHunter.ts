/**
 * useHunter Hook
 * Provides hunter profile, stats with background refresh (no flash)
 *
 * @author Subash Karki
 */
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';

import {
  hunterProfileAtom,
  hunterStatsAtom,
  hunterLoadingStateAtom,
  refreshHunterAtom,
} from '../atoms/hunter';
import type { HunterProfile, HunterStats } from '../lib/api';

interface UseHunterReturn {
  profile: HunterProfile | null;
  stats: HunterStats | null;
  loading: boolean;
  error: null;
  refresh: () => void;
}

export const useHunter = (): UseHunterReturn => {
  const profile = useAtomValue(hunterProfileAtom);
  const stats = useAtomValue(hunterStatsAtom);
  const loading = useAtomValue(hunterLoadingStateAtom);
  const refresh = useSetAtom(refreshHunterAtom);

  // Initial fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, stats, loading, error: null, refresh };
};
