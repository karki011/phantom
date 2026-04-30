/**
 * Phantom — SolidJS pane store
 * Ported from v1 Jotai atoms to SolidJS createStore + produce
 * Author: Subash Karki
 */

import { createMemo, createSignal, type Accessor } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import type { WorkspaceState, Tab, PaneType, PaneLeaf, LayoutNode } from './types';
import {
  uid,
  removePaneFromLayout,
  insertPaneAdjacentTo,
  updateSplitAtPath,
  getLayoutPaneIds,
  countPanes,
  MAX_PANES_PER_TAB,
} from './layout-utils';
import { destroyTerminal } from '@/core/bindings';
import { destroySession as destroyXtermSession, getSession, safeFit } from '@/core/terminal/registry';
import {
  getSessionTitle,
  getSessionCwd,
  onTitleChange,
  onCommandFinished,
} from '@/core/terminal/addons/shellIntegration';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makePane(kind: PaneType, title?: string, data?: Record<string, unknown>): import('./types').Pane {
  return {
    id: uid(),
    kind,
    title: title ?? kind,
    data: data ?? {},
  };
}

function makeTab(paneType: PaneType = 'terminal', label?: string): Tab {
  const pane = makePane(paneType, label ?? paneType.charAt(0).toUpperCase() + paneType.slice(1));
  return {
    id: uid(),
    label: label ?? pane.title,
    activePaneId: pane.id,
    layout: { type: 'leaf', id: pane.id, paneType },
    panes: { [pane.id]: pane },
  };
}

