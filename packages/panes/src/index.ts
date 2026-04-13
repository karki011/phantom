/**
 * @phantom-os/panes — Split-view pane/tab layout system
 * @author Subash Karki
 *
 * Binary tree layout with tabs, drag-and-drop, and pluggable pane content.
 */

// ---------------------------------------------------------------------------
// Core types (framework-agnostic)
// ---------------------------------------------------------------------------
export type {
  LayoutNode,
  PaneLeaf,
  SplitNode,
  Pane,
  PaneActions,
  Tab,
  WorkspaceState,
  PaneDefinition,
  PaneRegistry,
} from './core/types.js';

// ---------------------------------------------------------------------------
// Jotai atoms (framework-agnostic state)
// ---------------------------------------------------------------------------
export {
  paneStateAtom,
  tabsAtom,
  activeTabIdAtom,
  activeTabAtom,
  activePaneAtom,
  addTabAtom,
  removeTabAtom,
  setActiveTabAtom,
  reorderTabAtom,
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
  makePane,
  makeTab,
  stripTerminalPanes,
} from './core/atoms.js';

// ---------------------------------------------------------------------------
// Layout utilities
// ---------------------------------------------------------------------------
export {
  uid,
  findPaneInLayout,
  getLayoutPaneIds,
  countPanes,
  replacePaneInLayout,
  replaceNode,
  removePaneFromLayout,
  updateSplitAtPath,
  equalizeLayout,
  insertPaneAdjacentTo,
} from './core/layout-utils.js';

// ---------------------------------------------------------------------------
// React components
// ---------------------------------------------------------------------------
export { Workspace, type WorkspaceProps } from './react/Workspace.js';
export {
  WorkspaceProvider,
  type WorkspaceProviderProps,
  usePaneStore,
  usePaneStoreSelector,
  usePaneStoreApi,
  usePaneRegistry,
  type PaneStoreCompat,
} from './react/WorkspaceProvider.js';
export { TabBar, type TabBarProps, type PaneMenuItem } from './react/TabBar.js';
export { TabContent, type TabContentProps } from './react/TabContent.js';
export { LayoutRenderer, type LayoutRendererProps } from './react/LayoutRenderer.js';
export { PaneContainer, type PaneContainerProps } from './react/PaneContainer.js';
export { ResizeHandle, type ResizeHandleProps } from './react/ResizeHandle.js';
export { DropZone, type DropZoneProps, PANE_DRAG_TYPE } from './react/DropZone.js';

// ---------------------------------------------------------------------------
// Backward-compatible re-exports
// ---------------------------------------------------------------------------
export { usePanes, usePaneSelector } from './react/usePanes.js';
export { PaneRegistryProvider, type PaneRegistryProviderProps } from './react/PaneRegistry.js';
export { PaneLayout, type PaneLayoutProps } from './react/PaneLayout.js';

// ---------------------------------------------------------------------------
// Backward-compat: Zustand-like store shim + type alias
// ---------------------------------------------------------------------------
export { paneStore, createPaneStore, jotaiStore } from './core/store.js';
export type { PaneStoreCompat as PaneStore } from './react/WorkspaceProvider.js';
