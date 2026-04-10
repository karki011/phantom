/**
 * @phantom-os/panes — Jotai atom-based pane store
 * Replaces the Zustand store with atomic state management.
 * @author Subash Karki
 */
import { atom } from 'jotai';
import type { Pane, Tab, WorkspaceState } from './types.js';
import {
  uid,
  removePaneFromLayout,
  updateSplitAtPath,
  equalizeLayout,
  insertPaneAdjacentTo,
  getLayoutPaneIds,
} from './layout-utils.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makePane<TData>(
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

function makeTab<TData>(label = 'Home'): Tab<TData> {
  const pane = makePane<TData>('workspace-home', {} as TData, 'Home');
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
// Base state atom
// ---------------------------------------------------------------------------

const defaultState = (): WorkspaceState => {
  const tab = makeTab();
  return { tabs: [tab], activeTabId: tab.id };
};

export const paneStateAtom = atom<WorkspaceState>(defaultState());

// ---------------------------------------------------------------------------
// Derived read atoms
// ---------------------------------------------------------------------------

export const tabsAtom = atom((get) => get(paneStateAtom).tabs);

export const activeTabIdAtom = atom((get) => get(paneStateAtom).activeTabId);

export const activeTabAtom = atom((get) => {
  const { tabs, activeTabId } = get(paneStateAtom);
  return tabs.find((t) => t.id === activeTabId);
});

export const activePaneAtom = atom((get) => {
  const tab = get(activeTabAtom);
  if (!tab || !tab.activePaneId) return undefined;
  return tab.panes[tab.activePaneId];
});

// ---------------------------------------------------------------------------
// Tab operation atoms (write)
// ---------------------------------------------------------------------------

export const addTabAtom = atom(null, (_get, set, label = 'New Tab') => {
  const tab = makeTab(label);
  set(paneStateAtom, (s) => ({
    ...s,
    tabs: [...s.tabs, tab],
    activeTabId: tab.id,
  }));
  return tab.id;
});

export const removeTabAtom = atom(null, (_get, set, tabId: string) => {
  set(paneStateAtom, (s) => {
    const tabs = s.tabs.filter((t) => t.id !== tabId);
    if (tabs.length === 0) return s; // Prevent removing last tab
    const activeTabId =
      s.activeTabId === tabId ? tabs[0].id : s.activeTabId;
    return { ...s, tabs, activeTabId };
  });
});

export const setActiveTabAtom = atom(null, (_get, set, tabId: string) => {
  set(paneStateAtom, (s) => ({ ...s, activeTabId: tabId }));
});

export const reorderTabAtom = atom(
  null,
  (_get, set, { from, to }: { from: number; to: number }) => {
    set(paneStateAtom, (s) => {
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      if (!moved) return s;
      tabs.splice(to, 0, moved);
      return { ...s, tabs };
    });
  },
);

// ---------------------------------------------------------------------------
// Pane operation atoms (write)
// ---------------------------------------------------------------------------

export const addPaneAsTabAtom = atom(
  null,
  (
    _get,
    set,
    { kind, data, title }: { kind: string; data?: any; title?: string },
  ) => {
    const pane = makePane(kind, data ?? {}, title ?? kind);
    const tab: Tab = {
      id: uid(),
      label: title ?? kind.charAt(0).toUpperCase() + kind.slice(1),
      createdAt: Date.now(),
      activePaneId: pane.id,
      layout: { type: 'pane', paneId: pane.id },
      panes: { [pane.id]: pane },
    };
    set(paneStateAtom, (s) => ({
      ...s,
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
    }));
    return tab.id;
  },
);

export const closePaneAtom = atom(null, (_get, set, paneId: string) => {
  set(paneStateAtom, (s) => {
    // Check if any tab has this pane as a terminal — if so, dispatch kill event
    for (const tab of s.tabs) {
      const pane = tab.panes[paneId];
      if (pane?.kind === 'terminal' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('phantom:terminal-kill', { detail: { paneId } }),
        );
        break;
      }
    }

    return {
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
    };
  });
});

export const setActivePaneInTabAtom = atom(
  null,
  (
    _get,
    set,
    { tabId, paneId }: { tabId: string; paneId: string },
  ) => {
    set(paneStateAtom, (s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === tabId && paneId in t.panes
          ? { ...t, activePaneId: paneId }
          : t,
      ),
    }));
  },
);

// ---------------------------------------------------------------------------
// Split operation atoms (write)
// ---------------------------------------------------------------------------

