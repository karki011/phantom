/**
 * @phantom-os/panes — Split-view pane/tab layout system
 * @author Subash Karki
 */

// Core (framework-agnostic)
export type {
  LayoutNode,
  Pane,
  PaneActions,
  Tab,
  WorkspaceState,
} from './core/types.js';
export { paneStore } from './core/store.js';
export type { PaneStore } from './core/store.js';

// React bindings
export { usePanes, usePaneSelector } from './react/usePanes.js';
export {
  PaneRegistryProvider,
  usePaneRegistry,
  type PaneDefinition,
  type PaneRegistryProviderProps,
} from './react/PaneRegistry.js';
export { PaneLayout, type PaneLayoutProps } from './react/PaneLayout.js';
export { PaneContainer, type PaneContainerProps } from './react/PaneContainer.js';
export { TabBar, type PaneMenuItem } from './react/TabBar.js';
