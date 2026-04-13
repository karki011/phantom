/**
 * @phantom-os/panes — Backward-compatible store shim
 * @author Subash Karki
 *
 * Provides a `paneStore` singleton with a Zustand-like `getState()` API
 * backed by the Jotai atom store. This allows non-React code (e.g. useEffect
 * callbacks) to call `paneStore.getState().switchWorkspace(id)` without changes.
 *
 * New code should use the Jotai atoms directly from `./atoms.js`.
 */
import { getDefaultStore } from 'jotai';
import {
  paneStateAtom,
  activeTabAtom,
  activePaneAtom,
  addTabAtom,
  removeTabAtom,
  closeOtherTabsAtom,
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
  getTabAtom,
  setupPaneAutoSave,
} from './atoms.js';
import { removePaneFromLayout } from './layout-utils.js';
import type { Pane, PaneActions, Tab, WorkspaceState } from './types.js';

// ---------------------------------------------------------------------------
// Store type — matches the old Zustand store shape for backward compat
// ---------------------------------------------------------------------------

export type PaneStore = WorkspaceState & PaneActions;

// ---------------------------------------------------------------------------
// Jotai store singleton — shared with WorkspaceProvider
// ---------------------------------------------------------------------------

/** Use Jotai's default store so ALL atoms (pane + app) share one store */
export const jotaiStore = getDefaultStore();

// ---------------------------------------------------------------------------
// Compat shim — Zustand-like API surface over Jotai
// ---------------------------------------------------------------------------

function getState(): PaneStore {
  const state = jotaiStore.get(paneStateAtom);
  const activeTab = jotaiStore.get(activeTabAtom);
  const activePane = jotaiStore.get(activePaneAtom);
  const getTabFn = jotaiStore.get(getTabAtom);

  return {
    ...state,

    // Tab operations
    addTab: (label?: string) => jotaiStore.set(addTabAtom, label),
    removeTab: (tabId: string) => jotaiStore.set(removeTabAtom, tabId),
    closeOtherTabs: (keepTabId: string) => jotaiStore.set(closeOtherTabsAtom, keepTabId),
    setActiveTab: (tabId: string) => jotaiStore.set(setActiveTabAtom, tabId),
    reorderTab: (from: number, to: number) =>
      jotaiStore.set(reorderTabAtom, { from, to }),
    renameTab: (tabId: string, label: string) =>
      jotaiStore.set(renameTabAtom, { tabId, label }),

    // Pane operations
    addPaneAsTab: (kind: string, data?: any, title?: string) =>
      jotaiStore.set(addPaneAsTabAtom, { kind, data, title }),
    addPane: (kind: string, data?: any, title?: string) =>
      jotaiStore.set(addPaneAtom, { kind, data, title }),
    closePane: (paneId: string) => jotaiStore.set(closePaneAtom, paneId),
    setActivePaneInTab: (tabId: string, paneId: string) =>
      jotaiStore.set(setActivePaneInTabAtom, { tabId, paneId }),

    // Split operations
    splitPane: (
      paneId: string,
      direction: 'horizontal' | 'vertical',
      newKind: string,
      newData?: any,
      newTitle?: string,
    ) =>
      jotaiStore.set(splitPaneAtom, {
        paneId,
        direction,
        newKind,
        newData,
        newTitle,
      }),
    resizeSplit: (tabId: string, path: number[], splitPercentage: number) =>
      jotaiStore.set(resizeSplitAtom, { tabId, path, splitPercentage }),
    equalizeTab: (tabId: string) => jotaiStore.set(equalizeTabAtom, tabId),

    // DnD / move operations
    movePaneToSplit: (
      paneId: string,
      targetPaneId: string,
      direction: 'horizontal' | 'vertical',
      position: 'before' | 'after',
    ) =>
      jotaiStore.set(movePaneToSplitAtom, {
        paneId,
        targetPaneId,
        direction,
        position,
      }),
    movePaneToTab: (paneId: string, targetTabId: string) =>
      jotaiStore.set(movePaneToTabAtom, { paneId, targetTabId }),

    // Workspace switching
    switchWorkspace: (workspaceId: string) =>
      jotaiStore.set(switchWorkspaceAtom, workspaceId),

    // Utility
    getActiveTab: () => activeTab,
    getActivePane: () => activePane,
    getTab: (tabId: string) => getTabFn(tabId),
  };
}

/**
 * Backward-compatible pane store singleton.
 * Exposes `getState()` and `subscribe()` like a Zustand store.
 *
 * @deprecated New code should use Jotai atoms directly from `./atoms.js`.
 */
export const paneStore = {
  getState,
  /** Subscribe to paneStateAtom changes */
  subscribe: (callback: () => void) => {
    return jotaiStore.sub(paneStateAtom, callback);
  },
};

/**
 * @deprecated Use Jotai atoms directly. Kept for backward compatibility.
 */
export function createPaneStore() {
  return paneStore;
}

// Listen for force-close events (dispatched after user confirms unsaved changes modal)
// Bypasses the phantom:pane-close veto — directly removes the pane from state
if (typeof window !== 'undefined') {
  window.addEventListener('phantom:pane-force-close', ((e: CustomEvent) => {
    const paneId = e.detail?.paneId as string | undefined;
    console.log('[PaneStore] force-close received, paneId:', paneId);
    if (!paneId) return;

    // Dispatch terminal kill if needed
    jotaiStore.set(paneStateAtom, (s) => {
      for (const tab of s.tabs) {
        const pane = tab.panes[paneId];
        if (pane?.kind === 'terminal') {
          window.dispatchEvent(
            new CustomEvent('phantom:terminal-kill', { detail: { paneId } }),
          );
          break;
        }
      }

      // Find which tab contains this pane
      const tabWithPane = s.tabs.find((t) => paneId in t.panes);
      if (!tabWithPane) {
        console.log('[PaneStore] pane not found in any tab');
        return s;
      }

      const paneCount = Object.keys(tabWithPane.panes).length;
      console.log('[PaneStore] pane found in tab', tabWithPane.id, 'paneCount:', paneCount);

      // If it's the only pane in the tab, remove the entire tab instead
      if (paneCount <= 1) {
        const tabs = s.tabs.filter((t) => t.id !== tabWithPane.id);
        if (tabs.length === 0) return s; // Never remove last tab
        const activeTabId = s.activeTabId === tabWithPane.id ? tabs[0].id : s.activeTabId;
        return { ...s, tabs, activeTabId };
      }

      return {
        ...s,
        tabs: s.tabs.map((t) => {
          if (t.id !== tabWithPane.id) return t;
          const layout = removePaneFromLayout(t.layout, paneId);
          if (!layout) return t;
          const { [paneId]: _, ...panes } = t.panes;
          const activePaneId =
            t.activePaneId === paneId ? Object.keys(panes)[0] ?? null : t.activePaneId;
          return { ...t, layout, panes, activePaneId };
        }),
      };
    });
  }) as EventListener);
}

// ---------------------------------------------------------------------------
// Auto-save: persist pane state to SQLite on every change
// ---------------------------------------------------------------------------
setupPaneAutoSave(jotaiStore);
