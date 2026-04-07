/**
 * @phantom-os/panes — React context provider
 * @author Subash Karki
 *
 * Provides the Zustand store + PaneRegistry to the React tree.
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useStore, type StoreApi } from 'zustand';
import { paneStore } from '../core/store.js';
import type { PaneStore } from '../core/store.js';
import type { PaneDefinition, PaneRegistry } from '../core/types.js';

// ---------------------------------------------------------------------------
// Store context
// ---------------------------------------------------------------------------

const PaneStoreContext = createContext<StoreApi<PaneStore> | null>(null);

export function usePaneStore(): PaneStore {
  const store = useContext(PaneStoreContext);
  if (!store) throw new Error('usePaneStore must be used within <WorkspaceProvider>');
  return useStore(store);
}

export function usePaneStoreSelector<T>(selector: (s: PaneStore) => T): T {
  const store = useContext(PaneStoreContext);
  if (!store) throw new Error('usePaneStoreSelector must be used within <WorkspaceProvider>');
  return useStore(store, selector);
}

/** Direct access to the store API (for non-React code) */
export function usePaneStoreApi(): StoreApi<PaneStore> {
  const store = useContext(PaneStoreContext);
  if (!store) throw new Error('usePaneStoreApi must be used within <WorkspaceProvider>');
  return store;
}

// ---------------------------------------------------------------------------
// Registry context
// ---------------------------------------------------------------------------

const PaneRegistryContext = createContext<PaneRegistry>(new Map());

export function usePaneRegistry(): PaneRegistry {
  return useContext(PaneRegistryContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface WorkspaceProviderProps {
  /** Custom store instance. Falls back to the default singleton. */
  store?: StoreApi<PaneStore>;
  /** Pane type definitions keyed by `kind`. */
  definitions: Record<string, PaneDefinition>;
  children: ReactNode;
}

export function WorkspaceProvider({
  store: storeProp,
  definitions,
  children,
}: WorkspaceProviderProps) {
  const storeInstance = storeProp ?? paneStore;
  const registry: PaneRegistry = useMemo(
    () => new Map(Object.entries(definitions)),
    [definitions],
  );

  return (
    <PaneStoreContext value={storeInstance}>
      <PaneRegistryContext value={registry}>
        {children}
      </PaneRegistryContext>
    </PaneStoreContext>
  );
}
