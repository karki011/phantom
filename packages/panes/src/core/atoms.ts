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

function makeTab(label = 'Home'): Tab {
  const pane = makePane('workspace-home', {}, 'Home');
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

export const addTabAtom = atom(null, (_get, set, label: string = 'New Tab') => {
  const tab = makeTab(label);
  set(paneStateAtom, (s) => ({
    ...s,
    tabs: [...s.tabs, tab],
    activeTabId: tab.id,
  }));
  return tab.id;
});

export const removeTabAtom = atom(null, (get, set, tabId: string) => {
  const state = get(paneStateAtom);
  const removedTab = state.tabs.find((t) => t.id === tabId);

  // Allow panes in this tab to veto the close (e.g. unsaved editor changes)
  if (removedTab && typeof window !== 'undefined') {
    for (const pane of Object.values(removedTab.panes)) {
      const closeEvent = new CustomEvent('phantom:pane-close', {
        detail: { paneId: pane.id },
        cancelable: true,
      });
      const allowed = window.dispatchEvent(closeEvent);
      if (!allowed) return; // A pane vetoed — abort tab close
    }
  }

  set(paneStateAtom, (s) => {
    // Dispatch kill events for any terminal panes in the removed tab
    if (removedTab && typeof window !== 'undefined') {
      for (const pane of Object.values(removedTab.panes)) {
        if (pane.kind === 'terminal') {
          window.dispatchEvent(
            new CustomEvent('phantom:terminal-kill', { detail: { paneId: pane.id } }),
          );
        }
      }
    }

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

export const renameTabAtom = atom(
  null,
  (_get, set, { tabId, label }: { tabId: string; label: string }) => {
    set(paneStateAtom, (s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, label } : t,
      ),
    }));
  },
);

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
    get,
    set,
    { kind, data, title }: { kind: string; data?: any; title?: string },
  ) => {
    // Dedup: if a tab already has a pane with the same kind + filePath, focus it
    const state = get(paneStateAtom);
    const filePath = data?.filePath as string | undefined;
    if (filePath) {
      for (const tab of state.tabs) {
        for (const pane of Object.values(tab.panes)) {
          if (pane.kind === kind && (pane.data as any)?.filePath === filePath) {
            set(paneStateAtom, (s) => ({ ...s, activeTabId: tab.id }));
            return tab.id;
          }
        }
      }
    }

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

export const closePaneAtom = atom(null, (get, set, paneId: string) => {
  // Allow panes to cancel close (e.g. unsaved editor changes)
  if (typeof window !== 'undefined') {
    const closeEvent = new CustomEvent('phantom:pane-close', {
      detail: { paneId },
      cancelable: true,
    });
    const allowed = window.dispatchEvent(closeEvent);
    if (!allowed) return; // Pane vetoed the close
  }

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

        // Prevent closing the last pane in a tab — keeps layout valid
        if (Object.keys(t.panes).length <= 1) return t;

        const layout = removePaneFromLayout(t.layout, paneId);
        // If layout became null despite the guard, preserve the tab as-is
        if (!layout) return t;

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
    if (!tab.panes[paneId]) return '';

    // For terminal splits without explicit cwd, inherit from the source pane
    let resolvedData = newData;
    if (newKind === 'terminal' && !newData?.cwd) {
      const sourcePane = tab.panes[paneId];
      if (sourcePane?.kind === 'terminal' && sourcePane.data?.cwd) {
        resolvedData = { ...newData, cwd: sourcePane.data.cwd };
      }
    }

    const newPane = makePane(newKind, resolvedData ?? {}, newTitle);
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
      const filtered = tabs.filter((t): t is Tab => t !== null);
      if (filtered.length === 0) return s; // Safety: never empty

      return { ...s, tabs: filtered };
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

    // Reuse existing unpinned pane of same kind (skip for terminals — allow multiple)
    if (kind !== 'terminal') {
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
    }

    // For terminals without explicit cwd, inherit from an existing terminal in the same tab
    let resolvedData = data;
    if (kind === 'terminal' && !data?.cwd) {
      const siblingTerminal = Object.values(tab.panes).find((p) => p.kind === 'terminal');
      if (siblingTerminal?.data?.cwd) {
        resolvedData = { ...data, cwd: siblingTerminal.data.cwd };
      }
    }

    // Split from the active pane (or first pane)
    const targetPaneId = tab.activePaneId ?? Object.keys(tab.panes)[0];
    if (!targetPaneId) return '';
    return set(splitPaneAtom, {
      paneId: targetPaneId,
      direction: 'horizontal',
      newKind: kind,
      newData: resolvedData,
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
 * Strip ALL terminal panes from a WorkspaceState.
 * Used during shutdown ceremony so the next boot starts with a clean layout.
 * Tabs that become empty are replaced with a home pane.
 */
export function stripTerminalPanes(state: WorkspaceState): WorkspaceState {
  const processedTabs = state.tabs.map((tab) => {
    const nonTerminalPanes: Record<string, typeof tab.panes[string]> = {};
    for (const [id, pane] of Object.entries(tab.panes)) {
      if (pane.kind !== 'terminal') {
        nonTerminalPanes[id] = pane;
      }
    }

    // If no panes survive, replace with a home pane
    if (Object.keys(nonTerminalPanes).length === 0) {
      const home = makePane('workspace-home', {}, 'Home');
      return {
        ...tab,
        label: 'Home',
        layout: { type: 'pane' as const, paneId: home.id },
        panes: { [home.id]: home },
        activePaneId: home.id,
      };
    }

    // Rebuild layout without terminal panes
    let layout = tab.layout;
    for (const [id, pane] of Object.entries(tab.panes)) {
      if (pane.kind === 'terminal') {
        const stripped = removePaneFromLayout(layout, id);
        if (stripped) layout = stripped;
      }
    }

    // Safety: if layout became null, rebuild from surviving panes
    if (!layout) {
      const ids = Object.keys(nonTerminalPanes);
      layout = ids.length === 1
        ? { type: 'pane' as const, paneId: ids[0] }
        : ids.reduce<any>((acc, pid, i) =>
            i === 0
              ? { type: 'pane' as const, paneId: pid }
              : { type: 'split' as const, direction: 'horizontal' as const, children: [acc, { type: 'pane' as const, paneId: pid }], splitPercentage: 50 },
          null);
    }

    const activePaneId = nonTerminalPanes[tab.activePaneId ?? '']
      ? tab.activePaneId
      : Object.keys(nonTerminalPanes)[0];

    return { ...tab, layout, panes: nonTerminalPanes, activePaneId };
  });

  // Deduplicate: if multiple tabs all became "Home" after stripping, keep just one
  const seen = new Set<string>();
  const dedupedTabs = processedTabs.filter((tab) => {
    const panes = Object.values(tab.panes);
    if (panes.length === 1 && panes[0].kind === 'workspace-home') {
      if (seen.has('home')) return false;
      seen.add('home');
    }
    return true;
  });

  const tabs = dedupedTabs.length > 0 ? dedupedTabs : processedTabs.slice(0, 1);
  const activeTabId = tabs.some((t) => t.id === state.activeTabId)
    ? state.activeTabId
    : tabs[0].id;

  return { tabs, activeTabId };
}

/**
 * On cold boot, check which terminal tabs have restorable sessions.
 * Keep restorable terminals (mark for cold restore), strip dead ones.
 */
function restoreOrStripTerminals(state: WorkspaceState, _worktreeId?: string): WorkspaceState {
  // All terminals are marked for cold restore — they handle reconnection
  // failures gracefully via WebSocket auto-reconnect with backoff.
  // No synchronous health check needed.

  const processedTabs = state.tabs.map((tab) => {
    const paneEntries = Object.entries(tab.panes);
    const updatedPanes: Record<string, typeof tab.panes[string]> = {};

    for (const [id, pane] of paneEntries) {
      if (pane.kind === 'terminal') {
        // Always attempt restore — dead sessions fail gracefully
        updatedPanes[id] = { ...pane, data: { ...(pane.data as any), coldRestore: true } };
      } else {
        updatedPanes[id] = pane;
      }
    }

    // If tab is somehow empty, skip it
    if (Object.keys(updatedPanes).length === 0) return null;

    // Ensure layout is consistent with surviving panes
    let layout = tab.layout;
    for (const [id] of paneEntries) {
      if (!updatedPanes[id]) {
        const stripped = removePaneFromLayout(layout, id);
        if (stripped) layout = stripped;
      }
    }

    // If layout became null (all panes stripped), skip the tab
    if (!layout) return null;

    // Final consistency: if layout references paneIds not in the panes map, rebuild
    const layoutIds = getLayoutPaneIds(layout);
    const paneIds = new Set(Object.keys(updatedPanes));
    const hasOrphan = layoutIds.some((id) => !paneIds.has(id));
    if (hasOrphan) {
      // Rebuild layout from surviving panes
      const ids = Object.keys(updatedPanes);
      if (ids.length === 0) return null;
      layout = ids.length === 1
        ? { type: 'pane' as const, paneId: ids[0] }
        : ids.reduce<any>((acc, pid, i) =>
            i === 0
              ? { type: 'pane' as const, paneId: pid }
              : { type: 'split' as const, direction: 'horizontal' as const, children: [acc, { type: 'pane' as const, paneId: pid }], splitPercentage: 50 },
          null);
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
      const pane = paneList[0];
      // Don't migrate terminals marked for cold restore — they have active sessions
      if ((pane.data as any)?.coldRestore) return tab;
      const newPane = { ...pane, kind: 'workspace-home', title: 'Home' };
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

let switchingWorkspace = false;

export const switchWorkspaceAtom = atom(
  null,
  async (get, set, workspaceId: string) => {
    // Prevent concurrent loads (StrictMode double-execution)
    if (switchingWorkspace) return;
    switchingWorkspace = true;
    try {
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
    } finally {
      switchingWorkspace = false;
    }
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
