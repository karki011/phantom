/**
 * Sessions Jotai Atoms
 * Now backed by TanStack Query via atoms/queries.ts.
 * Re-exports for backward compatibility + legacy refresh atoms that invalidate queries.
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

import { type TaskData, getSessionTasks } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import {
  activeSessionsStatusAtom,
  recentSessionsStatusAtom,
} from './queries';

// ---------------------------------------------------------------------------
// Re-exports from TanStack Query atoms
// ---------------------------------------------------------------------------

export {
  activeSessionsAtom,
  recentSessionsAtom,
  activeSessionsStatusAtom,
  recentSessionsStatusAtom,
} from './queries';

// ---------------------------------------------------------------------------
// Backward-compatible refresh atoms (now invalidate TanStack Query cache)
// ---------------------------------------------------------------------------

export const refreshActiveSessionsAtom = atom(null, () => {
  queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
});

export const refreshRecentSessionsAtom = atom(null, () => {
  queryClient.invalidateQueries({ queryKey: ['sessions', 'recent'] });
});

// ---------------------------------------------------------------------------
// Combined loading/error derived from query status atoms
// ---------------------------------------------------------------------------

export const sessionsLoadingAtom = atom((get) => {
  const activeStatus = get(activeSessionsStatusAtom);
  const recentStatus = get(recentSessionsStatusAtom);
  return activeStatus.isLoading || recentStatus.isLoading;
});

export const sessionsErrorAtom = atom((get) => {
  const activeStatus = get(activeSessionsStatusAtom);
  const recentStatus = get(recentSessionsStatusAtom);
  return activeStatus.error ?? recentStatus.error ?? null;
});

// ---------------------------------------------------------------------------
// Session tasks — atom family keyed by sessionId (unchanged — not migrated)
// ---------------------------------------------------------------------------

export const sessionTasksAtomFamily = atomFamily((sessionId: string) => {
  const refreshAtom = atom(0);

  const tasksAtom = atom<Promise<TaskData[]>>(async (get) => {
    get(refreshAtom);
    return getSessionTasks(sessionId);
  });

  const refreshTasksAtom = atom(null, (_get, set) => {
    set(refreshAtom, (c) => c + 1);
  });

  return atom(
    async (get) => get(tasksAtom),
    (_get, set) => set(refreshTasksAtom),
  );
});
