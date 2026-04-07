/**
 * @phantom-os/panes — Core types
 * @author Subash Karki
 *
 * Binary-tree layout model inspired by Superset's pane architecture.
 * Generic TData allows each pane to carry typed payload.
 */

import type { ComponentType, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Layout tree
// ---------------------------------------------------------------------------

/** Leaf node — represents a single pane */
export interface PaneLeaf {
  type: 'pane';
  paneId: string;
}

/** Split node — two children with a draggable divider */
export interface SplitNode {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  first: LayoutNode;
  second: LayoutNode;
  /** Percentage of space given to `first` child (0–100) */
  splitPercentage: number;
}

export type LayoutNode = PaneLeaf | SplitNode;

// ---------------------------------------------------------------------------
// Pane
// ---------------------------------------------------------------------------

export interface Pane<TData = Record<string, unknown>> {
  id: string;
  /** Discriminator for the pane renderer (e.g. 'dashboard', 'terminal') */
  kind: string;
  title: string;
  pinned: boolean;
  createdAt: number;
  /** Kind-specific payload */
  data: TData;
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export interface Tab<TData = Record<string, unknown>> {
  id: string;
  label: string;
  createdAt: number;
  activePaneId: string | null;
  layout: LayoutNode;
  /** paneId → Pane */
  panes: Record<string, Pane<TData>>;
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export interface WorkspaceState<TData = Record<string, unknown>> {
  tabs: Tab<TData>[];
  activeTabId: string | null;
}

// ---------------------------------------------------------------------------
// Store actions
// ---------------------------------------------------------------------------

export interface PaneActions<TData = Record<string, unknown>> {
  // Tab operations
  addTab: (label?: string) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;

  // Pane operations
  addPane: (kind: string, data?: TData, title?: string) => string;
  closePane: (paneId: string) => void;
  setActivePaneInTab: (tabId: string, paneId: string) => void;

  // Split operations
  splitPane: (
    paneId: string,
    direction: 'horizontal' | 'vertical',
    newKind: string,
    newData?: TData,
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

  // Utility
  getActiveTab: () => Tab<TData> | undefined;
  getActivePane: () => Pane<TData> | undefined;
  getTab: (tabId: string) => Tab<TData> | undefined;
}

// ---------------------------------------------------------------------------
// Pane Registry
// ---------------------------------------------------------------------------

export interface PaneDefinition<TData = Record<string, unknown>> {
  kind?: string;
  title?: string;
  icon?: string;
  /** React component (or lazy) that renders this pane type */
  component?: ComponentType<{ pane: Pane<TData> }>;
  /** Render function — either component or render must be provided */
  render?: (pane: Pane<TData>) => ReactNode;
  defaultTitle?: string;
}

export type PaneRegistry<TData = Record<string, unknown>> = Map<string, PaneDefinition<TData>>;