export const splitPaneAtom = atom(
  null,
  (
    get,
    set,
    {
      paneId,
      direction,
      newKind,
      newData,
      newTitle,
    }: {
      paneId: string;
      direction: 'horizontal' | 'vertical';
      newKind: string;
      newData?: any;
      newTitle?: string;
    },
  ) => {
    const tab = get(activeTabAtom);
    if (!tab) return '';
    const newPane = makePane(newKind, newData ?? {}, newTitle);
    const newLayout = insertPaneAdjacentTo(
      tab.layout,
      paneId,
      newPane.id,
      direction,
      'after',
    );
    set(paneStateAtom, (s) => ({
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
);

export const resizeSplitAtom = atom(
  null,
  (
    _get,
    set,
    {
      tabId,
      path,
      splitPercentage,
    }: {
      tabId: string;
      path: number[];
      splitPercentage: number;
    },
  ) => {
    set(paneStateAtom, (s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, layout: updateSplitAtPath(t.layout, path, splitPercentage) }
          : t,
      ),
    }));
  },
);

export const equalizeTabAtom = atom(null, (_get, set, tabId: string) => {
  set(paneStateAtom, (s) => ({
    ...s,
    tabs: s.tabs.map((t) =>
      t.id === tabId ? { ...t, layout: equalizeLayout(t.layout) } : t,
    ),
  }));
});

// ---------------------------------------------------------------------------
// DnD / move operation atoms (write)
// ---------------------------------------------------------------------------

export const movePaneToSplitAtom = atom(
  null,
  (
    get,
    set,
    {
      paneId,
      targetPaneId,
      direction,
      position,
    }: {
      paneId: string;
      targetPaneId: string;
      direction: 'horizontal' | 'vertical';
      position: 'before' | 'after';
    },
  ) => {
    if (paneId === targetPaneId) return;
    const tab = get(activeTabAtom);
    if (!tab || !tab.panes[paneId]) return;

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

    set(paneStateAtom, (s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === tab.id
          ? { ...t, layout: newLayout, activePaneId: paneId }
          : t,
      ),
    }));
  },
);

