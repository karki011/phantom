/**
 * AI Commit Message atoms — per-worktree state for AI-generated commit messages
 * Uses atomFamily for per-worktree isolation to minimize rerenders.
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { activeWorktreeAtom } from './worktrees';

// Phase type
export type AiCommitPhase = 'idle' | 'generating' | 'ready' | 'error';

// State interface
export interface AiCommitState {
  phase: AiCommitPhase;
  message: string | null;
  error: string | null;
}

const DEFAULT_STATE: AiCommitState = { phase: 'idle', message: null, error: null };

// ---------------------------------------------------------------------------
// In-flight tracking (Set of worktreeIds) — mirrors prCreatingSetAtom
// ---------------------------------------------------------------------------

export const commitGenSetAtom = atom<Set<string>>(new Set<string>());

export const addCommitGenAtom = atom(null, (_get, set, worktreeId: string) => {
  set(commitGenSetAtom, (prev: Set<string>) => new Set([...prev, worktreeId]));
});

export const removeCommitGenAtom = atom(null, (_get, set, worktreeId: string) => {
  set(commitGenSetAtom, (prev: Set<string>) => {
    const next = new Set(prev);
    next.delete(worktreeId);
    return next;
  });
});

// ---------------------------------------------------------------------------
// Per-worktree atom family — mirrors prStatusFamily
// ---------------------------------------------------------------------------

export const aiCommitFamily = atomFamily((_worktreeId: string) =>
  atom<AiCommitState>(DEFAULT_STATE),
);

// ---------------------------------------------------------------------------
// Derived atom for active worktree
// ---------------------------------------------------------------------------

export const activeAiCommitAtom = atom<AiCommitState>((get) => {
  const wt = get(activeWorktreeAtom);
  if (!wt) return DEFAULT_STATE;
  return get(aiCommitFamily(wt.id));
});

export const activeIsGeneratingCommitAtom = atom<boolean>((get) => {
  const wt = get(activeWorktreeAtom);
  if (!wt) return false;
  return get(commitGenSetAtom).has(wt.id);
});
