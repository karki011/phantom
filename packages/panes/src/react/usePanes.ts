/**
 * @phantom-os/panes — React hook
 * @author Subash Karki
 */

import { useStore } from 'zustand';
import { paneStore } from '../core/store.js';
import type { PaneStore } from '../core/store.js';

/** Subscribe to the full pane store from React. */
export const usePanes = (): PaneStore => useStore(paneStore);

/** Selector overload for fine-grained subscriptions. */
export function usePaneSelector<T>(selector: (s: PaneStore) => T): T {
  return useStore(paneStore, selector);
}