export const movePaneToTabAtom = atom(
  null,
  (
    get,
    set,
    { paneId, targetTabId }: { paneId: string; targetTabId: string },
  ) => {
    const state = get(paneStateAtom);
    const sourceTab = state.tabs.find((t) => paneId in t.panes);
    if (!sourceTab || sourceTab.id === targetTabId) return;

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

    set(paneStateAtom, (s) => {
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
          const target = t.activePaneId ?? existingPaneIds[0];
          const newLayout = target
            ? insertPaneAdjacentTo(
                t.layout,
                target,
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
      tabs = tabs.filter(Boolean) as Tab[];
      if (tabs.length === 0) return s; // Safety: never empty

      return { ...s, tabs };
    });
  },
);

// ---------------------------------------------------------------------------
// addPane — reuses existing unpinned pane or splits from active
// ---------------------------------------------------------------------------

export const addPaneAtom = atom(
  null,
  (
    get,
    set,
    { kind, data, title }: { kind: string; data?: any; title?: string },
  ) => {
    const state = get(paneStateAtom);
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!tab) return '';

    // Reuse existing unpinned pane of same kind
    const existing = Object.values(tab.panes).find(
      (p) => p.kind === kind && !p.pinned,
    );
    if (existing) {
      const updated = {
        ...existing,
        data: data ?? existing.data,
        title: title ?? existing.title,
      };
      set(paneStateAtom, (s) => ({
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
    const targetPaneId = tab.activePaneId ?? Object.keys(tab.panes)[0];
    if (!targetPaneId) return '';
    return set(splitPaneAtom, {
      paneId: targetPaneId,
      direction: 'horizontal',
      newKind: kind,
      newData: data,
      newTitle: title,
    });
  },
);

// ---------------------------------------------------------------------------
// Workspace switching + persistence
// ---------------------------------------------------------------------------

/** Current workspace ID — drives which persistence key is used */
let activeWorkspaceId: string | null = null;

/** True until the first switchWorkspace call completes */
let coldBoot = true;

/**
 * On cold boot, check which terminal tabs have restorable sessions.
 * Keep restorable terminals (mark for cold restore), strip dead ones.
 */
function restoreOrStripTerminals(state: WorkspaceState, worktreeId?: string): WorkspaceState {
  // Try to fetch restorable sessions from the server
  let restorableIds = new Set<string>();
  if (worktreeId) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `/api/terminal-sessions/${worktreeId}`, false);
      xhr.send();
      if (xhr.status === 200) {
        const sessions = JSON.parse(xhr.responseText);
        restorableIds = new Set(sessions.map((s: { paneId: string }) => s.paneId));
      }
    } catch {
      // If server isn't ready, treat all as non-restorable
    }
  }

  const processedTabs = state.tabs.map((tab) => {
    const paneEntries = Object.entries(tab.panes);
    const updatedPanes: Record<string, typeof tab.panes[string]> = {};

    for (const [id, pane] of paneEntries) {
      if (pane.kind === 'terminal') {
        if (restorableIds.has(id)) {
          // Mark for cold restore — TerminalPane will pick this up
          updatedPanes[id] = { ...pane, data: { ...(pane.data as any), coldRestore: true } };
        }
        // else: drop the pane (dead terminal)
      } else {
        updatedPanes[id] = pane;
      }
    }

    // If tab had only dead terminals, skip it
    if (Object.keys(updatedPanes).length === 0) return null;

    // Strip dead terminal panes from the layout tree (handles split tabs)
    let layout = tab.layout;
    for (const [id, pane] of paneEntries) {
      if (pane.kind === 'terminal' && !updatedPanes[id]) {
        const stripped = removePaneFromLayout(layout, id);
        if (stripped) layout = stripped;
      }
    }

    return { ...tab, layout, panes: updatedPanes };
  });

  const validTabs = processedTabs.filter(Boolean) as typeof state.tabs;
  if (validTabs.length === 0) {
    const home = makeTab();
    return { tabs: [home], activeTabId: home.id };
  }

  const activeTabId = validTabs.some((t) => t.id === state.activeTabId)
    ? state.activeTabId
    : validTabs[0].id;

  return { tabs: validTabs, activeTabId };
}

/**
 * Migrate persisted tabs: replace any lone "terminal" default pane with
 * "workspace-home" so users see the Hunter's Terminal on upgrade.
 */
function migrateState(state: WorkspaceState): WorkspaceState {
  const tabs = state.tabs.map((tab) => {
    const paneList = Object.values(tab.panes);
    if (paneList.length === 1 && paneList[0].kind === 'terminal') {
      const oldPane = paneList[0];
      const newPane = { ...oldPane, kind: 'workspace-home', title: 'Home' };
      return { ...tab, panes: { [newPane.id]: newPane } };
    }
    return tab;
  });
  return { ...state, tabs };
}

async function loadState(wsId: string): Promise<WorkspaceState> {
  try {
    const res = await fetch(`/api/pane-states/${wsId}`);
    if (res.ok) {
      const saved = await res.json();
      if (saved?.tabs?.length > 0) {
        // On cold boot: strip dead terminals, then migrate old pane types
        // On hot switch: return as-is — terminal panes must survive
        if (coldBoot) {
          return migrateState(restoreOrStripTerminals(saved, wsId));
        }
        return saved;
      }
    }
  } catch {
    /* ignore — server may be starting up */
  }

  // Fallback: try localStorage (one-time migration from old persistence)
  try {
    const raw = localStorage.getItem(`phantom-os:panes:${wsId}`);
    if (raw) {
      localStorage.removeItem(`phantom-os:panes:${wsId}`);
      const saved = JSON.parse(raw);
      if (saved?.tabs?.length > 0) {
        // Migrate to new API backend
        fetch(`/api/pane-states/${wsId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: raw,
        }).catch(() => {});
        if (coldBoot) {
          return migrateState(restoreOrStripTerminals(saved, wsId));
        }
        return saved;
      }
    }
  } catch {
    /* ignore */
  }

  // Legacy key migration
  try {
    const legacyKey = 'phantom-os:workspace';
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) {
      localStorage.removeItem(legacyKey);
      const saved = JSON.parse(legacy);
      if (saved?.tabs?.length > 0) {
        if (coldBoot) {
          return migrateState(restoreOrStripTerminals(saved, wsId));
        }
        return saved;
      }
    }
  } catch {
    /* ignore */
  }

  return defaultState();
}

/** Debounced save to SQLite via API — 300ms like Superset */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveState(wsId: string, state: WorkspaceState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch(`/api/pane-states/${wsId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }).catch(() => {
      /* silent — server may be restarting */
    });
  }, 300);
}

export const switchWorkspaceAtom = atom(
  null,
  async (get, set, workspaceId: string) => {
    // Save current workspace state
    if (activeWorkspaceId) {
      const { tabs, activeTabId } = get(paneStateAtom);
      saveState(activeWorkspaceId, { tabs, activeTabId });
    }
    // Load target workspace state
    activeWorkspaceId = workspaceId;
    const loaded = await loadState(workspaceId);
    set(paneStateAtom, loaded);
    // After first switch, stop stripping terminals (only strip on cold boot)
    coldBoot = false;
  },
);

// ---------------------------------------------------------------------------
// Auto-save subscriber — call once at app startup
// ---------------------------------------------------------------------------

/**
 * Subscribe to paneStateAtom changes and auto-save.
 * Pass the Jotai store instance (from useStore or createStore).
 */
export function setupPaneAutoSave(store: {
  sub: (atom: any, callback: () => void) => () => void;
  get: (atom: any) => any;
}): () => void {
  return store.sub(paneStateAtom, () => {
    if (!activeWorkspaceId) return;
    const state = store.get(paneStateAtom) as WorkspaceState;
    saveState(activeWorkspaceId, {
      tabs: state.tabs,
      activeTabId: state.activeTabId,
    });
  });
}

// ---------------------------------------------------------------------------
// Utility read atoms
// ---------------------------------------------------------------------------

export const getTabAtom = atom((get) => {
  const state = get(paneStateAtom);
  return (tabId: string) => state.tabs.find((t) => t.id === tabId);
});

// ---------------------------------------------------------------------------
// Convenience exports
// ---------------------------------------------------------------------------

export { makePane, makeTab };
