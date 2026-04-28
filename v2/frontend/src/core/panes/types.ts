// PhantomOS v2 — Pane layout types
// Author: Subash Karki

export type PaneType = 'terminal' | 'tui' | 'editor' | 'chat' | 'diff' | 'home' | 'journal' | 'markdown-preview';

// ---------------------------------------------------------------------------
// Layout tree (binary tree of panes)
// ---------------------------------------------------------------------------

/** Leaf node — represents a single rendered pane in the layout */
export interface PaneLeaf {
  type: 'leaf';
  id: string;
  paneType: PaneType;
}

/** Split node — two children divided by a draggable handle */
export interface SplitNode {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  /** Percentage of space given to `first` child (10–90) */
  splitPercentage: number;
  first: LayoutNode;
  second: LayoutNode;
}

export type LayoutNode = PaneLeaf | SplitNode;

// ---------------------------------------------------------------------------
// Pane (the data record, separate from the layout position)
// ---------------------------------------------------------------------------

export interface Pane {
  id: string;
  kind: PaneType;
  title: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tab + Workspace
// ---------------------------------------------------------------------------

export interface Tab {
  id: string;
  label: string;
  layout: LayoutNode;
  activePaneId: string;
  /** paneId → Pane data */
  panes: Record<string, Pane>;
}

export interface WorkspaceState {
  tabs: Tab[];
  activeTabId: string;
}
