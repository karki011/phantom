/**
 * @phantom-os/panes — Zustand vanilla store
 * @author Subash Karki
 */
import { createStore } from 'zustand/vanilla';
import { findUnpinned, makePane, makeTab, removeFromLayout, replaceNode } from './helpers.js';
import type { LayoutNode, Pane, PaneActions, WorkspaceState } from './types.js';

const defaultTab = makeTab('Main');
const initialState: WorkspaceState = { tabs: [defaultTab], activeTabId: defaultTab.id };

export type PaneStore = WorkspaceState & PaneActions;

export const paneStore = createStore<PaneStore>()((set, get) => ({
  ...initialState,

  addTab: (label = 'New Tab') => {
    const tab = makeTab(label);
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    return tab.id;
  },
  removeTab: (tabId) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      if (tabs.length === 0) return s;
      return { tabs, activeTabId: s.activeTabId === tabId ? tabs[0].id : s.activeTabId };
    }),
  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  openPane: (kind, data = {}, title) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!tab) return '';
    const existing = findUnpinned(tab, kind);
    if (existing) {
      const updated: Pane = { ...existing, data, title: title ?? existing.title };
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tab.id ? { ...t, panes: { ...t.panes, [existing.id]: updated }, activePaneId: existing.id } : t,
        ),
      }));
      return existing.id;
    }
    return state.splitPane(tab.activePaneId ?? Object.keys(tab.panes)[0], 'horizontal', kind, data);
  },
  closePane: (paneId) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (!(paneId in t.panes)) return t;
        const layout = removeFromLayout(t.layout, paneId) ?? t.layout;
        const { [paneId]: _, ...panes } = t.panes;
        const activePaneId = t.activePaneId === paneId ? (Object.keys(panes)[0] ?? null) : t.activePaneId;
        return { ...t, layout, panes, activePaneId };
      }),
    })),
  setActivePane: (paneId) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (paneId in t.panes ? { ...t, activePaneId: paneId } : t)),
    })),

  splitPane: (paneId, direction, newKind, newData = {}) => {
    const tab = get().getActiveTab();
    if (!tab) return '';
    const newPane = makePane(newKind, newData);
    const splitNode: LayoutNode = {
      type: 'split', direction,
      first: { type: 'pane', paneId },
      second: { type: 'pane', paneId: newPane.id },
      ratio: 0.5,
    };
    const layout = replaceNode(tab.layout, (n) => n.type === 'pane' && n.paneId === paneId, splitNode);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tab.id ? { ...t, layout, panes: { ...t.panes, [newPane.id]: newPane }, activePaneId: newPane.id } : t,
      ),
    }));
    return newPane.id;
  },
  setSplitRatio: (find, ratio) =>
    set((s) => ({
      tabs: s.tabs.map((t) => ({
        ...t,
        layout: replaceNode(t.layout, (n) => n === find, { ...find, ratio } as LayoutNode),
      })),
    })),

  getActiveTab: () => {
    const s = get();
    return s.tabs.find((t) => t.id === s.activeTabId);
  },
  getActivePane: () => {
    const tab = get().getActiveTab();
    if (!tab?.activePaneId) return undefined;
    return tab.panes[tab.activePaneId];
  },
}));
