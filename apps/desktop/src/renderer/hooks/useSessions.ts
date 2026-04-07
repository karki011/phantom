/**
 * useSessions Hook
 * Provides active sessions, recent sessions with background refresh (no flash)
 *
 * @author Subash Karki
 */
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';

import {
  activeSessionsAtom,
  recentSessionsAtom,
  refreshActiveSessionsAtom,
  refreshRecentSessionsAtom,
  sessionsLoadingAtom,
  sessionsErrorAtom,
} from '../atoms/sessions';
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
  const loading = useAtomValue(sessionsLoadingAtom);
  const error = useAtomValue(sessionsErrorAtom);
  const refreshActive = useSetAtom(refreshActiveSessionsAtom);
  const refreshRecent = useSetAtom(refreshRecentSessionsAtom);

  // Initial fetch on mount
  useEffect(() => {
    refreshActive();
    refreshRecent();
  }, [refreshActive, refreshRecent]);

  const refresh = () => {
    refreshActive();
    refreshRecent();
  };

  return { active, recent, loading, error, refresh };
};
