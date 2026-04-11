/**
 * @phantom-os/panes — React context provider (Jotai)
 * @author Subash Karki
 *
 * Provides the Jotai-based pane store + PaneRegistry to the React tree.
 * Exposes a backward-compatible usePaneStore() hook that returns
 * the same API shape as the old Zustand store.
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { createStore } from 'jotai';
import {
  paneStateAtom,
  activeTabAtom,
  activePaneAtom,
  addTabAtom,
  removeTabAtom,
  setActiveTabAtom,
  reorderTabAtom,
  renameTabAtom,
  addPaneAsTabAtom,
  addPaneAtom,
  closePaneAtom,
  setActivePaneInTabAtom,
  splitPaneAtom,
  resizeSplitAtom,
  equalizeTabAtom,
  movePaneToSplitAtom,
  movePaneToTabAtom,
  switchWorkspaceAtom,
} from '../core/atoms.js';
import { jotaiStore } from '../core/store.js';
import type { PaneDefinition, PaneRegistry, Pane, Tab } from '../core/types.js';

// ---------------------------------------------------------------------------
// Store context (Jotai store for non-React access)
// ---------------------------------------------------------------------------

type JotaiStore = ReturnType<typeof createStore>;
const JotaiStoreContext = createContext<JotaiStore | null>(null);

/**
 * Direct access to the Jotai store API (for non-React code).
 * Replaces the old usePaneStoreApi().
 */
export function usePaneStoreApi(): JotaiStore {
  const store = useContext(JotaiStoreContext);
  if (!store) throw new Error('usePaneStoreApi must be used within <WorkspaceProvider>');
  return store;
}

// ---------------------------------------------------------------------------
// Backward-compatible hook — same API shape as old Zustand store
// ---------------------------------------------------------------------------

/** Return type matching the old PaneStore (state + actions) */
export interface PaneStoreCompat {
  // State
  tabs: Tab[];
  activeTabId: string | null;

  // Tab operations
  addTab: (label?: string) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;
  renameTab: (tabId: string, label: string) => void;

  // Pane operations
  addPane: (kind: string, data?: any, title?: string) => string;
  addPaneAsTab: (kind: string, data?: any, title?: string) => string;
  closePane: (paneId: string) => void;
  setActivePaneInTab: (tabId: string, paneId: string) => void;

  // Split operations
  splitPane: (
    paneId: string,
    direction: 'horizontal' | 'vertical',
    newKind: string,
    newData?: any,
    newTitle?: string,
  ) => string;
  resizeSplit: (tabId: string, path: number[], splitPercentage: number) => void;
  equalizeTab: (tabId: string) => void;

  // DnD / move operations
  movePaneToSplit: (
    paneId: string,
    targetPaneId: string,
    direction: 'horizontal' | 'vertical',
    position: 'before' | 'after',
  ) => void;
  movePaneToTab: (paneId: string, targetTabId: string) => void;

  // Workspace switching
  switchWorkspace: (workspaceId: string) => void;

  // Utility
  getActiveTab: () => Tab | undefined;
  getActivePane: () => Pane | undefined;
  getTab: (tabId: string) => Tab | undefined;
}

