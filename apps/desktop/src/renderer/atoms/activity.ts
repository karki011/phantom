/**
 * Git Activity atoms — PR status, CI/CD runs, recent commits
 * Uses atomFamily for per-worktree isolation to minimize rerenders.
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { PrStatus, CiRun, CommitInfo } from '../lib/api';
import { activeWorktreeAtom } from './worktrees';

// ---------------------------------------------------------------------------
// PR creation in-flight tracking (Set of worktreeIds)
// ---------------------------------------------------------------------------

export const prCreatingSetAtom = atom<Set<string>>(new Set());

export const addPrCreatingAtom = atom(null, (_get, set, worktreeId: string) => {
  set(prCreatingSetAtom, (prev) => new Set([...prev, worktreeId]));
});

export const removePrCreatingAtom = atom(null, (_get, set, worktreeId: string) => {
  set(prCreatingSetAtom, (prev) => {
    const next = new Set(prev);
    next.delete(worktreeId);
    return next;
  });
});

// ---------------------------------------------------------------------------
// Per-worktree atom families (isolate rerenders per worktree)
// ---------------------------------------------------------------------------

export const prStatusFamily = atomFamily((_worktreeId: string) =>
  atom<PrStatus | null>(null),
);

export const ciRunsFamily = atomFamily((_worktreeId: string) =>
  atom<CiRun[] | null>(null),
);

export const commitsFamily = atomFamily((_worktreeId: string) =>
  atom<CommitInfo[]>([]),
);

// ---------------------------------------------------------------------------
// Derived atoms for active worktree (for RightSidebar badge)
// ---------------------------------------------------------------------------

/** PR status for the active worktree only — avoids full-map subscription */
export const activePrStatusAtom = atom<PrStatus | null>((get) => {
  const wt = get(activeWorktreeAtom);
  if (!wt) return null;
  return get(prStatusFamily(wt.id));
});

/** Whether a PR creation is in-flight for the active worktree */
export const activeIsCreatingPrAtom = atom<boolean>((get) => {
  const wt = get(activeWorktreeAtom);
  if (!wt) return false;
  return get(prCreatingSetAtom).has(wt.id);
});

// ---------------------------------------------------------------------------
// Activity refresh trigger (bump to force immediate refetch)
// ---------------------------------------------------------------------------

/** Monotonic counter — bump to signal that activity data should be refetched */
export const activityRefreshAtom = atom(0);
export const bumpActivityRefreshAtom = atom(null, (_get, set) => {
  set(activityRefreshAtom, (n) => n + 1);
});
