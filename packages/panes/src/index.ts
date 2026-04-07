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
// Core store (framework-agnostic)
// ---------------------------------------------------------------------------
export { paneStore, createPaneStore } from './core/store.js';
export type { PaneStore } from './core/store.js';

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
export { WorkspaceProvider, type WorkspaceProviderProps, usePaneStore, usePaneStoreSelector, usePaneStoreApi, usePaneRegistry } from './react/WorkspaceProvider.js';
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