function defaultState(): WorkspaceState {
  const tab = makeTab('home', 'Home');
  return {
    tabs: [tab],
    activeTabId: tab.id,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const [workspace, setWorkspace] = createStore<WorkspaceState>(defaultState());

// ---------------------------------------------------------------------------
// Derived signals
// ---------------------------------------------------------------------------

const tabs = () => workspace.tabs;

const activeTab = createMemo(
  () =>
    workspace.tabs.find((t) => t.id === workspace.activeTabId) ??
    workspace.tabs[0],
);

const activePaneId = createMemo(() => activeTab()?.activePaneId ?? '');

// ---------------------------------------------------------------------------
// Per-worktree state cache (in-memory, mirrors v1 switchWorkspaceAtom)
// ---------------------------------------------------------------------------

const stateCache = new Map<string, WorkspaceState>();
let previousWorktreeId: string | null = null;

export function switchWorkspace(worktreeId: string): void {
  // Save current state under the PREVIOUS worktree before switching
  if (previousWorktreeId && previousWorktreeId !== worktreeId) {
    stateCache.set(previousWorktreeId, JSON.parse(JSON.stringify(workspace)));
  }
  previousWorktreeId = worktreeId;

  const cached = stateCache.get(worktreeId);
  if (cached) {
    setWorkspace(cached);
  } else {
    // Look up the worktree path from worktreeMap to pre-populate cwd
    let cwd = '';
    const allWorktrees = worktreeMap();
    for (const workspaces of Object.values(allWorktrees)) {
      const match = workspaces.find((w) => w.id === worktreeId);
      if (match) {
        cwd = match.worktree_path ?? '';
        break;
      }
    }

    const tab = makeTab('home', 'Home');
    const paneId = tab.activePaneId;
    if (paneId && tab.panes[paneId]) {
      tab.panes[paneId] = { ...tab.panes[paneId], data: { cwd } };
    }
    setWorkspace({ tabs: [tab], activeTabId: tab.id });
  }
}

// ---------------------------------------------------------------------------
// Tab actions
// ---------------------------------------------------------------------------

export function focusOrCreateTab(paneType: PaneType, label?: string, data?: Record<string, unknown>): void {
  const existing = workspace.tabs.find((t) =>
    Object.values(t.panes).some((p) => p.kind === paneType)
  );
  if (existing) {
    setWorkspace('activeTabId', existing.id);
    return;
  }
  if (data) {
    addTabWithData(paneType, label ?? paneType, data);
  } else {
    addTabWithData(paneType, label ?? paneType, {});
  }
}

export function addTab(paneType: PaneType = 'terminal'): void {
  const tab = makeTab(paneType);
  setWorkspace(produce((s) => { s.tabs.push(tab); }));
  queueMicrotask(() => setWorkspace('activeTabId', tab.id));
}

/**
 * Add a new tab with a pre-populated pane data payload.
 * Used by TUI launchers (Bubbletea) that need to pass a session ID
 * into the pane before it mounts.
 */
export function addTabWithData(
  paneType: PaneType,
  label: string,
  data: Record<string, unknown>,
): string {
  const tab = makeTab(paneType, label);
  const paneId = tab.activePaneId;
  if (paneId && tab.panes[paneId]) {
    tab.panes[paneId] = { ...tab.panes[paneId], data };
  }
  setWorkspace(produce((s) => { s.tabs.push(tab); }));
  queueMicrotask(() => setWorkspace('activeTabId', tab.id));
  return paneId;
}


export function removeTab(tabId: string): void {
  // Collect terminal pane IDs before the store mutation removes them.
  const tab = workspace.tabs.find((t) => t.id === tabId);
  const terminalPaneIds: string[] = [];
  if (tab) {
    for (const pane of Object.values(tab.panes)) {
      if (pane.kind === 'terminal') {
        terminalPaneIds.push(pane.id);
      }
    }
  }

  setWorkspace(
    produce((s) => {
      if (s.tabs.length <= 1) return;
      const idx = s.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return;
      if (s.tabs[idx].label === 'Home') return;
      s.tabs = s.tabs.filter((t) => t.id !== tabId);
      if (s.activeTabId === tabId) {
        const nextTab = s.tabs[idx] ?? s.tabs[idx - 1] ?? s.tabs[0];
        s.activeTabId = nextTab?.id ?? '';
      }
    }),
  );

  // Kill PTYs and clean up xterm instances for all terminal panes in the removed tab.
  for (const paneId of terminalPaneIds) {
    destroyXtermSession(paneId);
    void destroyTerminal(paneId);
    disposePaneSubscription(paneId);
  }
}

export function setActiveTab(tabId: string): void {
  setWorkspace('activeTabId', tabId);
}

// ---------------------------------------------------------------------------
// Pane actions
// ---------------------------------------------------------------------------

export function setActivePaneInTab(paneId: string): void {
  setWorkspace(
    produce((s) => {
      const tab = s.tabs.find((t) => paneId in t.panes);
      if (tab) {
        s.activeTabId = tab.id;
        tab.activePaneId = paneId;
      }
    }),
  );
}

export function closePane(paneId: string): void {
  // Capture pane metadata before the store mutation removes it.
  let paneKind: PaneType | undefined;
  for (const tab of workspace.tabs) {
    const pane = tab.panes[paneId];
    if (pane) {
      paneKind = pane.kind;
      break;
    }
  }

  // Capture the surviving pane ids BEFORE the mutation so we can refit them.
  const tabBefore = workspace.tabs.find((t) => paneId in t.panes);
  const survivorIds = tabBefore
    ? Object.keys(tabBefore.panes).filter((id) => id !== paneId)
    : [];

  setWorkspace(
    produce((s) => {
      const tab = s.tabs.find((t) => paneId in t.panes);
      if (!tab) return;

      // Prevent closing the last pane in a tab
      if (Object.keys(tab.panes).length <= 1) return;

      const newLayout = removePaneFromLayout(tab.layout, paneId);
      if (!newLayout) return;

      tab.layout = newLayout;
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete tab.panes[paneId];

      if (tab.activePaneId === paneId) {
        tab.activePaneId = Object.keys(tab.panes)[0] ?? '';
      }
    }),
  );

  // If the closed pane was a terminal, clean up xterm and kill its PTY.
  if (paneKind === 'terminal') {
    destroyXtermSession(paneId);
    void destroyTerminal(paneId);
    disposePaneSubscription(paneId);
  }

  // Explicit refit on survivors after DOM commit. ResizeObserver doesn't
  // reliably fire when a sibling is removed (flex reflow happens but the
  // observed element's contentRect may match its previous value within the
  // same frame). VS Code, Hyper, and tmux all do this same explicit refit.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const id of survivorIds) {
        const session = getSession(id);
        if (session) safeFit(session);
      }
    });
  });
}

export function splitPane(
  paneId: string,
  direction: 'horizontal' | 'vertical',
  newPaneType: PaneType = 'terminal',
): void {
  setWorkspace(
    produce((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      if (!tab || !(paneId in tab.panes)) return;
      if (countPanes(tab.layout) >= MAX_PANES_PER_TAB) return;

      const parentPane = tab.panes[paneId];
      const parentData = parentPane?.data;
      const inheritedData = parentData ? { cwd: parentData.cwd, worktreeId: parentData.worktreeId, projectId: parentData.projectId } : undefined;
      const newPane = makePane(newPaneType, undefined, inheritedData);
      const newLeaf: PaneLeaf = { type: 'leaf', id: newPane.id, paneType: newPaneType };

      tab.layout = insertPaneAdjacentTo(tab.layout, paneId, newLeaf, direction, 'after');
      tab.panes[newPane.id] = newPane;
      tab.activePaneId = newPane.id;
    }),
  );
}

