/**
 * PhantomOS v2 — SolidJS pane store
 * Ported from v1 Jotai atoms to SolidJS createStore + produce
 * Author: Subash Karki
 */

import { createMemo } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { activeWorktreeId } from '@/core/signals/app';
import type { WorkspaceState, Tab, PaneType, PaneLeaf, LayoutNode } from './types';
import {
  uid,
  removePaneFromLayout,
  insertPaneAdjacentTo,
  updateSplitAtPath,
  getLayoutPaneIds,
} from './layout-utils';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makePane(kind: PaneType, title?: string): import('./types').Pane {
  return {
    id: uid(),
    kind,
    title: title ?? kind,
    data: {},
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
  const tab = makeTab('terminal', 'Terminal');
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

export function switchWorkspace(worktreeId: string): void {
  // Save current state before switching
  const currentId = activeWorktreeId();
  if (currentId) {
    stateCache.set(currentId, JSON.parse(JSON.stringify(workspace)));
  }

  const cached = stateCache.get(worktreeId);
  if (cached) {
    setWorkspace(cached);
  } else {
    const state = defaultState();
    setWorkspace(state);
  }
}

// ---------------------------------------------------------------------------
// Tab actions
// ---------------------------------------------------------------------------

export function addTab(paneType: PaneType = 'terminal'): void {
  const tab = makeTab(paneType);
  setWorkspace(
    produce((s) => {
      s.tabs.push(tab);
      s.activeTabId = tab.id;
    }),
  );
}

export function removeTab(tabId: string): void {
  setWorkspace(
    produce((s) => {
      if (s.tabs.length <= 1) return; // Prevent removing last tab
      s.tabs = s.tabs.filter((t) => t.id !== tabId);
      if (s.activeTabId === tabId) {
        s.activeTabId = s.tabs[0]?.id ?? '';
      }
    }),
  );
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
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      if (tab && paneId in tab.panes) {
        tab.activePaneId = paneId;
      }
    }),
  );
}

export function closePane(paneId: string): void {
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

      const newPane = makePane(newPaneType);
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

export { workspace, tabs, activeTab, activePaneId };
