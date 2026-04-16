/**
 * TanStack Query atoms -- replaces hand-rolled fetch+refresh patterns
 * with stale-while-revalidate, structural sharing, and automatic refetch.
 *
 * Uses `atomWithQuery` from jotai-tanstack-query to create Jotai atoms
 * backed by TanStack Query. Each atom returns a full QueryObserverResult
 * (data, isLoading, isError, error, etc.).
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { atomWithQuery } from 'jotai-tanstack-query';
import {
  getActiveSessions,
  getSessions,
  getHunter,
  getWorktrees,
  getProjects,
  getGitStatus,
  type SessionData,
  type HunterProfile,
  type HunterStats,
  type WorktreeData,
  type ProjectData,
  type GitStatusResult,
} from '../lib/api';
import { activeWorktreeAtom } from './worktrees';

// ---------------------------------------------------------------------------
// Active Sessions
// ---------------------------------------------------------------------------

export const activeSessionsStatusAtom = atomWithQuery(() => ({
  queryKey: ['sessions', 'active'] as const,
  queryFn: getActiveSessions,
  staleTime: 10_000,
  // No polling — SSE events trigger invalidation in real-time
}));

export const activeSessionsAtom = atom<SessionData[]>((get) => {
  const status = get(activeSessionsStatusAtom);
  return status.data ?? [];
});

// ---------------------------------------------------------------------------
// Recent Sessions
// ---------------------------------------------------------------------------

export const recentSessionsStatusAtom = atomWithQuery(() => ({
  queryKey: ['sessions', 'recent'] as const,
  queryFn: () => getSessions({ limit: 50 }),
  staleTime: 10_000,
  // No polling — SSE events trigger invalidation in real-time
}));

export const recentSessionsAtom = atom<SessionData[]>((get) => {
  const status = get(recentSessionsStatusAtom);
  return status.data ?? [];
});

// ---------------------------------------------------------------------------
// Hunter Profile + Stats
// ---------------------------------------------------------------------------

export const hunterStatusAtom = atomWithQuery(() => ({
  queryKey: ['hunter'] as const,
  queryFn: getHunter,
  staleTime: 30_000,
  // No polling — SSE events trigger invalidation in real-time
}));

export const hunterProfileAtom = atom<HunterProfile | null>((get) => {
  const status = get(hunterStatusAtom);
  return status.data?.profile ?? null;
});

export const hunterStatsAtom = atom<HunterStats | null>((get) => {
  const status = get(hunterStatusAtom);
  return status.data?.stats ?? null;
});

export const hunterLoadingStateAtom = atom((get) => {
  const status = get(hunterStatusAtom);
  return status.isLoading;
});

// ---------------------------------------------------------------------------
// Worktrees
// ---------------------------------------------------------------------------

export const worktreesStatusAtom = atomWithQuery(() => ({
  queryKey: ['worktrees'] as const,
  queryFn: () => getWorktrees(),
  staleTime: 30_000,
  refetchInterval: 30_000,
}));

export const worktreeListAtom = atom<WorktreeData[]>((get) => {
  const status = get(worktreesStatusAtom);
  return status.data ?? [];
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projectsStatusAtom = atomWithQuery(() => ({
  queryKey: ['projects'] as const,
  queryFn: getProjects,
  staleTime: 60_000,
  refetchInterval: 60_000,
}));

export const projectsListAtom = atom<ProjectData[]>((get) => {
  const status = get(projectsStatusAtom);
  return status.data ?? [];
});

// ---------------------------------------------------------------------------
// Git Status (per-worktree, stale-while-revalidate)
// Keyed by active worktreeId — switching back shows cached data instantly
// ---------------------------------------------------------------------------

export const gitStatusQueryAtom = atomWithQuery((get) => {
  const wt = get(activeWorktreeAtom);
  const wtId = wt?.id ?? '';
  return {
    queryKey: ['git-status', wtId] as const,
    queryFn: () => getGitStatus(wtId),
    enabled: !!wtId,
    staleTime: 5_000,
    refetchInterval: 30_000, // Safety net — fs.watch + manual refresh handle real-time
  };
});

/** Git status for the active worktree — cached per worktreeId */
export const gitStatusAtom = atom<GitStatusResult | null>((get) => {
  const status = get(gitStatusQueryAtom);
  return status.data ?? null;
});

/** Derived count — drives the Changes tab badge */
export const gitChangesCountAtom = atom((get) => {
  const status = get(gitStatusAtom);
  return status?.files.length ?? 0;
});
