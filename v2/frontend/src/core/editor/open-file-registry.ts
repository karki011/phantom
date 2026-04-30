// Phantom — Global registry of open files (single-instance enforcement)
// Author: Subash Karki
//
// A file may only be open in ONE editor tab across ALL editor panes.
// Every entry point (file tree, Quick Open, terminal links, Claude events)
// MUST check this registry before creating a new tab.

import { createSignal } from 'solid-js';
import type { OpenFileEntry } from './types';

// ---------------------------------------------------------------------------
// Reactive signal: filePath -> OpenFileEntry
// ---------------------------------------------------------------------------

const [openFiles, setOpenFiles] = createSignal<Map<string, OpenFileEntry>>(new Map());

export { openFiles };

/** Register a file as open in a specific pane/tab. */
export const registerOpenFile = (filePath: string, entry: OpenFileEntry): void => {
  setOpenFiles((prev) => {
    const next = new Map(prev);
    next.set(filePath, entry);
    return next;
  });
};

/** Unregister a file when its tab is closed. */
export const unregisterOpenFile = (filePath: string): void => {
  setOpenFiles((prev) => {
    const next = new Map(prev);
    next.delete(filePath);
    return next;
  });
};

/** Check if a file is already open. Returns the entry or undefined. */
export const getOpenFileEntry = (filePath: string): OpenFileEntry | undefined => {
  return openFiles().get(filePath);
};

/** Get all open file paths (for file watcher registration). */
export const getAllOpenFilePaths = (): string[] => {
  return Array.from(openFiles().keys());
};

/**
 * Unregister all files belonging to a specific pane.
 * Called when an editor pane is closed/destroyed.
 */
export const unregisterAllFilesForPane = (paneId: string): void => {
  setOpenFiles((prev) => {
    const next = new Map(prev);
    for (const [path, entry] of next) {
      if (entry.paneId === paneId) {
        next.delete(path);
      }
    }
    return next;
  });
};

/**
 * After closing a tab, decrement tabIndex for all later tabs in the same pane.
 * This keeps the registry in sync with the visual tab order.
 */
export const decrementTabIndicesAfter = (paneId: string, closedIndex: number): void => {
  setOpenFiles((prev) => {
    const next = new Map(prev);
    for (const [path, entry] of next) {
      if (entry.paneId === paneId && entry.tabIndex > closedIndex) {
        next.set(path, { ...entry, tabIndex: entry.tabIndex - 1 });
      }
    }
    return next;
  });
};
