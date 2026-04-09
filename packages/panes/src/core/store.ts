/**
 * @phantom-os/panes — Zustand vanilla store
 * @author Subash Karki
 *
 * Framework-agnostic store using Zustand's vanilla createStore.
 * All state mutations are immutable.
 */
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  uid,
  removePaneFromLayout,
  replacePaneInLayout,
  updateSplitAtPath,
  equalizeLayout,
  insertPaneAdjacentTo,
  getLayoutPaneIds,
} from './layout-utils.js';
import type {
  LayoutNode,
  Pane,
  PaneActions,
  Tab,
  WorkspaceState,
} from './types.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makePane<TData = Record<string, unknown>>(
  kind: string,
  data: TData = {} as TData,
  title?: string,
): Pane<TData> {
  return {
    id: uid(),
    kind,
    title: title ?? kind,
    pinned: false,
    createdAt: Date.now(),
    data,
  };
}

function makeTab<TData = Record<string, unknown>>(label: string): Tab<TData> {
  const pane = makePane<TData>('workspace-home', undefined as TData, 'Home');
  return {
    id: uid(),
    label,
    createdAt: Date.now(),
    activePaneId: pane.id,
    layout: { type: 'pane', paneId: pane.id },
    panes: { [pane.id]: pane },
  };
}

// ---------------------------------------------------------------------------
// Per-workspace persistence
// ---------------------------------------------------------------------------

/** Current workspace ID — drives which localStorage key is used */
let activeWorkspaceId: string | null = null;

function storageKey(wsId: string): string {
  return `phantom-os:panes:${wsId}`;
}

/**
 * Migrate persisted tabs: replace any lone "terminal" default pane with
 * "workspace-home" so users see the Hunter's Terminal on upgrade.
 */
function migrateState<TData>(state: WorkspaceState<TData>): WorkspaceState<TData> {
  const tabs = state.tabs.map((tab) => {
    const paneList = Object.values(tab.panes);
    if (paneList.length === 1 && paneList[0].kind === 'terminal') {
      const oldPane = paneList[0];
      const newPane: Pane<TData> = { ...oldPane, kind: 'workspace-home', title: 'Home' };
      return { ...tab, panes: { [newPane.id]: newPane } };
    }
    return tab;
  });
  return { ...state, tabs };
}

function loadWorkspaceState<TData>(wsId: string): WorkspaceState<TData> {
  try {
    const raw = localStorage.getItem(storageKey(wsId));
    if (raw) {
      const saved = JSON.parse(raw) as WorkspaceState<TData>;
      if (saved.tabs.length > 0) return migrateState(saved);
    }
  } catch { /* ignore */ }

  // Also try migrating from the legacy global key (one-time)
  try {
    const legacyKey = 'phantom-os:workspace';
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) {
      localStorage.removeItem(legacyKey); // Clean up legacy key
      const saved = JSON.parse(legacy) as WorkspaceState<TData>;
      if (saved.tabs.length > 0) return migrateState(saved);
    }
  } catch { /* ignore */ }

  const tab = makeTab<TData>('Home');
  return { tabs: [tab], activeTabId: tab.id };
}

function saveWorkspaceState<TData>(wsId: string, state: WorkspaceState<TData>): void {
  try {
    localStorage.setItem(
      storageKey(wsId),
      JSON.stringify({ tabs: state.tabs, activeTabId: state.activeTabId }),
    );
  } catch { /* ignore quota errors */ }
}

// ---------------------------------------------------------------------------
// Initial state — empty until switchWorkspace is called
// ---------------------------------------------------------------------------

function createInitialState<TData>(): WorkspaceState<TData> {
  const tab = makeTab<TData>('Home');
  return { tabs: [tab], activeTabId: tab.id };
}

// ---------------------------------------------------------------------------
// Store type
// ---------------------------------------------------------------------------

export type PaneStore<TData = Record<string, unknown>> = WorkspaceState<TData> &
  PaneActions<TData>;

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

