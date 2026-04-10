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
// Clear file tree (on worktree switch)
// ---------------------------------------------------------------------------

export const clearFileTreeAtom = atom(null, (_get, set) => {
  set(fileTreeDataAtom, new Map());
  set(expandedFoldersAtom, []);
  set(selectedFileAtom, null);
});

// ---------------------------------------------------------------------------
// Right sidebar active tab
// ---------------------------------------------------------------------------

export const rightSidebarTabAtom = atomWithStorage<'files' | 'changes'>(
  'phantom-right-sidebar-tab',
  'files',
);
