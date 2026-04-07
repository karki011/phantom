/**
 * Sessions Jotai Atoms
 * Writable atoms that refetch in the background without clearing current data
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

import {
  type SessionData,
  type TaskData,
  getActiveSessions,
  getSessions,
  getSessionTasks,
} from '../lib/api';

// ---------------------------------------------------------------------------
// Active sessions — keeps previous data while refetching (no flash)
// ---------------------------------------------------------------------------

const activeSessionsDataAtom = atom<SessionData[]>([]);
const activeSessionsLoadingAtom = atom(false);
const activeSessionsErrorAtom = atom<unknown>(null);

export const activeSessionsAtom = atom((get) => get(activeSessionsDataAtom));

export const refreshActiveSessionsAtom = atom(null, async (_get, set) => {
  set(activeSessionsLoadingAtom, true);
  try {
    const data = await getActiveSessions();
    set(activeSessionsDataAtom, data);
    set(activeSessionsErrorAtom, null);
  } catch (err) {
    set(activeSessionsErrorAtom, err);
  } finally {
    set(activeSessionsLoadingAtom, false);
  }
});

// Initial fetch on first read
const activeInitAtom = atom(false);
export const activeSessionsInitAtom = atom(async (get) => {
  if (!get(activeInitAtom)) {
    // Trigger initial fetch
  }
  return get(activeSessionsDataAtom);
});

// ---------------------------------------------------------------------------
// Recent sessions — same pattern
// ---------------------------------------------------------------------------

const recentSessionsDataAtom = atom<SessionData[]>([]);
const recentSessionsLoadingAtom = atom(false);
const recentSessionsErrorAtom = atom<unknown>(null);

export const recentSessionsAtom = atom((get) => get(recentSessionsDataAtom));

export const refreshRecentSessionsAtom = atom(null, async (_get, set) => {
  set(recentSessionsLoadingAtom, true);
  try {
    const data = await getSessions({ limit: 50 });
    set(recentSessionsDataAtom, data);
    set(recentSessionsErrorAtom, null);
  } catch (err) {
    set(recentSessionsErrorAtom, err);
  } finally {
    set(recentSessionsLoadingAtom, false);
  }
});

// ---------------------------------------------------------------------------
// Combined loading/error for the hook
// ---------------------------------------------------------------------------

export const sessionsLoadingAtom = atom(
  (get) => get(activeSessionsLoadingAtom) || get(recentSessionsLoadingAtom),
);

export const sessionsErrorAtom = atom(
  (get) => get(activeSessionsErrorAtom) ?? get(recentSessionsErrorAtom),
);

// ---------------------------------------------------------------------------
// Session tasks — atom family keyed by sessionId
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
