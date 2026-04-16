/**
 * File Explorer Jotai Atoms
 * State for the right sidebar file tree
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import {
  type FileEntry,
  type DirectoryListing,
  getDirectoryListing,
} from '../lib/api';

// ---------------------------------------------------------------------------
// File tree cache — Map<directoryPath, FileEntry[]>
// ---------------------------------------------------------------------------

/** Max cached directory listings across all worktrees */
const MAX_CACHE_ENTRIES = 200;

const fileTreeDataAtom = atom<Map<string, FileEntry[]>>(new Map());

export const fileTreeAtom = atom((get) => get(fileTreeDataAtom));

// ---------------------------------------------------------------------------
// Expanded folders
// ---------------------------------------------------------------------------

export const expandedFoldersAtom = atomWithStorage<string[]>(
  'phantom-expanded-folders',
  [],
);

export const toggleFolderAtom = atom(null, (get, set, path: string) => {
  const current = get(expandedFoldersAtom);
  if (current.includes(path)) {
    set(
      expandedFoldersAtom,
      current.filter((p) => p !== path),
    );
  } else {
    set(expandedFoldersAtom, [...current, path]);
  }
});

// ---------------------------------------------------------------------------
// Selected file
// ---------------------------------------------------------------------------

export const selectedFileAtom = atom<string | null>(null);

// ---------------------------------------------------------------------------
// Loading state per directory
// ---------------------------------------------------------------------------

const loadingDirsAtom = atom<Set<string>>(new Set<string>());

export const isDirLoadingAtom = atom((get) => (path: string) =>
  get(loadingDirsAtom).has(path),
);

// ---------------------------------------------------------------------------
// Fetch directory entries for a worktree
// ---------------------------------------------------------------------------

export const fetchDirectoryAtom = atom(
  null,
  async (
    get,
    set,
    params: { worktreeId: string; path: string },
  ) => {
    const { worktreeId, path } = params;
    const cacheKey = `${worktreeId}:${path}`;

    // Mark loading
    set(loadingDirsAtom, (prev: Set<string>) => new Set([...prev, cacheKey]));

    try {
      const result: DirectoryListing = await getDirectoryListing(
        worktreeId,
        path,
      );
      set(fileTreeDataAtom, (prev: Map<string, FileEntry[]>) => {
        const next = new Map(prev);
        next.set(cacheKey, result.entries);
        return next;
      });
    } catch {
      // Keep existing data on error
    } finally {
      set(loadingDirsAtom, (prev: Set<string>) => {
        const next = new Set(prev);
        next.delete(cacheKey);
        return next;
      });
    }
  },
);

// ---------------------------------------------------------------------------
// LRU eviction — trim stale file tree entries
// ---------------------------------------------------------------------------

/** Evict stale file tree entries when cache exceeds MAX_CACHE_ENTRIES.
 *  Keeps all entries for the given worktreeId; evicts from others. */
export const trimFileTreeCacheAtom = atom(
  null,
  (get, set, activeWorktreeId: string) => {
    const tree = get(fileTreeDataAtom);
    if (tree.size <= MAX_CACHE_ENTRIES) return;

    const next = new Map<string, FileEntry[]>();
    const overflow: string[] = [];

    // Keep all entries for the active worktree
    for (const [key, entries] of tree) {
      if (key.startsWith(`${activeWorktreeId}:`)) {
        next.set(key, entries);
      } else {
        overflow.push(key);
      }
    }

    // If still over limit after keeping active, trim from overflow
    // Keep most recently added (last in Map iteration order)
    const remaining = MAX_CACHE_ENTRIES - next.size;
    const toKeep = overflow.slice(-Math.max(0, remaining));
    for (const key of toKeep) {
      next.set(key, tree.get(key)!);
    }

    set(fileTreeDataAtom, next);
  },
);

// ---------------------------------------------------------------------------
// Clear file tree
// ---------------------------------------------------------------------------

/** @deprecated File tree cache now persists across switches. Kept for manual-refresh scenarios. */
export const clearFileTreeAtom = atom(null, (_get, set) => {
  set(fileTreeDataAtom, new Map());
  set(expandedFoldersAtom, []);
  set(selectedFileAtom, null);
});

// ---------------------------------------------------------------------------
// Right sidebar active tab
// ---------------------------------------------------------------------------

export const rightSidebarTabAtom = atomWithStorage<'files' | 'changes' | 'activity'>(
  'phantom-right-sidebar-tab',
  'files',
);

// ---------------------------------------------------------------------------
// Git status — now backed by TanStack Query (per-worktree cached)
// Re-exported here for backwards compatibility with existing consumers.
// ---------------------------------------------------------------------------

export { gitStatusAtom, gitChangesCountAtom } from './queries';

// ---------------------------------------------------------------------------
// Root file count (derived from file tree root entries)
// ---------------------------------------------------------------------------

export const rootFileCountAtom = atom((get) => {
  const tree = get(fileTreeDataAtom);
  let count = 0;
  for (const entries of tree.values()) {
    count += entries.filter((e) => !e.isDirectory).length;
  }
  return count;
});
