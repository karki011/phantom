/**
 * @phantom-os/panes — Pane type registry
 * @author Subash Karki
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Pane } from '../core/types.js';

export interface PaneDefinition {
  render: (pane: Pane) => ReactNode;
  icon?: ReactNode;
  defaultTitle?: string;
}

const PaneRegistryContext = createContext<Map<string, PaneDefinition>>(new Map());

export interface PaneRegistryProviderProps {
  definitions: Record<string, PaneDefinition>;
  children: ReactNode;
}

export function PaneRegistryProvider({ definitions, children }: PaneRegistryProviderProps) {
  const map = useMemo(() => new Map(Object.entries(definitions)), [definitions]);
  return <PaneRegistryContext value={map}>{children}</PaneRegistryContext>;
}

export const usePaneRegistry = () => useContext(PaneRegistryContext);
