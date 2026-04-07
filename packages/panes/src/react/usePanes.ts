/**
 * @phantom-os/panes — React hooks (backward-compatible re-exports)
 * @author Subash Karki
 *
 * These hooks re-export from WorkspaceProvider for backward compatibility
 * with existing code that imports from this module.
 */

import { useStore } from 'zustand';
import { paneStore } from '../core/store.js';
import type { PaneStore } from '../core/store.js';

/**
 * Subscribe to the full pane store from React.
 * Prefer using usePaneStore() from WorkspaceProvider when inside a provider tree.
 * This hook uses the singleton store directly (no provider needed).
 */
export const usePanes = (): PaneStore => useStore(paneStore);

/**
 * Selector overload for fine-grained subscriptions.
 * Uses the singleton store directly.
 */
export function usePaneSelector<T>(selector: (s: PaneStore) => T): T {
  return useStore(paneStore, selector);
}
