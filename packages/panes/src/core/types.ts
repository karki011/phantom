/**
 * @phantom-os/panes — Core types
 * @author Subash Karki
 *
 * Binary-tree layout model for split-view pane workspaces.
 */

/** Binary tree layout node */
export type LayoutNode =
  | { type: 'pane'; paneId: string }
  | {
      type: 'split';
      direction: 'horizontal' | 'vertical';
      first: LayoutNode;
      second: LayoutNode;
      ratio: number;
    };

/** Individual pane instance */
export interface Pane {
  id: string;
  /** Discriminator for the pane renderer (e.g. 'dashboard', 'terminal') */
  kind: string;
  title: string;
  pinned: boolean;
  /** Kind-specific payload (e.g. { filePath } for editor) */
  data: Record<string, unknown>;
}

/** A tab containing a layout of panes */
export interface Tab {
  id: string;
  label: string;
  layout: LayoutNode;
  /** paneId → Pane */
  panes: Record<string, Pane>;
  activePaneId: string | null;
}

/** Full workspace state */
export interface WorkspaceState {
  tabs: Tab[];
  activeTabId: string;
}

/** Store actions (framework-agnostic) */
export interface PaneActions {
  // Tab operations
  addTab: (label?: string) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  // Pane operations
  openPane: (kind: string, data?: Record<string, unknown>, title?: string) => string;
  closePane: (paneId: string) => void;
  setActivePane: (paneId: string) => void;

  // Split operations
  splitPane: (
    paneId: string,
    direction: 'horizontal' | 'vertical',
    newKind: string,
    newData?: Record<string, unknown>,
  ) => string;
  setSplitRatio: (find: LayoutNode, ratio: number) => void;

  // Utility
  getActiveTab: () => Tab | undefined;
  getActivePane: () => Pane | undefined;
}
