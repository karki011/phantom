/**
 * @phantom-os/panes — Pane type registry (backward-compatible wrapper)
 * @author Subash Karki
 *
 * This module provides backward-compatible exports for code that imported
 * from PaneRegistry directly. New code should use WorkspaceProvider instead.
 */

import { type ReactNode } from 'react';
import { WorkspaceProvider, type WorkspaceProviderProps } from './WorkspaceProvider.js';
import type { Pane } from '../core/types.js';

/** @deprecated Use PaneDefinition from core/types instead */
export interface PaneDefinition {
  render: (pane: Pane) => ReactNode;
  icon?: ReactNode;
  defaultTitle?: string;
}

export interface PaneRegistryProviderProps {
  definitions: Record<string, PaneDefinition>;
  children: ReactNode;
}

/**
 * @deprecated Use WorkspaceProvider instead.
 * This is a backward-compatible wrapper.
 */
export function PaneRegistryProvider({ definitions, children }: PaneRegistryProviderProps) {
  return (
    <WorkspaceProvider definitions={definitions as WorkspaceProviderProps['definitions']}>
      {children}
    </WorkspaceProvider>
  );
}

/** @deprecated Use usePaneRegistry from WorkspaceProvider instead */
export { usePaneRegistry } from './WorkspaceProvider.js';
