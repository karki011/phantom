/**
 * @phantom-os/panes — React hooks (backward-compatible re-exports)
 * @author Subash Karki
 *
 * These hooks re-export from WorkspaceProvider for backward compatibility
 * with existing code that imports from this module.
 */

import { usePaneStore, usePaneStoreSelector } from './WorkspaceProvider.js';
import type { PaneStoreCompat } from './WorkspaceProvider.js';

/**
 * Subscribe to the full pane store from React.
 * Prefer using usePaneStore() from WorkspaceProvider when inside a provider tree.
 */
export const usePanes = (): PaneStoreCompat => usePaneStore();

/**
 * Selector overload for fine-grained subscriptions.
 */
export function usePaneSelector<T>(selector: (s: PaneStoreCompat) => T): T {
  return usePaneStoreSelector(selector);
}