export function usePaneStore(): PaneStoreCompat {
  const state = useAtomValue(paneStateAtom);
  const _activeTab = useAtomValue(activeTabAtom);
  const _activePane = useAtomValue(activePaneAtom);

  // Write dispatchers
  const _addTab = useSetAtom(addTabAtom);
  const _removeTab = useSetAtom(removeTabAtom);
  const _setActiveTab = useSetAtom(setActiveTabAtom);
  const _reorderTab = useSetAtom(reorderTabAtom);
  const _renameTab = useSetAtom(renameTabAtom);
  const _addPaneAsTab = useSetAtom(addPaneAsTabAtom);
  const _addPane = useSetAtom(addPaneAtom);
  const _closePane = useSetAtom(closePaneAtom);
  const _setActivePaneInTab = useSetAtom(setActivePaneInTabAtom);
  const _splitPane = useSetAtom(splitPaneAtom);
  const _resizeSplit = useSetAtom(resizeSplitAtom);
  const _equalizeTab = useSetAtom(equalizeTabAtom);
  const _movePaneToSplit = useSetAtom(movePaneToSplitAtom);
  const _movePaneToTab = useSetAtom(movePaneToTabAtom);
  const _switchWorkspace = useSetAtom(switchWorkspaceAtom);

  return useMemo(
    () => ({
      // State
      ...state,

      // Tab operations — match old Zustand API signatures
      addTab: (label?: string) => _addTab(label),
      removeTab: (tabId: string) => _removeTab(tabId),
      setActiveTab: (tabId: string) => _setActiveTab(tabId),
      reorderTab: (fromIndex: number, toIndex: number) =>
        _reorderTab({ from: fromIndex, to: toIndex }),
      renameTab: (tabId: string, label: string) =>
        _renameTab({ tabId, label }),

      // Pane operations
      addPaneAsTab: (kind: string, data?: any, title?: string) =>
        _addPaneAsTab({ kind, data, title }),
      addPane: (kind: string, data?: any, title?: string) =>
        _addPane({ kind, data, title }),
      closePane: (paneId: string) => _closePane(paneId),
      setActivePaneInTab: (tabId: string, paneId: string) =>
        _setActivePaneInTab({ tabId, paneId }),

      // Split operations
      splitPane: (
        paneId: string,
        direction: 'horizontal' | 'vertical',
        newKind: string,
        newData?: any,
        newTitle?: string,
      ) => _splitPane({ paneId, direction, newKind, newData, newTitle }),
      resizeSplit: (tabId: string, path: number[], splitPercentage: number) =>
        _resizeSplit({ tabId, path, splitPercentage }),
      equalizeTab: (tabId: string) => _equalizeTab(tabId),

      // DnD / move operations
      movePaneToSplit: (
        paneId: string,
        targetPaneId: string,
        direction: 'horizontal' | 'vertical',
        position: 'before' | 'after',
      ) => _movePaneToSplit({ paneId, targetPaneId, direction, position }),
      movePaneToTab: (paneId: string, targetTabId: string) =>
        _movePaneToTab({ paneId, targetTabId }),

      // Workspace switching
      switchWorkspace: (workspaceId: string) => _switchWorkspace(workspaceId),

      // Utility — snapshot-based (returns current render value)
      getActiveTab: () => _activeTab,
      getActivePane: () => _activePane,
      getTab: (tabId: string) => state.tabs.find((t) => t.id === tabId),
    }),
    [
      state,
      _activeTab,
      _activePane,
      _addTab,
      _removeTab,
      _setActiveTab,
      _reorderTab,
      _renameTab,
      _addPaneAsTab,
      _addPane,
      _closePane,
      _setActivePaneInTab,
      _splitPane,
      _resizeSplit,
      _equalizeTab,
      _movePaneToSplit,
      _movePaneToTab,
      _switchWorkspace,
    ],
  );
}

/**
 * Selector hook — subscribe to a derived slice of pane state.
 * For fine-grained subscriptions, prefer using individual Jotai atoms directly.
 */
export function usePaneStoreSelector<T>(selector: (s: PaneStoreCompat) => T): T {
  const store = usePaneStore();
  return selector(store);
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
  /** Pane type definitions keyed by `kind`. */
  definitions: Record<string, PaneDefinition>;
  children: ReactNode;
}

export function WorkspaceProvider({
  definitions,
  children,
}: WorkspaceProviderProps) {
  const registry: PaneRegistry = useMemo(
    () => new Map(Object.entries(definitions)),
    [definitions],
  );

  return (
    <JotaiStoreContext value={jotaiStore}>
      <PaneRegistryContext value={registry}>
        {children}
      </PaneRegistryContext>
    </JotaiStoreContext>
  );
}
