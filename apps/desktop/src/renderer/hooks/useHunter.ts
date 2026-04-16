/**
 * useHunter Hook
 * Provides hunter profile, stats with TanStack Query-backed atoms.
 * No manual initial fetch needed -- atomWithQuery handles it automatically.
 *
 * @author Subash Karki
 */
import { useAtomValue } from 'jotai';

import {
  hunterProfileAtom,
  hunterStatsAtom,
  hunterStatusAtom,
} from '../atoms/queries';
import { queryClient } from '../lib/queryClient';
import type { HunterProfile, HunterStats } from '../lib/api';

interface UseHunterReturn {
  profile: HunterProfile | null;
  stats: HunterStats | null;
  loading: boolean;
  error: null | Error;
  refresh: () => void;
}

export const useHunter = (): UseHunterReturn => {
  const profile = useAtomValue(hunterProfileAtom);
  const stats = useAtomValue(hunterStatsAtom);
  const status = useAtomValue(hunterStatusAtom);

  return {
    profile,
    stats,
    loading: status.isLoading,
    error: status.error ?? null,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['hunter'] }),
  };
};