export function resizeSplit(path: number[], percentage: number): void {
  setWorkspace(
    produce((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      if (!tab) return;
      tab.layout = updateSplitAtPath(tab.layout, path, percentage);
    }),
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function clearWorktreeCache(worktreeId: string): void {
  stateCache.delete(worktreeId);
}

// ---------------------------------------------------------------------------
// Pane color assignment — each split terminal gets a unique border color
// ---------------------------------------------------------------------------

const PANE_COLORS = [
  '#56CCFF', // cyan (accent)
  '#2EE6A6', // green
  '#FFB84D', // amber
  '#FF627E', // coral
  '#8B5CFF', // purple
  '#EC4899', // pink
];

const paneColorMap = new Map<string, string>();
let colorIndex = 0;

export function getPaneColor(paneId: string): string {
  if (!paneColorMap.has(paneId)) {
    paneColorMap.set(paneId, PANE_COLORS[colorIndex % PANE_COLORS.length]);
    colorIndex++;
  }
  return paneColorMap.get(paneId)!;
}

export { workspace, tabs, activeTab, activePaneId };

// ---------------------------------------------------------------------------
// Auto-rename: derive tab labels from the active terminal session's OSC title
// or cwd basename (VS Code-style 2-tier ladder, no foreground-process tier).
// ---------------------------------------------------------------------------

/**
 * Per-pane reactivity hooks. We can't read xterm session state inside a Solid
 * memo and have it re-run when OSC events fire — Solid only tracks signals.
 * So each terminal pane gets a "tick" signal that we bump from inside the
 * shellIntegration listeners, and `deriveTabLabel` reads the tick to subscribe.
 */
const paneTicks = new Map<string, { tick: Accessor<number>; bump: () => void }>();
const paneSubs = new Map<string, () => void>();

function ensurePaneSubscription(paneId: string): Accessor<number> {
  let entry = paneTicks.get(paneId);
  if (!entry) {
    const [tick, setTick] = createSignal(0);
    const bump = () => setTick((n) => n + 1);
    entry = { tick, bump };
    paneTicks.set(paneId, entry);

    // Bump the tick whenever the terminal session's title changes or a new
    // command finishes (which can update cwd via `633;P;Cwd=`).
    const offTitle = onTitleChange(paneId, () => entry!.bump());
    const offCmd = onCommandFinished(paneId, () => entry!.bump());
    paneSubs.set(paneId, () => {
      offTitle();
      offCmd();
    });
  }
  return entry.tick;
}

function disposePaneSubscription(paneId: string): void {
  const off = paneSubs.get(paneId);
  if (off) {
    try {
      off();
    } catch {
      /* ignore */
    }
    paneSubs.delete(paneId);
  }
  paneTicks.delete(paneId);
}

/** Strip everything before the last `/` and any trailing slashes. */
function basename(p: string): string {
  const trimmed = p.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/** If `s` looks like an absolute path, return its basename; else return `s`. */
function maybeBasename(s: string): string {
  return s.startsWith('/') || s.startsWith('~/') ? basename(s) : s;
}

/**
 * Resolve the display label for a tab. For tabs whose active pane is a
 * terminal, walk the 2-tier ladder; otherwise fall through to `tab.label`.
 *
 * Ladder:
 *   1. OSC 0/1/2 title (live-updating via `terminal.onTitleChange`)
 *   2. cwd basename   (from OSC 633;P;Cwd=… on the most recent command)
 *   3. tab.label      (the static default assigned at creation)
 */
export function deriveTabLabel(tab: Tab): string {
  const pane = tab.panes[tab.activePaneId];
  if (!pane || pane.kind !== 'terminal') return tab.label;

  // Subscribe so the memo re-runs when this pane's title/cwd changes.
  ensurePaneSubscription(pane.id);

  const title = getSessionTitle(pane.id);
  if (title && title.length > 0) return maybeBasename(title);

  const cwd = getSessionCwd(pane.id);
  if (cwd && cwd.length > 0) return basename(cwd);

  return tab.label;
}

/**
 * Reactive accessor for a tab's display label. Re-runs when the tab's active
 * pane changes or when its terminal session emits a new title/cwd.
 *
 * Returns `tab.label` for unknown tabIds — keeps the TabBar resilient.
 */
export function tabDisplayLabel(tabId: string): string {
  const tab = workspace.tabs.find((t) => t.id === tabId);
  if (!tab) return '';
  return deriveTabLabel(tab);
}

// Wrap closePane / removeTab so we tear down per-pane subscriptions when the
// pane goes away. Both functions are exported above; we patch the cleanup
// path by re-exporting wrappers would be intrusive, so we expose a helper that
// the existing destroy flow calls. The hook is invoked inline in those fns:

/** Internal — release per-pane reactive bookkeeping. Safe for unknown ids. */
export function _disposePaneAutoRename(paneId: string): void {
  disposePaneSubscription(paneId);
}
