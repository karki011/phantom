// Author: Subash Karki

import { createSignal } from 'solid-js';
import { loadPref, setPref } from './preferences';

const MAX_MRU = 20;
const PREF_KEY = 'worktree_mru';

const [mruStack, setMruStack] = createSignal<string[]>([]);

export const mruWorktrees = mruStack;

export const pushMru = (worktreeId: string): void => {
  setMruStack((prev) => {
    const filtered = prev.filter((id) => id !== worktreeId);
    const next = [worktreeId, ...filtered].slice(0, MAX_MRU);
    persistMru(next);
    return next;
  });
};

export const pruneMru = (validIds: Set<string>): void => {
  setMruStack((prev) => {
    const pruned = prev.filter((id) => validIds.has(id));
    if (pruned.length !== prev.length) persistMru(pruned);
    return pruned;
  });
};

// seedIds: fallback list of all known worktree IDs to prime an empty MRU.
// Passed in from the caller (worktrees.ts) to avoid a circular import.
export const initMru = async (seedIds: string[] = []): Promise<void> => {
  const raw = await loadPref(PREF_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setMruStack(parsed.filter((id): id is string => typeof id === 'string').slice(0, MAX_MRU));
        return;
      }
    } catch {
      // Malformed pref — fall through to seed from provided IDs
    }
  }

  // No saved MRU: seed from all known worktrees (unordered, just primes the list)
  setMruStack(seedIds.slice(0, MAX_MRU));
};

const persistMru = (stack: string[]): void => {
  // Fire and forget — MRU is a UX convenience, not critical data
  setPref(PREF_KEY, JSON.stringify(stack)).catch(() => {});
};