export function createPaneStore<TData = Record<string, unknown>>() {
  const initialState = createInitialState<TData>();

  const store = createStore<PaneStore<TData>>()(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      // ---------------------------------------------------------------
      // Tab operations
      // ---------------------------------------------------------------

      addTab: (label = 'New Tab') => {
        const tab = makeTab<TData>(label);
        set((s) => ({ ...s, tabs: [...s.tabs, tab], activeTabId: tab.id }));
        return tab.id;
      },

      removeTab: (tabId) =>
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== tabId);
          if (tabs.length === 0) return s; // Prevent removing last tab
          const activeTabId =
            s.activeTabId === tabId ? tabs[0].id : s.activeTabId;
          return { ...s, tabs, activeTabId };
        }),

      setActiveTab: (tabId) => set((s) => ({ ...s, activeTabId: tabId })),

      reorderTab: (fromIndex, toIndex) =>
        set((s) => {
          const tabs = [...s.tabs];
          const [moved] = tabs.splice(fromIndex, 1);
          if (!moved) return s;
          tabs.splice(toIndex, 0, moved);
          return { ...s, tabs };
        }),

      // ---------------------------------------------------------------
      // Pane operations
      // ---------------------------------------------------------------

      addPaneAsTab: (kind, data = {} as TData, title) => {
        const pane = makePane<TData>(kind, data, title ?? kind);
        const tab: Tab<TData> = {
          id: uid(),
          label: title ?? kind.charAt(0).toUpperCase() + kind.slice(1),
          createdAt: Date.now(),
          activePaneId: pane.id,
          layout: { type: 'pane', paneId: pane.id },
          panes: { [pane.id]: pane },
        };
        set((s) => ({ ...s, tabs: [...s.tabs, tab], activeTabId: tab.id }));
        return tab.id;
      },

      addPane: (kind, data = {} as TData, title) => {
        const state = get();
        const tab = state.tabs.find((t) => t.id === state.activeTabId);
        if (!tab) return '';

        // Re-use existing unpinned pane of same kind
        const existing = Object.values(tab.panes).find(
          (p) => p.kind === kind && !p.pinned,
        );
        if (existing) {
          const updated: Pane<TData> = {
            ...existing,
            data: data ?? existing.data,
            title: title ?? existing.title,
          };
          set((s) => ({
            ...s,
            tabs: s.tabs.map((t) =>
              t.id === tab.id
                ? {
                    ...t,
                    panes: { ...t.panes, [existing.id]: updated },
                    activePaneId: existing.id,
                  }
                : t,
            ),
          }));
          return existing.id;
        }

        // Split from the active pane (or first pane)
        const targetPaneId =
          tab.activePaneId ?? Object.keys(tab.panes)[0];
        if (!targetPaneId) return '';
        return state.splitPane(targetPaneId, 'horizontal', kind, data, title);
      },

      closePane: (paneId) =>
        set((s) => ({
          ...s,
          tabs: s.tabs.map((t) => {
            if (!(paneId in t.panes)) return t;
            const layout = removePaneFromLayout(t.layout, paneId) ?? t.layout;
            const { [paneId]: _, ...panes } = t.panes;
            const activePaneId =
              t.activePaneId === paneId
                ? Object.keys(panes)[0] ?? null
                : t.activePaneId;
            return { ...t, layout, panes, activePaneId };
          }),
        })),

      setActivePaneInTab: (tabId, paneId) =>
        set((s) => ({
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tabId && paneId in t.panes
              ? { ...t, activePaneId: paneId }
              : t,
          ),
        })),

      // ---------------------------------------------------------------
      // Split operations
      // ---------------------------------------------------------------

      splitPane: (paneId, direction, newKind, newData = {} as TData, newTitle) => {
        const tab = get().getActiveTab();
        if (!tab) return '';
        const newPane = makePane<TData>(newKind, newData, newTitle);
        const newLayout = insertPaneAdjacentTo(
          tab.layout,
          paneId,
          newPane.id,
          direction,
          'after',
        );
        set((s) => ({
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tab.id
              ? {
                  ...t,
                  layout: newLayout,
                  panes: { ...t.panes, [newPane.id]: newPane },
                  activePaneId: newPane.id,
                }
              : t,
          ),
        }));
        return newPane.id;
      },

      resizeSplit: (tabId, path, splitPercentage) =>
        set((s) => ({
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tabId
              ? { ...t, layout: updateSplitAtPath(t.layout, path, splitPercentage) }
              : t,
          ),
        })),

      equalizeTab: (tabId) =>
        set((s) => ({
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, layout: equalizeLayout(t.layout) } : t,
          ),
        })),

      // ---------------------------------------------------------------
      // DnD / move operations
      // ---------------------------------------------------------------

      movePaneToSplit: (paneId, targetPaneId, direction, position) => {
        if (paneId === targetPaneId) return;
        const state = get();
        const tab = state.getActiveTab();
        if (!tab) return;

        // Find the pane data
        const pane = tab.panes[paneId];
        if (!pane) return;

        // Remove the pane from its current position
        const layoutAfterRemove = removePaneFromLayout(tab.layout, paneId);
        if (!layoutAfterRemove) return; // Can't remove last pane

        // Insert adjacent to target
        const newLayout = insertPaneAdjacentTo(
          layoutAfterRemove,
          targetPaneId,
          paneId,
          direction,
          position,
        );

        set((s) => ({
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tab.id
              ? { ...t, layout: newLayout, activePaneId: paneId }
              : t,
          ),
        }));
      },

      movePaneToTab: (paneId, targetTabId) => {
        const state = get();
        // Find source tab
        const sourceTab = state.tabs.find((t) => paneId in t.panes);
        if (!sourceTab) return;
        if (sourceTab.id === targetTabId) return;

        const pane = sourceTab.panes[paneId];
        if (!pane) return;

        // Remove from source
        const sourceLayout = removePaneFromLayout(sourceTab.layout, paneId);
        const { [paneId]: _, ...sourcePanes } = sourceTab.panes;
        const sourceActivePaneId =
          sourceTab.activePaneId === paneId
            ? Object.keys(sourcePanes)[0] ?? null
            : sourceTab.activePaneId;

        // If removing this pane would leave the source tab empty, remove the tab
        const sourceLayoutPaneIds = sourceLayout
          ? getLayoutPaneIds(sourceLayout)
          : [];

        set((s) => {
          let tabs = s.tabs.map((t) => {
            if (t.id === sourceTab.id) {
              if (sourceLayoutPaneIds.length === 0) return null; // Mark for removal
              return {
                ...t,
                layout: sourceLayout!,
                panes: sourcePanes,
                activePaneId: sourceActivePaneId,
              };
            }
            if (t.id === targetTabId) {
              // Add pane to target tab's layout
              const existingPaneIds = getLayoutPaneIds(t.layout);
              const targetPaneId =
                t.activePaneId ?? existingPaneIds[0];
              const newLayout = targetPaneId
                ? insertPaneAdjacentTo(
                    t.layout,
                    targetPaneId,
                    paneId,
                    'horizontal',
                    'after',
                  )
                : ({ type: 'pane' as const, paneId });
              return {
                ...t,
                layout: newLayout,
                panes: { ...t.panes, [paneId]: pane },
                activePaneId: paneId,
              };
            }
            return t;
          });

          // Filter out null entries (removed tabs)
          tabs = tabs.filter(Boolean) as Tab<TData>[];
          if (tabs.length === 0) return s; // Safety: never empty

          return { ...s, tabs };
        });
      },

      // ---------------------------------------------------------------
      // Workspace switching
      // ---------------------------------------------------------------

      switchWorkspace: (workspaceId: string) => {
        // Save current workspace state
        if (activeWorkspaceId) {
          const current = get();
          saveWorkspaceState(activeWorkspaceId, { tabs: current.tabs, activeTabId: current.activeTabId });
        }
        // Load target workspace state
        activeWorkspaceId = workspaceId;
        const loaded = loadWorkspaceState<TData>(workspaceId);
        set((s) => ({ ...s, tabs: loaded.tabs, activeTabId: loaded.activeTabId }));
      },

      // ---------------------------------------------------------------
      // Utility
      // ---------------------------------------------------------------

      getActiveTab: () => {
        const s = get();
        return s.tabs.find((t) => t.id === s.activeTabId);
      },

      getActivePane: () => {
        const tab = get().getActiveTab();
        if (!tab?.activePaneId) return undefined;
        return tab.panes[tab.activePaneId];
      },

      getTab: (tabId) => {
        return get().tabs.find((t) => t.id === tabId);
      },
    })),
  );

  // Auto-persist on state changes (debounced, per-workspace)
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  store.subscribe(
    (s) => ({ tabs: s.tabs, activeTabId: s.activeTabId }),
    (slice) => {
      if (!activeWorkspaceId) return; // No workspace active yet
      const wsId = activeWorkspaceId;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveWorkspaceState(wsId, slice), 300);
    },
  );

  return store;
}

/** Default singleton store instance */
export const paneStore = createPaneStore();
