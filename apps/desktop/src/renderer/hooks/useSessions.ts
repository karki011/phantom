/**
 * useSessions Hook
 * Provides active sessions, recent sessions with TanStack Query-backed atoms.
 * No manual initial fetch needed -- atomWithQuery handles it automatically.
 *
 * @author Subash Karki
 */
import { useAtomValue } from 'jotai';

import {
  activeSessionsAtom,
  recentSessionsAtom,
  activeSessionsStatusAtom,
  recentSessionsStatusAtom,
} from '../atoms/queries';
import { queryClient } from '../lib/queryClient';
import type { SessionData } from '../lib/api';

interface UseSessionsReturn {
  active: SessionData[];
  recent: SessionData[];
  loading: boolean;
  error: unknown;
  refresh: () => void;
}

export const useSessions = (): UseSessionsReturn => {
  const active = useAtomValue(activeSessionsAtom);
  const recent = useAtomValue(recentSessionsAtom);
  const activeStatus = useAtomValue(activeSessionsStatusAtom);
  const recentStatus = useAtomValue(recentSessionsStatusAtom);

  return {
    active,
    recent,
    loading: activeStatus.isLoading || recentStatus.isLoading,
    error: activeStatus.error ?? recentStatus.error ?? null,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  };
};
